import { ChevronDown, Compass, CopyPlus, Folder, FolderOpen, FolderPlus, Layers, Pencil, Trash2, X } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'

import { CollectionNameDialog } from './CollectionNameDialog'
import { ConfirmDialog } from './ConfirmDialog'
import { ExplorePanel } from './ExplorePanel'
import { FolderSelect } from './FolderSelect'
import { getSourceBadge } from '../lib/sources'
import type { BrowseMode, ExploreEntry, ExploreRegistry, SourceConfig, SkillRecord } from '../types'
import type { SkillCollection } from '../lib/collections'

interface SourceManagerProps {
  sources: SourceConfig[]
  activeSourceId: string
  skills: SkillRecord[]
  desktopFeatures: boolean
  browseMode: BrowseMode
  onBrowseModeChange: (mode: BrowseMode) => void
  collections: SkillCollection[]
  collectionMemberCounts: Record<string, number>
  activeCollectionId: string
  onSelectCollection: (id: string) => void
  onCreateCollection: (name: string) => void
  onRenameCollection: (id: string, name: string) => void
  onDeleteCollection: (id: string) => void
  onSelectSource: (sourceId: string) => void
  onToggleSource: (sourceId: string) => void
  onAddCustomSource: (label: string, path: string, writable: boolean) => boolean
  onCopySource: (source: SourceConfig) => void
  onRemoveSource: (sourceId: string) => void
  onExportSources?: () => void | Promise<void>
  onImportSourcesText?: (json: string) => void | Promise<void>
  onExploreEntriesChange: (entries: ExploreEntry[], registry: ExploreRegistry) => void
  onExploreError: (msg: string) => void
  onExploreLoadingChange?: (loading: boolean) => void
  exploreRefreshKey?: number
}

