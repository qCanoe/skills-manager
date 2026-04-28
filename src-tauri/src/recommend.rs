use std::{
  collections::HashSet,
  ffi::OsStr,
  fs,
  path::{Path, PathBuf},
  time::UNIX_EPOCH,
};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

use super::{
  append_discovered_skills, build_raw_excerpt, collect_extras, home_join, normalize_relative_path,
  DiscoveredSkill, SourceConfig,
};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendScanRequest {
  pub sources: Vec<SourceConfig>,
  pub include_plugin_cache: bool,
  pub workspace_root: Option<String>,
}

fn dedupe_by_skill_file(discovered: Vec<DiscoveredSkill>) -> Vec<DiscoveredSkill> {
  let mut seen = HashSet::<String>::new();
  let mut out = Vec::new();
  for row in discovered {
    let key = row.skill_file.to_lowercase();
    if seen.insert(key) {
      out.push(row);
    }
  }
  out
}

fn path_contains_skills_segment(path: &Path) -> bool {
  path.iter().any(|c| {
    c.to_string_lossy().eq_ignore_ascii_case("skills")
  })
}

fn append_plugin_cache_skills(discovered: &mut Vec<DiscoveredSkill>) -> Result<(), String> {
  let cache_root = home_join(&[".cursor", "plugins", "cache"])?;
  let root = PathBuf::from(&cache_root);
  if !root.is_dir() {
    return Ok(());
  }

  let pseudo = SourceConfig {
    id: "rec-plugin-skills".into(),
    label: "插件 skills".into(),
    root_path: cache_root.clone(),
    writable: false,
    kind: "custom".into(),
    enabled: true,
  };

  for entry in WalkDir::new(&root)
    .max_depth(18)
    .into_iter()
    .filter_entry(|e| e.file_name() != OsStr::new(".git"))
    .filter_map(Result::ok)
  {
    if !entry.file_type().is_file() {
      continue;
    }
    if !entry.file_name().to_string_lossy().eq_ignore_ascii_case("SKILL.md") {
      continue;
    }
    if !path_contains_skills_segment(entry.path()) {
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
      source_id: pseudo.id.clone(),
      root_path: pseudo.root_path.clone(),
      skill_dir: skill_dir.to_string_lossy().to_string(),
      skill_file: skill_file.to_string_lossy().to_string(),
      relative_path: normalize_relative_path(relative),
      extras,
      raw_excerpt: build_raw_excerpt(&raw_content),
      modified_at_epoch,
    });
  }

  Ok(())
}

#[tauri::command]
pub fn scan_recommend_inventory(request: RecommendScanRequest) -> Result<Vec<DiscoveredSkill>, String> {
  let mut discovered = Vec::new();

  for source in request.sources.into_iter().filter(|s| s.enabled) {
    append_discovered_skills(&mut discovered, &source);
  }

  if let Some(ws) = request
    .workspace_root
    .as_ref()
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
  {
    let root = PathBuf::from(ws);
    if root.is_dir() {
      let pairs = [
        (
          "rec-workspace-cursor",
          "项目 · .cursor/skills",
          root.join(".cursor").join("skills"),
        ),
        (
          "rec-workspace-agents",
          "项目 · .agents/skills",
          root.join(".agents").join("skills"),
        ),
      ];
      for (id, label, path) in pairs {
        if path.is_dir() {
          let pseudo = SourceConfig {
            id: id.into(),
            label: label.into(),
            root_path: path.to_string_lossy().to_string(),
            writable: false,
            kind: "custom".into(),
            enabled: true,
          };
          append_discovered_skills(&mut discovered, &pseudo);
        }
      }
    }
  }

  if request.include_plugin_cache {
    append_plugin_cache_skills(&mut discovered)?;
  }

  Ok(dedupe_by_skill_file(discovered))
}

fn read_limited(path: &Path, max: usize) -> Option<String> {
  fs::read_to_string(path)
    .ok()
    .map(|s| {
      let end = s.len().min(max);
      s.chars().take(end).collect()
    })
}

