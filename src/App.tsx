import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, useDeferredValue } from 'react'

import './styles/app.css'
import { CommandBar } from './components/CommandBar'
import { EmptyState } from './components/EmptyState'
import { SkillEditor } from './components/SkillEditor'
import { SkillList } from './components/SkillList'
import { SkillPreview } from './components/SkillPreview'
import { SourceManager } from './components/SourceManager'
import { SyncDialog } from './components/SyncDialog'
import { normalizeSkills } from './lib/skills'
import { createCustomSource, loadStoredSources, normalizePathInput, persistSources } from './lib/sources'
import { loadActiveSource, loadWritableOnly, persistActiveSource, persistWritableOnly } from './lib/ui-state'
import type { RawSkillRecord, SkillRecord, SourceConfig, SyncConflictStrategy } from './types'

interface SyncResult {
  finalSkillDir: string
  finalRelativePath: string
  skipped: boolean
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
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [activeSourceId, setActiveSourceId] = useState(loadActiveSource())
  const [showWritableOnly, setShowWritableOnly] = useState(loadWritableOnly())
  const [searchValue, setSearchValue] = useState('')
  const [selectedSkillId, setSelectedSkillId] = useState<string>()
  const [editorState, setEditorState] = useState<EditorState>(null)
  const [syncingSkill, setSyncingSkill] = useState<SkillRecord | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [statusLine, setStatusLine] = useState('准备来源...')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const refreshSkills = useCallback(async (currentSources: SourceConfig[], nextSelectedId?: string) => {
    setIsLoading(true)
    setErrorMessage(null)
    setStatusLine('扫描中...')

    try {
      const rawSkills = await invoke<RawSkillRecord[]>('scan_skills', {
        sources: currentSources.filter((source) => source.enabled),
      })
      const normalized = normalizeSkills(rawSkills, currentSources)
      setSkills(normalized)
      setSelectedSkillId((previous) => nextSelectedId ?? previous ?? normalized[0]?.id)
      setStatusLine(`已索引 ${normalized.length} 个 skills`)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
      setStatusLine('扫描失败。')
    } finally {
      setIsLoading(false)
    }
  }, [])

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
    persistActiveSource(activeSourceId)
  }, [activeSourceId])

  useEffect(() => {
    persistWritableOnly(showWritableOnly)
  }, [showWritableOnly])

  useEffect(() => {
    if (!isTauriRuntime()) return

    const setupListener = async () => {
      const unlisten = await listen('refresh-requested', () => {
        void refreshSkills(sources)
      })
      return unlisten
    }

    let cleanup: (() => void) | undefined
    void setupListener().then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup?.()
  }, [refreshSkills, sources])

  const deferredSearchValue = useDeferredValue(searchValue)

  const visibleSkills = useMemo(() => {
    const term = deferredSearchValue.trim().toLowerCase()

    return skills.filter((skill) => {
      if (showWritableOnly && !skill.writable) return false
      if (activeSourceId !== 'all' && skill.sourceId !== activeSourceId) return false
      if (!term) return true

      return [skill.name, skill.description, skill.sourceLabel, skill.relativePath, skill.previewBody]
        .join(' ')
        .toLowerCase()
        .includes(term)
    })
  }, [activeSourceId, deferredSearchValue, showWritableOnly, skills])

  useEffect(() => {
    if (visibleSkills.length === 0) {
      setSelectedSkillId(undefined)
      return
    }

    if (!selectedSkillId || !visibleSkills.some((skill) => skill.id === selectedSkillId)) {
      setSelectedSkillId(visibleSkills[0]?.id)
    }
  }, [selectedSkillId, visibleSkills])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName ?? ''
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return
      if (visibleSkills.length === 0) return

      const index = visibleSkills.findIndex((skill) => skill.id === selectedSkillId)

      if (event.key === 'ArrowDown' || event.key.toLowerCase() === 'j') {
        event.preventDefault()
        const nextIndex = index >= 0 ? Math.min(index + 1, visibleSkills.length - 1) : 0
        setSelectedSkillId(visibleSkills[nextIndex]?.id)
      }

      if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const nextIndex = index >= 0 ? Math.max(index - 1, 0) : 0
        setSelectedSkillId(visibleSkills[nextIndex]?.id)
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [selectedSkillId, visibleSkills])

  const selectedSkill = visibleSkills.find((skill) => skill.id === selectedSkillId)
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
    if (!normalizedPath) return

    const nextSources = [...sources, createCustomSource(label, normalizedPath, writable)]
    setSources(nextSources)
    setStatusLine(`已添加来源 ${label.trim()}。`)
  }

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

  const handleSyncSkill = async (targetSource: SourceConfig, conflictStrategy: SyncConflictStrategy) => {
    if (!syncingSkill || !isTauriRuntime()) return

    try {
      const result = await invoke<SyncResult>('sync_skill', {
        request: {
          sourceSkillDir: syncingSkill.skillDir,
          relativePath: syncingSkill.relativePath,
          targetSource,
          conflictStrategy,
        },
      })

      setSyncingSkill(null)
      const nextSelectedId = `${targetSource.id}:${result.finalRelativePath}`
      await refreshSkills(sources, result.skipped ? syncingSkill.id : nextSelectedId)
      setStatusLine(
        result.skipped
          ? `已跳过 ${syncingSkill.name} 的同步（目标已存在）。`
          : `已将 ${syncingSkill.name} 同步到 ${targetSource.label}。`,
      )
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <main className="app-shell">
      {/* Top: title + search */}
      <CommandBar
        searchValue={searchValue}
        resultCount={visibleSkills.length}
        totalCount={skills.length}
        writableOnly={showWritableOnly}
        onSearchChange={setSearchValue}
        onToggleWritable={() => setShowWritableOnly((current) => !current)}
        onRefresh={() => void refreshSkills(sources)}
        onCreate={() => setEditorState({ mode: 'create' })}
      />

      {/* Error banner */}
      {errorMessage ? (
        <div className="status-banner">
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
      <div className="tray-body">
        {/* Source section */}
        <SourceManager
          activeSourceId={activeSourceId}
          sources={sources}
          skills={skills}
          onSelectSource={setActiveSourceId}
          onToggleSource={handleToggleSource}
          onAddCustomSource={handleAddCustomSource}
          onRemoveSource={handleRemoveSource}
        />

        {/* Selected skill detail drawer */}
        {selectedSkill ? (
          <SkillPreview
            skill={selectedSkill}
            onOpenFolder={(path) => void handleOpenPath(path)}
            onOpenSkill={(path) => void handleOpenPath(path)}
            onEdit={(skill) => setEditorState({ mode: 'edit', skill })}
            onSync={setSyncingSkill}
            onCreate={() => setEditorState({ mode: 'create' })}
          />
        ) : null}

        {/* Skills list */}
        {visibleSkills.length > 0 ? (
          <SkillList
            skills={visibleSkills}
            selectedSkillId={selectedSkillId}
            onSelectSkill={setSelectedSkillId}
          />
        ) : (
          <div className="tray-section">
            <EmptyState
              title="没有匹配的 skills"
              description="尝试开启更多来源、清空搜索词或新建 skill。"
              actionLabel="新建 skill"
              onAction={() => setEditorState({ mode: 'create' })}
            />
          </div>
        )}
      </div>

      {/* Bottom status strip */}
      <footer className="status-strip">
        <span aria-live="polite" aria-atomic="true">{statusLine}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="status-strip__kbd">J/K 浏览</span>
          {isLoading ? <LoaderCircle className="spin" size={12} /> : null}
        </div>
      </footer>

      {/* Modals */}
      {editorState ? (
        <SkillEditor
          mode={editorState.mode}
          skill={editorState.mode === 'edit' ? editorState.skill : undefined}
          writableSources={writableSources}
          onCancel={() => setEditorState(null)}
          onSubmit={(payload) => void handleSaveSkill(payload)}
        />
      ) : null}

      {syncingSkill ? (
        <SyncDialog
          skill={syncingSkill}
          sources={sources}
          onCancel={() => setSyncingSkill(null)}
          onConfirm={(targetSource, conflictStrategy) =>
            void handleSyncSkill(targetSource, conflictStrategy)
          }
        />
      ) : null}
    </main>
  )
}

export default App
