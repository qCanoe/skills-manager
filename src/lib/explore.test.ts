import { describe, expect, it } from 'vitest'

import { adaptExploreEntryToSkillRecord, BUILT_IN_REGISTRIES, loadExploreSkillContents } from './explore'
import type { ExploreEntry } from '../types'

const registry = BUILT_IN_REGISTRIES[0]!

const entry: ExploreEntry = {
  registryId: 'anthropics-skills',
  path: 'skills/creative/art-gen/SKILL.md',
  skillDir: 'skills/creative/art-gen',
  name: 'art gen',
  category: 'creative',
}

describe('adaptExploreEntryToSkillRecord', () => {
  it('builds correct id matching sourceId:relativePath convention', () => {
    const record = adaptExploreEntryToSkillRecord(entry, registry)
    expect(record.id).toBe('anthropics-skills:skills/creative/art-gen/SKILL.md')
    expect(record.relativePath).toBe('skills/creative/art-gen/SKILL.md')
    expect(record.id).toBe(`${record.sourceId}:${record.relativePath}`)
  })

  it('sets writable to false', () => {
    const record = adaptExploreEntryToSkillRecord(entry, registry)
    expect(record.writable).toBe(false)
  })

  it('sets sourceKind to explore', () => {
    const record = adaptExploreEntryToSkillRecord(entry, registry)
    expect(record.sourceKind).toBe('explore')
  })

  it('uses empty strings for unpopulated content fields', () => {
    const record = adaptExploreEntryToSkillRecord(entry, registry)
    expect(record.description).toBe('')
    expect(record.previewBody).toBe('')
  })

  it('merges loaded content when provided', () => {
    const record = adaptExploreEntryToSkillRecord(entry, registry, {
      description: 'A great skill',
      previewBody: '# Art Gen\n\nDoes art stuff.',
    })
    expect(record.description).toBe('A great skill')
    expect(record.previewBody).toBe('# Art Gen\n\nDoes art stuff.')
  })

  it('builds searchIndex from name and category', () => {
    const record = adaptExploreEntryToSkillRecord(entry, registry)
    expect(record.searchIndex).toContain('art gen')
    expect(record.searchIndex).toContain('creative')
  })
})

describe('BUILT_IN_REGISTRIES', () => {
  it('contains anthropics/skills as the first entry', () => {
    expect(registry.owner).toBe('anthropics')
    expect(registry.repo).toBe('skills')
    expect(registry.skillsPath).toBe('skills')
  })

  it('includes obra/superpowers', () => {
    const sp = BUILT_IN_REGISTRIES.find((r) => r.id === 'obra-superpowers')
    expect(sp).toBeDefined()
    expect(sp?.owner).toBe('obra')
    expect(sp?.repo).toBe('superpowers')
    expect(sp?.skillsPath).toBe('skills')
  })

  it('includes mattpocock/skills', () => {
    const mp = BUILT_IN_REGISTRIES.find((r) => r.id === 'mattpocock-skills')
    expect(mp).toBeDefined()
    expect(mp?.owner).toBe('mattpocock')
    expect(mp?.repo).toBe('skills')
    expect(mp?.skillsPath).toBe('skills')
  })

  it('includes garrytan/gstack with repo-root skill layout', () => {
    const gs = BUILT_IN_REGISTRIES.find((r) => r.id === 'garrytan-gstack')
    expect(gs).toBeDefined()
    expect(gs?.owner).toBe('garrytan')
    expect(gs?.repo).toBe('gstack')
    expect(gs?.repoRootSkills).toBe(true)
  })
})

describe('loadExploreSkillContents', () => {
  const entries: ExploreEntry[] = [
    { ...entry, path: 'skills/one/SKILL.md', skillDir: 'skills/one', name: 'one' },
    { ...entry, path: 'skills/two/SKILL.md', skillDir: 'skills/two', name: 'two' },
    { ...entry, path: 'skills/three/SKILL.md', skillDir: 'skills/three', name: 'three' },
  ]

  it('waits for every skill content before resolving', async () => {
    const progress: Array<{ loaded: number; total: number; path: string }> = []

    const result = await loadExploreSkillContents(registry, entries, {
      fetchContent: async (_registry, path) => `---\ndescription: ${path}\n---\n\nBody for ${path}`,
      onProgress: (event) => progress.push(event),
    })

    expect(result.rawByPath.size).toBe(entries.length)
    expect(result.loadedByPath.size).toBe(entries.length)
    expect(result.loadedByPath.get('skills/two/SKILL.md')?.description).toBe('skills/two/SKILL.md')
    expect(progress).toEqual([
      { loaded: 1, total: 3, path: 'skills/one/SKILL.md' },
      { loaded: 2, total: 3, path: 'skills/two/SKILL.md' },
      { loaded: 3, total: 3, path: 'skills/three/SKILL.md' },
    ])
  })

  it('limits concurrent content fetches', async () => {
    let active = 0
    let maxActive = 0

    await loadExploreSkillContents(registry, entries, {
      concurrency: 2,
      fetchContent: async (_registry, path) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await Promise.resolve()
        active -= 1
        return `---\ndescription: ${path}\n---`
      },
    })

    expect(maxActive).toBe(2)
  })
})
