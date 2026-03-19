import { useId, useRef, type ReactNode } from 'react'
import { Copy, FilePlus2, SkipForward } from 'lucide-react'

import { useModalDialog } from '../hooks/useModalDialog'
import type { CopyConflictStrategy } from '../types'

interface CopyConflictDialogProps {
  title: string
  description: string
  targetPath?: string
  conflictCount?: number
  conflictPaths?: string[]
  onCancel: () => void
  onConfirm: (strategy: CopyConflictStrategy) => void
}

const STRATEGY_OPTIONS: Array<{
  id: CopyConflictStrategy
  modifier: string
  icon: ReactNode
  label: string
  description: string
}> = [
  {
    id: 'rename',
    modifier: 'rename',
    icon: <FilePlus2 size={14} />,
    label: '保留两份',
    description: '为新副本自动改名，不覆盖原有内容。',
  },
  {
    id: 'overwrite',
    modifier: 'overwrite',
    icon: <Copy size={14} />,
    label: '覆盖目标',
    description: '用这次复制的内容替换目标中的现有内容。',
  },
  {
    id: 'skip',
    modifier: 'skip',
    icon: <SkipForward size={14} />,
    label: '跳过冲突',
    description: '保留目标现状，不复制已存在的项。',
  },
]

export function CopyConflictDialog({
  title,
  description,
  targetPath,
  conflictCount,
  conflictPaths = [],
  onCancel,
  onConfirm,
}: CopyConflictDialogProps) {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  useModalDialog(panelRef, onCancel)

  return (
    <div className="modal-backdrop">
      <section
        ref={panelRef}
        className="modal-panel modal-panel--compact modal-panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="panel-heading">
          <span className="eyebrow conflict-eyebrow">检测到冲突</span>
          <h2 id={titleId}>{title}</h2>
        </div>

        <div className="copy-dialog">
          <p className="copy-dialog__hint">{description}</p>

          {(targetPath || typeof conflictCount === 'number') && (
            <div className="copy-info-row">
              {targetPath && (
                <div className="copy-path-card">
                  <span className="copy-path-card__label">目标路径</span>
                  <code className="copy-path-card__value">{targetPath}</code>
                </div>
              )}
              {typeof conflictCount === 'number' && (
                <div className="copy-path-card copy-path-card--inline">
                  <span className="copy-path-card__label">冲突数量</span>
                  <span className="copy-path-card__value copy-path-card__value--count">{conflictCount}</span>
                </div>
              )}
            </div>
          )}

          {conflictPaths.length > 0 && (
            <div className="copy-conflict-list">
              {conflictPaths.slice(0, 6).map((path) => (
                <code key={path} className="copy-conflict-list__item">
                  {path}
                </code>
              ))}
              {conflictPaths.length > 6 && (
                <p className="copy-dialog__hint copy-dialog__hint--muted">
                  还有 {conflictPaths.length - 6} 个冲突未展示
                </p>
              )}
            </div>
          )}

          <p className="copy-dialog__section-label">选择处理方式</p>
          <div className="copy-strategy-grid">
            {STRATEGY_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`copy-strategy-card copy-strategy-card--${option.modifier}`}
                onClick={() => onConfirm(option.id)}
                type="button"
              >
                <div className="copy-strategy-card__icon">{option.icon}</div>
                <div className="copy-strategy-card__body">
                  <span className="copy-strategy-card__title">{option.label}</span>
                  <span className="copy-strategy-card__desc">{option.description}</span>
                </div>
              </button>
            ))}
          </div>
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
