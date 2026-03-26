import { describe, expect, it } from 'vitest'

import { adaptExploreEntryToSkillRecord, BUILT_IN_REGISTRIES } from './explore'
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
})
