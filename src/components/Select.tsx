import { useState, useRef, useEffect, useId, useLayoutEffect, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  id?: string
  value: string
  options: SelectOption[]
  disabled?: boolean
  onChange: (value: string) => void
  /** `aria-label` for the listbox (portal); defaults to 「选择来源」. */
  menuAriaLabel?: string
}

export function Select({
  id,
  value,
  options,
  disabled = false,
  onChange,
  menuAriaLabel = '选择来源',
}: SelectProps) {
  const [open, setOpen] = useState(false)
  const [listStyle, setListStyle] = useState<CSSProperties>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listId = `${triggerId}-list`

  const selectedOption = options.find((o) => o.value === value) ?? options[0]

  const reposition = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const gap = 4
    const margin = 8
    const spaceBelow = window.innerHeight - rect.bottom - gap - margin
    const maxListH = 220
    setListStyle({
      position: 'fixed',
      top: rect.bottom + gap,
      left: rect.left,
      width: rect.width,
      maxHeight: Math.min(maxListH, Math.max(72, spaceBelow)),
      zIndex: 200,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, reposition])

  useEffect(() => {
    if (!open) return

    function handleOutside(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t) || listRef.current?.contains(t)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = Math.max(0, options.findIndex((o) => o.value === value))
        const next =
          e.key === 'ArrowDown'
            ? Math.min(idx + 1, options.length - 1)
            : Math.max(idx - 1, 0)
        const opt = options[next]
        if (opt) onChange(opt.value)
      }
    }

    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, options, value, onChange])

  return (
    <div ref={containerRef} className={`custom-select ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''}`}>
      <button
        id={triggerId}
        type="button"
        className="custom-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="custom-select__value">{selectedOption?.label ?? '—'}</span>
        <ChevronDown className="custom-select__chevron" size={14} />
      </button>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            className="custom-select__list custom-select__list--portal"
            aria-label={menuAriaLabel}
            style={listStyle}
          >
            {options.map((option) => {
              const isSelected = option.value === value
              return (
                <li
                  key={option.value}
                  role="option"
                  aria-selected={isSelected}
                  className={`custom-select__option ${isSelected ? 'is-selected' : ''}`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onChange(option.value)
                    setOpen(false)
                  }}
                >
                  <span className="custom-select__option-label">{option.label}</span>
                  {isSelected && <Check size={12} className="custom-select__option-check" />}
                </li>
              )
            })}
          </ul>,
          document.body,
        )}
    </div>
  )
}
