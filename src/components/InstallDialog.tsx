import { invoke } from '@tauri-apps/api/core'
import { useId, useRef, useState } from 'react'

import { useModalDialog } from '../hooks/useModalDialog'
import { Select } from './Select'
import type { ExploreEntry, SourceConfig } from '../types'

interface InstallDialogProps {
  entry: ExploreEntry
  rawContent: string
  writableSources: SourceConfig[]
  onSuccess: (sourceLabel: string) => void
  onClose: () => void
}

export function InstallDialog({
  entry,
  rawContent,
  writableSources,
  onSuccess,
  onClose,
}: InstallDialogProps) {
  const [sourceId, setSourceId] = useState(writableSources[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmOverwrite, setConfirmOverwrite] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLElement | null>(null)
  const targetSource = writableSources.find((s) => s.id === sourceId)

  useModalDialog(panelRef, onClose)

  const doInstall = async (overwrite: boolean) => {
    if (!targetSource) return
    setBusy(true)
    setErrorMessage(null)
    try {
      await invoke('save_skill', {
        request: {
          source: targetSource,
          relativePath: `${entry.skillDir}/SKILL.md`,
          rawContent,
          overwrite,
        },
      })
      onSuccess(targetSource.label)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('已存在')) {
        setConfirmOverwrite(true)
      } else {
        setErrorMessage(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const sourceOptions = writableSources.map((s) => ({ value: s.id, label: s.label }))

  if (writableSources.length === 0) {
    return (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <section
          className="modal-panel modal-panel--compact"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="panel-heading">
            <h2 id={titleId}>安装 Skill</h2>
          </div>
          <p className="confirm-dialog__desc">无可用的可写来源，请先在来源面板中添加可写来源。</p>
          <div className="modal-actions modal-actions--compact">
            <button className="ghost-button" type="button" onClick={onClose}>
              关闭
            </button>
          </div>
        </section>
      </div>
    )
  }

  if (confirmOverwrite) {
    return (
      <div
        className="modal-backdrop"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <section
          ref={panelRef}
          className="modal-panel modal-panel--compact"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descId}
        >
          <div className="panel-heading">
            <h2 id={titleId}>覆盖确认</h2>
          </div>
          <p id={descId} className="confirm-dialog__desc">
            「{entry.name}」在该来源中已存在，是否覆盖？
          </p>
          <div className="modal-actions modal-actions--compact">
            <button className="ghost-button" type="button" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button
              className="accent-button"
              type="button"
              onClick={() => void doInstall(true)}
              disabled={busy}
            >
              {busy ? '安装中…' : '覆盖'}
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <section
        ref={panelRef}
        className="modal-panel modal-panel--compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="panel-heading">
          <h2 id={titleId}>安装「{entry.name}」</h2>
        </div>
        {errorMessage ? (
          <p className="confirm-dialog__desc" role="alert">
            {errorMessage}
          </p>
        ) : null}
        <div className="field-group">
          <label className="field-label" htmlFor="install-target-source">
            目标来源
          </label>
          <Select
            id="install-target-source"
            value={sourceId}
            options={sourceOptions}
            onChange={setSourceId}
            aria-label="选择目标来源"
          />
        </div>
        <div className="modal-actions modal-actions--compact">
          <button className="ghost-button" type="button" onClick={onClose} disabled={busy}>
            取消
          </button>
          <button
            className="accent-button"
            type="button"
            onClick={() => void doInstall(false)}
            disabled={busy || !targetSource}
          >
            {busy ? '安装中…' : '安装'}
          </button>
        </div>
      </section>
    </div>
  )
}
