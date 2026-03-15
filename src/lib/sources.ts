import type { SourceConfig } from '../types'

const STORAGE_KEY = 'skills-manager.sources.v1'

// IDs that were removed from the default source list and should never be
// restored from localStorage even if the backend still returns them temporarily.
const REMOVED_SOURCE_IDS = new Set(['cursor-builtins'])

export function loadStoredSources(defaultSources: SourceConfig[]): SourceConfig[] {
  // Filter out any removed sources the backend may still return during transition
  const activeDefaults = defaultSources.filter((s) => !REMOVED_SOURCE_IDS.has(s.id))

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return activeDefaults
  }

  try {
    const parsed = JSON.parse(raw) as SourceConfig[]
    const parsedMap = new Map(parsed.map((source) => [source.id, source]))

    const mergedDefaults = activeDefaults.map((source) => {
      const existing = parsedMap.get(source.id)
      if (!existing) return source
      return { ...source, enabled: existing.enabled }
    })

    const customSources = parsed.filter(
      (source) =>
        source.kind === 'custom' &&
        !REMOVED_SOURCE_IDS.has(source.id) &&
        !activeDefaults.some((d) => d.id === source.id),
    )

    return [...mergedDefaults, ...customSources]
  } catch {
    return activeDefaults
  }
}

export function persistSources(sources: SourceConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sources))
}

export function createCustomSource(label: string, rootPath: string, writable = true): SourceConfig {
  return {
    id: `custom-${crypto.randomUUID()}`,
    label: label.trim(),
    rootPath: rootPath.trim(),
    writable,
    kind: 'custom',
    enabled: true,
  }
}

export function normalizePathInput(value: string) {
  return value.trim().replace(/[\\/]+$/, '')
}

export function getComparablePath(value: string) {
  return normalizePathInput(value).replace(/\\/g, '/').toLowerCase()
}

export function isSameSourcePath(left: string, right: string) {
  return getComparablePath(left) === getComparablePath(right)
}

export function getSourceBadge(source: SourceConfig) {
  if (!source.writable) {
    return '只读'
  }

  switch (source.kind) {
    case 'cursor':
      return 'Cursor'
    case 'codex':
      return 'Codex'
    default:
      return 'Custom'
  }
}
