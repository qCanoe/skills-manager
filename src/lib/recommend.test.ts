import { describe, expect, it } from 'vitest'

import type { SkillRecord } from '../types'
import {
  RECOMMEND_ALL_SCOPE_ID,
  buildRecommendScanScope,
  mergeAiRecommendations,
  rankRecommendCandidates,
  scoreSkillForRecommend,
  tokenizeRecommendPrompt,
} from './recommend'

function fakeSkill(partial: Partial<SkillRecord> & Pick<SkillRecord, 'id' | 'name'>): SkillRecord {
  return {
    sourceId: 's1',
    rootPath: '/r',
    skillDir: '/r/x',
    skillFile: '/r/x/SKILL.md',
    relativePath: 'x/SKILL.md',
    extras: [],
    rawExcerpt: '',
    modifiedAtEpoch: null,
    sourceLabel: 'Test',
    sourceKind: 'custom',
    writable: true,
    description: '',
    namespace: undefined,
    previewBody: '',
    tags: [],
    searchIndex: `${partial.name}`.toLowerCase(),
    ...partial,
  }
}

describe('tokenizeRecommendPrompt', () => {
  it('splits mixed text', () => {
    expect(tokenizeRecommendPrompt('优化 React 性能，Tauri')).toContain('react')
    expect(tokenizeRecommendPrompt('优化 React 性能，Tauri')).toContain('tauri')
  })
})

describe('scoreSkillForRecommend', () => {
  it('boosts keyword overlap', () => {
    const s = fakeSkill({
      id: 'a',
      name: 'frontend-design',
      description: 'React 组件与界面',
    })
    const sc = scoreSkillForRecommend(s, tokenizeRecommendPrompt('我要做 React 界面'), 'react app')
    expect(sc).toBeGreaterThan(0)
  })
})

describe('rankRecommendCandidates', () => {
  it('orders by score', () => {
    const a = fakeSkill({ id: '1', name: 'alpha', description: 'rust tauri' })
    const b = fakeSkill({ id: '2', name: 'beta', description: 'generic' })
    const out = rankRecommendCandidates([b, a], 'Tauri 桌面', '', 2)
    expect(out[0]!.id).toBe('1')
  })
})

describe('buildRecommendScanScope', () => {
  const sources = [
    {
      id: 'cursor',
      label: 'Cursor',
      rootPath: '/cursor',
      writable: true,
      kind: 'cursor',
      enabled: true,
    },
    {
      id: 'agents',
      label: 'Agents',
      rootPath: '/agents',
      writable: true,
      kind: 'agents',
      enabled: false,
    },
  ]

  it('uses all enabled sources for the all scope', () => {
    const scope = buildRecommendScanScope(sources, RECOMMEND_ALL_SCOPE_ID)

    expect(scope.sources.map((s) => s.id)).toEqual(['cursor'])
  })

  it('uses only the selected configured source', () => {
    const scope = buildRecommendScanScope(sources, 'cursor')

    expect(scope.sources.map((s) => s.id)).toEqual(['cursor'])
  })
})

describe('mergeAiRecommendations', () => {
  it('uses AI order when present', () => {
    const a = fakeSkill({ id: 'a', name: 'a' })
    const b = fakeSkill({ id: 'b', name: 'b' })
    const { ordered, metaBySkillId } = mergeAiRecommendations([a, b], {
      recommendations: [
        {
          skillId: 'b',
          rank: 1,
          score: 0.9,
          reason: 'fits',
          whenToUse: 'now',
          confidence: 'high',
        },
      ],
    })
    expect(ordered[0]!.id).toBe('b')
    expect(metaBySkillId.b?.aiGenerated).toBe(true)
  })

  it('falls back to local when AI missing', () => {
    const a = fakeSkill({ id: 'a', name: 'a' })
    const { ordered, metaBySkillId } = mergeAiRecommendations([a], null)
    expect(ordered).toHaveLength(1)
    expect(metaBySkillId.a?.aiGenerated).toBe(false)
  })
})
