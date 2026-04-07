import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'

import './styles/app.css'
import { CopyConflictDialog } from './components/CopyConflictDialog'
import { CopyDialog } from './components/CopyDialog'
import { CopySourceDialog } from './components/CopySourceDialog'
import { CommandBar } from './components/CommandBar'
import { CollectionNameDialog } from './components/CollectionNameDialog'
import { EmptyState } from './components/EmptyState'
import { InstallDialog } from './components/InstallDialog'
import { SkillEditor } from './components/SkillEditor'
import { ExploreSkillList } from './components/ExploreSkillList'
import { SkillList } from './components/SkillList'
import { SkillPreview } from './components/SkillPreview'
import { SourceManager } from './components/SourceManager'
import { ToastContainer, type ToastMessage } from './components/Toast'
import {
  addMember,
  collectionIdsContainingSkill,
  createCollection,
  deleteCollection,
  filterSkillsForCollection,
  listMembers,
  loadCollectionsState,
  removeMember,
  renameCollection,
  saveCollectionsState,
  type CollectionsState,
} from './lib/collections'
import {
  adaptExploreEntryToSkillRecord,
  BUILT_IN_REGISTRIES,
  clearExploreCache,
  fetchExploreSkillContent,
  parseExploreSkillContent,
  type LoadedContent,
} from './lib/explore'
import { mergeSkillsByContent, normalizeSkills } from './lib/skills'
import {
  buildSourcesExport,
  createCustomSource,
  isSameSourcePath,
  loadStoredSources,
  mergeImportedSources,
  normalizePathInput,
  parseSourcesExportJson,
  persistSources,
  stringifySourcesExport,
} from './lib/sources'
import {
  loadActiveCollectionId,
  loadActiveSource,
  loadBrowseMode,
  loadWritableOnly,
  persistActiveCollectionId,
  persistActiveSource,
  persistBrowseMode,
  persistWritableOnly,
} from './lib/ui-state'
import type {
  CopyConflictStrategy,
  CopySkillRequest,
  CopySourceResult,
  CopySourceRequest,
  CopySkillResult,
  ExploreEntry,
  ExploreRegistry,
  RawSkillRecord,
  SkillRecord,
  SourceConfig,
} from './types'

interface SkillCopyContext {
  request: CopySkillRequest
  skillId: string
  skillName: string
  targetLabel: string
}

interface SourceCopyContext {
  request: CopySourceRequest
  sourceLabel: string
  targetLabel: string
}

interface ExploreContentCacheEntry {
  raw: string
  loaded: LoadedContent
}

const EXPLORE_PREFETCH_LIMIT = 12

type CopyConflictState =
  | {
      kind: 'skill'
      context: SkillCopyContext
      description: string
      targetPath: string
    }
  | {
      kind: 'source'
      context: SourceCopyContext
      conflictCount: number
      conflictPaths: string[]
    }

function formatTargetPath(rootPath: string, relativePath: string) {
  const normalizedRoot = rootPath.replace(/[\\/]+$/, '').replace(/\\/g, '/')
  const normalizedRelative = relativePath.replace(/^[/\\]+/, '').replace(/\\/g, '/')
  return normalizedRelative ? `${normalizedRoot}/${normalizedRelative}` : normalizedRoot
}

type EditorState =
  | { mode: 'create' }
  | { mode: 'edit'; skill: SkillRecord }
  | null

