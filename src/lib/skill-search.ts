import type { SkillRecord } from '../types'

/** Split query into lowercase tokens (whitespace-separated AND match). */
export function parseSearchQuery(raw: string): string[] {
  const trimmed = raw.trim().toLowerCase()
  if (!trimmed) return []
  return trimmed.split(/\s+/).filter(Boolean)
}

/** Every token must appear as a substring of `searchIndex`. */
export function skillMatchesSearch(searchIndex: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true
  for (const t of tokens) {
    if (!searchIndex.includes(t)) return false
  }
  return true
}

/** Higher score appears earlier when sorting search results. */
export function skillSearchRankScore(skill: SkillRecord, tokens: string[]): number {
  if (tokens.length === 0) return 0
  const name = skill.name.trim().toLowerCase()
  const joined = tokens.join(' ')
  let score = 0

  if (name === joined) score += 220
  else if (name.startsWith(joined)) score += 170
  else if (tokens.every((t) => name.includes(t))) score += 130
  else if (name.includes(joined)) score += 95
  else if (tokens.length === 1 && name.includes(tokens[0])) score += 75
  else if (name.includes(tokens[0])) score += 45

  for (const t of tokens) {
    if (name.includes(t)) score += 14
  }

  const hay = skill.searchIndex
  const first = tokens[0]
  if (first) {
    const idx = hay.indexOf(first)
    if (idx !== -1) score += Math.max(0, 28 - Math.min(idx, 120) / 8)
  }

  return score
}

export function compareSkillsForSearch(a: SkillRecord, b: SkillRecord, tokens: string[]): number {
  if (tokens.length === 0) return a.name.localeCompare(b.name)
  const da = skillSearchRankScore(a, tokens)
  const db = skillSearchRankScore(b, tokens)
  if (da !== db) return db - da
  return a.name.localeCompare(b.name)
}

/** When `tokens` is empty, returns the same array reference (caller relies on existing order). */
export function orderSkillsForSearch(skills: SkillRecord[], tokens: string[]): SkillRecord[] {
  if (tokens.length === 0) return skills
  return [...skills].sort((a, b) => compareSkillsForSearch(a, b, tokens))
}