export function SourceManager({
  sources,
  activeSourceId,
  skills,
  desktopFeatures,
  browseMode,
  onBrowseModeChange,
  collections,
  collectionMemberCounts,
  activeCollectionId,
  onSelectCollection,
  onCreateCollection,
  onRenameCollection,
  onDeleteCollection,
  onSelectSource,
  onToggleSource,
  onAddCustomSource,
  onCopySource,
  onRemoveSource,
  onExploreEntriesChange,
  onExploreError,
  onExploreLoadingChange,
  exploreRefreshKey = 0,
}: SourceManagerProps) {
  type NameModalState =
    | { mode: 'create' }
    | { mode: 'rename'; collectionId: string; initialName: string }

  const sectionContentId = useId()
  const browsePanelId = useId()
  const [collapsed, setCollapsed] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [label, setLabel] = useState('')
  const [path, setPath] = useState('')
  const [writable, setWritable] = useState(true)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [nameModal, setNameModal] = useState<NameModalState | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null)
  const [collectionNameDialogKey, setCollectionNameDialogKey] = useState(0)

  const pickFolder = async () => {
    if (!desktopFeatures) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        title: '选择 skills 根目录',
        directory: true,
        multiple: false,
      })
      if (typeof selected === 'string' && selected) {
        setPath(selected)
        return
      }
      if (Array.isArray(selected) && selected[0]) {
        setPath(selected[0])
      }
    } catch {
      /* dialog cancelled or unavailable */
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!label.trim() || !path.trim()) return

    const added = onAddCustomSource(label, path, writable)
    if (!added) return

    setLabel('')
    setPath('')
    setWritable(true)
    setShowAddForm(false)
  }

  const allCount = skills.length

  return (
    <>
    <div className="tray-section">
      <div
        className="tray-section-header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        aria-controls={sectionContentId}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed((v) => !v) } }}
      >
        <div className="tray-section-header__left">
          {browseMode === 'collections' ? (
            <Folder size={14} style={{ color: 'var(--text-faint)' }} />
          ) : browseMode === 'explore' ? (
            <Compass size={14} style={{ color: 'var(--text-faint)' }} />
          ) : (
            <Layers size={14} style={{ color: 'var(--text-faint)' }} />
          )}
          <span className="tray-section-label">
            {browseMode === 'collections' ? '文件夹' : browseMode === 'explore' ? '探索' : '来源'}
          </span>
        </div>
        <div className="tray-section-header__right">
          <span className="tray-section-status">{sources.filter((s) => s.enabled).length} 已启用</span>
          <ChevronDown size={14} className={`tray-section-chevron ${collapsed ? 'is-collapsed' : ''}`} />
        </div>
      </div>

      <div
        id={sectionContentId}
        className="tray-section-content"
        role="region"
        aria-label="来源列表与管理"
        hidden={collapsed}
      >
        <div
          className="browse-mode-segment"
          role="tablist"
          aria-label="浏览方式"
          data-active={
            browseMode === 'sources' ? 'sources' : browseMode === 'collections' ? 'folders' : 'explore'
          }
        >
          <span className="browse-mode-segment__thumb" aria-hidden="true" />
          <button
            type="button"
            role="tab"
            id={`${sectionContentId}-tab-sources`}
            aria-controls={browsePanelId}
            aria-selected={browseMode === 'sources'}
            className={`browse-mode-segment__btn ${browseMode === 'sources' ? 'is-active' : ''}`}
            onClick={() => onBrowseModeChange('sources')}
          >
            <Layers size={13} strokeWidth={2} className="browse-mode-segment__icon" aria-hidden />
            来源
          </button>
          <button
            type="button"
            role="tab"
            id={`${sectionContentId}-tab-folders`}
            aria-controls={browsePanelId}
            aria-selected={browseMode === 'collections'}
            className={`browse-mode-segment__btn ${browseMode === 'collections' ? 'is-active' : ''}`}
            onClick={() => onBrowseModeChange('collections')}
          >
            <Folder size={13} strokeWidth={2} className="browse-mode-segment__icon" aria-hidden />
            文件夹
          </button>
          <button
            type="button"
            role="tab"
            id={`${sectionContentId}-tab-explore`}
            aria-controls={browsePanelId}
            aria-selected={browseMode === 'explore'}
            className={`browse-mode-segment__btn ${browseMode === 'explore' ? 'is-active' : ''}`}
            onClick={() => onBrowseModeChange('explore')}
          >
            <Compass size={13} strokeWidth={2} className="browse-mode-segment__icon" aria-hidden />
            探索
          </button>
        </div>

        <div
          id={browsePanelId}
          role="tabpanel"
          aria-labelledby={
            browseMode === 'sources'
              ? `${sectionContentId}-tab-sources`
              : browseMode === 'collections'
                ? `${sectionContentId}-tab-folders`
                : `${sectionContentId}-tab-explore`
          }
          className="browse-panel"
        >
        {browseMode === 'sources' ? (
        <div key="sources" className="browse-panel__surface">
        <div className="source-chips">
          <button
            className={`source-chip ${activeSourceId === 'all' ? 'is-active' : ''}`}
            onClick={() => onSelectSource('all')}
            type="button"
          >
            全部
            <span className="source-chip__count">{allCount}</span>
          </button>

          {sources
            .map((source) => ({
              source,
              count: skills.filter((skill) => skill.sourceId === source.id).length,
            }))
            .filter(({ count }) => count > 0)
            .map(({ source, count }) => (
              <button
                key={source.id}
                className={`source-chip ${activeSourceId === source.id ? 'is-active' : ''} ${!source.enabled ? 'is-disabled' : ''}`}
                onClick={() => source.enabled && onSelectSource(source.id)}
                type="button"
                disabled={!source.enabled}
                aria-disabled={!source.enabled}
              >
                {source.label}
                <span className="source-chip__count">{count}</span>
              </button>
            ))}
        </div>
        </div>
        ) : browseMode === 'collections' ? (
          <div key="folders" className="browse-panel__surface">
          <div className="collection-toolbar">
            <div className="collection-toolbar__primary">
              <FolderSelect
                id="collection-select"
                collections={collections}
                collectionMemberCounts={collectionMemberCounts}
                value={activeCollectionId}
                onChange={onSelectCollection}
                placeholder="选择文件夹…"
              />
              <div className="collection-toolbar__actions" role="group" aria-label="所选文件夹操作">
              <button
                type="button"
                className="icon-button icon-button--create"
                data-tooltip="新建文件夹"
                aria-label="新建文件夹"
                onClick={() => {
                  setCollectionNameDialogKey((k) => k + 1)
                  setNameModal({ mode: 'create' })
                }}
              >
                <FolderPlus size={13} />
              </button>
                <button
                  type="button"
                  className="icon-button icon-button--edit"
                  disabled={!activeCollectionId}
                  data-tooltip="重命名"
                  aria-label="重命名文件夹"
                  onClick={() => {
                    if (!activeCollectionId) return
                    const c = collections.find((x) => x.id === activeCollectionId)
                    if (!c) return
                    setCollectionNameDialogKey((k) => k + 1)
                    setNameModal({
                      mode: 'rename',
                      collectionId: activeCollectionId,
                      initialName: c.name,
                    })
                  }}
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  className="icon-button icon-button--danger"
                  disabled={!activeCollectionId}
                  data-tooltip="删除"
                  aria-label="删除文件夹"
                  onClick={() => {
                    if (!activeCollectionId) return
                    const c = collections.find((x) => x.id === activeCollectionId)
                    if (!c) return
                    setDeleteModal({ id: activeCollectionId, name: c.name })
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
          </div>
        ) : (
          <div key="explore" className="browse-panel__surface">
            <ExplorePanel
              refreshKey={exploreRefreshKey}
              onEntriesChange={onExploreEntriesChange}
              onError={onExploreError}
              onLoadingChange={onExploreLoadingChange}
            />
          </div>
        )}
        </div>

        {browseMode === 'sources' ? (
        <div className="source-rows">
          {sources
            .filter((source) => skills.some((skill) => skill.sourceId === source.id))
            .map((source) => {
            const sourceSkills = skills.filter((skill) => skill.sourceId === source.id)
            const hasRootLevelSkill = sourceSkills.some((skill) => !skill.relativePath.includes('/'))
            const isCopyDisabled = sourceSkills.length === 0 || hasRootLevelSkill
            const copyTitle =
              sourceSkills.length === 0
                ? '当前来源没有可复制的 skill'
                : hasRootLevelSkill
                  ? '当前来源包含位于根目录的 SKILL.md，请先整理到单独文件夹'
                  : `复制 ${source.label} 中的全部 skills`

            return (
              <div
                key={source.id}
                className={`source-row-item ${activeSourceId === source.id ? 'is-selected' : ''} ${!source.enabled ? 'is-disabled' : ''}`}
              >
              <button
                className="source-row-item__label"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                onClick={() => onSelectSource(source.id)}
                type="button"
              >
                <div className="source-row-item__name">{source.label}</div>
                <div className="source-row-item__meta">{getSourceBadge(source)}</div>
              </button>

              <div className="source-row-item__controls">
                <button
                  className="tiny-toggle"
                  disabled={isCopyDisabled}
                  onClick={() => onCopySource(source)}
                  type="button"
                  title={copyTitle}
                >
                  <CopyPlus size={12} />
                  复制
                </button>

                <button
                  className={`tiny-toggle ${source.enabled ? 'is-active' : ''}`}
                  onClick={() => onToggleSource(source.id)}
                  type="button"
                >
                  {source.enabled ? '已启用' : '已停用'}
                </button>

                {source.kind === 'custom' ? (
                  confirmingDeleteId === source.id ? (
                    <>
                      <button
                        className="tiny-toggle tiny-toggle--danger"
                        onClick={() => { onRemoveSource(source.id); setConfirmingDeleteId(null) }}
                        type="button"
                      >
                        确认删除
                      </button>
                      <button
                        className="icon-button"
                        aria-label="取消删除"
                        onClick={() => setConfirmingDeleteId(null)}
                        type="button"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      aria-label={`删除 ${source.label}`}
                      className="icon-button"
                      onClick={() => setConfirmingDeleteId(source.id)}
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  )
                ) : null}
              </div>
              </div>
            )
          })}
        </div>
        ) : null}

        {browseMode === 'sources' ? (
          <>
        <div className="source-add-trigger">
          <button
            className="ghost-button ghost-button--wide"
            onClick={() => setShowAddForm((v) => !v)}
            type="button"
          >
            <FolderPlus size={14} />
            {showAddForm ? '取消添加' : '添加自定义来源'}
          </button>
        </div>

        {showAddForm ? (
          <form className="source-add-form" onSubmit={handleSubmit}>
            <div className="field-group">
              <label className="field-label" htmlFor="source-add-label">名称</label>
              <input
                id="source-add-label"
                className="field-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="例如：Claude / Team Skills"
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="source-add-path">文件夹路径</label>
              <div className="field-row">
                <input
                  id="source-add-path"
                  className="field-input"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  placeholder="C:\Users\you\skills"
                />
                <button
                  className="ghost-button"
                  disabled={!desktopFeatures}
                  onClick={() => void pickFolder()}
                  data-tooltip={desktopFeatures ? '使用系统对话框选择文件夹' : '仅在桌面应用中可用'}
                  type="button"
                >
                  <FolderOpen size={14} />
                  浏览…
                </button>
              </div>
            </div>

            <label className="field-check">
              <input checked={writable} onChange={(e) => setWritable(e.target.checked)} type="checkbox" />
              <span>可编辑来源</span>
            </label>

            <button className="accent-button" type="submit" style={{ alignSelf: 'flex-start' }}>
              <FolderPlus size={14} />
              添加
            </button>
          </form>
        ) : null}
          </>
        ) : null}
      </div>
    </div>

    {nameModal ? (
      <CollectionNameDialog
        key={collectionNameDialogKey}
        mode={nameModal.mode}
        initialName={nameModal.mode === 'rename' ? nameModal.initialName : ''}
        onCancel={() => setNameModal(null)}
        onConfirm={(name) => {
          if (nameModal.mode === 'create') {
            onCreateCollection(name)
          } else {
            onRenameCollection(nameModal.collectionId, name)
          }
          setNameModal(null)
        }}
      />
    ) : null}

    {deleteModal ? (
      <ConfirmDialog
        title="删除文件夹"
        description={`确定删除「${deleteModal.name}」？其中的 skill 引用将一并移除。`}
        confirmLabel="删除"
        danger
        onCancel={() => setDeleteModal(null)}
        onConfirm={() => {
          onDeleteCollection(deleteModal.id)
          setDeleteModal(null)
        }}
      />
    ) : null}
    </>
  )
}

