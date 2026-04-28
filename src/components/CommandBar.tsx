import { Download, Filter, Plus, RefreshCw, Search, Settings, Upload, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'

import { loadAiRecommendSettings, persistAiRecommendSettings, type AiRecommendSettings } from '../lib/ai-settings'

interface CommandBarProps {
  searchValue: string
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsMenuId = useId()
  const settingsHintId = useId()
  const apiFieldsHintId = useId()
  const sourcesIoAvailable = Boolean(
    desktopFeatures && onExportSources && onImportSourcesText,
  )
  const showSettingsMenu = desktopFeatures
  const [aiSettings, setAiSettings] = useState<AiRecommendSettings>(loadAiRecommendSettings)

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
    setAiSettings(loadAiRecommendSettings())
  }, [settingsOpen])

  const triggerImport = () => importInputRef.current?.click()

  const patchAiSettings = (patch: Partial<AiRecommendSettings>) => {
    const next = { ...aiSettings, ...patch }
    setAiSettings(next)
    persistAiRecommendSettings(patch)
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
          <span className="tray-titlebar__title">All Skills</span>
        </div>

        <div className="tray-titlebar__actions">
          <button
            className={`icon-button ${writableOnly ? 'is-active' : ''}`}
            onClick={onToggleWritable}
            data-tooltip={writableOnly ? '显示全部' : '仅显示可编辑'}
            data-tooltip-dir="down"
            type="button"
          >
            <Filter size={14} />
          </button>

          <button
            className={`icon-button ${refreshBusy ? 'is-active' : ''}`}
            onClick={() => void handleRefreshClick()}
            data-tooltip="重新扫描"
            data-tooltip-dir="down"
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

          <button className="icon-button" onClick={onCreate} data-tooltip="新建" data-tooltip-dir="down" type="button">
            <Plus size={16} />
          </button>

          {showSettingsMenu ? (
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
                aria-controls={settingsMenuId}
                aria-label={settingsOpen ? '关闭设置' : '打开设置'}
                data-tooltip="设置"
                data-tooltip-dir="down"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Settings size={14} strokeWidth={2} aria-hidden="true" />
              </button>
              {settingsOpen ? (
                <div
                  id={settingsMenuId}
                  className="settings-menu settings-menu--wide"
                  role="region"
                  aria-label="设置"
                  aria-describedby={settingsHintId}
                >
                  {sourcesIoAvailable ? (
                    <>
                      <div className="settings-menu__head">
                        <span className="settings-menu__eyebrow">来源</span>
                        <p id={settingsHintId} className="settings-menu__hint">
                          一键导出/导入来源目录
                        </p>
                      </div>
                      <button
                        type="button"
                        className="settings-menu__item"
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
                        type="button"
                        className="settings-menu__item"
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
                    </>
                  ) : (
                    <p id={settingsHintId} className="settings-menu__hint settings-menu__hint--solo">
                      来源导入/导出仅在完整桌面环境中可用。
                    </p>
                  )}

                  <div
                    className={`settings-menu__fields${sourcesIoAvailable ? ' settings-menu__fields--divider' : ''}`}
                    role="group"
                    aria-describedby={apiFieldsHintId}
                  >
                    <p id={apiFieldsHintId} className="settings-menu__hint settings-menu__hint--api">
                      推荐功能API设置（仅本地可见）
                    </p>
                    <label className="settings-menu__field-label" htmlFor={`${settingsMenuId}-api-base`}>
                      API Base
                    </label>
                    <input
                      id={`${settingsMenuId}-api-base`}
                      className="field-input settings-menu__field-control"
                      value={aiSettings.apiBase}
                      onChange={(e) => patchAiSettings({ apiBase: e.target.value })}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <label className="settings-menu__field-label" htmlFor={`${settingsMenuId}-api-key`}>
                      API Key
                    </label>
                    <input
                      id={`${settingsMenuId}-api-key`}
                      className="field-input settings-menu__field-control"
                      type="password"
                      value={aiSettings.apiKey}
                      onChange={(e) => patchAiSettings({ apiKey: e.target.value })}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <label className="settings-menu__field-label" htmlFor={`${settingsMenuId}-model`}>
                      模型
                    </label>
                    <input
                      id={`${settingsMenuId}-model`}
                      className="field-input settings-menu__field-control"
                      value={aiSettings.model}
                      onChange={(e) => patchAiSettings({ model: e.target.value })}
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
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