#[tauri::command]
pub fn read_recommend_project_context(workspace_root: Option<String>) -> Result<String, String> {
  let Some(ws) = workspace_root
    .as_ref()
    .map(|s| s.trim())
    .filter(|s| !s.is_empty())
  else {
    return Ok("未提供项目路径。".into());
  };

  let root = PathBuf::from(ws);
  if !root.is_dir() {
    return Ok(format!("项目路径不存在或不是目录：{ws}"));
  }

  let mut parts: Vec<String> = Vec::new();

  let pkg = root.join("package.json");
  if pkg.is_file() {
    if let Some(text) = read_limited(&pkg, 48_000) {
      let mut hints = Vec::new();
      let lower = text.to_lowercase();
      if lower.contains("\"react\"") || lower.contains("react-dom") {
        hints.push("React");
      }
      if lower.contains("\"vue\"") {
        hints.push("Vue");
      }
      if lower.contains("next") {
        hints.push("Next.js");
      }
      if lower.contains("vite") {
        hints.push("Vite");
      }
      if lower.contains("vitest") {
        hints.push("Vitest");
      }
      if lower.contains("eslint") {
        hints.push("ESLint");
      }
      if lower.contains("typescript") || lower.contains("\"ts\"") {
        hints.push("TypeScript");
      }
      if !hints.is_empty() {
        parts.push(format!("package.json 线索：{}", hints.join("、")));
      }
    }
  }

  let cargo = root.join("Cargo.toml");
  if cargo.is_file() {
    if let Some(text) = read_limited(&cargo, 24_000) {
      if text.contains("[package]") && text.to_lowercase().contains("tauri") {
        parts.push("根目录 Cargo.toml 含 Tauri 相关依赖线索。".into());
      }
    }
  }

  let tauri_cargo = root.join("src-tauri").join("Cargo.toml");
  if tauri_cargo.is_file() {
    parts.push("存在 src-tauri/Cargo.toml（Tauri 应用结构）。".into());
  }

  if parts.is_empty() {
    Ok(format!(
      "路径 {ws} 下未发现 package.json / Cargo.toml 等明显栈线索（或文件为空）。"
    ))
  } else {
    Ok(parts.join(" "))
  }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendAiRequest {
  pub api_base: String,
  pub api_key: String,
  pub model: String,
  pub user_prompt: String,
  pub project_context: String,
  pub candidates_json: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRecommendationItem {
  pub skill_id: String,
  pub rank: u32,
  pub score: f64,
  pub reason: String,
  pub when_to_use: String,
  pub when_not_to_use: Option<String>,
  pub confidence: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendAiRerankResponse {
  pub recommendations: Vec<AiRecommendationItem>,
}

#[derive(Debug, Deserialize)]
struct AiRecParsed {
  #[serde(alias = "skillId")]
  skill_id: String,
  rank: u32,
  score: f64,
  reason: String,
  #[serde(alias = "whenToUse")]
  when_to_use: String,
  #[serde(default, alias = "whenNotToUse")]
  when_not_to_use: Option<String>,
  confidence: String,
}

#[derive(Debug, Deserialize)]
struct AiPayload {
  recommendations: Vec<AiRecParsed>,
}

fn extract_json_object(text: &str) -> Result<String, String> {
  let t = text.trim();
  let start = t.find('{').ok_or_else(|| "模型输出中未找到 JSON 对象。".to_string())?;
  let end = t.rfind('}').ok_or_else(|| "模型输出中未找到完整 JSON 对象。".to_string())?;
  if end < start {
    return Err("JSON 解析失败。".into());
  }
  Ok(t[start..=end].to_string())
}

#[tauri::command]
pub fn recommend_ai_rerank(request: RecommendAiRequest) -> Result<RecommendAiRerankResponse, String> {
  let base = request.api_base.trim().trim_end_matches('/');
  if base.is_empty() {
    return Err("API Base 不能为空。".into());
  }
  if request.api_key.trim().is_empty() {
    return Err("API Key 不能为空。".into());
  }
  if request.model.trim().is_empty() {
    return Err("模型名称不能为空。".into());
  }

  let url = format!("{base}/chat/completions");

  let system = r#"你是 skill 选型助手。用户会给出任务描述、项目上下文摘要、以及候选 skill 列表（JSON）。
请从中挑出最适合的 3 个 skill（若候选不足 3 个则全部返回），按优先级排序。
只输出一个 JSON 对象，不要 Markdown，不要代码围栏。格式严格如下：
{"recommendations":[{"skillId":"候选中的 id","rank":1,"score":0.9,"reason":"一句话","whenToUse":"何时用","whenNotToUse":"可选：何时不要用","confidence":"high|medium|low"}]}
confidence 必须是小写英文。score 为 0 到 1。"#;

  let user = format!(
    "【用户任务】\n{}\n\n【项目上下文】\n{}\n\n【候选列表 JSON】\n{}",
    request.user_prompt.trim(),
    request.project_context.trim(),
    request.candidates_json.trim()
  );

  let body = serde_json::json!({
    "model": request.model.trim(),
    "temperature": 0.2,
    "messages": [
      {"role": "system", "content": system},
      {"role": "user", "content": user}
    ]
  });

  let client = reqwest::blocking::Client::builder()
    .timeout(std::time::Duration::from_secs(60))
    .build()
    .map_err(|e| format!("HTTP 客户端初始化失败：{e}"))?;

  let resp = client
    .post(&url)
    .header("Authorization", format!("Bearer {}", request.api_key.trim()))
    .header("Content-Type", "application/json")
    .json(&body)
    .send()
    .map_err(|e| format!("请求模型失败：{e}"))?;

  let status = resp.status();
  let text = resp.text().map_err(|e| format!("读取响应失败：{e}"))?;
  if !status.is_success() {
    return Err(format!("模型 API 错误（HTTP {status}）：{text}"));
  }

  let v: serde_json::Value =
    serde_json::from_str(&text).map_err(|e| format!("解析模型响应 JSON 失败：{e}"))?;
  let content = v
    .get("choices")
    .and_then(|c| c.get(0))
    .and_then(|c| c.get("message"))
    .and_then(|m| m.get("content"))
    .and_then(|c| c.as_str())
    .ok_or_else(|| format!("模型响应缺少 choices[0].message.content：{text}"))?;

  let json_str = extract_json_object(content)?;
  let parsed: AiPayload =
    serde_json::from_str(&json_str).map_err(|e| format!("解析推荐 JSON 失败：{e}"))?;

  let mut recs: Vec<AiRecommendationItem> = parsed
    .recommendations
    .into_iter()
    .map(|r| AiRecommendationItem {
      skill_id: r.skill_id,
      rank: r.rank,
      score: r.score,
      reason: r.reason,
      when_to_use: r.when_to_use,
      when_not_to_use: r.when_not_to_use,
      confidence: r.confidence,
    })
    .collect();

  recs.sort_by(|a, b| a.rank.cmp(&b.rank));
  recs.truncate(3);

  Ok(RecommendAiRerankResponse {
    recommendations: recs,
  })
}
