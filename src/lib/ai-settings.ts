const API_BASE_KEY = 'skills-manager.ai-recommend.api-base'
const API_KEY_KEY = 'skills-manager.ai-recommend.api-key'
const MODEL_KEY = 'skills-manager.ai-recommend.model'

const DEFAULT_BASE = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

export interface AiRecommendSettings {
  apiBase: string
  apiKey: string
  model: string
}

export function loadAiRecommendSettings(): AiRecommendSettings {
  return {
    apiBase: localStorage.getItem(API_BASE_KEY) ?? DEFAULT_BASE,
    apiKey: localStorage.getItem(API_KEY_KEY) ?? '',
    model: localStorage.getItem(MODEL_KEY) ?? DEFAULT_MODEL,
  }
}

/** 推荐功能依赖模型 API；三项均需非空（trim 后）。 */
export function isAiRecommendConfigured(settings: AiRecommendSettings): boolean {
  return (
    settings.apiBase.trim() !== '' &&
    settings.apiKey.trim() !== '' &&
    settings.model.trim() !== ''
  )
}

export function persistAiRecommendSettings(patch: Partial<AiRecommendSettings>) {
  if (patch.apiBase !== undefined) {
    const v = patch.apiBase.trim() || DEFAULT_BASE
    localStorage.setItem(API_BASE_KEY, v)
  }
  if (patch.apiKey !== undefined) {
    localStorage.setItem(API_KEY_KEY, patch.apiKey)
  }
  if (patch.model !== undefined) {
    const v = patch.model.trim() || DEFAULT_MODEL
    localStorage.setItem(MODEL_KEY, v)
  }
}
