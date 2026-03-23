import type { SkillRecord } from '../types'

export const COLLECTIONS_STORAGE_KEY = 'skills-manager.collections.v1'
export const COLLECTIONS_SCHEMA_VERSION = 1 as const

export type CollectionMemberRef = { sourceId: string; relativePath: string }

export type SkillCollection = {
  id: string
  name: string
  createdAt: string
}

export type CollectionsState = {
  schemaVersion: typeof COLLECTIONS_SCHEMA_VERSION
  collections: SkillCollection[]
  membersByCollectionId: Record<string, CollectionMemberRef[]>
}

export function normalizeCollectionRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, '/')
}

/** Stable key aligned with `SkillRecord.id` (`sourceId:relativePath`). */
export function memberKey(ref: CollectionMemberRef): string {
  return `${ref.sourceId}:${normalizeCollectionRelativePath(ref.relativePath)}`
}

export function skillPrimaryKey(skill: SkillRecord): string {
  return `${skill.sourceId}:${normalizeCollectionRelativePath(skill.relativePath)}`
}

export function skillMatchesMemberRefs(skill: SkillRecord, refKeys: Set<string>): boolean {
  if (refKeys.has(skillPrimaryKey(skill))) return true
  for (const m of skill.mergedPaths ?? []) {
    const key = `${m.sourceId}:${normalizeCollectionRelativePath(m.relativePath)}`
    if (refKeys.has(key)) return true
  }
  return false
}

export function filterSkillsForCollection(skills: SkillRecord[], members: CollectionMemberRef[]): SkillRecord[] {
  const keys = new Set(members.map(memberKey))
  return skills.filter((s) => skillMatchesMemberRefs(s, keys))
}

export function createEmptyCollectionsState(): CollectionsState {
  return {
    schemaVersion: COLLECTIONS_SCHEMA_VERSION,
    collections: [],
    membersByCollectionId: {},
  }
}

function isSkillCollection(x: unknown): x is SkillCollection {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.name === 'string' &&
    typeof o.createdAt === 'string'
  )
}

function isMemberRef(x: unknown): x is CollectionMemberRef {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.sourceId === 'string' && typeof o.relativePath === 'string'
}

export function parseCollectionsStateJson(raw: string | null): CollectionsState {
  if (!raw) return createEmptyCollectionsState()
  try {
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return createEmptyCollectionsState()
    const o = data as Record<string, unknown>
    if (o.schemaVersion !== COLLECTIONS_SCHEMA_VERSION) return createEmptyCollectionsState()

    const collectionsIn = Array.isArray(o.collections) ? o.collections.filter(isSkillCollection) : []
    const membersRaw = o.membersByCollectionId
    const membersByCollectionId: Record<string, CollectionMemberRef[]> = {}
    if (membersRaw && typeof membersRaw === 'object' && !Array.isArray(membersRaw)) {
      for (const [cid, list] of Object.entries(membersRaw)) {
        if (Array.isArray(list)) {
          const refs = list.filter(isMemberRef).map((r) => ({
            sourceId: r.sourceId,
            relativePath: normalizeCollectionRelativePath(r.relativePath),
          }))
          membersByCollectionId[cid] = dedupeMemberRefs(refs)
        }
      }
    }

    return {
      schemaVersion: COLLECTIONS_SCHEMA_VERSION,
      collections: collectionsIn,
      membersByCollectionId,
    }
  } catch {
    return createEmptyCollectionsState()
  }
}

function dedupeMemberRefs(refs: CollectionMemberRef[]): CollectionMemberRef[] {
  const seen = new Set<string>()
  const out: CollectionMemberRef[] = []
  for (const r of refs) {
    const k = memberKey(r)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

export function loadCollectionsState(): CollectionsState {
  if (typeof localStorage === 'undefined') return createEmptyCollectionsState()
  return parseCollectionsStateJson(localStorage.getItem(COLLECTIONS_STORAGE_KEY))
}

export function saveCollectionsState(state: CollectionsState): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(state))
}

export function createCollection(
  state: CollectionsState,
  name: string,
): { state: CollectionsState; id: string } {
  const id = crypto.randomUUID()
  const trimmed = name.trim()
  const col: SkillCollection = {
    id,
    name: trimmed || '未命名',
    createdAt: new Date().toISOString(),
  }
  return {
    id,
    state: {
      ...state,
      collections: [...state.collections, col],
      membersByCollectionId: { ...state.membersByCollectionId, [id]: [] },
    },
  }
}

export function renameCollection(state: CollectionsState, id: string, name: string): CollectionsState {
  const trimmed = name.trim()
  return {
    ...state,
    collections: state.collections.map((c) =>
      c.id === id ? { ...c, name: trimmed || c.name } : c,
    ),
  }
}

export function deleteCollection(state: CollectionsState, id: string): CollectionsState {
  const nextMembers = { ...state.membersByCollectionId }
  delete nextMembers[id]
  return {
    ...state,
    collections: state.collections.filter((c) => c.id !== id),
    membersByCollectionId: nextMembers,
  }
}

export function listMembers(state: CollectionsState, collectionId: string): CollectionMemberRef[] {
  return state.membersByCollectionId[collectionId] ?? []
}

export function addMember(
  state: CollectionsState,
  collectionId: string,
  ref: CollectionMemberRef,
): CollectionsState {
  const normalized: CollectionMemberRef = {
    sourceId: ref.sourceId,
    relativePath: normalizeCollectionRelativePath(ref.relativePath),
  }
  const key = memberKey(normalized)
  const list = state.membersByCollectionId[collectionId] ?? []
  if (list.some((r) => memberKey(r) === key)) return state
  return {
    ...state,
    membersByCollectionId: {
      ...state.membersByCollectionId,
      [collectionId]: [...list, normalized],
    },
  }
}

export function removeMember(
  state: CollectionsState,
  collectionId: string,
  ref: CollectionMemberRef,
): CollectionsState {
  const key = memberKey({
    sourceId: ref.sourceId,
    relativePath: normalizeCollectionRelativePath(ref.relativePath),
  })
  const list = state.membersByCollectionId[collectionId] ?? []
  const next = list.filter((r) => memberKey(r) !== key)
  return {
    ...state,
    membersByCollectionId: {
      ...state.membersByCollectionId,
      [collectionId]: next,
    },
  }
}

export function addSkillToCollections(
  state: CollectionsState,
  skill: SkillRecord,
  collectionIds: string[],
): CollectionsState {
  const ref: CollectionMemberRef = {
    sourceId: skill.sourceId,
    relativePath: skill.relativePath,
  }
  let next = state
  for (const cid of collectionIds) {
    if (!next.collections.some((c) => c.id === cid)) continue
    next = addMember(next, cid, ref)
  }
  return next
}

export function removeSkillFromCollection(
  state: CollectionsState,
  skill: SkillRecord,
  collectionId: string,
): CollectionsState {
  const ref: CollectionMemberRef = {
    sourceId: skill.sourceId,
    relativePath: skill.relativePath,
  }
  return removeMember(state, collectionId, ref)
}

/** Collections whose member list includes this skill's primary path. */
export function collectionIdsContainingSkill(state: CollectionsState, skill: SkillRecord): string[] {
  const pk = skillPrimaryKey(skill)
  const ids: string[] = []
  for (const c of state.collections) {
    const members = listMembers(state, c.id)
    if (members.some((m) => memberKey(m) === pk)) ids.push(c.id)
  }
  return ids
}
