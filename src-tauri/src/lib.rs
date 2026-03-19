use std::{
  ffi::OsStr,
  fs,
  path::{Component, Path, PathBuf},
  process::Command,
  time::UNIX_EPOCH,
};

use dirs::home_dir;
use serde::{Deserialize, Serialize};
use tauri::{
  menu::{Menu, MenuEvent, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
  AppHandle, Emitter, LogicalPosition, Manager, WindowEvent,
};
use walkdir::WalkDir;

const MAIN_WINDOW_LABEL: &str = "main";
const TOGGLE_WINDOW_ID: &str = "toggle-window";
const REFRESH_DATA_ID: &str = "refresh-data";
const QUIT_APP_ID: &str = "quit-app";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SourceConfig {
  id: String,
  label: String,
  root_path: String,
  writable: bool,
  kind: String,
  enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiscoveredSkill {
  source_id: String,
  root_path: String,
  skill_dir: String,
  skill_file: String,
  relative_path: String,
  extras: Vec<String>,
  raw_excerpt: String,
  modified_at_epoch: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveSkillRequest {
  source: SourceConfig,
  relative_path: String,
  raw_content: String,
  overwrite: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CopySkillRequest {
  source_skill_dir: String,
  relative_path: String,
  target_source: SourceConfig,
  target_relative_path: String,
  conflict_strategy: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CopySourceRequest {
  source: SourceConfig,
  target_source: SourceConfig,
  conflict_strategy: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CopySkillResult {
  status: String,
  final_skill_dir: Option<String>,
  final_relative_path: String,
  skipped: bool,
  conflict_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CopySourceResult {
  status: String,
  copied_count: usize,
  skipped_count: usize,
  overwritten_count: usize,
  renamed_count: usize,
  conflict_count: usize,
  conflict_relative_paths: Vec<String>,
}

fn home_join(parts: &[&str]) -> Result<String, String> {
  let home = home_dir().ok_or_else(|| "无法定位当前用户目录。".to_string())?;
  let mut path = home;
  for part in parts {
    path.push(part);
  }
  Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_default_sources() -> Result<Vec<SourceConfig>, String> {
  Ok(vec![
    SourceConfig {
      id: "cursor-personal".into(),
      label: "Cursor".into(),
      root_path: home_join(&[".cursor", "skills"])?,
      writable: true,
      kind: "cursor".into(),
      enabled: true,
    },
    SourceConfig {
      id: "codex-personal".into(),
      label: "Codex".into(),
      root_path: home_join(&[".codex", "skills"])?,
      writable: true,
      kind: "codex".into(),
      enabled: true,
    },
  ])
}

#[tauri::command]
fn scan_skills(sources: Vec<SourceConfig>) -> Result<Vec<DiscoveredSkill>, String> {
  let mut discovered = Vec::new();

  for source in sources.into_iter().filter(|source| source.enabled) {
    let root = PathBuf::from(&source.root_path);
    if !root.exists() || !root.is_dir() {
      continue;
    }

    for entry in WalkDir::new(&root)
      .into_iter()
      .filter_entry(|entry| entry.file_name() != OsStr::new(".git"))
      .filter_map(Result::ok)
    {
      if !entry.file_type().is_file() {
        continue;
      }

      if !entry.file_name().to_string_lossy().eq_ignore_ascii_case("SKILL.md") {
        continue;
      }

      let skill_file = entry.path().to_path_buf();
      let Some(skill_dir) = skill_file.parent().map(Path::to_path_buf) else {
        continue;
      };

      let Ok(relative) = skill_file.strip_prefix(&root) else {
        continue;
      };

      let Ok(raw_content) = fs::read_to_string(&skill_file) else {
        continue;
      };

      let extras = collect_extras(&skill_dir);
      let modified_at_epoch = entry
        .metadata()
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());

      discovered.push(DiscoveredSkill {
        source_id: source.id.clone(),
        root_path: source.root_path.clone(),
        skill_dir: skill_dir.to_string_lossy().to_string(),
        skill_file: skill_file.to_string_lossy().to_string(),
        relative_path: normalize_relative_path(relative),
        extras,
        raw_excerpt: build_raw_excerpt(&raw_content),
        modified_at_epoch,
      });
    }
  }

  Ok(discovered)
}

/// Returns frontmatter + first 300 bytes of body to keep IPC payload small.
fn build_raw_excerpt(raw_content: &str) -> String {
  let content = raw_content.replace('\r', "");

  let body_start = if let Some(rest) = content.strip_prefix("---\n") {
    rest.find("\n---\n").map(|i| 4 + i + 5)
  } else {
    None
  };

  match body_start {
    Some(start) => {
      let body = &content[start..];
      let end = safe_char_boundary(body, 300);
      format!("{}{}", &content[..start], &body[..end])
    }
    None => {
      let end = safe_char_boundary(&content, 500);
      content[..end].to_string()
    }
  }
}

fn safe_char_boundary(s: &str, max: usize) -> usize {
  let mut end = s.len().min(max);
  while end > 0 && !s.is_char_boundary(end) {
    end -= 1;
  }
  end
}

#[tauri::command]
fn get_skill_content(skill_file: String) -> Result<String, String> {
  fs::read_to_string(&skill_file).map_err(|err| format!("读取 Skill 内容失败：{err}"))
}

#[tauri::command]
fn save_skill(request: SaveSkillRequest) -> Result<(), String> {
  if !request.source.writable {
    return Err("目标来源是只读的，无法写入。".into());
  }

  let root = PathBuf::from(&request.source.root_path);
  let relative = sanitize_relative_path(&request.relative_path)?;
  ensure_skill_file_path(&relative)?;

  let target = root.join(relative);
  if target.exists() && !request.overwrite {
    return Err("目标 Skill 已存在，请确认是否覆盖。".into());
  }

  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|err| format!("创建目录失败：{err}"))?;
  }

  fs::write(&target, request.raw_content).map_err(|err| format!("写入 Skill 失败：{err}"))?;
  Ok(())
}

#[tauri::command]
fn copy_skill(request: CopySkillRequest) -> Result<CopySkillResult, String> {
  if !request.target_source.writable {
    return Err("目标来源是只读的，无法复制。".into());
  }

  let source_dir = PathBuf::from(&request.source_skill_dir);
  if !source_dir.exists() || !source_dir.is_dir() {
    return Err("源 Skill 目录不存在。".into());
  }

  let source_relative_file = sanitize_relative_path(&request.relative_path)?;
  ensure_skill_file_path(&source_relative_file)?;
  let target_relative_file = sanitize_relative_path(&request.target_relative_path)?;
  ensure_skill_file_path(&target_relative_file)?;

  let target_root = PathBuf::from(&request.target_source.root_path);
  fs::create_dir_all(&target_root).map_err(|err| format!("创建目标根目录失败：{err}"))?;
  let inspection = inspect_copy_target(&source_dir, &target_relative_file, &target_root)?;

  if request.conflict_strategy.is_none() {
    if let Some(conflict) = inspection.conflict {
      return Ok(CopySkillResult {
        status: "conflict".into(),
        final_skill_dir: None,
        final_relative_path: conflict.final_relative_path,
        skipped: false,
        conflict_message: Some(conflict.message),
      });
    }
  }

  let strategy = request.conflict_strategy.as_deref().unwrap_or("skip");
  let outcome = copy_skill_directory(&source_dir, &target_relative_file, &target_root, strategy)?;

  Ok(CopySkillResult {
    status: "copied".into(),
    final_skill_dir: Some(outcome.final_skill_dir.to_string_lossy().to_string()),
    final_relative_path: outcome.final_relative_path,
    skipped: matches!(outcome.status, CopyStatus::Skipped),
    conflict_message: None,
  })
}

#[tauri::command]
fn copy_source(request: CopySourceRequest) -> Result<CopySourceResult, String> {
  if !request.target_source.writable {
    return Err("目标来源是只读的，无法复制。".into());
  }

  if is_same_path(&request.source.root_path, &request.target_source.root_path) {
    return Err("源来源与目标来源路径相同，无法复制。".into());
  }

  let source_root = PathBuf::from(&request.source.root_path);
  if !source_root.exists() || !source_root.is_dir() {
    return Err("源来源目录不存在。".into());
  }

  let target_root = PathBuf::from(&request.target_source.root_path);
  fs::create_dir_all(&target_root).map_err(|err| format!("创建目标根目录失败：{err}"))?;

  let mut skill_paths = Vec::new();
  for entry in WalkDir::new(&source_root)
    .into_iter()
    .filter_entry(|entry| entry.file_name() != OsStr::new(".git"))
    .filter_map(Result::ok)
  {
    if !entry.file_type().is_file() {
      continue;
    }

    if !entry.file_name().to_string_lossy().eq_ignore_ascii_case("SKILL.md") {
      continue;
    }

    let relative = entry
      .path()
      .strip_prefix(&source_root)
      .map_err(|err| format!("读取来源路径失败：{err}"))?;

    skill_paths.push(relative.to_path_buf());
  }

  skill_paths.sort();

  if request.conflict_strategy.is_none() {
    let mut conflict_paths = Vec::new();
    for relative_path in &skill_paths {
      let source_skill_dir = source_root.join(skill_relative_dir(relative_path)?);
      let inspection = inspect_copy_target(&source_skill_dir, relative_path, &target_root)?;
      if let Some(conflict) = inspection.conflict {
        conflict_paths.push(conflict.final_relative_path);
      }
    }

    if !conflict_paths.is_empty() {
      return Ok(CopySourceResult {
        status: "conflict".into(),
        copied_count: 0,
        skipped_count: 0,
        overwritten_count: 0,
        renamed_count: 0,
        conflict_count: conflict_paths.len(),
        conflict_relative_paths: conflict_paths,
      });
    }
  }

  let strategy = request.conflict_strategy.as_deref().unwrap_or("skip");
  let mut result = CopySourceResult {
    status: "copied".into(),
    copied_count: 0,
    skipped_count: 0,
    overwritten_count: 0,
    renamed_count: 0,
    conflict_count: 0,
    conflict_relative_paths: Vec::new(),
  };

  for relative_path in skill_paths {
    let source_skill_dir = source_root.join(skill_relative_dir(&relative_path)?);

    let outcome = copy_skill_directory(&source_skill_dir, &relative_path, &target_root, strategy)?;

    match outcome.status {
      CopyStatus::Copied => {
        result.copied_count += 1;
      }
      CopyStatus::Skipped => {
        result.skipped_count += 1;
      }
      CopyStatus::Overwritten => {
        result.copied_count += 1;
        result.overwritten_count += 1;
      }
      CopyStatus::Renamed => {
        result.copied_count += 1;
        result.renamed_count += 1;
      }
    }
  }

  Ok(result)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
  let target = PathBuf::from(&path);
  if !target.exists() {
    return Err("路径不存在。".into());
  }

  let spawn_result = if cfg!(target_os = "windows") {
    if target.is_dir() {
      Command::new("explorer").arg(target.as_os_str()).spawn()
    } else {
      Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(target.as_os_str())
        .spawn()
    }
  } else if cfg!(target_os = "macos") {
    Command::new("open").arg(target.as_os_str()).spawn()
  } else if cfg!(target_os = "linux") {
    Command::new("xdg-open").arg(target.as_os_str()).spawn()
  } else {
    return Err("当前系统暂未实现打开路径功能。".into());
  };

  spawn_result.map(|_| ()).map_err(|err| format!("打开路径失败：{err}"))
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
  let target = PathBuf::from(path.trim());
  if target.as_os_str().is_empty() {
    return Err("路径无效。".into());
  }
  if let Some(parent) = target.parent() {
    if !parent.as_os_str().is_empty() {
      fs::create_dir_all(parent).map_err(|err| format!("创建目录失败：{err}"))?;
    }
  }
  fs::write(&target, contents).map_err(|err| format!("写入文件失败：{err}"))
}

fn collect_extras(skill_dir: &Path) -> Vec<String> {
  let Ok(entries) = fs::read_dir(skill_dir) else {
    return Vec::new();
  };

  let mut extras = entries
    .filter_map(Result::ok)
    .filter_map(|entry| {
      let name = entry.file_name().to_string_lossy().to_string();
      if name.eq_ignore_ascii_case("SKILL.md") || name == ".git" {
        return None;
      }
      Some(name)
    })
    .collect::<Vec<_>>();

  extras.sort();
  extras
}

fn sanitize_relative_path(input: &str) -> Result<PathBuf, String> {
  let normalized = input.replace('\\', "/");
  let path = Path::new(&normalized);

  if path.is_absolute() {
    return Err("Skill 相对路径不能是绝对路径。".into());
  }

  let mut clean = PathBuf::new();
  for component in path.components() {
    match component {
      Component::Normal(part) => clean.push(part),
      Component::CurDir => {}
      _ => return Err("Skill 相对路径包含非法片段。".into()),
    }
  }

  if clean.as_os_str().is_empty() {
    return Err("Skill 相对路径不能为空。".into());
  }

  Ok(clean)
}

fn ensure_skill_file_path(path: &Path) -> Result<(), String> {
  let Some(file_name) = path.file_name() else {
    return Err("Skill 路径缺少文件名。".into());
  };

  if !file_name.to_string_lossy().eq_ignore_ascii_case("SKILL.md") {
    return Err("Skill 文件必须命名为 SKILL.md。".into());
  }

  Ok(())
}

fn normalize_relative_path(path: &Path) -> String {
  path
    .components()
    .map(|component| component.as_os_str().to_string_lossy().to_string())
    .collect::<Vec<_>>()
    .join("/")
}

#[derive(Debug, Clone, Copy)]
enum CopyStatus {
  Copied,
  Skipped,
  Overwritten,
  Renamed,
}

#[derive(Debug, Clone)]
struct CopyOutcome {
  final_skill_dir: PathBuf,
  final_relative_path: String,
  status: CopyStatus,
}

#[derive(Debug, Clone)]
struct CopyConflict {
  final_relative_path: String,
  message: String,
}

#[derive(Debug, Clone)]
struct CopyInspection {
  conflict: Option<CopyConflict>,
}

fn inspect_copy_target(
  source_dir: &Path,
  relative_file: &Path,
  target_root: &Path,
) -> Result<CopyInspection, String> {
  let relative_dir = skill_relative_dir(relative_file)?;
  let target_dir = target_root.join(relative_dir);
  let final_relative_path = target_dir
    .join("SKILL.md")
    .strip_prefix(target_root)
    .map(normalize_relative_path)
    .unwrap_or_else(|_| "SKILL.md".into());

  if is_same_path(source_dir, &target_dir) {
    return Ok(CopyInspection {
      conflict: Some(CopyConflict {
        final_relative_path,
        message: "目标路径与源 Skill 相同，请修改目标路径或选择其他来源。".into(),
      }),
    });
  }

  ensure_paths_do_not_overlap(source_dir, &target_dir)?;

  if target_dir.exists() {
    return Ok(CopyInspection {
      conflict: Some(CopyConflict {
        final_relative_path,
        message: "目标路径中已存在同名 skill。".into(),
      }),
    });
  }

  Ok(CopyInspection { conflict: None })
}

fn copy_skill_directory(
  source_dir: &Path,
  relative_file: &Path,
  target_root: &Path,
  conflict_strategy: &str,
) -> Result<CopyOutcome, String> {
  let relative_dir = skill_relative_dir(relative_file)?;

  let initial_target_dir = target_root.join(relative_dir);

  if is_same_path(source_dir, &initial_target_dir) {
    match conflict_strategy {
      "skip" => {
        let final_relative_path = initial_target_dir
          .join("SKILL.md")
          .strip_prefix(target_root)
          .map(normalize_relative_path)
          .unwrap_or_else(|_| "SKILL.md".into());

        return Ok(CopyOutcome {
          final_skill_dir: initial_target_dir,
          final_relative_path,
          status: CopyStatus::Skipped,
        });
      }
      "overwrite" => {
        return Err("目标路径与源 Skill 相同，无法覆盖自身。".into());
      }
      "rename" => {}
      _ => return Err("未知的冲突处理策略。".into()),
    }
  }

  let mut target_dir = initial_target_dir.clone();
  let mut status = CopyStatus::Copied;

  if target_dir.exists() {
    let existing_relative_path = target_dir
      .join("SKILL.md")
      .strip_prefix(target_root)
      .map(normalize_relative_path)
      .unwrap_or_else(|_| "SKILL.md".into());

    match conflict_strategy {
      "skip" => {
        return Ok(CopyOutcome {
          final_skill_dir: target_dir,
          final_relative_path: existing_relative_path,
          status: CopyStatus::Skipped,
        });
      }
      "overwrite" => {
        ensure_paths_do_not_overlap(source_dir, &target_dir)?;
        fs::remove_dir_all(&target_dir).map_err(|err| format!("覆盖旧 Skill 失败：{err}"))?;
        status = CopyStatus::Overwritten;
      }
      "rename" => {
        target_dir = unique_copy_path(&target_dir);
        status = CopyStatus::Renamed;
      }
      _ => return Err("未知的冲突处理策略。".into()),
    }
  }

  ensure_paths_do_not_overlap(source_dir, &target_dir)?;
  copy_directory(source_dir, &target_dir)?;

  let final_relative_path = target_dir
    .join("SKILL.md")
    .strip_prefix(target_root)
    .map(normalize_relative_path)
    .unwrap_or_else(|_| "SKILL.md".into());

  Ok(CopyOutcome {
    final_skill_dir: target_dir,
    final_relative_path,
    status,
  })
}

fn skill_relative_dir(relative_file: &Path) -> Result<&Path, String> {
  let Some(relative_dir) = relative_file.parent() else {
    return Err("暂不支持复制位于来源根目录的 SKILL.md，请先将其放入单独文件夹。".into());
  };

  if relative_dir.as_os_str().is_empty() {
    return Err("暂不支持复制位于来源根目录的 SKILL.md，请先将其放入单独文件夹。".into());
  }

  Ok(relative_dir)
}

fn ensure_paths_do_not_overlap(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
  if is_same_or_nested_path(source_dir, target_dir) {
    return Err("目标路径位于源 Skill 内部，无法复制到自身子目录。".into());
  }

  if is_same_or_nested_path(target_dir, source_dir) {
    return Err("目标路径会覆盖源 Skill 的父级目录，已阻止本次复制。".into());
  }

  Ok(())
}

fn is_same_path(left: impl AsRef<Path>, right: impl AsRef<Path>) -> bool {
  comparable_path(left.as_ref()) == comparable_path(right.as_ref())
}

fn is_same_or_nested_path(base: &Path, candidate: &Path) -> bool {
  let base_parts = comparable_parts(base);
  let candidate_parts = comparable_parts(candidate);

  candidate_parts.len() >= base_parts.len()
    && candidate_parts
      .iter()
      .zip(base_parts.iter())
      .all(|(candidate_part, base_part)| candidate_part == base_part)
}

fn comparable_parts(path: &Path) -> Vec<String> {
  path
    .components()
    .filter_map(|component| match component {
      Component::Prefix(prefix) => Some(prefix.as_os_str().to_string_lossy().to_lowercase()),
      Component::RootDir => Some(String::new()),
      Component::Normal(part) => Some(part.to_string_lossy().to_lowercase()),
      Component::CurDir => None,
      Component::ParentDir => Some("..".into()),
    })
    .collect()
}

fn comparable_path(path: &Path) -> String {
  comparable_parts(path).join("/")
}

fn unique_copy_path(original: &Path) -> PathBuf {
  let parent = original.parent().map(Path::to_path_buf).unwrap_or_default();
  let stem = original
    .file_name()
    .map(|name| name.to_string_lossy().to_string())
    .unwrap_or_else(|| "skill".into());

  for index in 1..=999 {
    let suffix = if index == 1 {
      format!("{stem}-copy")
    } else {
      format!("{stem}-copy-{index}")
    };

    let candidate = parent.join(suffix);
    if !candidate.exists() {
      return candidate;
    }
  }

  parent.join(format!("{stem}-copy-overflow"))
}

fn copy_directory(source_dir: &Path, target_dir: &Path) -> Result<(), String> {
  for entry in WalkDir::new(source_dir)
    .into_iter()
    .filter_entry(|entry| entry.file_name() != OsStr::new(".git"))
    .filter_map(Result::ok)
  {
    let Ok(relative) = entry.path().strip_prefix(source_dir) else {
      continue;
    };

    let target_path = target_dir.join(relative);
    if entry.file_type().is_dir() {
      fs::create_dir_all(&target_path).map_err(|err| format!("创建目录失败：{err}"))?;
      continue;
    }

    if let Some(parent) = target_path.parent() {
      fs::create_dir_all(parent).map_err(|err| format!("创建目标父目录失败：{err}"))?;
    }

    fs::copy(entry.path(), &target_path).map_err(|err| format!("复制文件失败：{err}"))?;
  }

  Ok(())
}

fn position_bottom_right(app: &AppHandle) {
  let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
    return;
  };

  // 获取主显示器信息
  let Ok(Some(monitor)) = window.primary_monitor() else {
    return;
  };

  let screen_size = monitor.size();
  let scale = monitor.scale_factor();

  // 将物理像素转换为逻辑像素
  let screen_w = screen_size.width as f64 / scale;
  let screen_h = screen_size.height as f64 / scale;

  // 窗口尺寸（逻辑像素）
  let Ok(win_size) = window.outer_size() else {
    return;
  };
  let win_w = win_size.width as f64 / scale;
  let win_h = win_size.height as f64 / scale;

  // 右下角，留出 12px 边距 + 约 48px 任务栏高度
  let margin: f64 = 12.0;
  let taskbar: f64 = 48.0;
  let x = screen_w - win_w - margin;
  let y = screen_h - win_h - taskbar - margin;

  let _ = window.set_position(LogicalPosition::new(x, y));
}

fn show_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
    position_bottom_right(app);
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
  }
}

fn toggle_main_window(app: &AppHandle) {
  if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
    let visible = window.is_visible().unwrap_or(false);
    if visible {
      let _ = window.hide();
    } else {
      show_main_window(app);
    }
  }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
  let toggle_window = MenuItem::with_id(app, TOGGLE_WINDOW_ID, "显示 / 隐藏", true, None::<&str>)?;
  let refresh_data = MenuItem::with_id(app, REFRESH_DATA_ID, "重新扫描", true, None::<&str>)?;
  let quit_app = MenuItem::with_id(app, QUIT_APP_ID, "退出", true, None::<&str>)?;
  let menu = Menu::with_items(app, &[&toggle_window, &refresh_data, &quit_app])?;
  let icon = app.default_window_icon().cloned();

  TrayIconBuilder::with_id("skills-manager-tray")
    .icon(icon.expect("default icon missing"))
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app: &AppHandle<_>, event: MenuEvent| match event.id().as_ref() {
      TOGGLE_WINDOW_ID => toggle_main_window(app),
      REFRESH_DATA_ID => {
        let _ = app.emit("refresh-requested", ());
        show_main_window(app);
      }
      QUIT_APP_ID => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray: &TrayIcon<_>, event: TrayIconEvent| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        toggle_main_window(tray.app_handle());
      }
    })
    .build(app)?;

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .setup(|app| {
      build_tray(app.handle())?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .invoke_handler(tauri::generate_handler![
      get_default_sources,
      scan_skills,
      get_skill_content,
      save_skill,
      copy_skill,
      copy_source,
      open_path,
      write_text_file
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::{SystemTime, UNIX_EPOCH};

  fn temp_path(name: &str) -> PathBuf {
    let unique = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("time works")
      .as_nanos();

    std::env::temp_dir().join(format!("skills-manager-{name}-{unique}"))
  }

  #[test]
  fn copy_skill_directory_copies_to_target_root() {
    let workspace = temp_path("copy-skill");
    let source_root = workspace.join("source");
    let source_dir = source_root.join("alpha");
    let target_root = workspace.join("target");

    fs::create_dir_all(&source_dir).expect("create source");
    fs::create_dir_all(&target_root).expect("create target");
    fs::write(source_dir.join("SKILL.md"), "# alpha").expect("write skill");
    fs::write(source_dir.join("notes.txt"), "extra").expect("write extra");

    let result = copy_skill_directory(
      &source_dir,
      Path::new("alpha/SKILL.md"),
      &target_root,
      "rename",
    )
    .expect("copy succeeds");

    assert!(matches!(result.status, CopyStatus::Copied));
    assert_eq!(result.final_relative_path, "alpha/SKILL.md");
    assert!(target_root.join("alpha/SKILL.md").exists());
    assert!(target_root.join("alpha/notes.txt").exists());

    let _ = fs::remove_dir_all(workspace);
  }

  #[test]
  fn copy_skill_directory_renames_on_conflict() {
    let workspace = temp_path("copy-rename");
    let source_root = workspace.join("source");
    let source_dir = source_root.join("alpha");
    let target_root = workspace.join("target");
    let target_dir = target_root.join("alpha");

    fs::create_dir_all(&source_dir).expect("create source");
    fs::create_dir_all(&target_dir).expect("create target");
    fs::write(source_dir.join("SKILL.md"), "# alpha").expect("write source skill");
    fs::write(target_dir.join("SKILL.md"), "# existing").expect("write target skill");

    let result = copy_skill_directory(
      &source_dir,
      Path::new("alpha/SKILL.md"),
      &target_root,
      "rename",
    )
    .expect("copy succeeds");

    assert!(matches!(result.status, CopyStatus::Renamed));
    assert_eq!(result.final_relative_path, "alpha-copy/SKILL.md");
    assert!(target_root.join("alpha-copy/SKILL.md").exists());

    let _ = fs::remove_dir_all(workspace);
  }

  #[test]
  fn copy_skill_directory_blocks_self_overwrite() {
    let workspace = temp_path("copy-self");
    let source_root = workspace.join("source");
    let source_dir = source_root.join("alpha");

    fs::create_dir_all(&source_dir).expect("create source");
    fs::write(source_dir.join("SKILL.md"), "# alpha").expect("write skill");

    let error = copy_skill_directory(
      &source_dir,
      Path::new("alpha/SKILL.md"),
      &source_root,
      "overwrite",
    )
    .expect_err("self overwrite must fail");

    assert!(error.contains("无法覆盖自身"));

    let _ = fs::remove_dir_all(workspace);
  }

  #[test]
  fn copy_skill_directory_rejects_root_level_skill() {
    let workspace = temp_path("copy-root");
    let source_root = workspace.join("source");
    let target_root = workspace.join("target");

    fs::create_dir_all(&source_root).expect("create source");
    fs::create_dir_all(&target_root).expect("create target");
    fs::write(source_root.join("SKILL.md"), "# root").expect("write skill");

    let error = copy_skill_directory(&source_root, Path::new("SKILL.md"), &target_root, "rename")
      .expect_err("root level skill must fail");

    assert!(error.contains("来源根目录"));

    let _ = fs::remove_dir_all(workspace);
  }
}
