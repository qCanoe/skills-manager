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

// GitHub API response shapes (used in Task 2+)
#[derive(Deserialize)]
#[allow(dead_code)]
struct GitHubTreeResponse {
  truncated: bool,
  tree: Vec<GitHubTreeItem>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct GitHubTreeItem {
  path: String,
  #[serde(rename = "type")]
  item_type: String,
}

#[tauri::command]
pub fn explore_list_skills(
  _owner: String,
  _repo: String,
  _branch: String,
  _skills_path: String,
  _state: State<'_, Mutex<ExploreCache>>,
) -> Result<Vec<ExploreEntry>, String> {
  Ok(vec![])
}

#[tauri::command]
pub fn explore_fetch_skill(
  _owner: String,
  _repo: String,
  _branch: String,
  _path: String,
  _state: State<'_, Mutex<ExploreCache>>,
) -> Result<String, String> {
  Ok(String::new())
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
