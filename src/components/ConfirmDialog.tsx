import { useId, useRef } from 'react'

import { useModalDialog } from '../hooks/useModalDialog'

interface ConfirmDialogProps {
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  /** Use destructive styling for the confirm action (e.g. delete). */
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const descId = useId()

  useModalDialog(panelRef, onCancel)

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <section
        ref={panelRef}
        className="modal-panel modal-panel--compact"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-heading">
          <h2 id={titleId}>{title}</h2>
        </div>
        <p id={descId} className="confirm-dialog__desc">
          {description}
        </p>
        <div className="modal-actions modal-actions--compact">
          <button className="ghost-button" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={danger ? 'accent-button accent-button--danger' : 'accent-button'}
            type="button"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  )
}
