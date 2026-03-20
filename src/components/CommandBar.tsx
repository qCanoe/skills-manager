import { BookOpen, Download, Filter, Plus, RefreshCw, Search, Settings, Upload, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'

interface CommandBarProps {
  searchValue: string
  resultCount: number
  totalCount: number
  writableOnly: boolean
  onSearchChange: (value: string) => void
  onToggleWritable: () => void
  onRefresh: () => void | Promise<void>
  onCreate: () => void
  desktopFeatures?: boolean
  onExportSources?: () => void | Promise<void>
  onImportSourcesText?: (json: string) => void | Promise<void>
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
  desktopFeatures = false,
  onExportSources,
  onImportSourcesText,
}: CommandBarProps) {
  const searchInputRef = useRef<HTMLInputElement>(null)
  const settingsWrapRef = useRef<HTMLDivElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const exportMenuItemRef = useRef<HTMLButtonElement>(null)
  const importMenuItemRef = useRef<HTMLButtonElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsMenuId = useId()
  const settingsHintId = useId()
  const sourcesIoAvailable = Boolean(
    desktopFeatures && onExportSources && onImportSourcesText,
  )

  const [refreshBusy, setRefreshBusy] = useState(false)

  const handleRefreshClick = async () => {
    if (refreshBusy) return
    setRefreshBusy(true)
    try {
      await Promise.resolve(onRefresh())
    } finally {
      setRefreshBusy(false)
    }
  }

  useEffect(() => {
    if (!settingsOpen) return

    const onDocMouseDown = (event: MouseEvent) => {
      const el = settingsWrapRef.current
      if (el && event.target instanceof Node && !el.contains(event.target)) {
        setSettingsOpen(false)
      }
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [settingsOpen])

  useEffect(() => {
    if (!settingsOpen) return
    requestAnimationFrame(() => exportMenuItemRef.current?.focus())
  }, [settingsOpen])

  const triggerImport = () => importInputRef.current?.click()

  const handleSettingsMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (document.activeElement === exportMenuItemRef.current) {
        importMenuItemRef.current?.focus()
      } else {
        exportMenuItemRef.current?.focus()
      }
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (document.activeElement === importMenuItemRef.current) {
        exportMenuItemRef.current?.focus()
      } else {
        importMenuItemRef.current?.focus()
      }
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      exportMenuItemRef.current?.focus()
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      importMenuItemRef.current?.focus()
    }
  }

  const handleImportFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !onImportSourcesText) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : ''
      void onImportSourcesText(text)
      setSettingsOpen(false)
    }
    reader.readAsText(file)
  }

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

          <button
            className={`icon-button ${refreshBusy ? 'is-active' : ''}`}
            onClick={() => void handleRefreshClick()}
            title="重新扫描"
            type="button"
            aria-busy={refreshBusy}
            aria-label={refreshBusy ? '正在扫描…' : '重新扫描'}
            disabled={refreshBusy}
          >
            <RefreshCw
              size={14}
              strokeWidth={2}
              aria-hidden="true"
              className={refreshBusy ? 'spin' : undefined}
            />
          </button>

          <button className="icon-button" onClick={onCreate} title="新建" type="button">
            <Plus size={16} />
          </button>

          {sourcesIoAvailable ? (
            <div className="tray-titlebar__settings" ref={settingsWrapRef}>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                className="settings-menu-file-input"
                onChange={handleImportFile}
                aria-hidden="true"
                tabIndex={-1}
              />
              <button
                type="button"
                className={`icon-button ${settingsOpen ? 'is-active' : ''}`}
                aria-expanded={settingsOpen}
                aria-haspopup="menu"
                aria-controls={settingsMenuId}
                aria-label={settingsOpen ? '关闭设置菜单' : '打开设置：导入或导出来源配置'}
                title="设置"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Settings size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              {settingsOpen ? (
                <div
                  id={settingsMenuId}
                  className="settings-menu"
                  role="menu"
                  aria-label="来源配置"
                  aria-describedby={settingsHintId}
                  onKeyDown={handleSettingsMenuKeyDown}
                >
                  <div className="settings-menu__head">
                    <span className="settings-menu__eyebrow">来源</span>
                    <p id={settingsHintId} className="settings-menu__hint">
                      备份或恢复自定义来源与默认来源开关，文件为 JSON。
                    </p>
                  </div>
                  <button
                    ref={exportMenuItemRef}
                    type="button"
                    className="settings-menu__item"
                    role="menuitem"
                    onClick={() => {
                      void onExportSources?.()
                      setSettingsOpen(false)
                    }}
                  >
                    <span className="settings-menu__item-icon" aria-hidden="true">
                      <Download size={14} strokeWidth={2} />
                    </span>
                    <span className="settings-menu__item-label">导出为 JSON…</span>
                  </button>
                  <button
                    ref={importMenuItemRef}
                    type="button"
                    className="settings-menu__item"
                    role="menuitem"
                    onClick={() => {
                      setSettingsOpen(false)
                      triggerImport()
                    }}
                  >
                    <span className="settings-menu__item-icon" aria-hidden="true">
                      <Upload size={14} strokeWidth={2} />
                    </span>
                    <span className="settings-menu__item-label">从 JSON 导入…</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
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

