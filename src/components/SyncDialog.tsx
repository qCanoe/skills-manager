import { useMemo, useState } from 'react'

import type { SkillRecord, SourceConfig, SyncConflictStrategy } from '../types'

interface SyncDialogProps {
  skill: SkillRecord
  sources: SourceConfig[]
  onCancel: () => void
  onConfirm: (targetSource: SourceConfig, conflictStrategy: SyncConflictStrategy) => void
}

export function SyncDialog({ skill, sources, onCancel, onConfirm }: SyncDialogProps) {
  const targets = useMemo(
    () => sources.filter((source) => source.writable && source.id !== skill.sourceId),
    [skill.sourceId, sources],
  )
  const [targetSourceId, setTargetSourceId] = useState(targets[0]?.id ?? '')
  const [conflictStrategy, setConflictStrategy] = useState<SyncConflictStrategy>('rename')

  const selectedTarget = targets.find((source) => source.id === targetSourceId)

  return (
    <div className="modal-backdrop">
      <section className="modal-panel modal-panel--compact">
        <div className="panel-heading">
          <span className="eyebrow">同步 Skill</span>
          <h2>{skill.name}</h2>
        </div>

        {targets.length === 0 ? (
          <p className="sync-dialog__empty">
            暂无可用的可写目标来源，请先添加一个可编辑文件夹。
          </p>
        ) : (
          <div className="sync-dialog">
            <div className="field-group">
              <span className="field-label">目标来源</span>
              <select
                className="field-select"
                value={targetSourceId}
                onChange={(event) => setTargetSourceId(event.target.value)}
              >
                {targets.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <span className="field-label">冲突策略</span>
              <select
                className="field-select"
                value={conflictStrategy}
                onChange={(event) => setConflictStrategy(event.target.value as SyncConflictStrategy)}
              >
                <option value="rename">重命名副本</option>
                <option value="overwrite">覆盖目标</option>
                <option value="skip">跳过已存在</option>
              </select>
            </div>
          </div>
        )}

        <div className="modal-actions modal-actions--compact">
          <button className="ghost-button" onClick={onCancel} type="button">
            取消
          </button>
          <button
            className="accent-button"
            disabled={!selectedTarget}
            onClick={() => selectedTarget && onConfirm(selectedTarget, conflictStrategy)}
            type="button"
          >
            同步
          </button>
        </div>
      </section>
    </div>
  )
}
