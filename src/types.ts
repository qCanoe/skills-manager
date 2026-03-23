export type BrowseMode = 'sources' | 'collections'

export type SourceKind =
  | 'cursor'
  | 'codex'
  | 'claude'
  | 'agents'
  | 'windsurf'
  | 'amp'
  | 'custom'

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
  rawExcerpt: string
  modifiedAtEpoch?: number | null
}

/** One occurrence of a skill that was merged into a primary record. */
export interface SkillPathEntry {
  sourceId: string
  sourceLabel: string
  relativePath: string
  skillDir: string
  skillFile: string
  writable: boolean
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
  searchIndex: string
  /** Populated only in the "all sources" view when identical skills are merged. */
  mergedPaths?: SkillPathEntry[]
}

export interface SaveSkillRequest {
  source: SourceConfig
  relativePath: string
  rawContent: string
  overwrite: boolean
}

export type CopyConflictStrategy = 'skip' | 'overwrite' | 'rename'

export interface CopySkillRequest {
  sourceSkillDir: string
  relativePath: string
  targetSource: SourceConfig
  targetRelativePath: string
  conflictStrategy?: CopyConflictStrategy
}

export interface CopySourceRequest {
  source: SourceConfig
  targetSource: SourceConfig
  conflictStrategy?: CopyConflictStrategy
}

export interface CopySourceResult {
  status: 'copied' | 'conflict'
  copiedCount: number
  skippedCount: number
  overwrittenCount: number
  renamedCount: number
  conflictCount: number
  conflictRelativePaths: string[]
}

export interface CopySkillResult {
  status: 'copied' | 'conflict'
  finalSkillDir?: string
  finalRelativePath: string
  skipped: boolean
  conflictMessage?: string
}
