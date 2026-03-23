import { useId, useRef, useState, type FormEvent } from 'react'

import { useModalDialog } from '../hooks/useModalDialog'

interface CollectionNameDialogProps {
  mode: 'create' | 'rename'
  initialName: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function CollectionNameDialog({
  mode,
  initialName,
  onConfirm,
  onCancel,
}: CollectionNameDialogProps) {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const inputId = useId()
  const [name, setName] = useState(initialName)

  useModalDialog(panelRef, onCancel)

  const title = mode === 'create' ? '新建文件夹' : '重命名文件夹'
  const hint = mode === 'create' ? '新建' : '重命名'

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
  }

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
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="panel-heading">
          <span className="eyebrow">文件夹</span>
          <h2 id={titleId}>{title}</h2>
        </div>

        <form className="editor-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor={inputId}>
              名称
            </label>
            <input
              id={inputId}
              className="field-input"
              autoComplete="off"
              spellCheck={false}
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'create' ? '例如：常用 / 工作项目' : ''}
              autoFocus
            />
          </div>

          <div className="modal-actions modal-actions--compact">
            <button className="ghost-button" type="button" onClick={onCancel}>
              取消
            </button>
            <button className="accent-button" type="submit" disabled={!name.trim()}>
              {hint}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
