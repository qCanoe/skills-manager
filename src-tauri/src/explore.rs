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

/// Returns Some(ExploreEntry) if path is a valid skill at exactly depth 2
/// below skills_path (i.e. `{skills_path}/{category}/{name}/SKILL.md`).
fn parse_skill_path(path: &str, skills_path: &str) -> Option<ExploreEntry> {
  let prefix = format!("{skills_path}/");
  let relative = path.strip_prefix(&prefix)?; // "category/name/SKILL.md"
  let middle = relative.strip_suffix("/SKILL.md")?; // "category/name"
  let parts: Vec<&str> = middle.split('/').collect();
  if parts.len() != 2 {
    return None;
  }
  let (category, name_raw) = (parts[0], parts[1]);
  if category.is_empty() || name_raw.is_empty() {
    return None;
  }
  Some(ExploreEntry {
    path: path.to_string(),
    skill_dir: format!("{skills_path}/{category}/{name_raw}"),
    name: name_raw.replace('-', " "),
    category: category.to_string(),
  })
}

#[tauri::command]
pub fn explore_list_skills(
  owner: String,
  repo: String,
  branch: String,
  skills_path: String,
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
    .filter_map(|item| parse_skill_path(&item.path, &skills_path))
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
    let result = parse_skill_path(&item.path, "skills");
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
    assert!(parse_skill_path(&item.path, "skills").is_none());
  }

  #[test]
  fn skips_too_deep() {
    let item = make_item("skills/creative/art-gen/sub/SKILL.md");
    assert!(parse_skill_path(&item.path, "skills").is_none());
  }

  #[test]
  fn skips_non_skill_files() {
    let item = make_item("skills/creative/art-gen/notes.md");
    assert!(parse_skill_path(&item.path, "skills").is_none());
  }

  #[test]
  fn skips_wrong_prefix() {
    let item = make_item("other/creative/art-gen/SKILL.md");
    assert!(parse_skill_path(&item.path, "skills").is_none());
  }

  #[test]
  fn converts_hyphens_to_spaces_in_name() {
    let item = make_item("skills/dev/my-cool-skill/SKILL.md");
    let entry = parse_skill_path(&item.path, "skills").unwrap();
    assert_eq!(entry.name, "my cool skill");
  }
}
