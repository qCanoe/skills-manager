import { describe, expect, it } from 'vitest'

import type { SourceConfig } from '../types'
import {
  buildSourcesExport,
  mergeImportedSources,
  parseSourcesExportJson,
  stringifySourcesExport,
  SOURCES_EXPORT_SCHEMA_VERSION,
} from './sources'

const baseDefaults: SourceConfig[] = [
  {
    id: 'cursor-personal',
    label: 'Cursor',
    rootPath: '/home/x/.cursor/skills',
    writable: true,
    kind: 'cursor',
    enabled: true,
  },
]

describe('sources export/import', () => {
  it('buildSourcesExport captures custom rows and default flags', () => {
    const custom: SourceConfig = {
      id: 'custom-x',
      label: 'Team',
      rootPath: '/team/skills',
      writable: true,
      kind: 'custom',
      enabled: true,
    }
    const sources = [...baseDefaults, custom]
    const payload = buildSourcesExport(sources, new Set(['cursor-personal']))
    expect(payload.schemaVersion).toBe(SOURCES_EXPORT_SCHEMA_VERSION)
    expect(payload.customSources).toHaveLength(1)
    expect(payload.customSources[0]?.rootPath).toBe('/team/skills')
    expect(payload.defaultSourceFlags).toEqual([{ id: 'cursor-personal', enabled: true }])
  })

  it('roundtrips JSON and mergeImportedSources applies flags and customs', () => {
    const custom: SourceConfig = {
      id: 'legacy-id',
      label: 'Team',
      rootPath: '/team/skills',
      writable: false,
      kind: 'custom',
      enabled: true,
    }
    const payload = buildSourcesExport(
      [
        { ...baseDefaults[0]!, enabled: false },
        custom,
      ],
      new Set(['cursor-personal']),
    )
    const parsed = parseSourcesExportJson(stringifySourcesExport(payload))
    expect(parsed).not.toBeNull()
    const merged = mergeImportedSources(baseDefaults, parsed!)
    expect(merged.find((s) => s.id === 'cursor-personal')?.enabled).toBe(false)
    const customs = merged.filter((s) => s.kind === 'custom')
    expect(customs).toHaveLength(1)
    expect(customs[0]?.rootPath).toBe('/team/skills')
    expect(customs[0]?.writable).toBe(false)
    expect(customs[0]?.id.startsWith('custom-')).toBe(true)
  })

  it('parseSourcesExportJson rejects invalid payload', () => {
    expect(parseSourcesExportJson('')).toBeNull()
    expect(parseSourcesExportJson('{}')).toBeNull()
    expect(parseSourcesExportJson('{"schemaVersion":2,"exportedAt":"x","customSources":[]}')).toBeNull()
  })

  it('mergeImportedSources skips duplicate paths', () => {
    const payload = parseSourcesExportJson(
      stringifySourcesExport({
        schemaVersion: 1,
        exportedAt: 't',
        customSources: [
          {
            id: 'a',
            label: 'A',
            rootPath: '/home/x/.cursor/skills',
            writable: true,
            kind: 'custom',
            enabled: true,
          },
        ],
      }),
    )
    expect(payload).not.toBeNull()
    const merged = mergeImportedSources(baseDefaults, payload!)
    expect(merged.filter((s) => s.kind === 'custom')).toHaveLength(0)
  })
})