function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function App() {
  const [sources, setSources] = useState<SourceConfig[]>([])
  const sourcesRef = useRef(sources)
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [refreshSeq, setRefreshSeq] = useState(0)
  const [loadedContent, setLoadedContent] = useState('')
  const [activeSourceId, setActiveSourceId] = useState(loadActiveSource())
  const [browseMode, setBrowseMode] = useState(loadBrowseMode)
  const [activeCollectionId, setActiveCollectionId] = useState(loadActiveCollectionId)
  const [collectionsState, setCollectionsState] = useState<CollectionsState>(() => loadCollectionsState())
  const [showWritableOnly, setShowWritableOnly] = useState(loadWritableOnly())
  const [searchValue, setSearchValue] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState<string>()
  const [editorState, setEditorState] = useState<EditorState>(null)
  const [copyingSkill, setCopyingSkill] = useState<SkillRecord | null>(null)
  const [copyingSource, setCopyingSource] = useState<SourceConfig | null>(null)
  const [copyConflict, setCopyConflict] = useState<CopyConflictState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [statusLine, setStatusLine] = useState('准备来源...')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [createFolderFromPreviewOpen, setCreateFolderFromPreviewOpen] = useState(false)
  const [createFolderFromPreviewKey, setCreateFolderFromPreviewKey] = useState(0)
  const [exploreEntries, setExploreEntries] = useState<ExploreEntry[]>([])
  const [isExploreLoading, setIsExploreLoading] = useState(false)
  const [exploreRegistry, setExploreRegistry] = useState<ExploreRegistry>(BUILT_IN_REGISTRIES[0]!)
  const [exploreContentCache, setExploreContentCache] = useState<Map<string, ExploreContentCacheEntry>>(
    () => new Map(),
  )
  const [exploreRefreshKey, setExploreRefreshKey] = useState(0)
  const [installingEntry, setInstallingEntry] = useState<ExploreEntry | null>(null)
  const [isTrayScrolling, setIsTrayScrolling] = useState(false)
  const trayHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trayScrollThrottle = useRef(0)

  const handleTrayScroll = useCallback(() => {
    const now = performance.now()
    if (now - trayScrollThrottle.current > 80) {
      trayScrollThrottle.current = now
      setIsTrayScrolling(true)
    }
    if (trayHideTimer.current) clearTimeout(trayHideTimer.current)
    trayHideTimer.current = setTimeout(() => setIsTrayScrolling(false), 500)
  }, [])

  const pushToast = useCallback(
    (title: string, detail?: string, variant: ToastMessage['variant'] = 'success') => {
      setToasts((prev) => [...prev, { id: Date.now(), title, detail, variant }])
    },
    [],
  )

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const cacheExploreContent = useCallback((path: string, raw: string) => {
    const loaded = parseExploreSkillContent(raw)
    setExploreContentCache((prev) => {
      const existing = prev.get(path)
      if (existing?.raw === raw) return prev
      const next = new Map(prev)
      next.set(path, { raw, loaded })
      return next
    })
  }, [])

  const refreshSkills = useCallback(
    async (
      currentSources: SourceConfig[],
      nextSelectedId?: string,
      quiet?: boolean,
    ): Promise<{ ok: true; count: number } | { ok: false }> => {
      if (!quiet) {
        setIsLoading(true)
        setErrorMessage(null)
        setStatusLine('扫描中...')
      }

      try {
        const rawSkills = await invoke<RawSkillRecord[]>('scan_skills', {
          sources: currentSources.filter((source) => source.enabled),
        })
        const normalized = normalizeSkills(rawSkills, currentSources)
        setSkills(normalized)
        setRefreshSeq((n) => n + 1)
        setSelectedSkillId((previous) => nextSelectedId ?? previous ?? normalized[0]?.id)
        setStatusLine(`已索引 ${normalized.length} 个 skills`)
        return { ok: true, count: normalized.length }
      } catch (error) {
        if (!quiet) {
          setErrorMessage(error instanceof Error ? error.message : String(error))
          setStatusLine('扫描失败。')
        }
        return { ok: false }
      } finally {
        if (!quiet) {
          setIsLoading(false)
        }
      }
    },
    [],
  )

  const handleExploreEntriesChange = useCallback((entries: ExploreEntry[], registry: ExploreRegistry) => {
    setExploreRegistry(registry)
    setExploreEntries(entries)
    // Don't reset selectedSkillId here; effectiveSelectedSkillId already falls
    // back to the first visible skill when the current selection disappears.
  }, [])

  const handleExploreError = useCallback((msg: string) => {
    pushToast('探索加载失败', msg, 'error')
  }, [pushToast])

  const handleToolbarRefresh = useCallback(async () => {
    if (browseMode === 'explore') {
      if (isTauriRuntime()) {
        await clearExploreCache()
      }
      setExploreContentCache(new Map())
      setExploreRefreshKey((k) => k + 1)
      pushToast('已重新加载探索索引')
      return
    }
    const result = await refreshSkills(sources)
    if (result.ok) {
      pushToast('扫描完成', `已索引 ${result.count} 个 skills`)
    } else {
      pushToast('扫描失败', '请查看上方错误说明', 'error')
    }
  }, [browseMode, pushToast, refreshSkills, sources])

  useEffect(() => {
    const bootstrap = async () => {
      if (!isTauriRuntime()) {
        setStatusLine('浏览器预览模式。运行 `npm run tauri dev` 以启用桌面功能。')
        setSources([])
        setBootstrapped(true)
        setIsLoading(false)
        return
      }

      try {
        const defaultSources = await invoke<SourceConfig[]>('get_default_sources')
        const resolvedSources = loadStoredSources(defaultSources)
        setSources(resolvedSources)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setBootstrapped(true)
      }
    }

    void bootstrap()
  }, [])

  useEffect(() => {
    if (!bootstrapped) return

    persistSources(sources)
    if (!isTauriRuntime()) return

    void refreshSkills(sources)
  }, [bootstrapped, refreshSkills, sources])

  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  useEffect(() => {
    persistActiveSource(activeSourceId)
  }, [activeSourceId])

  useEffect(() => {
    persistWritableOnly(showWritableOnly)
  }, [showWritableOnly])

  useEffect(() => {
    persistBrowseMode(browseMode)
  }, [browseMode])

  useEffect(() => {
    persistActiveCollectionId(activeCollectionId)
  }, [activeCollectionId])

  useEffect(() => {
    saveCollectionsState(collectionsState)
  }, [collectionsState])

  useEffect(() => {
    if (browseMode !== 'collections') return
    if (activeCollectionId && collectionsState.collections.some((c) => c.id === activeCollectionId)) return
    setActiveCollectionId(collectionsState.collections[0]?.id ?? '')
  }, [browseMode, activeCollectionId, collectionsState.collections])

  useEffect(() => {
    if (browseMode !== 'sources') return
    if (activeSourceId === 'all') return
    const count = skills.filter((s) => s.sourceId === activeSourceId).length
    if (count === 0) setActiveSourceId('all')
  }, [activeSourceId, browseMode, skills])

  useEffect(() => {
    if (!isTauriRuntime()) return

    const setupListener = async () => {
      const unlisten = await listen('refresh-requested', () => {
        void refreshSkills(sourcesRef.current)
      })
      return unlisten
    }

    let cleanup: (() => void) | undefined
    void setupListener().then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup?.()
  }, [refreshSkills])

  // Rescan when the window regains visibility (e.g. after adding skills in another app).
  useEffect(() => {
    if (!bootstrapped || !isTauriRuntime()) return

    let wasHidden = document.visibilityState === 'hidden'

    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden'
      if (wasHidden && !hidden) {
        void refreshSkills(sourcesRef.current, undefined, true)
      }
      wasHidden = hidden
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [bootstrapped, refreshSkills])

  const deferredSearchValue = useDeferredValue(searchValue)

  const collectionMemberCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of collectionsState.collections) {
      m[c.id] = listMembers(collectionsState, c.id).length
    }
    return m
  }, [collectionsState])

  const skillCountBySourceId = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of skills) {
      m[s.sourceId] = (m[s.sourceId] ?? 0) + 1
    }
    return m
  }, [skills])

  const exploreEntryBySkillId = useMemo(() => {
    const map = new Map<string, ExploreEntry>()
    for (const entry of exploreEntries) {
      map.set(`${entry.registryId}:${entry.skillDir}/SKILL.md`, entry)
    }
    return map
  }, [exploreEntries])

  const visibleSkills = useMemo(() => {
    const term = deferredSearchValue.trim().toLowerCase()

    if (browseMode === 'explore') {
      const mapped = exploreEntries.map((entry) => {
        const loaded = exploreContentCache.get(entry.path)?.loaded
        return adaptExploreEntryToSkillRecord(entry, exploreRegistry, loaded)
      })
      if (!term) return mapped
      return mapped.filter((s) => s.searchIndex.includes(term))
    }

    if (browseMode === 'collections') {
      if (!activeCollectionId || !collectionsState.collections.some((c) => c.id === activeCollectionId)) {
        return []
      }
      const members = listMembers(collectionsState, activeCollectionId)
      const inCollection = filterSkillsForCollection(skills, members)
      const filtered = inCollection.filter((skill) => {
        if (showWritableOnly && !skill.writable) return false
        if (!term) return true
        return skill.searchIndex.includes(term)
      })
      return mergeSkillsByContent(filtered)
    }

    const filtered = skills.filter((skill) => {
      if (showWritableOnly && !skill.writable) return false
      if (activeSourceId !== 'all' && skill.sourceId !== activeSourceId) return false
      if (!term) return true

      return skill.searchIndex.includes(term)
    })

    // When showing all sources, merge identical skills (same name + content)
    // that appear across multiple paths into a single entry.
    return activeSourceId === 'all' ? mergeSkillsByContent(filtered) : filtered
  }, [
    activeCollectionId,
    activeSourceId,
    browseMode,
    collectionsState,
    deferredSearchValue,
    exploreContentCache,
    exploreEntries,
    exploreRegistry,
    showWritableOnly,
    skills,
  ])

  // Derive the effective selection synchronously during render to avoid a
  // one-frame gap where selectedSkillId still points to a skill from the
  // previous source (which would cause SkillPreview to flash/unmount).
  const effectiveSelectedSkillId = useMemo(() => {
    if (visibleSkills.length === 0) return undefined
    if (selectedSkillId && visibleSkills.some((s) => s.id === selectedSkillId)) return selectedSkillId
    return visibleSkills[0]?.id
  }, [selectedSkillId, visibleSkills])

  // Keep selectedSkillId state in sync after source/filter changes so that
  // user-initiated selections (clicks, keyboard) continue to work correctly.
  useEffect(() => {
    if (effectiveSelectedSkillId !== selectedSkillId) {
      setSelectedSkillId(effectiveSelectedSkillId)
    }
  }, [effectiveSelectedSkillId, selectedSkillId])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName ?? ''
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return
      if (visibleSkills.length === 0) return

      const index = visibleSkills.findIndex((skill) => skill.id === effectiveSelectedSkillId)

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const nextIndex = index >= 0 ? Math.min(index + 1, visibleSkills.length - 1) : 0
        setSelectedSkillId(visibleSkills[nextIndex]?.id)
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const nextIndex = index >= 0 ? Math.max(index - 1, 0) : 0
        setSelectedSkillId(visibleSkills[nextIndex]?.id)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [effectiveSelectedSkillId, visibleSkills])

  const selectedSkill = visibleSkills.find((skill) => skill.id === effectiveSelectedSkillId)

  const collectionIdsWithSkill = useMemo(() => {
    if (!selectedSkill) return []
    return collectionIdsContainingSkill(collectionsState, selectedSkill)
  }, [collectionsState, selectedSkill])

  const selectedSkillFile = selectedSkill?.skillFile

  useEffect(() => {
    if (!selectedSkillFile || !isTauriRuntime()) {
      setLoadedContent('')
      return
    }
    if (selectedSkill?.sourceKind === 'explore') {
      setLoadedContent('')
      return
    }

    let cancelled = false
    setLoadedContent('')
    void invoke<string>('get_skill_content', { skillFile: selectedSkillFile })
      .then((content) => { if (!cancelled) setLoadedContent(content) })
      .catch((err) => { if (!cancelled) setErrorMessage(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [selectedSkillFile, selectedSkill?.sourceKind, refreshSeq])

  const previewRawContent = useMemo(() => {
    if (browseMode !== 'explore') return loadedContent
    const skill = visibleSkills.find((s) => s.id === effectiveSelectedSkillId)
    if (!skill || skill.sourceKind !== 'explore') return loadedContent
    const entry = exploreEntryBySkillId.get(skill.id)
    if (!entry) return ''
    return exploreContentCache.get(entry.path)?.raw ?? ''
  }, [
    browseMode,
    loadedContent,
    effectiveSelectedSkillId,
    exploreContentCache,
    exploreEntryBySkillId,
    visibleSkills,
  ])

  useEffect(() => {
    if (browseMode !== 'explore' || !isTauriRuntime()) return
    const skill = visibleSkills.find((s) => s.id === effectiveSelectedSkillId)
    if (!skill || skill.sourceKind !== 'explore') return
    const entry = exploreEntryBySkillId.get(skill.id)
    if (!entry || exploreContentCache.has(entry.path)) return

    void fetchExploreSkillContent(exploreRegistry, entry.path)
      .then((raw) => {
        cacheExploreContent(entry.path, raw)
      })
      .catch((err) => {
        pushToast('加载失败', err instanceof Error ? err.message : String(err), 'error')
      })
  }, [
    browseMode,
    cacheExploreContent,
    effectiveSelectedSkillId,
    exploreContentCache,
    exploreEntryBySkillId,
    exploreRegistry,
    pushToast,
    visibleSkills,
  ])

  // Ref tracks which paths have already been queued for background fetching
  // so re-renders from content loading don't re-queue the same paths.
  const batchFetchQueuedRef = useRef(new Set<string>())

  // Reset queued set when explore entries change (registry switch or cache clear).
  useEffect(() => {
    batchFetchQueuedRef.current = new Set()
  }, [exploreEntries, exploreRefreshKey])

  // Pre-fetch descriptions for all currently visible explore skills in the background.
  // exploreContentMap is intentionally excluded from deps to avoid re-trigger loops;
  // batchFetchQueuedRef guards against duplicate requests.
  useEffect(() => {
    if (browseMode !== 'explore' || !isTauriRuntime()) return

    const toFetch = visibleSkills
      .filter((skill) => skill.sourceKind === 'explore')
      .slice(0, EXPLORE_PREFETCH_LIMIT)
      .map((skill) => exploreEntryBySkillId.get(skill.id))
      .filter((entry): entry is ExploreEntry => {
        if (!entry) return false
        return (
          !exploreContentCache.has(entry.path) && !batchFetchQueuedRef.current.has(entry.path)
        )
      })

    for (const entry of toFetch) {
      batchFetchQueuedRef.current.add(entry.path)
      void fetchExploreSkillContent(exploreRegistry, entry.path)
        .then((raw) => {
          cacheExploreContent(entry.path, raw)
        })
        .catch(() => {
          // Silently skip background pre-fetch failures; selected-skill fetch shows error.
        })
    }
  }, [browseMode, cacheExploreContent, exploreContentCache, exploreEntryBySkillId, exploreRegistry, visibleSkills])

  const writableSources = sources.filter((source) => source.writable)

  const handleOpenPath = async (path: string) => {
    if (!isTauriRuntime()) return

    try {
      await invoke('open_path', { path })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const handleAddCustomSource = (label: string, path: string, writable: boolean) => {
    const normalizedPath = normalizePathInput(path)
    if (!normalizedPath) return false

    const existingSource = sources.find((source) => isSameSourcePath(source.rootPath, normalizedPath))
    if (existingSource) {
      setErrorMessage(`来源路径已存在：${existingSource.label}`)
      setStatusLine('未添加重复来源。')
      return false
    }

    const nextSources = [...sources, createCustomSource(label, normalizedPath, writable)]
    setSources(nextSources)
    setStatusLine(`已添加来源 ${label.trim()}。`)
    return true
  }

  const handleExportSources = useCallback(async () => {
    if (!isTauriRuntime()) return
    setErrorMessage(null)
    try {
      const defaults = await invoke<SourceConfig[]>('get_default_sources')
      const defaultIds = new Set(defaults.map((s) => s.id))
      const payload = buildSourcesExport(sources, defaultIds)
      const json = stringifySourcesExport(payload)
      const { save } = await import('@tauri-apps/plugin-dialog')
      const path = await save({
        title: '导出来源配置',
        defaultPath: 'skills-manager-sources.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
      if (path == null) return
      await invoke('write_text_file', { path, contents: json })
      setStatusLine('已导出来源配置。')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }, [sources])

  const handleImportSourcesText = useCallback(async (json: string) => {
    if (!isTauriRuntime()) return
    const parsed = parseSourcesExportJson(json)
    if (!parsed) {
      setErrorMessage('导入失败：文件不是有效的来源配置（schemaVersion 必须为 1）。')
      return
    }
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    const proceed = await confirm(
      '将用文件中的自定义来源替换当前列表，并同步默认来源的启用状态。是否继续？',
      { title: '导入来源配置', kind: 'warning' },
    )
    if (!proceed) return
    setErrorMessage(null)
    try {
      const defaults = await invoke<SourceConfig[]>('get_default_sources')
      setSources(mergeImportedSources(defaults, parsed))
      setActiveSourceId('all')
      setStatusLine(`已导入来源配置（导出时间 ${parsed.exportedAt}）。`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const handleToggleSource = (sourceId: string) => {
    setSources((current) =>
      current.map((source) =>
        source.id === sourceId ? { ...source, enabled: !source.enabled } : source,
      ),
    )
  }

  const handleRemoveSource = (sourceId: string) => {
    setSources((current) => current.filter((source) => source.id !== sourceId))
    if (activeSourceId === sourceId) setActiveSourceId('all')
  }

  const handleSaveSkill = async (payload: {
    source: SourceConfig
    relativePath: string
    rawContent: string
    overwrite: boolean
  }) => {
    if (!isTauriRuntime()) return

    try {
      await invoke('save_skill', { request: payload })
      const nextSelectedId = `${payload.source.id}:${payload.relativePath}`
      setEditorState(null)
      await refreshSkills(sources, nextSelectedId)
      setStatusLine(`已保存 ${payload.relativePath}。`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const executeSkillCopy = async (context: SkillCopyContext, conflictStrategy?: CopyConflictStrategy) => {
    if (!isTauriRuntime()) return

    try {
      const requestPayload = conflictStrategy
        ? { ...context.request, conflictStrategy }
        : context.request
      const result = await invoke<CopySkillResult>('copy_skill', {
        request: requestPayload,
      })

      if (result.status === 'conflict') {
        setCopyingSkill(null)
        setCopyConflict({
          kind: 'skill',
          context,
          description: result.conflictMessage ?? '目标路径中已存在同名 skill，请选择如何处理。',
          targetPath: formatTargetPath(context.request.targetSource.rootPath, result.finalRelativePath),
        })
        return
      }

      setCopyConflict(null)
      setCopyingSkill(null)
      const nextSelectedId = `${context.request.targetSource.id}:${result.finalRelativePath}`
      await refreshSkills(sources, result.skipped ? context.skillId : nextSelectedId)
      if (result.skipped) {
        setStatusLine(`已跳过 ${context.skillName} 的复制（目标已存在）。`)
      } else {
        setStatusLine(`已将 ${context.skillName} 复制到 ${context.targetLabel}。`)
        pushToast('复制成功', `${context.skillName} → ${context.targetLabel}`)
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const executeSourceCopy = async (context: SourceCopyContext, conflictStrategy?: CopyConflictStrategy) => {
    if (!isTauriRuntime()) return

    try {
      const requestPayload = conflictStrategy
        ? { ...context.request, conflictStrategy }
        : context.request
      const result = await invoke<CopySourceResult>('copy_source', {
        request: requestPayload,
      })

      if (result.status === 'conflict') {
        setCopyingSource(null)
        setCopyConflict({
          kind: 'source',
          context,
          conflictCount: result.conflictCount,
          conflictPaths: result.conflictRelativePaths,
        })
        return
      }

      setCopyConflict(null)
      setCopyingSource(null)
      await refreshSkills(sources)

      const summaryParts = [`已复制 ${result.copiedCount} 个`]
      if (result.renamedCount > 0) summaryParts.push(`重命名 ${result.renamedCount} 个`)
      if (result.overwrittenCount > 0) summaryParts.push(`覆盖 ${result.overwrittenCount} 个`)
      if (result.skippedCount > 0) summaryParts.push(`跳过 ${result.skippedCount} 个`)

      const summaryStr = summaryParts.join('，')
      setStatusLine(`${context.sourceLabel} -> ${context.targetLabel}：${summaryStr}。`)
      pushToast('复制成功', `${context.sourceLabel} → ${context.targetLabel}：${summaryStr}`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const handleCopySkill = async (targetSource: SourceConfig, targetRelativePath: string) => {
    if (!copyingSkill) return

    await executeSkillCopy({
      request: {
        sourceSkillDir: copyingSkill.skillDir,
        relativePath: copyingSkill.relativePath,
        targetSource,
        targetRelativePath,
      },
      skillId: copyingSkill.id,
      skillName: copyingSkill.name,
      targetLabel: targetSource.label,
    })
  }

  const handleCopySkillCustom = async (customRootPath: string, targetRelativePath: string) => {
    if (!copyingSkill) return

    const targetSource: SourceConfig = {
      id: `custom:${customRootPath}`,
      label: customRootPath,
      rootPath: customRootPath,
      writable: true,
      kind: 'custom',
      enabled: true,
    }

    await executeSkillCopy({
      request: {
        sourceSkillDir: copyingSkill.skillDir,
        relativePath: copyingSkill.relativePath,
        targetSource,
        targetRelativePath,
      },
      skillId: copyingSkill.id,
      skillName: copyingSkill.name,
      targetLabel: customRootPath,
    })
  }

  const handleCopySource = async (source: SourceConfig, targetSource: SourceConfig) => {
    await executeSourceCopy({
      request: {
        source,
        targetSource,
      },
      sourceLabel: source.label,
      targetLabel: targetSource.label,
    })
  }

  const handleBrowseModeChange = (mode: typeof browseMode) => {
    setBrowseMode(mode)
  }

  const handleCreateCollection = (name: string) => {
    const { state: next, id } = createCollection(collectionsState, name)
    setCollectionsState(next)
    setActiveCollectionId(id)
    setStatusLine('已新建文件夹')
  }

  const openCreateFolderFromPreview = () => {
    setCreateFolderFromPreviewKey((k) => k + 1)
    setCreateFolderFromPreviewOpen(true)
  }

  const handleConfirmCreateFolderFromPreview = (name: string) => {
    const { state: next, id } = createCollection(collectionsState, name)
    let state = next
    if (selectedSkill) {
      state = addMember(state, id, { sourceId: selectedSkill.sourceId, relativePath: selectedSkill.relativePath })
    }
    setCollectionsState(state)
    setActiveCollectionId(id)
    setStatusLine(selectedSkill ? '已新建文件夹并加入当前 skill' : '已新建文件夹')
    setCreateFolderFromPreviewOpen(false)
  }

  const handleRenameCollection = (id: string, name: string) => {
    setCollectionsState((prev) => renameCollection(prev, id, name))
    setStatusLine('已重命名文件夹')
  }

  const handleDeleteCollection = (id: string) => {
    setCollectionsState((prev) => deleteCollection(prev, id))
    setActiveCollectionId((cur) => (cur === id ? '' : cur))
    setStatusLine('已删除文件夹')
  }

  const handleToggleSkillInCollection = (collectionId: string, add: boolean) => {
    if (!selectedSkill) return
    const ref = { sourceId: selectedSkill.sourceId, relativePath: selectedSkill.relativePath }
    setCollectionsState((prev) => (add ? addMember(prev, collectionId, ref) : removeMember(prev, collectionId, ref)))
  }

  return (
    <main className="app-shell">
      {/* Top: title + search */}
      <CommandBar
        searchValue={searchValue}
        resultCount={visibleSkills.length}
        totalCount={browseMode === 'explore' ? visibleSkills.length : skills.length}
        writableOnly={showWritableOnly}
        onSearchChange={setSearchValue}
        onToggleWritable={() => setShowWritableOnly((current) => !current)}
        onRefresh={handleToolbarRefresh}
        onCreate={() => setEditorState({ mode: 'create' })}
        desktopFeatures={bootstrapped && isTauriRuntime()}
        onExportSources={bootstrapped && isTauriRuntime() ? handleExportSources : undefined}
        onImportSourcesText={bootstrapped && isTauriRuntime() ? handleImportSourcesText : undefined}
      />

      {/* Error banner */}
      {errorMessage ? (
        <div className="status-banner" role="alert">
          <AlertTriangle size={13} aria-hidden="true" />
          <span>{errorMessage}</span>
          <button
            className="status-banner__close"
            type="button"
            aria-label="关闭错误提示"
            onClick={() => setErrorMessage(null)}
          >
            <X size={12} />
          </button>
        </div>
      ) : null}

      {/* Scrollable middle body */}
      <div className={`tray-body ${isTrayScrolling ? 'is-scrolling' : ''}`} onScroll={handleTrayScroll}>
        {/* Source section */}
        <SourceManager
          activeSourceId={activeSourceId}
          sources={sources}
          skills={skills}
          desktopFeatures={bootstrapped && isTauriRuntime()}
          browseMode={browseMode}
          onBrowseModeChange={handleBrowseModeChange}
          collections={collectionsState.collections}
          collectionMemberCounts={collectionMemberCounts}
          activeCollectionId={activeCollectionId}
          onSelectCollection={setActiveCollectionId}
          onCreateCollection={handleCreateCollection}
          onRenameCollection={handleRenameCollection}
          onDeleteCollection={handleDeleteCollection}
          onSelectSource={setActiveSourceId}
          onToggleSource={handleToggleSource}
          onAddCustomSource={handleAddCustomSource}
          onCopySource={setCopyingSource}
          onRemoveSource={handleRemoveSource}
          onExploreEntriesChange={handleExploreEntriesChange}
          onExploreError={handleExploreError}
          onExploreLoadingChange={setIsExploreLoading}
          exploreRefreshKey={exploreRefreshKey}
        />

        {/* Selected skill detail drawer */}
        {selectedSkill ? (
          <SkillPreview
            key={`${browseMode}:${selectedSkill.id}`}
            skill={selectedSkill}
            rawContent={previewRawContent}
            onOpenFolder={(path) => void handleOpenPath(path)}
            onOpenSkill={(path) => void handleOpenPath(path)}
            onCopy={setCopyingSkill}
            allCollections={collectionsState.collections}
            collectionIdsWithSkill={collectionIdsWithSkill}
            onToggleSkillInCollection={handleToggleSkillInCollection}
            onRequestCreateFolder={openCreateFolderFromPreview}
            skillCountBySourceId={skillCountBySourceId}
            exploreMode={browseMode === 'explore'}
            onInstall={
              browseMode === 'explore'
                ? () => {
                    const entry = exploreEntries.find(
                      (e) => `${e.registryId}:${e.skillDir}/SKILL.md` === selectedSkill.id,
                    )
                    if (entry) setInstallingEntry(entry)
                  }
                : undefined
            }
          />
        ) : null}

        {/* Skills list */}
        {browseMode === 'explore' ? (
          visibleSkills.length > 0 || isExploreLoading ? (
            <div className="tray-section">
              <ExploreSkillList
                skills={visibleSkills}
                selectedSkillId={effectiveSelectedSkillId}
                onSelectSkill={setSelectedSkillId}
                isSearching={searchValue.trim() !== ''}
              />
            </div>
          ) : (
            <div className="tray-section">
              <EmptyState
                title="没有匹配的 skills"
                description="切换分类或清空搜索；若列表为空请检查网络后点击刷新。"
              />
            </div>
          )
        ) : visibleSkills.length > 0 ? (
          <SkillList
            skills={visibleSkills}
            selectedSkillId={effectiveSelectedSkillId}
            onSelectSkill={setSelectedSkillId}
            skillCountBySourceId={skillCountBySourceId}
          />
        ) : (
          <div className="tray-section">
            <EmptyState
              className={browseMode === 'collections' ? 'empty-state--folder' : undefined}
              eyebrow={browseMode === 'collections' && !activeCollectionId ? null : undefined}
              title={
                browseMode === 'collections' && !activeCollectionId
                  ? '请选择文件夹'
                  : browseMode === 'collections' && activeCollectionId
                    ? '该文件夹暂无 skill'
                    : '没有匹配的 skills'
              }
              description={
                browseMode === 'collections' && !activeCollectionId
                  ? '在上方选择或新建；来源模式可勾选加入。'
                  : browseMode === 'collections' && activeCollectionId
                    ? '在预览勾选加入，或切至来源浏览全部。'
                    : '尝试开启更多来源、清空搜索或新建 skill。'
              }
              actionLabel="新建 skill"
              onAction={() => setEditorState({ mode: 'create' })}
            />
          </div>
        )}
      </div>

      {/* Bottom status strip */}
      <footer className="status-strip">
        <span aria-live="polite" aria-atomic="true">{statusLine}</span>
        {isLoading ? <LoaderCircle className="spin" size={12} /> : null}
      </footer>

      {/* Modals */}
      {editorState ? (
        <SkillEditor
          key={editorState.mode === 'edit' ? editorState.skill.id : 'create'}
          mode={editorState.mode}
          skill={editorState.mode === 'edit' ? editorState.skill : undefined}
          initialContent={editorState.mode === 'edit' ? loadedContent : undefined}
          writableSources={writableSources}
          onCancel={() => setEditorState(null)}
          onSubmit={(payload) => void handleSaveSkill(payload)}
        />
      ) : null}

      {installingEntry ? (
        <InstallDialog
          key={installingEntry.path}
          entry={installingEntry}
          rawContent={exploreContentCache.get(installingEntry.path)?.raw ?? ''}
          writableSources={sources.filter((s) => s.writable && s.enabled)}
          onSuccess={(label) => {
            setInstallingEntry(null)
            pushToast(`已安装到 ${label}`)
            void refreshSkills(sources)
          }}
          onClose={() => setInstallingEntry(null)}
        />
      ) : null}

      {copyingSkill ? (
        <CopyDialog
          key={copyingSkill.id}
          skill={copyingSkill}
          sources={sources}
          skillCountBySourceId={skillCountBySourceId}
          onCancel={() => setCopyingSkill(null)}
          onConfirm={(targetSource, targetRelativePath) =>
            void handleCopySkill(targetSource, targetRelativePath)
          }
          onConfirmCustom={(customRootPath, targetRelativePath) =>
            void handleCopySkillCustom(customRootPath, targetRelativePath)
          }
        />
      ) : null}

      {copyingSource ? (
        <CopySourceDialog
          key={copyingSource.id}
          source={copyingSource}
          sources={sources}
          skillCount={skills.filter((skill) => skill.sourceId === copyingSource.id).length}
          skillCountBySourceId={skillCountBySourceId}
          onCancel={() => setCopyingSource(null)}
          onConfirm={(targetSource) =>
            void handleCopySource(copyingSource, targetSource)
          }
        />
      ) : null}

      {copyConflict?.kind === 'skill' ? (
        <CopyConflictDialog
          title={copyConflict.context.skillName}
          description={copyConflict.description}
          targetPath={copyConflict.targetPath}
          onCancel={() => setCopyConflict(null)}
          onConfirm={(strategy) => void executeSkillCopy(copyConflict.context, strategy)}
        />
      ) : null}

      {copyConflict?.kind === 'source' ? (
        <CopyConflictDialog
          title={`${copyConflict.context.sourceLabel} -> ${copyConflict.context.targetLabel}`}
          description="目标来源里已经存在部分同路径 skills，请选择本次批量复制的处理方式。"
          conflictCount={copyConflict.conflictCount}
          conflictPaths={copyConflict.conflictPaths}
          onCancel={() => setCopyConflict(null)}
          onConfirm={(strategy) => void executeSourceCopy(copyConflict.context, strategy)}
        />
      ) : null}

      {createFolderFromPreviewOpen ? (
        <CollectionNameDialog
          key={createFolderFromPreviewKey}
          mode="create"
          initialName=""
          onCancel={() => setCreateFolderFromPreviewOpen(false)}
          onConfirm={handleConfirmCreateFolderFromPreview}
        />
      ) : null}

      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </main>
  )
}

export default App
