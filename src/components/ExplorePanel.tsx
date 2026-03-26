import { Compass, LoaderCircle, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { BUILT_IN_REGISTRIES, listExploreSkills } from '../lib/explore'
import { Select } from './Select'
import type { ExploreEntry, ExploreRegistry } from '../types'

interface ExplorePanelProps {
  /** Increment from parent after `explore_clear_cache` to force re-fetch. */
  refreshKey?: number
  onEntriesChange: (entries: ExploreEntry[], registry: ExploreRegistry) => void
  onError: (msg: string) => void
}

export function ExplorePanel({ refreshKey = 0, onEntriesChange, onError }: ExplorePanelProps) {
  const [registryId, setRegistryId] = useState(BUILT_IN_REGISTRIES[0]!.id)
  const [activeCategory, setActiveCategory] = useState('全部')
  const [allEntries, setAllEntries] = useState<ExploreEntry[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const registry = useMemo(
    () => BUILT_IN_REGISTRIES.find((r) => r.id === registryId) ?? BUILT_IN_REGISTRIES[0]!,
    [registryId],
  )

  const loadIndex = useCallback(async () => {
    setLoading(true)
    setError(null)
    setAllEntries([])
    setCategories([])
    try {
      const entries = await listExploreSkills(registry)
      const cats = Array.from(new Set(entries.map((e) => e.category))).sort()
      setAllEntries(entries)
      setCategories(cats)
      setActiveCategory('全部')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      onError(msg)
    } finally {
      setLoading(false)
    }
  }, [registry, onError])

  useEffect(() => {
    void loadIndex()
  }, [loadIndex, refreshKey])

  const filteredEntries = useMemo(() => {
    if (activeCategory === '全部') return allEntries
    return allEntries.filter((e) => e.category === activeCategory)
  }, [allEntries, activeCategory])

  useEffect(() => {
    onEntriesChange(filteredEntries, registry)
  }, [filteredEntries, registry, onEntriesChange])

  const registryOptions = BUILT_IN_REGISTRIES.map((r) => ({
    value: r.id,
    label: r.label,
  }))

  return (
    <div className="explore-panel">
      <div className="explore-panel__registry">
        <Compass size={14} aria-hidden="true" style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
        <Select
          value={registryId}
          options={registryOptions}
          onChange={setRegistryId}
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
        <div className="explore-panel__categories" role="tablist" aria-label="技能分类">
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

      {!loading && !error && allEntries.length === 0 ? (
        <p className="explore-panel__empty" aria-live="polite">
          该注册表暂无可用 skill。
        </p>
      ) : null}
    </div>
  )
}
