export type SourceKind = 'cursor' | 'codex' | 'builtin' | 'custom'

export interface SourceConfig {
  id: string
  label: string
  rootPath: string
  writable: boolean
  kind: SourceKind | string
  enabled: boolean
}

export interface RawSkillRecord {
  sourceId: string
  rootPath: string
  skillDir: string
  skillFile: string
  relativePath: string
  extras: string[]
  rawContent: string
  modifiedAtEpoch?: number | null
}

export interface SkillRecord extends RawSkillRecord {
  id: string
  sourceLabel: string
  sourceKind: SourceKind | string
  writable: boolean
  name: string
  description: string
  namespace?: string
  previewBody: string
  tags: string[]
}

export interface SaveSkillRequest {
  source: SourceConfig
  relativePath: string
  rawContent: string
  overwrite: boolean
}

export type SyncConflictStrategy = 'skip' | 'overwrite' | 'rename'

export interface SyncSkillRequest {
  sourceSkillDir: string
  relativePath: string
  targetSource: SourceConfig
  conflictStrategy: SyncConflictStrategy
}
