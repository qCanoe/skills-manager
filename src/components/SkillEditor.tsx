import { useId, useMemo, useRef, useState, type FormEvent } from 'react'

import { useModalDialog } from '../hooks/useModalDialog'
import { buildRelativeSkillPath, buildSkillTemplate } from '../lib/skills'
import { Select } from './Select'
import type { SkillRecord, SourceConfig } from '../types'

interface SkillEditorProps {
  mode: 'create' | 'edit'
  skill?: SkillRecord
  initialContent?: string
  writableSources: SourceConfig[]
  onCancel: () => void
  onSubmit: (payload: { source: SourceConfig; relativePath: string; rawContent: string; overwrite: boolean }) => void
}

export function SkillEditor({
  mode,
  skill,
  initialContent,
  writableSources,
  onCancel,
  onSubmit,
}: SkillEditorProps) {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  useModalDialog(panelRef, onCancel)

  const [selectedSourceId, setSelectedSourceId] = useState(skill?.sourceId ?? writableSources[0]?.id ?? '')
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [namespace, setNamespace] = useState(skill?.namespace ?? '')
  const [body, setBody] = useState('')
  const [rawContent, setRawContent] = useState(
    initialContent ?? buildSkillTemplate('new-skill', 'Describe this skill.', ''),
  )
  const [isManuallyEdited, setIsManuallyEdited] = useState(false)

  const selectedSource = useMemo(
    () => writableSources.find((source) => source.id === selectedSourceId) ?? writableSources[0],
    [selectedSourceId, writableSources],
  )

  const relativePath =
    mode === 'edit' && skill ? skill.relativePath : buildRelativeSkillPath(name || 'new-skill', namespace)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedSource) return

    onSubmit({
      source: selectedSource,
      relativePath,
      rawContent,
      overwrite: mode === 'edit',
    })
  }

  const updateDraftContent = (nextName: string, nextDescription: string, nextBody: string) => {
    if (mode !== 'create' || isManuallyEdited) return

    setRawContent(buildSkillTemplate(nextName || 'new-skill', nextDescription || 'Describe this skill.', nextBody))
  }

  return (
    <div className="modal-backdrop">
      <section ref={panelRef} className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="panel-heading">
          <span className="eyebrow">{mode === 'create' ? '新建 Skill' : '编辑 Skill'}</span>
          <h2 id={titleId}>{mode === 'create' ? '创建新技能包' : skill?.name}</h2>
        </div>

        <form className="editor-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="editor-source">目标来源</label>
            <Select
              id="editor-source"
              value={selectedSourceId}
              disabled={mode === 'edit'}
              options={writableSources.map((source) => ({ value: source.id, label: source.label }))}
              onChange={setSelectedSourceId}
            />
          </div>

          {mode === 'create' ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="editor-name">名称</label>
                <input
                  id="editor-name"
                  className="field-input"
                  value={name}
                  onChange={(event) => {
                    const nextName = event.target.value
                    setName(nextName)
                    updateDraftContent(nextName, description, body)
                  }}
                  placeholder="my-skill"
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="editor-description">描述</label>
                <textarea
                  id="editor-description"
                  className="field-textarea"
                  rows={2}
                  value={description}
                  onChange={(event) => {
                    const nextDescription = event.target.value
                    setDescription(nextDescription)
                    updateDraftContent(name, nextDescription, body)
                  }}
                  placeholder="这个 skill 的用途和使用时机"
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="editor-namespace">命名空间（可选）</label>
                <input
                  id="editor-namespace"
                  className="field-input"
                  value={namespace}
                  onChange={(event) => setNamespace(event.target.value)}
                  placeholder=".system/tools"
                />
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="editor-body">正文</label>
                <textarea
                  id="editor-body"
                  className="field-textarea"
                  rows={6}
                  value={body}
                  onChange={(event) => {
                    const nextBody = event.target.value
                    setBody(nextBody)
                    updateDraftContent(name, description, nextBody)
                  }}
                  placeholder="## 指南&#10;说明 agent 应如何使用此 skill。"
                />
              </div>
            </>
          ) : null}

          <div className="field-group">
            <label className="field-label" htmlFor="editor-relative-path">相对路径</label>
            <input id="editor-relative-path" className="field-input" disabled value={relativePath} />
          </div>

          <div className="field-group">
            <div className="field-label-row">
              <label className="field-label" htmlFor="editor-raw">SKILL.md 内容</label>
              {isManuallyEdited ? (
                <span className="field-label-badge">手动编辑模式</span>
              ) : null}
            </div>
            <textarea
              id="editor-raw"
              className="field-textarea editor-form__raw"
              rows={14}
              value={rawContent}
              onChange={(event) => {
                setIsManuallyEdited(true)
                setRawContent(event.target.value)
              }}
            />
          </div>

          <div className="modal-actions">
            <button className="ghost-button" onClick={onCancel} type="button">
              取消
            </button>
            <button className="accent-button" type="submit">
              {mode === 'create' ? '创建 Skill' : '保存修改'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
