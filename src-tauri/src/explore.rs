use std::{
  collections::HashMap,
  sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::State;

/// Session-level cache. Cleared by the frontend refresh action.
#[derive(Default)]
pub struct ExploreCache {
  /// key: "owner/repo" → list of skills under that registry
  pub index: HashMap<String, Vec<ExploreEntry>>,
  /// key: "owner/repo::path/to/SKILL.md"
  pub content: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreEntry {
  pub path: String,       // "skills/creative/art-gen/SKILL.md"
  pub skill_dir: String,  // "skills/creative/art-gen"
  pub name: String,       // "art gen"
  pub category: String,   // "creative"
}

// GitHub API response shapes
#[derive(Deserialize)]
struct GitHubTreeResponse {
  truncated: bool,
  tree: Vec<GitHubTreeItem>,
}

#[derive(Deserialize)]
struct GitHubTreeItem {
  path: String,
  #[serde(rename = "type")]
  item_type: String,
}

/// Returns Some(ExploreEntry) for `{skills_path}/.../SKILL.md` under the skills root.
///
/// Supports both layouts used in the wild:
/// - **Flat** (e.g. anthropics/skills): `skills/my-skill/SKILL.md` — one folder under `skills/`.
/// - **Grouped**: `skills/group/my-skill/SKILL.md` — category = first segment, display name = last folder.
fn parse_skill_under_skills_path(path: &str, skills_path: &str) -> Option<ExploreEntry> {
  let prefix = format!("{skills_path}/");
  let relative = path.strip_prefix(&prefix)?;
  let middle = relative.strip_suffix("/SKILL.md")?;
  if middle.is_empty() {
    return None;
  }
  let parts: Vec<&str> = middle.split('/').filter(|p| !p.is_empty()).collect();
  if parts.is_empty() {
    return None;
  }
  let category = parts.first().copied()?.to_string();
  let name_raw = parts.last().copied()?;
  if name_raw.is_empty() {
    return None;
  }
  Some(ExploreEntry {
    path: path.to_string(),
    skill_dir: format!("{skills_path}/{middle}"),
    name: name_raw.replace('-', " "),
    category,
  })
}

/// Repo-root layout (e.g. garrytan/gstack): `browse/SKILL.md`, `openclaw/skills/foo/SKILL.md`.
/// Category = first path segment; display name = leaf folder. Skips root `SKILL.md` and non-`SKILL.md` blobs.
fn parse_repo_root_skill_path(path: &str) -> Option<ExploreEntry> {
  let middle = path.strip_suffix("/SKILL.md")?;
  if middle.is_empty() {
    return None;
  }
  let parts: Vec<&str> = middle.split('/').filter(|p| !p.is_empty()).collect();
  if parts.is_empty() {
    return None;
  }
  let category = parts.first().copied()?.to_string();
  let name_raw = parts.last().copied()?;
  if name_raw.is_empty() {
    return None;
  }
  Some(ExploreEntry {
    path: path.to_string(),
    skill_dir: middle.to_string(),
    name: name_raw.replace('-', " "),
    category,
  })
}

fn parse_skill_path(path: &str, skills_path: &str, repo_root_skills: bool) -> Option<ExploreEntry> {
  if repo_root_skills {
    parse_repo_root_skill_path(path)
  } else {
    parse_skill_under_skills_path(path, skills_path)
  }
}

#[tauri::command]
pub fn explore_list_skills(
  owner: String,
  repo: String,
  branch: String,
  skills_path: String,
  repo_root_skills: bool,
  state: State<'_, Mutex<ExploreCache>>,
) -> Result<Vec<ExploreEntry>, String> {
  let cache_key = format!("{owner}/{repo}");

  {
    let cache = state.lock().map_err(|e| e.to_string())?;
    if let Some(cached) = cache.index.get(&cache_key) {
      return Ok(cached.clone());
    }
  }

  let url = format!(
    "https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
  );

  let client = reqwest::blocking::Client::new();
  let resp = client
    .get(&url)
    .header("User-Agent", "skill-manager")
    .send()
    .map_err(|e| format!("网络请求失败：{e}"))?;

  let status = resp.status();
  if status == 403 || status == 429 {
    return Err("GitHub API 速率限制，请稍后重试。".into());
  }
  if !status.is_success() {
    return Err(format!("GitHub API 返回错误（HTTP {status}）。"));
  }

  let data: GitHubTreeResponse = resp
    .json()
    .map_err(|e| format!("解析响应失败：{e}"))?;

  if data.truncated {
    return Err("仓库目录树过大，无法完整加载。".into());
  }

  let entries: Vec<ExploreEntry> = data
    .tree
    .iter()
    .filter(|item| item.item_type == "blob")
    .filter_map(|item| parse_skill_path(&item.path, &skills_path, repo_root_skills))
    .collect();

  {
    let mut cache = state.lock().map_err(|e| e.to_string())?;
    cache.index.insert(cache_key, entries.clone());
  }

  Ok(entries)
}

#[tauri::command]
pub fn explore_fetch_skill(
  owner: String,
  repo: String,
  branch: String,
  path: String,
  state: State<'_, Mutex<ExploreCache>>,
) -> Result<String, String> {
  let cache_key = format!("{owner}/{repo}::{path}");

  {
    let cache = state.lock().map_err(|e| e.to_string())?;
    if let Some(cached) = cache.content.get(&cache_key) {
      return Ok(cached.clone());
    }
  }

  let url = format!(
    "https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
  );

  let client = reqwest::blocking::Client::new();
  let resp = client
    .get(&url)
    .header("User-Agent", "skill-manager")
    .send()
    .map_err(|e| format!("网络请求失败：{e}"))?;

  let status = resp.status();
  if status == 404 {
    return Err("文件不存在。".into());
  }
  if !status.is_success() {
    return Err(format!("拉取内容失败（HTTP {status}）。"));
  }

  let content = resp.text().map_err(|e| format!("读取响应失败：{e}"))?;

  {
    let mut cache = state.lock().map_err(|e| e.to_string())?;
    cache.content.insert(cache_key, content.clone());
  }

  Ok(content)
}

#[tauri::command]
pub fn explore_clear_cache(state: State<'_, Mutex<ExploreCache>>) -> Result<(), String> {
  let mut cache = state
    .lock()
    .map_err(|_| "Explore cache mutex poisoned.".to_string())?;
  cache.index.clear();
  cache.content.clear();
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn make_item(path: &str) -> GitHubTreeItem {
    GitHubTreeItem {
      path: path.to_string(),
      item_type: "blob".to_string(),
    }
  }

  #[test]
  fn parses_valid_skill_path() {
    let item = make_item("skills/creative/art-gen/SKILL.md");
    let result = parse_skill_path(&item.path, "skills", false);
    assert!(result.is_some());
    let entry = result.unwrap();
    assert_eq!(entry.category, "creative");
    assert_eq!(entry.name, "art gen");
    assert_eq!(entry.skill_dir, "skills/creative/art-gen");
    assert_eq!(entry.path, "skills/creative/art-gen/SKILL.md");
  }

  #[test]
  fn skips_too_shallow() {
    let item = make_item("skills/SKILL.md");
    assert!(parse_skill_path(&item.path, "skills", false).is_none());
  }

  #[test]
  fn parses_nested_three_levels() {
    // Deeper than group/name is OK: category = first segment, name = leaf folder.
    let item = make_item("skills/creative/art-gen/sub/SKILL.md");
    let entry = parse_skill_path(&item.path, "skills", false).unwrap();
    assert_eq!(entry.category, "creative");
    assert_eq!(entry.name, "sub");
    assert_eq!(entry.skill_dir, "skills/creative/art-gen/sub");
  }

  #[test]
  fn parses_flat_anthropic_layout() {
    // anthropics/skills uses skills/<skill-folder>/SKILL.md (single segment under skills/).
    let item = make_item("skills/algorithmic-art/SKILL.md");
    let entry = parse_skill_path(&item.path, "skills", false).unwrap();
    assert_eq!(entry.category, "algorithmic-art");
    assert_eq!(entry.name, "algorithmic art");
    assert_eq!(entry.skill_dir, "skills/algorithmic-art");
  }

  #[test]
  fn skips_non_skill_files() {
    let item = make_item("skills/creative/art-gen/notes.md");
    assert!(parse_skill_path(&item.path, "skills", false).is_none());
  }

  #[test]
  fn skips_wrong_prefix() {
    let item = make_item("other/creative/art-gen/SKILL.md");
    assert!(parse_skill_path(&item.path, "skills", false).is_none());
  }

  #[test]
  fn converts_hyphens_to_spaces_in_name() {
    let item = make_item("skills/dev/my-cool-skill/SKILL.md");
    let entry = parse_skill_path(&item.path, "skills", false).unwrap();
    assert_eq!(entry.name, "my cool skill");
  }

  #[test]
  fn parses_repo_root_skill() {
    let item = make_item("browse/SKILL.md");
    let entry = parse_skill_path(&item.path, "", true).unwrap();
    assert_eq!(entry.category, "browse");
    assert_eq!(entry.name, "browse");
    assert_eq!(entry.skill_dir, "browse");
    assert_eq!(entry.path, "browse/SKILL.md");
  }

  #[test]
  fn skips_root_level_skill_md_in_repo_root_mode() {
    let item = make_item("SKILL.md");
    assert!(parse_skill_path(&item.path, "", true).is_none());
  }

  #[test]
  fn parses_nested_repo_root_skill() {
    let item = make_item("openclaw/skills/gstack-openclaw-retro/SKILL.md");
    let entry = parse_skill_path(&item.path, "", true).unwrap();
    assert_eq!(entry.category, "openclaw");
    assert_eq!(entry.name, "gstack openclaw retro");
    assert_eq!(entry.skill_dir, "openclaw/skills/gstack-openclaw-retro");
  }

  #[test]
  fn repo_root_mode_ignores_skills_prefix_layout() {
    let item = make_item("skills/algorithmic-art/SKILL.md");
    let entry = parse_skill_path(&item.path, "skills", true).unwrap();
    assert_eq!(entry.category, "skills");
    assert_eq!(entry.name, "algorithmic art");
  }
}
