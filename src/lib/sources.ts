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

export const SOURCES_EXPORT_SCHEMA_VERSION = 1 as const

export interface SourcesExportPayload {
  schemaVersion: typeof SOURCES_EXPORT_SCHEMA_VERSION
  exportedAt: string
  customSources: SourceConfig[]
  defaultSourceFlags?: { id: string; enabled: boolean }[]
}

function isValidSourceConfigSlice(items: unknown[]): items is SourceConfig[] {
  return items.every((item) => {
    if (!item || typeof item !== 'object') return false
    const o = item as Record<string, unknown>
    return (
      typeof o.id === 'string' &&
      typeof o.label === 'string' &&
      typeof o.rootPath === 'string' &&
      typeof o.writable === 'boolean' &&
      typeof o.kind === 'string' &&
      typeof o.enabled === 'boolean'
    )
  })
}

export function buildSourcesExport(
  sources: SourceConfig[],
  defaultSourceIds: Set<string>,
): SourcesExportPayload {
  const customSources = sources.filter((s) => s.kind === 'custom')
  const defaultSourceFlags = sources
    .filter((s) => defaultSourceIds.has(s.id))
    .map((s) => ({ id: s.id, enabled: s.enabled }))

  return {
    schemaVersion: SOURCES_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    customSources,
    defaultSourceFlags,
  }
}

export function stringifySourcesExport(payload: SourcesExportPayload): string {
  return JSON.stringify(payload, null, 2)
}

export function parseSourcesExportJson(raw: string): SourcesExportPayload | null {
  try {
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return null
    const o = data as Record<string, unknown>
    if (o.schemaVersion !== SOURCES_EXPORT_SCHEMA_VERSION) return null
    if (typeof o.exportedAt !== 'string') return null
    if (!Array.isArray(o.customSources)) return null
    if (!isValidSourceConfigSlice(o.customSources)) return null

    if (o.defaultSourceFlags !== undefined) {
      if (!Array.isArray(o.defaultSourceFlags)) return null
      for (const f of o.defaultSourceFlags) {
        if (!f || typeof f !== 'object') return null
        const e = f as Record<string, unknown>
        if (typeof e.id !== 'string' || typeof e.enabled !== 'boolean') return null
      }
    }

    return data as SourcesExportPayload
  } catch {
    return null
  }
}

/** Rebuilds default sources from the current machine and reapplies flags + custom entries from an export file. */
export function mergeImportedSources(
  defaultSources: SourceConfig[],
  payload: SourcesExportPayload,
): SourceConfig[] {
  const activeDefaults = defaultSources.filter((s) => !REMOVED_SOURCE_IDS.has(s.id))
  const flags = new Map((payload.defaultSourceFlags ?? []).map((f) => [f.id, f.enabled]))
  const mergedDefaults = activeDefaults.map((s) =>
    flags.has(s.id) ? { ...s, enabled: Boolean(flags.get(s.id)) } : s,
  )

  const usedPaths = new Set(mergedDefaults.map((s) => getComparablePath(s.rootPath)))
  const newCustoms: SourceConfig[] = []

  for (const raw of payload.customSources) {
    if (raw.kind !== 'custom') continue
    const rootPath = normalizePathInput(raw.rootPath)
    if (!rootPath) continue
    const p = getComparablePath(rootPath)
    if (usedPaths.has(p)) continue
    usedPaths.add(p)
    newCustoms.push({
      id: `custom-${crypto.randomUUID()}`,
      label: raw.label.trim() || rootPath,
      rootPath,
      writable: raw.writable,
      kind: 'custom',
      enabled: raw.enabled,
    })
  }

  return [...mergedDefaults, ...newCustoms]
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
    case 'claude':
      return 'Claude'
    default:
      return 'Custom'
  }
}
