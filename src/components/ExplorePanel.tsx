import { LoaderCircle, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BUILT_IN_REGISTRIES, listExploreSkills, type ExploreIndexMeta } from '../lib/explore'
import { Select } from './Select'
import type { ExploreEntry, ExploreRegistry } from '../types'

interface ExplorePanelProps {
  /** Increment from parent after `explore_clear_cache` to force re-fetch. */
  refreshKey?: number
  onEntriesChange: (entries: ExploreEntry[], registry: ExploreRegistry, meta: ExploreIndexMeta) => void
  onError: (msg: string) => void
  onLoadingChange?: (loading: boolean) => void
}

export function ExplorePanel({ refreshKey = 0, onEntriesChange, onError, onLoadingChange }: ExplorePanelProps) {
  const [registryId, setRegistryId] = useState(BUILT_IN_REGISTRIES[0]!.id)
  const [activeCategory, setActiveCategory] = useState('全部')
  const [allEntries, setAllEntries] = useState<ExploreEntry[]>([])
  const [categories, setCategories] = useState<string[]>([])
  /** Start true so the first sync effect does not push [] to parent before fetch runs (avoids title-bar 0/0 flash). */
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadRunRef = useRef(0)

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

  const onErrorRef = useRef(onError)
  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const registry = useMemo(
    () => BUILT_IN_REGISTRIES.find((r) => r.id === registryId) ?? BUILT_IN_REGISTRIES[0]!,
    [registryId],
  )

  const loadIndex = useCallback(async () => {
    const runId = loadRunRef.current + 1
    loadRunRef.current = runId
    setLoading(true)
    setError(null)
    try {
      const entries = await listExploreSkills(registry)
      if (loadRunRef.current !== runId) return
      const cats = Array.from(new Set(entries.map((e) => e.category))).sort()
      setAllEntries(entries)
      setCategories(cats)
      setActiveCategory('全部')
    } catch (err) {
      if (loadRunRef.current !== runId) return
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      onErrorRef.current(msg)
    } finally {
      if (loadRunRef.current === runId) setLoading(false)
    }
  }, [registry])

  useEffect(() => {
    void loadIndex()
  }, [loadIndex, refreshKey])

  const handleRegistryChange = useCallback((id: string) => {
    setLoading(true)
    setRegistryId(id)
  }, [])

  const filteredEntries = useMemo(() => {
    if (activeCategory === '全部') return allEntries
    return allEntries.filter((e) => e.category === activeCategory)
  }, [allEntries, activeCategory])

  useEffect(() => {
    if (loading) return
    onEntriesChange(filteredEntries, registry, { indexTotal: allEntries.length })
  }, [filteredEntries, registry, loading, allEntries.length, onEntriesChange])

  const registryOptions = BUILT_IN_REGISTRIES.map((r) => ({
    value: r.id,
    label: r.label,
  }))

  return (
    <div className="explore-panel">
      <div className="explore-toolbar">
        <div className="explore-toolbar__primary">
          <Select
            value={registryId}
            options={registryOptions}
            onChange={handleRegistryChange}
            aria-label="选择注册表"
          />
        </div>

        {loading ? (
          <div className="explore-panel__status" aria-live="polite">
            <LoaderCircle className="spin" size={14} aria-hidden="true" />
            <span>正在拉取索引…</span>
          </div>
        ) : null}

        {error && !loading ? (
          <div className="explore-panel__error" role="alert">
            <span className="explore-panel__error-text">{error}</span>
            <button type="button" className="ghost-button" onClick={() => void loadIndex()}>
              <RotateCcw size={12} aria-hidden="true" />
              重试
            </button>
          </div>
        ) : null}

        {!loading && !error && categories.length > 0 ? (
          <div className="explore-toolbar__categories" role="tablist" aria-label="技能分类">
            {['全部', ...categories].map((cat) => (
              <button
                key={cat}
                type="button"
                role="tab"
                aria-selected={activeCategory === cat}
                className={`source-chip explore-panel__cat ${activeCategory === cat ? 'is-active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!loading && !error && allEntries.length === 0 ? (
        <p className="explore-panel__empty" aria-live="polite">
          该注册表暂无可用 skill。
        </p>
      ) : null}
    </div>
  )
}
