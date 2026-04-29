import { useCallback, useEffect, useRef, useState } from 'react'

import {
  BUILT_IN_REGISTRIES,
  clearExploreCache,
  fetchExploreSkillContent,
  parseExploreSkillContent,
  type ExploreIndexMeta,
  type LoadedContent,
} from '../lib/explore'
import { isTauriRuntime } from '../lib/tauri-env'
import type { ExploreEntry, ExploreRegistry } from '../types'

export interface ExploreContentCacheEntry {
  raw: string
  loaded: LoadedContent
}

export type { ExploreIndexMeta }

interface ExploreHandlersOptions {
  pushToast: (title: string, detail?: string, variant?: 'success' | 'error') => void
  setStatusLine: (value: string) => void
}

export function useExploreCatalog({ pushToast, setStatusLine }: ExploreHandlersOptions) {
  const [exploreEntries, setExploreEntries] = useState<ExploreEntry[]>([])
  const [isExploreLoading, setIsExploreLoading] = useState(false)
  const [exploreRegistry, setExploreRegistry] = useState<ExploreRegistry>(BUILT_IN_REGISTRIES[0]!)
  const [exploreContentCache, setExploreContentCache] = useState<Map<string, ExploreContentCacheEntry>>(
    () => new Map(),
  )
  const [exploreFetchPath, setExploreFetchPath] = useState<string | null>(null)
  const [exploreRefreshKey, setExploreRefreshKey] = useState(0)
  const [installingEntry, setInstallingEntry] = useState<ExploreEntry | null>(null)
  const [exploreLoadError, setExploreLoadError] = useState<string | null>(null)

  const exploreRefreshPendingRef = useRef(false)
  const exploreRegistryIdRef = useRef<string>(BUILT_IN_REGISTRIES[0]!.id)
  const exploreContentCacheRef = useRef(exploreContentCache)
  const inflightExploreRef = useRef<Map<string, Promise<void>>>(new Map())

  useEffect(() => {
    exploreContentCacheRef.current = exploreContentCache
  }, [exploreContentCache])

  const ensureExploreContent = useCallback(
    async (registry: ExploreRegistry, entry: ExploreEntry) => {
      if (!isTauriRuntime()) return
      if (exploreContentCacheRef.current.has(entry.path)) return

      let p = inflightExploreRef.current.get(entry.path)
      if (!p) {
        p = (async () => {
          setExploreFetchPath(entry.path)
          try {
            const raw = await fetchExploreSkillContent(registry, entry.path)
            const loaded = parseExploreSkillContent(raw)
            setExploreContentCache((prev) => {
              if (entry.registryId !== exploreRegistryIdRef.current) return prev
              const next = new Map(prev)
              next.set(entry.path, { raw, loaded })
              return next
            })
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            pushToast('加载 Skill 正文失败', msg, 'error')
            throw e
          } finally {
            inflightExploreRef.current.delete(entry.path)
            if (entry.registryId === exploreRegistryIdRef.current) {
              setExploreFetchPath((cur) => (cur === entry.path ? null : cur))
            }
          }
        })()
        inflightExploreRef.current.set(entry.path, p)
      }
      return p
    },
    [pushToast],
  )

  const handleExploreEntriesChange = useCallback(
    (entries: ExploreEntry[], registry: ExploreRegistry, meta: ExploreIndexMeta) => {
      if (exploreRegistryIdRef.current !== registry.id) {
        exploreRegistryIdRef.current = registry.id
        setExploreContentCache(new Map())
        setExploreFetchPath(null)
      }

      setExploreRegistry(registry)
      setExploreEntries(entries)
      setExploreLoadError(null)
      setStatusLine(`探索已加载 ${meta.indexTotal} 个 skills`)
      if (exploreRefreshPendingRef.current) {
        exploreRefreshPendingRef.current = false
        pushToast('探索加载完成', `已加载 ${meta.indexTotal} 个 skills`)
      }
    },
    [pushToast, setStatusLine],
  )

  const handleExploreLoadingChange = useCallback(
    (loading: boolean) => {
      setIsExploreLoading(loading)
      if (loading) setStatusLine('正在加载探索仓库…')
    },
    [setStatusLine],
  )

  const handleExploreError = useCallback(
    (msg: string) => {
      exploreRefreshPendingRef.current = false
      setExploreLoadError(msg)
      pushToast('探索加载失败', msg, 'error')
    },
    [pushToast],
  )

  const triggerExploreRefresh = useCallback(async () => {
    if (isTauriRuntime()) {
      await clearExploreCache()
    }
    setExploreContentCache(new Map())
    setExploreFetchPath(null)
    exploreRefreshPendingRef.current = true
    setExploreRefreshKey((k) => k + 1)
  }, [])

  return {
    exploreEntries,
    isExploreLoading,
    exploreRegistry,
    exploreContentCache,
    exploreFetchPath,
    exploreRefreshKey,
    installingEntry,
    setInstallingEntry,
    exploreLoadError,
    handleExploreEntriesChange,
    handleExploreLoadingChange,
    handleExploreError,
    triggerExploreRefresh,
    exploreRefreshPendingRef,
    ensureExploreContent,
  }
}
