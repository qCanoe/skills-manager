import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronDown, CopyPlus, FilePenLine, FolderOpen, SquareArrowOutUpRight } from 'lucide-react'

import { renderMarkdownToSafeHtml } from '../lib/render-markdown'
import type { SkillRecord } from '../types'

interface SkillPreviewProps {
  skill?: SkillRecord
  rawContent: string
  onOpenSkill: (path: string) => void
  onOpenFolder: (path: string) => void
  onEdit: (skill: SkillRecord) => void
  onCopy: (skill: SkillRecord) => void
}

export function SkillPreview({
  skill,
  rawContent,
  onOpenSkill,
  onOpenFolder,
  onEdit,
  onCopy,
}: SkillPreviewProps) {
  const [renderedHtml, setRenderedHtml] = useState('')
  const [htmlReady, setHtmlReady] = useState(false)

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
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollThrottleRef = useRef(0)

  const handleScroll = useCallback(() => {
    const now = performance.now()
    if (now - scrollThrottleRef.current > 80) {
      scrollThrottleRef.current = now
      setIsScrolling(true)
    }
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setIsScrolling(false), 800)
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

          {skill.writable ? (
            <button className="ghost-button" onClick={() => onEdit(skill)} type="button">
              <FilePenLine size={12} />
              编辑
            </button>
          ) : null}

          <button className="accent-button" onClick={() => onCopy(skill)} type="button">
            <CopyPlus size={12} />
            复制
          </button>
        </div>

        {expanded && (
          <>
            <div className="skill-drawer__meta">
              <div className="skill-drawer__meta-item skill-drawer__meta-item--full">
                <span className="skill-drawer__meta-label">路径</span>
                {skill.mergedPaths && skill.mergedPaths.length > 0 ? (
                  <div className="skill-drawer__merged-paths">
                    {[
                      { sourceId: skill.sourceId, sourceLabel: skill.sourceLabel, relativePath: skill.relativePath, skillDir: skill.skillDir, skillFile: skill.skillFile, writable: skill.writable },
                      ...skill.mergedPaths,
                    ].map((p) => (
                      <div key={`${p.sourceId}:${p.relativePath}`} className="skill-drawer__merged-path">
                        <span className="skill-drawer__merged-path-text">
                          {p.sourceLabel} · {p.relativePath}
                        </span>
                        <button
                          className="ghost-button ghost-button--xs"
                          type="button"
                          onClick={() => onOpenFolder(p.skillDir)}
                          title="打开文件夹"
                        >
                          <FolderOpen size={11} />
                        </button>
                        <button
                          className="ghost-button ghost-button--xs"
                          type="button"
                          onClick={() => onOpenSkill(p.skillFile)}
                          title="打开 SKILL.md"
                        >
                          <SquareArrowOutUpRight size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="skill-drawer__meta-value">{skill.relativePath}</span>
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
