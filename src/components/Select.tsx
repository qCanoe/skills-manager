import { useState, useRef, useEffect, useId } from 'react'
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
}

export function Select({ id, value, options, disabled = false, onChange }: SelectProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const generatedId = useId()
  const triggerId = id ?? generatedId
  const listId = `${triggerId}-list`

  const selectedOption = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return

    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  useEffect(() => {
    if (!open) return

    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        return
      }

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const idx = options.findIndex((o) => o.value === value)
        const next =
          e.key === 'ArrowDown'
            ? Math.min(idx + 1, options.length - 1)
            : Math.max(idx - 1, 0)
        onChange(options[next].value)
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

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="custom-select__list"
          aria-label="选择来源"
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
        </ul>
      )}
    </div>
  )
}
