import { useEffect, useId, useMemo, useRef, useState, useCallback } from 'react'
import { ChevronDown, CopyPlus, FolderOpen, FolderPlus, SquareArrowOutUpRight } from 'lucide-react'

import { filterPathEntriesBySourceSkillCount, pathEntriesForSkill } from '../lib/skills'
import { renderMarkdownToSafeHtml } from '../lib/render-markdown'
import type { SkillCollection } from '../lib/collections'
import type { SkillPathEntry, SkillRecord } from '../types'

interface SkillPreviewProps {
  skill?: SkillRecord
  rawContent: string
  onOpenSkill: (path: string) => void
  onOpenFolder: (path: string) => void
  onCopy: (skill: SkillRecord) => void
  allCollections?: SkillCollection[]
  collectionIdsWithSkill?: string[]
  onToggleSkillInCollection?: (collectionId: string, add: boolean) => void
  /** Opens in-app dialog to create a folder (dropdown “新建”). */
  onRequestCreateFolder?: () => void
  /** Indexed skill counts per source (used to hide zero-skill sources from path list). */
  skillCountBySourceId: Record<string, number>
}

export function SkillPreview({
  skill,
  rawContent,
  onOpenSkill,
  onOpenFolder,
  onCopy,
  allCollections = [],
  collectionIdsWithSkill = [],
  onToggleSkillInCollection,
  onRequestCreateFolder,
  skillCountBySourceId,
}: SkillPreviewProps) {
  const [renderedHtml, setRenderedHtml] = useState('')
  const [htmlReady, setHtmlReady] = useState(false)

  const visiblePathEntries = useMemo(() => {
    if (!skill) return []
    return filterPathEntriesBySourceSkillCount(pathEntriesForSkill(skill), skillCountBySourceId)
  }, [skill, skillCountBySourceId])

  useEffect(() => {
    // Reset fade while new markdown is parsed (source changed).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional UI reset before async sanitize+parse
    setHtmlReady(false)
    if (!rawContent) {
      setRenderedHtml('')
      return
    }
    let cancelled = false
    void renderMarkdownToSafeHtml(rawContent).then((html) => {
      if (!cancelled) {
        setRenderedHtml(html)
        setHtmlReady(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [rawContent])

  const [isScrolling, setIsScrolling] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [folderPickerOpen, setFolderPickerOpen] = useState(false)
  const folderPickerRef = useRef<HTMLDivElement>(null)
  const folderMenuId = useId()
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollThrottleRef = useRef(0)

  useEffect(() => {
    // Close folder dropdown when viewing another skill (avoid stale open state).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional UI reset on skill change
    setFolderPickerOpen(false)
  }, [skill?.id])

  useEffect(() => {
    if (!folderPickerOpen) return
    const onDoc = (e: MouseEvent) => {
      if (folderPickerRef.current?.contains(e.target as Node)) return
      setFolderPickerOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFolderPickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [folderPickerOpen])

  const handleScroll = useCallback(() => {
    const now = performance.now()
    if (now - scrollThrottleRef.current > 80) {
      scrollThrottleRef.current = now
      setIsScrolling(true)
    }
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setIsScrolling(false), 500)
  }, [])

  if (!skill) return null

  return (
    <div className="tray-section">
      <div key={skill.id} className="skill-drawer skill-drawer--enter">
        <div className="skill-drawer__header">
          <div className="skill-drawer__header-main">
            <div className="skill-drawer__header-text">
              <h3 className="skill-drawer__name">{skill.name}</h3>
              {skill.description ? (
                <p className="skill-drawer__desc">{skill.description}</p>
              ) : null}
            </div>
            <button
              className="skill-drawer__collapse-btn"
              type="button"
              onClick={() => setExpanded(o => !o)}
              aria-label={expanded ? '折叠' : '展开'}
            >
              <ChevronDown
                size={14}
                className={`skill-drawer__collapse-chevron ${expanded ? '' : 'is-collapsed'}`}
              />
            </button>
          </div>
        </div>

        <div className="skill-drawer__actions">
          <button
            className="ghost-button"
            onClick={() => onOpenFolder(skill.skillDir)}
            type="button"
          >
            <FolderOpen size={12} />
            打开文件夹
          </button>

          <button
            className="ghost-button"
            onClick={() => onOpenSkill(skill.skillFile)}
            type="button"
          >
            <SquareArrowOutUpRight size={12} />
            SKILL.md
          </button>

          {onToggleSkillInCollection && onRequestCreateFolder ? (
            <div className="skill-drawer__folder-picker" ref={folderPickerRef}>
              <button
                type="button"
                className="ghost-button skill-drawer__folder-trigger"
                aria-expanded={folderPickerOpen}
                aria-haspopup="true"
                aria-controls={folderPickerOpen ? folderMenuId : undefined}
                onClick={() => setFolderPickerOpen((o) => !o)}
              >
                <FolderPlus size={12} />
                文件夹
                <ChevronDown
                  size={14}
                  className={`skill-drawer__folder-chevron ${folderPickerOpen ? 'is-open' : ''}`}
                  aria-hidden
                />
              </button>
              {folderPickerOpen ? (
                <div
                  id={folderMenuId}
                  className="skill-drawer__folder-menu"
                  role="menu"
                  aria-label="文件夹操作"
                >
                  <button
                    type="button"
                    className={`skill-drawer__folder-menu-new ${allCollections.length > 0 ? 'has-list-below' : ''}`}
                    role="menuitem"
                    onClick={() => {
                      setFolderPickerOpen(false)
                      onRequestCreateFolder()
                    }}
                  >
                    <FolderPlus size={12} aria-hidden />
                    新建
                  </button>
                  {allCollections.map((c) => {
                    const checked = collectionIdsWithSkill.includes(c.id)
                    return (
                      <label key={c.id} className="skill-drawer__folder-menu-row">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => onToggleSkillInCollection(c.id, e.target.checked)}
                        />
                        <span className="skill-drawer__folder-menu-name">{c.name}</span>
                      </label>
                    )
                  })}
                </div>
              ) : null}
            </div>
          ) : null}

          <button className="ghost-button" onClick={() => onCopy(skill)} type="button">
            <CopyPlus size={12} />
            复制
          </button>

        </div>

        {expanded && (
          <>
            <div className="skill-drawer__meta">
              <div className="skill-drawer__meta-item skill-drawer__meta-item--full">
                <span className="skill-drawer__meta-label">路径</span>
                {visiblePathEntries.length > 1 ? (
                  <div className="skill-drawer__merged-paths">
                    {visiblePathEntries.map((p: SkillPathEntry) => (
                      <div key={`${p.sourceId}:${p.relativePath}`} className="skill-drawer__merged-path">
                        <span className="skill-drawer__merged-path-text">
                          {p.sourceLabel} · {p.relativePath}
                        </span>
                        <button
                          className="ghost-button ghost-button--xs"
                          type="button"
                          onClick={() => onOpenFolder(p.skillDir)}
                          data-tooltip="打开文件夹"
                        >
                          <FolderOpen size={11} />
                        </button>
                        <button
                          className="ghost-button ghost-button--xs"
                          type="button"
                          onClick={() => onOpenSkill(p.skillFile)}
                          data-tooltip="打开 SKILL.md"
                        >
                          <SquareArrowOutUpRight size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="skill-drawer__meta-value">
                    {visiblePathEntries[0]
                      ? `${visiblePathEntries[0].sourceLabel} · ${visiblePathEntries[0].relativePath}`
                      : skill.relativePath}
                  </span>
                )}
              </div>
              <div className="skill-drawer__meta-item">
                <span className="skill-drawer__meta-label">命名空间</span>
                <span className="skill-drawer__meta-value">{skill.namespace ?? '顶层'}</span>
              </div>
              <div className="skill-drawer__meta-item">
                <span className="skill-drawer__meta-label">权限</span>
                <span className="skill-drawer__meta-value">{skill.writable ? '可编辑' : '只读'}</span>
              </div>
              <div className="skill-drawer__meta-item">
                <span className="skill-drawer__meta-label">附件</span>
                <span className="skill-drawer__meta-value">
                  {skill.extras.length > 0 ? skill.extras.join(', ') : '无'}
                </span>
              </div>
            </div>

            <div
              className={`skill-drawer__preview ${isScrolling ? 'is-scrolling' : ''}`}
              onScroll={handleScroll}
            >
              <div
                className={`md-body ${htmlReady ? 'md-body--ready' : ''}`}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
