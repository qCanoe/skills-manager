import type { SkillRecord, SkillRecommendationMeta, SourceConfig } from '../types'

export const RECOMMEND_ALL_SCOPE_ID = '__recommend_all__'
export const RECOMMEND_PLUGIN_SCOPE_ID = '__recommend_plugin_cache__'

/** Synthetic sources for ids produced by `scan_recommend_inventory` (labels only; roots come from scan rows). */
export const RECOMMEND_SYNTHETIC_SOURCES: SourceConfig[] = [
  {
    id: 'rec-workspace-cursor',
    label: '项目 · .cursor/skills',
    rootPath: '',
    writable: false,
    kind: 'custom',
    enabled: true,
  },
  {
    id: 'rec-workspace-agents',
    label: '项目 · .agents/skills',
    rootPath: '',
    writable: false,
    kind: 'custom',
    enabled: true,
  },
  {
    id: 'rec-plugin-skills',
    label: '插件 skills',
    rootPath: '',
    writable: false,
    kind: 'custom',
    enabled: true,
  },
]

export function mergeSourcesForRecommend(userSources: SourceConfig[]): SourceConfig[] {
  const ids = new Set(userSources.map((s) => s.id))
  const extra = RECOMMEND_SYNTHETIC_SOURCES.filter((s) => !ids.has(s.id))
  return [...userSources, ...extra]
}

export interface RecommendScanScope {
  sources: SourceConfig[]
  includePluginCache: boolean
}

export function buildRecommendScanScope(userSources: SourceConfig[], scopeId: string): RecommendScanScope {
  const enabledSources = userSources.filter((source) => source.enabled)

  if (scopeId === RECOMMEND_PLUGIN_SCOPE_ID) {
    return { sources: [], includePluginCache: true }
  }

  const selectedSource = enabledSources.find((source) => source.id === scopeId)
  if (selectedSource) {
    return { sources: [selectedSource], includePluginCache: false }
  }

  return { sources: enabledSources, includePluginCache: true }
}

export interface RecommendCandidatePayload {
  id: string
  name: string
  description: string
  sourceLabel: string
  relativePath: string
}

export interface AiRerankItem {
  skillId: string
  rank: number
  score: number
  reason: string
  whenToUse: string
  whenNotToUse?: string
  confidence: string
}

export interface AiRerankResponse {
  recommendations: AiRerankItem[]
}

export function tokenizeRecommendPrompt(text: string): string[] {
  const t = text.trim().toLowerCase()
  if (!t) return []
  return t
    .split(/[^a-z0-9\u4e00-\u9fff]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
}

export function scoreSkillForRecommend(skill: SkillRecord, tokens: string[], contextLower: string): number {
  const hay = `${skill.name} ${skill.description} ${skill.previewBody} ${skill.relativePath} ${skill.sourceLabel} ${skill.searchIndex}`
    .toLowerCase()

  let score = 0
  for (const tok of tokens) {
    if (hay.includes(tok)) score += 4
  }

  if (contextLower) {
    const ctxTokens = tokenizeRecommendPrompt(contextLower)
    for (const tok of ctxTokens) {
      if (tok.length >= 3 && hay.includes(tok)) score += 1.5
    }
  }

  if (skill.sourceId.startsWith('rec-workspace')) score += 1.2
  if (skill.sourceId === 'rec-plugin-skills') score += 0.6

  return score
}

export function rankRecommendCandidates(
  skills: SkillRecord[],
  prompt: string,
  projectContext: string,
  topK: number,
): SkillRecord[] {
  const tokens = tokenizeRecommendPrompt(prompt)
  const ctx = projectContext.toLowerCase()
  const scored = skills.map((s) => ({
    s,
    sc: scoreSkillForRecommend(s, tokens, ctx),
  }))
  scored.sort((a, b) => b.sc - a.sc || a.s.name.localeCompare(b.s.name))
  const positive = scored.filter((x) => x.sc > 0).map((x) => x.s)
  if (positive.length >= topK) return positive.slice(0, topK)
  if (positive.length > 0) return positive.slice(0, topK)
  return [...skills].sort((a, b) => a.name.localeCompare(b.name)).slice(0, topK)
}

export function buildRecommendCandidatePayload(skills: SkillRecord[]): RecommendCandidatePayload[] {
  return skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    sourceLabel: s.sourceLabel,
    relativePath: s.relativePath,
  }))
}

export function normalizeConfidence(raw: string): 'high' | 'medium' | 'low' | undefined {
  const v = raw.trim().toLowerCase()
  if (v === 'high' || v === 'medium' || v === 'low') return v
  return undefined
}

export function mergeAiRecommendations(
  localOrdered: SkillRecord[],
  ai: AiRerankResponse | null,
): { ordered: SkillRecord[]; metaBySkillId: Record<string, SkillRecommendationMeta> } {
  const byId = new Map(localOrdered.map((s) => [s.id, s]))
  const metaBySkillId: Record<string, SkillRecommendationMeta> = {}

  if (!ai?.recommendations?.length) {
    const ordered = localOrdered.slice(0, 3)
    ordered.forEach((s, i) => {
      metaBySkillId[s.id] = {
        rank: i + 1,
        reason: '根据任务描述与项目摘要做的本地关键词匹配。',
        whenToUse: '当你需要与描述相近的 workflow 或领域能力时。',
        aiGenerated: false,
      }
    })
    return { ordered, metaBySkillId }
  }

  const ordered: SkillRecord[] = []
  const seen = new Set<string>()

  const sorted = [...ai.recommendations].sort((a, b) => a.rank - b.rank)
  for (const row of sorted) {
    const skill = byId.get(row.skillId)
    if (!skill || seen.has(skill.id)) continue
    seen.add(skill.id)
    ordered.push(skill)
    metaBySkillId[skill.id] = {
      rank: row.rank,
      reason: row.reason,
      whenToUse: row.whenToUse,
      whenNotToUse: row.whenNotToUse,
      confidence: normalizeConfidence(row.confidence),
      aiGenerated: true,
    }
    if (ordered.length >= 3) break
  }

  for (const s of localOrdered) {
    if (ordered.length >= 3) break
    if (seen.has(s.id)) continue
    seen.add(s.id)
    ordered.push(s)
    metaBySkillId[s.id] = {
      rank: ordered.length,
      reason: '本地排序补充（AI 未返回或未能匹配该条目）。',
      whenToUse: '可作为备选查看描述与路径。',
      aiGenerated: false,
    }
  }

  return { ordered, metaBySkillId }
}
