import { useState, useMemo } from 'react'
import { FolderInput } from 'lucide-react'

import { isSameSourcePath } from '../lib/sources'
import type { SkillRecord, SourceConfig } from '../types'

interface CopyDialogProps {
  skill: SkillRecord
  sources: SourceConfig[]
  onCancel: () => void
  onConfirm: (targetSource: SourceConfig, targetRelativePath: string) => void
  onConfirmCustom: (customRootPath: string, targetRelativePath: string) => void
}

export function CopyDialog({ skill, sources, onCancel, onConfirm, onConfirmCustom }: CopyDialogProps) {
  const isRootLevelSkill = !skill.relativePath.includes('/')
  const [showCustom, setShowCustom] = useState(false)
  const [customPath, setCustomPath] = useState('')

  const targets = useMemo(
    () =>
      sources.filter(
        (source) =>
          source.writable &&
          source.id !== skill.sourceId &&
          !isSameSourcePath(source.rootPath, skill.rootPath),
      ),
    [skill.rootPath, skill.sourceId, sources],
  )

  return (
    <div className="modal-backdrop">
      <section className="modal-panel modal-panel--compact">
        <div className="panel-heading">
          <span className="eyebrow">来自 {skill.sourceLabel}</span>
          <h2>{skill.name}</h2>
        </div>

        <div className="copy-dialog">
          {isRootLevelSkill ? (
            <p className="copy-dialog__hint">
              这个 skill 位于来源根目录，无法直接复制，请先将它移到一个单独文件夹中。
            </p>
          ) : (
            <div className="copy-target-list">
              {targets.map((target) => (
                <button
                  key={target.id}
                  className="copy-target-card"
                  onClick={() => onConfirm(target, skill.relativePath)}
                  type="button"
                >
                  <span className="copy-target-card__label">{target.label}</span>
                  <span className="copy-target-card__path">{target.rootPath}</span>
                </button>
              ))}

              {showCustom ? (
                <div className="copy-target-card copy-target-card--custom">
                  <span className="copy-target-card__label">自定义路径</span>
                  <input
                    autoFocus
                    className="field-input"
                    placeholder="例如：C:\Users\you\my-skills"
                    spellCheck={false}
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customPath.trim()) {
                        onConfirmCustom(customPath.trim(), skill.relativePath)
                      }
                      if (e.key === 'Escape') setShowCustom(false)
                    }}
                  />
                  <div className="copy-target-card__custom-actions">
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setShowCustom(false)}
                    >
                      取消
                    </button>
                    <button
                      className="accent-button"
                      type="button"
                      disabled={!customPath.trim()}
                      onClick={() => onConfirmCustom(customPath.trim(), skill.relativePath)}
                    >
                      复制
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="copy-target-card copy-target-card--add"
                  onClick={() => setShowCustom(true)}
                  type="button"
                >
                  <FolderInput size={14} />
                  <span className="copy-target-card__label">自定义路径</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions modal-actions--compact">
          <button className="ghost-button" onClick={onCancel} type="button">
            取消
          </button>
        </div>
      </section>
    </div>
  )
}
