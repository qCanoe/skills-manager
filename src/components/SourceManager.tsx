import { ChevronDown, CopyPlus, Download, FolderOpen, FolderPlus, Layers, Trash2, Upload, X } from 'lucide-react'
import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

import { getSourceBadge } from '../lib/sources'
import type { SourceConfig, SkillRecord } from '../types'

interface SourceManagerProps {
  sources: SourceConfig[]
  activeSourceId: string
  skills: SkillRecord[]
  desktopFeatures: boolean
  onSelectSource: (sourceId: string) => void
  onToggleSource: (sourceId: string) => void
  onAddCustomSource: (label: string, path: string, writable: boolean) => boolean
  onCopySource: (source: SourceConfig) => void
  onRemoveSource: (sourceId: string) => void
  onExportSources?: () => void | Promise<void>
  onImportSourcesText?: (json: string) => void | Promise<void>
}

export function SourceManager({
  sources,
  activeSourceId,
  skills,
  desktopFeatures,
  onSelectSource,
  onToggleSource,
  onAddCustomSource,
  onCopySource,
  onRemoveSource,
  onExportSources,
  onImportSourcesText,
}: SourceManagerProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const sectionContentId = useId()
  const [collapsed, setCollapsed] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [label, setLabel] = useState('')
  const [path, setPath] = useState('')
  const [writable, setWritable] = useState(true)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

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

  const triggerImport = () => importInputRef.current?.click()

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onImportSourcesText) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      void onImportSourcesText(text)
    }
    reader.readAsText(file)
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
          <Layers size={14} style={{ color: 'var(--text-faint)' }} />
          <span className="tray-section-label">来源</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <div className="source-chips">
          <button
            className={`source-chip ${activeSourceId === 'all' ? 'is-active' : ''}`}
            onClick={() => onSelectSource('all')}
            type="button"
          >
            全部
            <span className="source-chip__count">{allCount}</span>
          </button>

          {sources.map((source) => {
            const count = skills.filter((skill) => skill.sourceId === source.id).length
            return (
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
            )
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sources.map((source) => {
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0 0' }}>
          <button
            className="ghost-button ghost-button--wide"
            onClick={() => setShowAddForm((v) => !v)}
            type="button"
          >
            <FolderPlus size={14} />
            {showAddForm ? '取消添加' : '添加自定义来源'}
          </button>

          {desktopFeatures && onExportSources && onImportSourcesText ? (
            <div className="source-config-io">
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
              <button className="ghost-button ghost-button--wide" onClick={() => void onExportSources()} type="button">
                <Download size={14} />
                导出来源配置
              </button>
              <button className="ghost-button ghost-button--wide" onClick={triggerImport} type="button">
                <Upload size={14} />
                导入来源配置
              </button>
            </div>
          ) : null}
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
                  title={desktopFeatures ? '使用系统对话框选择文件夹' : '仅在桌面应用中可用'}
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
      </div>
    </div>
  )
}

