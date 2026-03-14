import type { SourceConfig } from '../types'

const STORAGE_KEY = 'skills-manager.sources.v1'

export function loadStoredSources(defaultSources: SourceConfig[]): SourceConfig[] {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return defaultSources
  }

  try {
    const parsed = JSON.parse(raw) as SourceConfig[]
    const parsedMap = new Map(parsed.map((source) => [source.id, source]))

    const mergedDefaults = defaultSources.map((source) => {
      const existing = parsedMap.get(source.id)
      if (!existing) {
        return source
      }

      return {
        ...source,
        enabled: existing.enabled,
      }
    })

    const customSources = parsed.filter(
      (source) => !defaultSources.some((defaultSource) => defaultSource.id === source.id),
    )

    return [...mergedDefaults, ...customSources]
  } catch {
    return defaultSources
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

export function getSourceBadge(source: SourceConfig) {
  if (!source.writable) {
    return '只读'
  }

  switch (source.kind) {
    case 'cursor':
      return 'Cursor'
    case 'codex':
      return 'Codex'
    case 'builtin':
      return 'Built-in'
    default:
      return 'Custom'
  }
}
