interface EmptyStateProps {
  title: string
  description: string
  /** Omit eyebrow line when `null` (e.g. title already states the situation). */
  eyebrow?: string | null
  actionLabel?: string
  onAction?: () => void
  /** e.g. `empty-state--folder` for folder-mode typography */
  className?: string
}

export function EmptyState({
  title,
  description,
  eyebrow = '无选中项',
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div className={['empty-state', className].filter(Boolean).join(' ')}>
      {eyebrow != null ? <span className="eyebrow">{eyebrow}</span> : null}
      <h3>{title}</h3>
      <p>{description}</p>
      {actionLabel && onAction ? (
        <button className="accent-button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
