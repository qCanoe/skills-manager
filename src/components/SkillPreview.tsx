import { CopyPlus, FilePenLine, FilePlus, FolderOpen, SquareArrowOutUpRight } from 'lucide-react'

import type { SkillRecord } from '../types'

interface SkillPreviewProps {
  skill?: SkillRecord
  onOpenSkill: (path: string) => void
  onOpenFolder: (path: string) => void
  onEdit: (skill: SkillRecord) => void
  onSync: (skill: SkillRecord) => void
  onCreate: () => void
}

export function SkillPreview({
  skill,
  onOpenSkill,
  onOpenFolder,
  onEdit,
  onSync,
  onCreate,
}: SkillPreviewProps) {
  if (!skill) return null

  return (
    <div className="tray-section">
      <div className="skill-drawer">
        <div className="skill-drawer__header">
          <h3 className="skill-drawer__name">{skill.name}</h3>
          {skill.description ? (
            <p className="skill-drawer__desc">{skill.description}</p>
          ) : null}
        </div>

        <div className="skill-drawer__actions">
          <button
            className="ghost-button"
            onClick={() => onOpenFolder(skill.skillDir)}
            type="button"
          >
            <FolderOpen size={12} />
            打开文件夹
          </button>

          <button
            className="ghost-button"
            onClick={() => onOpenSkill(skill.skillFile)}
            type="button"
          >
            <SquareArrowOutUpRight size={12} />
            SKILL.md
          </button>

          {skill.writable ? (
            <button className="ghost-button" onClick={() => onEdit(skill)} type="button">
              <FilePenLine size={12} />
              编辑
            </button>
          ) : null}

          <button className="ghost-button" onClick={onCreate} type="button">
            <FilePlus size={12} />
            基于此新建
          </button>

          <button className="accent-button" onClick={() => onSync(skill)} type="button">
            <CopyPlus size={12} />
            同步
          </button>
        </div>

        <div className="skill-drawer__meta">
          <div className="skill-drawer__meta-item">
            <span className="skill-drawer__meta-label">路径</span>
            <span className="skill-drawer__meta-value">{skill.relativePath}</span>
          </div>
          <div className="skill-drawer__meta-item">
            <span className="skill-drawer__meta-label">命名空间</span>
            <span className="skill-drawer__meta-value">{skill.namespace ?? '顶层'}</span>
          </div>
          <div className="skill-drawer__meta-item">
            <span className="skill-drawer__meta-label">权限</span>
            <span className="skill-drawer__meta-value">{skill.writable ? '可编辑' : '只读'}</span>
          </div>
          <div className="skill-drawer__meta-item">
            <span className="skill-drawer__meta-label">附件</span>
            <span className="skill-drawer__meta-value">
              {skill.extras.length > 0 ? skill.extras.join(', ') : '无'}
            </span>
          </div>
        </div>

        <div className="skill-drawer__preview">
          <pre>{skill.rawContent}</pre>
        </div>
      </div>
    </div>
  )
}
