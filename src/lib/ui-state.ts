const WRITABLE_FILTER_KEY = 'skills-manager.only-writable'
const ACTIVE_SOURCE_KEY = 'skills-manager.active-source'

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
