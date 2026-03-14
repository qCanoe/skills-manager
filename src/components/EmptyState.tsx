interface EmptyStateProps {
  title: string
  description: string
  eyebrow?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ title, description, eyebrow = '无选中项', actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="eyebrow">{eyebrow}</span>
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
