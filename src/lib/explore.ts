import { invoke } from '@tauri-apps/api/core'

import type { ExploreEntry, ExploreRegistry, RawSkillRecord, SkillRecord, SourceConfig } from '../types'
import { normalizeSkills } from './skills'

export const BUILT_IN_REGISTRIES: ExploreRegistry[] = [
  {
    id: 'anthropics-skills',
    label: 'anthropics/skills',
    owner: 'anthropics',
    repo: 'skills',
    branch: 'main',
    skillsPath: 'skills',
  },
  {
    id: 'obra-superpowers',
    label: 'obra/superpowers',
    owner: 'obra',
    repo: 'superpowers',
    branch: 'main',
    skillsPath: 'skills',
  },
  {
    id: 'garrytan-gstack',
    label: 'garrytan/gstack',
    owner: 'garrytan',
    repo: 'gstack',
    branch: 'main',
    skillsPath: '',
    repoRootSkills: true,
  },
]

/** Payload returned from Rust (no registryId). */
type ExploreEntryFromRust = Omit<ExploreEntry, 'registryId'>

export async function listExploreSkills(registry: ExploreRegistry): Promise<ExploreEntry[]> {
  const rows = await invoke<ExploreEntryFromRust[]>('explore_list_skills', {
    owner: registry.owner,
    repo: registry.repo,
    branch: registry.branch,
    skillsPath: registry.skillsPath,
    repoRootSkills: registry.repoRootSkills ?? false,
  })
  return rows.map((row) => ({ ...row, registryId: registry.id }))
}

export async function fetchExploreSkillContent(
  registry: ExploreRegistry,
  path: string,
): Promise<string> {
  return invoke<string>('explore_fetch_skill', {
    owner: registry.owner,
    repo: registry.repo,
    branch: registry.branch,
    path,
  })
}

export async function clearExploreCache(): Promise<void> {
  await invoke('explore_clear_cache')
}

export interface LoadedContent {
  description: string
  previewBody: string
}

export interface ExploreContentProgress {
  loaded: number
  total: number
  path: string
}

export interface ExploreContentLoadResult {
  rawByPath: Map<string, string>
  loadedByPath: Map<string, LoadedContent>
}

interface ExploreContentLoadOptions {
  concurrency?: number
  fetchContent?: (registry: ExploreRegistry, path: string) => Promise<string>
  onProgress?: (event: ExploreContentProgress) => void
}

/** Parse raw SKILL.md using the same pipeline as local scans. */
export function parseExploreSkillContent(rawContent: string): LoadedContent {
  const fakeSource: SourceConfig = {
    id: '__explore__',
    label: '',
    rootPath: '',
    writable: false,
    kind: 'explore',
    enabled: true,
  }
  const fakeRaw: RawSkillRecord = {
    sourceId: '__explore__',
    rootPath: '',
    skillDir: '',
    skillFile: 'SKILL.md',
    relativePath: 'SKILL.md',
    extras: [],
    rawExcerpt: rawContent,
  }
  const normalized = normalizeSkills([fakeRaw], [fakeSource])[0]
  if (!normalized) {
    return { description: '', previewBody: rawContent }
  }
  return { description: normalized.description, previewBody: normalized.previewBody }
}

export async function loadExploreSkillContents(
  registry: ExploreRegistry,
  entries: ExploreEntry[],
  options: ExploreContentLoadOptions = {},
): Promise<ExploreContentLoadResult> {
  const total = entries.length
  const rawByPath = new Map<string, string>()
  const loadedByPath = new Map<string, LoadedContent>()
  const fetchContent = options.fetchContent ?? fetchExploreSkillContent
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, total || 1))
  let nextIndex = 0
  let loaded = 0

  const worker = async () => {
    while (nextIndex < entries.length) {
      const entry = entries[nextIndex]
      nextIndex += 1
      if (!entry) continue

      const raw = await fetchContent(registry, entry.path)
      rawByPath.set(entry.path, raw)
      loadedByPath.set(entry.path, parseExploreSkillContent(raw))
      loaded += 1
      options.onProgress?.({ loaded, total, path: entry.path })
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  return { rawByPath, loadedByPath }
}

/** Map a remote explore row to a SkillRecord for SkillList / SkillPreview. */
export function adaptExploreEntryToSkillRecord(
  entry: ExploreEntry,
  registry: ExploreRegistry,
  loadedContent?: LoadedContent,
): SkillRecord {
  const relativePath = `${entry.skillDir}/SKILL.md`
  return {
    id: `${entry.registryId}:${relativePath}`,
    sourceId: entry.registryId,
    rootPath: '',
    skillDir: entry.skillDir,
    skillFile: 'SKILL.md',
    relativePath,
    extras: [],
    rawExcerpt: '',
    modifiedAtEpoch: null,
    sourceLabel: registry.label,
    sourceKind: 'explore',
    writable: false,
    name: entry.name,
    description: loadedContent?.description ?? '',
    namespace: undefined,
    previewBody: loadedContent?.previewBody ?? '',
    tags: [],
    searchIndex: `${entry.name} ${entry.category}`.toLowerCase(),
    mergedPaths: undefined,
    exploreCategory: entry.category,
  }
}
