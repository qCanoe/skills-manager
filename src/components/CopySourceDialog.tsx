import { useMemo } from 'react'

import { isSameSourcePath } from '../lib/sources'
import type { SourceConfig } from '../types'

interface CopySourceDialogProps {
  source: SourceConfig
  sources: SourceConfig[]
  skillCount: number
  onCancel: () => void
  onConfirm: (targetSource: SourceConfig) => void
}

export function CopySourceDialog({
  source,
  sources,
  skillCount,
  onCancel,
  onConfirm,
}: CopySourceDialogProps) {
  const targets = useMemo(
    () =>
      sources.filter(
        (target) =>
          target.writable &&
          target.id !== source.id &&
          !isSameSourcePath(target.rootPath, source.rootPath),
      ),
    [source.id, source.rootPath, sources],
  )

  return (
    <div className="modal-backdrop">
      <section className="modal-panel modal-panel--compact">
        <div className="panel-heading">
          <span className="eyebrow">来自 {source.label}</span>
          <h2>{skillCount} 个 skills</h2>
        </div>

        <div className="copy-dialog">
          {targets.length === 0 ? (
            <p className="copy-dialog__hint">
              没有可用的目标来源，请先在来源管理里添加一个可编辑文件夹。
            </p>
          ) : (
            <div className="copy-target-list">
              {targets.map((target) => (
                <button
                  key={target.id}
                  className="copy-target-card"
                  onClick={() => onConfirm(target)}
                  type="button"
                >
                  <span className="copy-target-card__label">{target.label}</span>
                  <span className="copy-target-card__path">{target.rootPath}</span>
                </button>
              ))}
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
