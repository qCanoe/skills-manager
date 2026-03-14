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
  raw_content: String,
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
struct SyncSkillRequest {
  source_skill_dir: String,
  relative_path: String,
  target_source: SourceConfig,
  conflict_strategy: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncSkillResult {
  final_skill_dir: String,
  final_relative_path: String,
  skipped: bool,
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
      label: "Cursor / Personal".into(),
      root_path: home_join(&[".cursor", "skills"])?,
      writable: true,
      kind: "cursor".into(),
      enabled: true,
    },
    SourceConfig {
      id: "codex-personal".into(),
      label: "Codex / Personal".into(),
      root_path: home_join(&[".codex", "skills"])?,
      writable: true,
      kind: "codex".into(),
      enabled: true,
    },
    SourceConfig {
      id: "cursor-builtins".into(),
      label: "Cursor / Built-in".into(),
      root_path: home_join(&[".cursor", "skills-cursor"])?,
      writable: false,
      kind: "builtin".into(),
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
        raw_content,
        modified_at_epoch,
      });
    }
  }

  Ok(discovered)
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
fn sync_skill(request: SyncSkillRequest) -> Result<SyncSkillResult, String> {
  if !request.target_source.writable {
    return Err("目标来源是只读的，无法同步。".into());
  }

  let source_dir = PathBuf::from(&request.source_skill_dir);
  if !source_dir.exists() || !source_dir.is_dir() {
    return Err("源 Skill 目录不存在。".into());
  }

  let relative_file = sanitize_relative_path(&request.relative_path)?;
  ensure_skill_file_path(&relative_file)?;

  let Some(relative_dir) = relative_file.parent() else {
    return Err("Skill 路径无效。".into());
  };

  let target_root = PathBuf::from(&request.target_source.root_path);
  fs::create_dir_all(&target_root).map_err(|err| format!("创建目标根目录失败：{err}"))?;

  let mut target_dir = target_root.join(relative_dir);
  if target_dir.exists() {
    let existing_relative_path = target_dir
      .join("SKILL.md")
      .strip_prefix(&target_root)
      .map(normalize_relative_path)
      .unwrap_or_else(|_| "SKILL.md".into());

    match request.conflict_strategy.as_str() {
      "skip" => {
        return Ok(SyncSkillResult {
          final_skill_dir: target_dir.to_string_lossy().to_string(),
          final_relative_path: existing_relative_path,
          skipped: true,
        })
      }
      "overwrite" => {
        fs::remove_dir_all(&target_dir).map_err(|err| format!("覆盖旧 Skill 失败：{err}"))?;
      }
      "rename" => {
        target_dir = unique_copy_path(&target_dir);
      }
      _ => return Err("未知的冲突处理策略。".into()),
    }
  }

  copy_directory(&source_dir, &target_dir)?;
  let final_relative_path = target_dir
    .join("SKILL.md")
    .strip_prefix(&target_root)
    .map(normalize_relative_path)
    .unwrap_or_else(|_| "SKILL.md".into());

  Ok(SyncSkillResult {
    final_skill_dir: target_dir.to_string_lossy().to_string(),
    final_relative_path,
    skipped: false,
  })
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
  let target = PathBuf::from(path);
  if !target.exists() {
    return Err("路径不存在。".into());
  }

  if cfg!(target_os = "windows") {
    if target.is_dir() {
      Command::new("explorer")
        .arg(target.as_os_str())
        .spawn()
        .map_err(|err| format!("打开目录失败：{err}"))?;
    } else {
      Command::new("cmd")
        .arg("/C")
        .arg("start")
        .arg("")
        .arg(target.as_os_str())
        .spawn()
        .map_err(|err| format!("打开文件失败：{err}"))?;
    }

    return Ok(());
  }

  Err("当前系统暂未实现打开路径功能。".into())
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
        toggle_main_window(&tray.app_handle());
      }
    })
    .build(app)?;

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .setup(|app| {
      build_tray(&app.handle())?;
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
      save_skill,
      sync_skill,
      open_path
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
