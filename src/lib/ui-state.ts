import type { BrowseMode } from '../types'

const WRITABLE_FILTER_KEY = 'skills-manager.only-writable'
const ACTIVE_SOURCE_KEY = 'skills-manager.active-source'
const BROWSE_MODE_KEY = 'skills-manager.browse-mode'
const ACTIVE_COLLECTION_KEY = 'skills-manager.active-collection-id'

export function loadWritableOnly() {
  return localStorage.getItem(WRITABLE_FILTER_KEY) === 'true'
}

export function persistWritableOnly(value: boolean) {
  localStorage.setItem(WRITABLE_FILTER_KEY, String(value))
}

export function loadActiveSource() {
  return localStorage.getItem(ACTIVE_SOURCE_KEY) ?? 'all'
}

export function persistActiveSource(sourceId: string) {
  localStorage.setItem(ACTIVE_SOURCE_KEY, sourceId)
}

export function loadBrowseMode(): BrowseMode {
  const raw = localStorage.getItem(BROWSE_MODE_KEY)
  if (raw === 'collections') return 'collections'
  if (raw === 'explore') return 'explore'
  return 'sources'
}

export function persistBrowseMode(mode: BrowseMode) {
  localStorage.setItem(BROWSE_MODE_KEY, mode)
}

export function loadActiveCollectionId() {
  return localStorage.getItem(ACTIVE_COLLECTION_KEY) ?? ''
}

export function persistActiveCollectionId(id: string) {
  localStorage.setItem(ACTIVE_COLLECTION_KEY, id)
}
