use std::{
  collections::HashMap,
  sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Default)]
pub struct ExploreCache {
  pub index: HashMap<String, ExploreEntry>,
  pub content: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExploreEntry {}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GitHubTreeResponse {
  tree: Vec<GitHubTreeItem>,
  truncated: bool,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GitHubTreeItem {
  path: String,
  mode: String,
  #[serde(rename = "type")]
  item_type: String,
  sha: Option<String>,
  size: Option<u64>,
  url: Option<String>,
}

#[tauri::command]
pub fn explore_list_skills(
  _state: State<'_, Mutex<ExploreCache>>,
) -> Result<Vec<ExploreEntry>, String> {
  Ok(vec![])
}

#[tauri::command]
pub fn explore_fetch_skill(_path: String) -> Result<String, String> {
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
