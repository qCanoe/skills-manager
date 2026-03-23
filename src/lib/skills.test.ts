import { describe, expect, it } from 'vitest'

import {
  filterPathEntriesBySourceSkillCount,
  mergeSkillsByContent,
  normalizeSkills,
  pathEntriesForSkill,
} from './skills'
import type { RawSkillRecord, SkillRecord, SourceConfig } from '../types'

const stubSource: SourceConfig = {
  id: 'test',
  label: 'Test',
  rootPath: '/tmp',
  writable: true,
  kind: 'custom',
  enabled: true,
}

function rawSkill(relativePath: string, rawExcerpt: string): RawSkillRecord {
  return {
    sourceId: 'test',
    rootPath: '/tmp',
    skillDir: '/tmp/x',
    skillFile: '/tmp/x/SKILL.md',
    relativePath,
    extras: [],
    rawExcerpt,
  }
}

describe('normalizeSkills', () => {
  it('parses YAML block literal description (description: |) instead of mistaking | for text', () => {
    const raw = rawSkill(
      'browse/SKILL.md',
      `---
name: browse
description: |
  Fast headless browser for QA testing.
  Second line here.
---

# Body
`,
    )
    const [skill] = normalizeSkills([raw], [stubSource])
    expect(skill?.description).toContain('Fast headless browser')
    expect(skill?.description).toContain('Second line')
    expect(skill?.description).not.toBe('|')
  })

  it('parses folded block description (description: >)', () => {
    const raw = rawSkill(
      'x/SKILL.md',
      `---
name: x
description: >
  First line
  continues folded.
---

# Hi
`,
    )
    const [skill] = normalizeSkills([raw], [stubSource])
    expect(skill?.description).toMatch(/First line.*continues folded/)
    expect(skill?.description).not.toContain('\n')
  })

  it('keeps one row per name per source, preferring paths outside .agents/skills', () => {
    const agents = rawSkill(
      'gstack/.agents/skills/gstack-browse/SKILL.md',
      `---
name: browse
description: Agent copy
---
`,
    )
    const flat = rawSkill(
      'gstack/browse/SKILL.md',
      `---
name: browse
description: Canonical copy
---
`,
    )
    const out = normalizeSkills([agents, flat], [stubSource])
    expect(out).toHaveLength(1)
    expect(out[0]?.relativePath).toBe('gstack/browse/SKILL.md')
    expect(out[0]?.description).toBe('Canonical copy')
  })

  it('does not dedupe the same skill name across different sources', () => {
    const s1: SourceConfig = { ...stubSource, id: 'a', label: 'A' }
    const s2: SourceConfig = { ...stubSource, id: 'b', label: 'B' }
    const excerpt = '---\nname: dup\n---\n'
    const rawA: RawSkillRecord = { ...rawSkill('x/SKILL.md', excerpt), sourceId: 'a' }
    const rawB: RawSkillRecord = { ...rawSkill('x/SKILL.md', excerpt), sourceId: 'b' }
    const out = normalizeSkills([rawA, rawB], [s1, s2])
    expect(out).toHaveLength(2)
  })
})

function stubSkill(overrides: Partial<SkillRecord> = {}): SkillRecord {
  return {
    id: 'test:x/SKILL.md',
    sourceId: 'test',
    sourceLabel: 'Test',
    sourceKind: 'custom',
    rootPath: '/tmp',
    skillDir: '/tmp/x',
    skillFile: '/tmp/x/SKILL.md',
    relativePath: 'x/SKILL.md',
    extras: [],
    rawExcerpt: '',
    writable: true,
    name: 'my-skill',
    description: 'desc',
    previewBody: 'body line',
    namespace: undefined,
    tags: [],
    searchIndex: 'my-skill desc body line',
    ...overrides,
  }
}

describe('mergeSkillsByContent', () => {
  it('returns skills unchanged when there are no duplicates', () => {
    const a = stubSkill({ id: 'a', name: 'alpha', previewBody: 'alpha body' })
    const b = stubSkill({ id: 'b', name: 'beta', previewBody: 'beta body' })
    expect(mergeSkillsByContent([a, b])).toHaveLength(2)
  })

  it('merges skills with same name and previewBody into one entry', () => {
    const a = stubSkill({ id: 'src1:x/SKILL.md', sourceId: 'src1', sourceLabel: 'Source 1', relativePath: 'x/SKILL.md' })
    const b = stubSkill({ id: 'src2:x/SKILL.md', sourceId: 'src2', sourceLabel: 'Source 2', relativePath: 'x/SKILL.md' })
    const out = mergeSkillsByContent([a, b])
    expect(out).toHaveLength(1)
    expect(out[0]?.mergedPaths).toHaveLength(1)
  })

  it('prefers writable copy as primary', () => {
    const readonly = stubSkill({ id: 'r:x/SKILL.md', sourceId: 'r', writable: false, relativePath: 'x/SKILL.md' })
    const writable = stubSkill({ id: 'w:x/SKILL.md', sourceId: 'w', writable: true, relativePath: 'y/SKILL.md' })
    const [primary] = mergeSkillsByContent([readonly, writable])
    expect(primary?.writable).toBe(true)
    expect(primary?.mergedPaths?.[0]?.writable).toBe(false)
  })

  it('stores alternate path info in mergedPaths', () => {
    const a = stubSkill({ id: 'a:path-a/SKILL.md', sourceId: 'a', sourceLabel: 'A', relativePath: 'path-a/SKILL.md', skillDir: '/a' })
    const b = stubSkill({ id: 'b:path-b/SKILL.md', sourceId: 'b', sourceLabel: 'B', relativePath: 'path-b/SKILL.md', skillDir: '/b' })
    const [merged] = mergeSkillsByContent([a, b])
    expect(merged?.mergedPaths).toEqual([
      expect.objectContaining({ sourceId: 'b', sourceLabel: 'B', relativePath: 'path-b/SKILL.md' }),
    ])
  })

  it('does not merge skills with same name but different content', () => {
    const a = stubSkill({ id: 'a', name: 'foo', previewBody: 'content A' })
    const b = stubSkill({ id: 'b', name: 'foo', previewBody: 'content B' })
    expect(mergeSkillsByContent([a, b])).toHaveLength(2)
  })
})

describe('filterPathEntriesBySourceSkillCount', () => {
  it('drops merged paths when that source has zero indexed skills', () => {
    const a = stubSkill({
      id: 'a:path-a/SKILL.md',
      sourceId: 'a',
      sourceLabel: 'A',
      relativePath: 'path-a/SKILL.md',
      skillDir: '/a',
    })
    const b = stubSkill({
      id: 'b:path-b/SKILL.md',
      sourceId: 'b',
      sourceLabel: 'B',
      relativePath: 'path-b/SKILL.md',
      skillDir: '/b',
    })
    const [merged] = mergeSkillsByContent([a, b])
    expect(merged).toBeDefined()
    const entries = pathEntriesForSkill(merged!)
    expect(entries).toHaveLength(2)
    expect(filterPathEntriesBySourceSkillCount(entries, { a: 1, b: 0 })).toHaveLength(1)
    expect(filterPathEntriesBySourceSkillCount(entries, { a: 1, b: 1 })).toHaveLength(2)
  })
})
