import { describe, expect, it, beforeEach } from 'vitest'

import {
  addMember,
  collectionIdsContainingSkill,
  createCollection,
  createEmptyCollectionsState,
  filterSkillsForCollection,
  loadCollectionsState,
  memberKey,
  parseCollectionsStateJson,
  removeMember,
  saveCollectionsState,
  skillMatchesMemberRefs,
} from './collections'
import type { SkillRecord } from '../types'

function stubSkill(partial: Partial<SkillRecord> & Pick<SkillRecord, 'id' | 'sourceId' | 'relativePath'>): SkillRecord {
  return {
    rootPath: '/r',
    skillDir: '/d',
    skillFile: '/f',
    extras: [],
    rawExcerpt: '',
    sourceLabel: 'L',
    sourceKind: 'cursor',
    writable: true,
    name: 'n',
    description: 'd',
    previewBody: 'p',
    tags: [],
    searchIndex: 'x',
    ...partial,
  }
}

describe('memberKey', () => {
  it('normalizes slashes in path', () => {
    expect(memberKey({ sourceId: 'a', relativePath: 'x\\y\\SKILL.md' })).toBe('a:x/y/SKILL.md')
  })
})

describe('filterSkillsForCollection', () => {
  it('keeps skill when primary ref matches', () => {
    const s = stubSkill({
      id: 'src:a/b.md',
      sourceId: 'src',
      relativePath: 'a/b.md',
    })
    const out = filterSkillsForCollection([s], [{ sourceId: 'src', relativePath: 'a/b.md' }])
    expect(out).toHaveLength(1)
  })

  it('keeps merged row when secondary path matches member', () => {
    const primary = stubSkill({
      id: 's1:p1/SKILL.md',
      sourceId: 's1',
      relativePath: 'p1/SKILL.md',
      mergedPaths: [
        {
          sourceId: 's2',
          sourceLabel: 'S2',
          relativePath: 'p2/SKILL.md',
          skillDir: '/d2',
          skillFile: '/f2',
          writable: true,
        },
      ],
    })
    const out = filterSkillsForCollection([primary], [{ sourceId: 's2', relativePath: 'p2/SKILL.md' }])
    expect(out).toHaveLength(1)
  })
})

describe('skillMatchesMemberRefs', () => {
  it('returns true for merged path only', () => {
    const skill = stubSkill({
      id: 'a:x',
      sourceId: 'a',
      relativePath: 'x',
      mergedPaths: [
        {
          sourceId: 'b',
          sourceLabel: 'B',
          relativePath: 'y/SKILL.md',
          skillDir: '/',
          skillFile: '/f',
          writable: false,
        },
      ],
    })
    const keys = new Set(['b:y/SKILL.md'])
    expect(skillMatchesMemberRefs(skill, keys)).toBe(true)
  })
})

describe('addMember / removeMember dedupe', () => {
  it('does not duplicate same ref', () => {
    let state = createEmptyCollectionsState()
    const created = createCollection(state, 'C1')
    state = created.state
    const cid = created.id
    const ref = { sourceId: 'a', relativePath: 'b/SKILL.md' }
    state = addMember(state, cid, ref)
    state = addMember(state, cid, ref)
    expect(state.membersByCollectionId[cid]).toHaveLength(1)
    state = removeMember(state, cid, ref)
    expect(state.membersByCollectionId[cid]).toHaveLength(0)
  })
})

describe('collectionIdsContainingSkill', () => {
  it('lists collections that include primary path', () => {
    let state = createEmptyCollectionsState()
    const a = createCollection(state, 'A')
    state = a.state
    const b = createCollection(state, 'B')
    state = b.state
    state = addMember(state, a.id, { sourceId: 's', relativePath: 'x/SKILL.md' })
    const skill = stubSkill({
      id: 's:x/SKILL.md',
      sourceId: 's',
      relativePath: 'x/SKILL.md',
    })
    const ids = collectionIdsContainingSkill(state, skill)
    expect(ids).toContain(a.id)
    expect(ids).not.toContain(b.id)
  })
})

describe('parseCollectionsStateJson', () => {
  it('returns empty on bad version', () => {
    const s = parseCollectionsStateJson(JSON.stringify({ schemaVersion: 0, collections: [], membersByCollectionId: {} }))
    expect(s.collections).toHaveLength(0)
  })
})

describe('localStorage round-trip', () => {
  const store: Record<string, string> = {}

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k]
    globalThis.localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k]
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length
      },
    } as Storage
  })

  it('save and load', () => {
    let state = createEmptyCollectionsState()
    const { state: s2, id } = createCollection(state, 'Test')
    state = addMember(s2, id, { sourceId: 'x', relativePath: 'y.md' })
    saveCollectionsState(state)
    const loaded = loadCollectionsState()
    expect(loaded.collections).toHaveLength(1)
    expect(loaded.membersByCollectionId[id]).toHaveLength(1)
  })
})
