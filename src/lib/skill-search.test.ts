import { describe, expect, it } from 'vitest'

import {
  compareSkillsForSearch,
  orderSkillsForSearch,
  parseSearchQuery,
  skillMatchesSearch,
  skillSearchRankScore,
} from './skill-search'
import type { SkillRecord } from '../types'

function minimalSkill(overrides: Partial<SkillRecord> & Pick<SkillRecord, 'name' | 'searchIndex'>): SkillRecord {
  return {
    id: 'x',
    sourceId: 's',
    rootPath: '',
    skillDir: '',
    skillFile: 'SKILL.md',
    relativePath: 'a/SKILL.md',
    extras: [],
    rawExcerpt: '',
    modifiedAtEpoch: null,
    sourceLabel: '',
    sourceKind: 'custom',
    writable: true,
    description: '',
    previewBody: '',
    tags: [],
    ...overrides,
  }
}

describe('parseSearchQuery', () => {
  it('returns empty for blank input', () => {
    expect(parseSearchQuery('')).toEqual([])
    expect(parseSearchQuery('   ')).toEqual([])
  })

  it('splits on whitespace and lowercases', () => {
    expect(parseSearchQuery('  Foo  BAR ')).toEqual(['foo', 'bar'])
  })
})

describe('skillMatchesSearch', () => {
  it('matches when every token appears', () => {
    const hay = 'alpha beta gamma'
    expect(skillMatchesSearch(hay, ['alpha', 'gamma'])).toBe(true)
    expect(skillMatchesSearch(hay, ['beta'])).toBe(true)
  })

  it('fails when any token is missing', () => {
    expect(skillMatchesSearch('alpha beta', ['alpha', 'missing'])).toBe(false)
  })
})

describe('skillSearchRankScore', () => {
  it('ranks exact name matches higher than body-only', () => {
    const exact = minimalSkill({ name: 'react hooks', searchIndex: 'react hooks desc body' })
    const bodyOnly = minimalSkill({ name: 'other', searchIndex: 'react hooks tutorial in body' })
    expect(skillSearchRankScore(exact, ['react', 'hooks'])).toBeGreaterThan(
      skillSearchRankScore(bodyOnly, ['react', 'hooks']),
    )
  })
})

describe('orderSkillsForSearch', () => {
  it('returns same reference when no tokens', () => {
    const list = [minimalSkill({ name: 'b', searchIndex: 'b' }), minimalSkill({ name: 'a', searchIndex: 'a' })]
    expect(orderSkillsForSearch(list, [])).toBe(list)
  })

  it('sorts by relevance then name', () => {
    const a = minimalSkill({ id: '1', name: 'zz', searchIndex: 'react hooks zz' })
    const b = minimalSkill({ id: '2', name: 'react hooks', searchIndex: 'react hooks' })
    const out = orderSkillsForSearch([a, b], ['react', 'hooks'])
    expect(out[0]).toBe(b)
  })
})

describe('compareSkillsForSearch', () => {
  it('falls back to locale name order when scores tie', () => {
    const x = minimalSkill({ id: '1', name: 'm', searchIndex: 'foo bar m' })
    const y = minimalSkill({ id: '2', name: 'n', searchIndex: 'foo bar n' })
    expect(compareSkillsForSearch(x, y, ['foo'])).toBeLessThan(0)
    expect(compareSkillsForSearch(y, x, ['foo'])).toBeGreaterThan(0)
  })
})
