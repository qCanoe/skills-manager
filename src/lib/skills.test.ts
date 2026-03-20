import { describe, expect, it } from 'vitest'

import { normalizeSkills } from './skills'
import type { RawSkillRecord, SourceConfig } from '../types'

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
