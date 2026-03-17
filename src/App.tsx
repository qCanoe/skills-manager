import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'

import './styles/app.css'
import { CopyConflictDialog } from './components/CopyConflictDialog'
import { CopyDialog } from './components/CopyDialog'
import { CopySourceDialog } from './components/CopySourceDialog'
import { CommandBar } from './components/CommandBar'
import { EmptyState } from './components/EmptyState'
import { SkillEditor } from './components/SkillEditor'
import { SkillList } from './components/SkillList'
import { SkillPreview } from './components/SkillPreview'
import { SourceManager } from './components/SourceManager'
import { ToastContainer, type ToastMessage } from './components/Toast'
import { normalizeSkills } from './lib/skills'
import { createCustomSource, isSameSourcePath, loadStoredSources, normalizePathInput, persistSources } from './lib/sources'
import { loadActiveSource, loadWritableOnly, persistActiveSource, persistWritableOnly } from './lib/ui-state'
import type {
  CopyConflictStrategy,
  CopySkillRequest,
  CopySourceResult,
  CopySourceRequest,
  CopySkillResult,
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

  const pushToast = useCallback((title: string, detail?: string) => {
    setToasts((prev) => [...prev, { id: Date.now(), title, detail }])
  }, [])

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

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
      setRefreshSeq((n) => n + 1)
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
    sourcesRef.current = sources
  }, [sources])

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

  const deferredSearchValue = useDeferredValue(searchValue)

  const visibleSkills = useMemo(() => {
    const term = deferredSearchValue.trim().toLowerCase()

    return skills.filter((skill) => {
      if (showWritableOnly && !skill.writable) return false
      if (activeSourceId !== 'all' && skill.sourceId !== activeSourceId) return false
      if (!term) return true

      return skill.searchIndex.includes(term)
    })
  }, [activeSourceId, deferredSearchValue, showWritableOnly, skills])

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
  const selectedSkillFile = selectedSkill?.skillFile

  useEffect(() => {
    if (!selectedSkillFile || !isTauriRuntime()) { setLoadedContent(''); return }

    let cancelled = false
    setLoadedContent('')
    void invoke<string>('get_skill_content', { skillFile: selectedSkillFile })
      .then((content) => { if (!cancelled) setLoadedContent(content) })
      .catch((err) => { if (!cancelled) setErrorMessage(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [selectedSkillFile, refreshSeq])

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
          onCopySource={setCopyingSource}
          onRemoveSource={handleRemoveSource}
        />

        {/* Selected skill detail drawer */}
        {selectedSkill ? (
          <SkillPreview
            skill={selectedSkill}
            rawContent={loadedContent}
            onOpenFolder={(path) => void handleOpenPath(path)}
            onOpenSkill={(path) => void handleOpenPath(path)}
            onEdit={(skill) => setEditorState({ mode: 'edit', skill })}
            onCopy={setCopyingSkill}
          />
        ) : null}

        {/* Skills list */}
        {visibleSkills.length > 0 ? (
          <SkillList
            skills={visibleSkills}
            selectedSkillId={effectiveSelectedSkillId}
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

      {copyingSkill ? (
        <CopyDialog
          key={copyingSkill.id}
          skill={copyingSkill}
          sources={sources}
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

      <ToastContainer messages={toasts} onDismiss={dismissToast} />
    </main>
  )
}

export default App
