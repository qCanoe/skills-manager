import { BookOpen, Filter, Plus, RefreshCw, Search, X } from 'lucide-react'
import { useRef } from 'react'

interface CommandBarProps {
  searchValue: string
  resultCount: number
  totalCount: number
  writableOnly: boolean
  onSearchChange: (value: string) => void
  onToggleWritable: () => void
  onRefresh: () => void
  onCreate: () => void
}

export function CommandBar({
  searchValue,
  resultCount,
  totalCount,
  writableOnly,
  onSearchChange,
  onToggleWritable,
  onRefresh,
  onCreate,
}: CommandBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <header className="tray-titlebar">
        <div className="tray-titlebar__left">
          <div className="tray-titlebar__icon">
            <BookOpen size={12} strokeWidth={2.5} />
          </div>
          <span className="tray-titlebar__title">Skills</span>
          <span className="tray-titlebar__subtitle">
            {resultCount} / {totalCount}
          </span>
        </div>

        <div className="tray-titlebar__actions">
          <button
            className={`icon-button ${writableOnly ? 'is-active' : ''}`}
            onClick={onToggleWritable}
            title={writableOnly ? '显示全部' : '仅显示可编辑'}
            type="button"
          >
            <Filter size={14} />
          </button>

          <button className="icon-button" onClick={onRefresh} title="重新扫描" type="button">
            <RefreshCw size={14} />
          </button>

          <button className="icon-button" onClick={onCreate} title="新建" type="button">
            <Plus size={16} />
          </button>
        </div>
      </header>

      <div className="tray-search">
        <div
          role="search"
          className={`search-field${searchValue ? ' search-field--has-value' : ''}`}
          onClick={() => searchInputRef.current?.focus()}
        >
          <Search size={13} className="search-field__icon" aria-hidden="true" />
          <input
            ref={searchInputRef}
            aria-label="搜索"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="搜索 skills..."
            spellCheck={false}
          />
          {searchValue && (
            <button
              className="search-clear"
              type="button"
              aria-label="清除搜索"
              onClick={() => onSearchChange('')}
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          )}
        </div>
      </div>
    </>
  )
}

