import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { SkillCollection } from '../lib/collections'

interface FolderSelectProps {
  id: string
  collections: SkillCollection[]
  collectionMemberCounts: Record<string, number>
  value: string
  onChange: (id: string) => void
  placeholder?: string
}

export function FolderSelect({
  id,
  collections,
  collectionMemberCounts,
  value,
  onChange,
  placeholder = '选择文件夹…',
}: FolderSelectProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({})
  const listboxId = useId()

  const selected = collections.find((c) => c.id === value)
  const displayLabel = selected ? `${selected.name}（${collectionMemberCounts[value] ?? 0}）` : placeholder
  const isPlaceholder = !value

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const openMenu = () => {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      setMenuStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        zIndex: 9999,
      })
    }
    setOpen(true)
  }

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  return (
    <div className="folder-select" ref={wrapRef}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        className="folder-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => open ? setOpen(false) : openMenu()}
      >
        <span className={`folder-select__value ${isPlaceholder ? 'is-placeholder' : ''}`}>
          {displayLabel}
        </span>
        <ChevronDown
          size={16}
          strokeWidth={2}
          className="folder-select__chevron"
          aria-hidden
        />
      </button>

      {open ? createPortal(
        <ul
          id={listboxId}
          className="folder-select__menu"
          role="listbox"
          aria-labelledby={id}
          style={menuStyle}
        >
          <li role="presentation" className="folder-select__li">
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              className={`folder-select__option ${value === '' ? 'is-selected' : ''}`}
              onClick={() => pick('')}
            >
              <span className="folder-select__option-label">{placeholder}</span>
            </button>
          </li>
          {collections.map((c) => {
            const count = collectionMemberCounts[c.id] ?? 0
            const active = value === c.id
            return (
              <li key={c.id} role="presentation" className="folder-select__li">
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`folder-select__option ${active ? 'is-selected' : ''}`}
                  onClick={() => pick(c.id)}
                >
                  <span className="folder-select__option-label">{c.name}</span>
                  <span className="folder-select__count">{count}</span>
                </button>
              </li>
            )
          })}
        </ul>,
        document.body
      ) : null}
    </div>
  )
}
