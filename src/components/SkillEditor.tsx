import { useEffect, useMemo, useState, type FormEvent } from 'react'

import { buildRelativeSkillPath, buildSkillTemplate } from '../lib/skills'
import type { SkillRecord, SourceConfig } from '../types'

interface SkillEditorProps {
  mode: 'create' | 'edit'
  skill?: SkillRecord
  writableSources: SourceConfig[]
  onCancel: () => void
  onSubmit: (payload: { source: SourceConfig; relativePath: string; rawContent: string; overwrite: boolean }) => void
}

export function SkillEditor({
  mode,
  skill,
  writableSources,
  onCancel,
  onSubmit,
}: SkillEditorProps) {
  const [selectedSourceId, setSelectedSourceId] = useState(skill?.sourceId ?? writableSources[0]?.id ?? '')
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [namespace, setNamespace] = useState(skill?.namespace ?? '')
  const [body, setBody] = useState('')
  const [rawContent, setRawContent] = useState(skill?.rawContent ?? '')
  const [isManuallyEdited, setIsManuallyEdited] = useState(false)

  useEffect(() => {
    if (mode === 'create' && !isManuallyEdited) {
      setRawContent(buildSkillTemplate(name || 'new-skill', description || 'Describe this skill.', body))
    }
  }, [body, description, isManuallyEdited, mode, name])

  useEffect(() => {
    if (mode === 'edit' && skill) {
      setRawContent(skill.rawContent)
    }
  }, [mode, skill])

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

  return (
    <div className="modal-backdrop">
      <section className="modal-panel">
        <div className="panel-heading">
          <span className="eyebrow">{mode === 'create' ? '新建 Skill' : '编辑 Skill'}</span>
          <h2>{mode === 'create' ? '创建新技能包' : skill?.name}</h2>
        </div>

        <form className="editor-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="editor-source">目标来源</label>
            <select
              id="editor-source"
              className="field-select"
              disabled={mode === 'edit'}
              value={selectedSourceId}
              onChange={(event) => setSelectedSourceId(event.target.value)}
            >
              {writableSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </div>

          {mode === 'create' ? (
            <>
              <div className="field-group">
                <label className="field-label" htmlFor="editor-name">名称</label>
                <input
                  id="editor-name"
                  className="field-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
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
                  onChange={(event) => setDescription(event.target.value)}
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
                  onChange={(event) => setBody(event.target.value)}
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
