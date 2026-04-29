use std::{
  collections::HashSet,
  error::Error,
  fs,
  path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

use super::{append_discovered_skills, DiscoveredSkill, SourceConfig};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecommendScanRequest {
  pub sources: Vec<SourceConfig>,
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

#[tauri::command]
pub async fn scan_recommend_inventory(request: RecommendScanRequest) -> Result<Vec<DiscoveredSkill>, String> {
  tauri::async_runtime::spawn_blocking(move || scan_recommend_inventory_blocking(request))
    .await
    .map_err(|e| format!("扫描中断：{e}"))?
}

fn scan_recommend_inventory_blocking(request: RecommendScanRequest) -> Result<Vec<DiscoveredSkill>, String> {
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

/// OpenRouter 兼容端点默认 Base（与应用内「API Base」一致即可走 OpenRouter）。
pub const OPENROUTER_API_BASE: &str = "https://openrouter.ai/api/v1";

fn api_base_targets_openrouter(base: &str) -> bool {
  let trim = base.trim().trim_end_matches('/');
  let normalized = trim.to_ascii_lowercase();
  normalized.contains("openrouter.ai")
    || normalized.contains("openrouter.com")
    || trim.eq_ignore_ascii_case(OPENROUTER_API_BASE.trim_end_matches('/'))
}

/// OpenRouter 在「API Base」为该端点时读取以下环境变量并附加可选请求头（应用署名与排行，不参与鉴权）。
/// 优先级：`SKILLS_MANAGER_OPENROUTER_*` 优先于通用的 `OPENROUTER_*`。
///
/// | 变量 | 请求头 |
/// |------|--------|
/// | `SKILLS_MANAGER_OPENROUTER_HTTP_REFERER` 或 `OPENROUTER_HTTP_REFERER` | `HTTP-Referer` |
/// | `SKILLS_MANAGER_OPENROUTER_TITLE` 或 `OPENROUTER_APP_TITLE` | `X-OpenRouter-Title` |
/// | `SKILLS_MANAGER_OPENROUTER_CATEGORIES` 或 `OPENROUTER_CATEGORIES` | `X-OpenRouter-Categories` |
fn openrouter_optional_headers_from_env() -> Vec<(&'static str, String)> {
  let mut pairs: Vec<(&'static str, String)> = Vec::new();
  push_env_as_header(
    &mut pairs,
    &[
      "SKILLS_MANAGER_OPENROUTER_HTTP_REFERER",
      "OPENROUTER_HTTP_REFERER",
    ],
    "HTTP-Referer",
  );
  push_env_as_header(
    &mut pairs,
    &["SKILLS_MANAGER_OPENROUTER_TITLE", "OPENROUTER_APP_TITLE"],
    "X-OpenRouter-Title",
  );
  push_env_as_header(
    &mut pairs,
    &["SKILLS_MANAGER_OPENROUTER_CATEGORIES", "OPENROUTER_CATEGORIES"],
    "X-OpenRouter-Categories",
  );
  pairs
}

fn push_env_as_header(out: &mut Vec<(&'static str, String)>, keys: &[&'static str], header_name: &'static str) {
  for key in keys {
    if let Ok(v) = std::env::var(key) {
      let t = v.trim().to_string();
      if !t.is_empty() {
        out.push((header_name, t));
        return;
      }
    }
  }
}

fn error_chain_text(err: &dyn Error) -> String {
  let mut s = err.to_string();
  let mut src = err.source();
  while let Some(e) = src {
    s.push_str("；");
    s.push_str(&e.to_string());
    src = e.source();
  }
  s
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
pub async fn recommend_ai_rerank(request: RecommendAiRequest) -> Result<RecommendAiRerankResponse, String> {
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

  // HTTP/1.1：部分网络/代理对 HTTP/2 不稳定，会出现 “connection closed before message completed”。
  let client = reqwest::Client::builder()
    .http1_only()
    .timeout(std::time::Duration::from_secs(60))
    .build()
    .map_err(|e| format!("HTTP 客户端初始化失败：{e}"))?;

  let mut attempt = 0u32;
  let resp = loop {
    let mut req = client
      .post(&url)
      .header("Authorization", format!("Bearer {}", request.api_key.trim()))
      .header("Content-Type", "application/json");

    if api_base_targets_openrouter(base) {
      for (name, value) in openrouter_optional_headers_from_env() {
        req = req.header(name, value);
      }
    }

    match req.json(&body).send().await {
      Ok(r) => break r,
      Err(e) => {
        attempt += 1;
        if attempt >= 3 {
          return Err(format!("请求模型失败：{}", error_chain_text(&e)));
        }
        tokio::time::sleep(std::time::Duration::from_millis(400 * attempt as u64)).await;
      }
    }
  };

  let status = resp.status();
  // 部分模型/OpenRouter 链路可能返回严格 UTF-8 以外的字节，`text()` 会报 “error decoding response body”.
  let bytes = resp
    .bytes()
    .await
    .map_err(|e| format!("读取响应失败：{}", error_chain_text(&e)))?;
  let text = String::from_utf8_lossy(&bytes).into_owned();
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
