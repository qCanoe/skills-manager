import { ChevronDown, FolderPlus, Layers, Trash2, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { getSourceBadge } from '../lib/sources'
import type { SourceConfig, SkillRecord } from '../types'

interface SourceManagerProps {
  sources: SourceConfig[]
  activeSourceId: string
  skills: SkillRecord[]
  onSelectSource: (sourceId: string) => void
  onToggleSource: (sourceId: string) => void
  onAddCustomSource: (label: string, path: string, writable: boolean) => void
  onRemoveSource: (sourceId: string) => void
}

export function SourceManager({
  sources,
  activeSourceId,
  skills,
  onSelectSource,
  onToggleSource,
  onAddCustomSource,
  onRemoveSource,
}: SourceManagerProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [label, setLabel] = useState('')
  const [path, setPath] = useState('')
  const [writable, setWritable] = useState(true)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!label.trim() || !path.trim()) return

    onAddCustomSource(label, path, writable)
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

      <div className={`tray-section-content ${collapsed ? 'is-collapsed' : ''}`}>
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
          {sources.map((source) => (
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
          ))}
        </div>

        <div style={{ padding: '8px 0 0' }}>
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
              <input
                id="source-add-path"
                className="field-input"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="C:\Users\you\skills"
              />
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

