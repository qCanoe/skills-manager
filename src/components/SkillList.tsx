import { ChevronDown, Library } from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'

import type { SkillRecord } from '../types'

interface SkillListProps {
  skills: SkillRecord[]
  selectedSkillId?: string
  onSelectSkill: (skillId: string) => void
}

export function SkillList({ skills, selectedSkillId, onSelectSkill }: SkillListProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="tray-section">
      <div
        className="tray-section-header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCollapsed((v) => !v) } }}
      >
        <div className="tray-section-header__left">
          <Library size={14} style={{ color: 'var(--text-faint)' }} />
          <span className="tray-section-label">Skills</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tray-section-status">{skills.length} 条</span>
          <ChevronDown size={14} className={`tray-section-chevron ${collapsed ? 'is-collapsed' : ''}`} />
        </div>
      </div>

      {!collapsed ? (
        <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {skills.map((skill) => (
            <button
              key={skill.id}
              className={clsx('skill-row', selectedSkillId === skill.id && 'is-selected')}
              onClick={() => onSelectSkill(skill.id)}
              type="button"
            >
              <div className="skill-row__content">
                <div className="skill-row__name">{skill.name}</div>
                {skill.description ? (
                  <div className="skill-row__desc">{skill.description}</div>
                ) : null}
                <div className="skill-row__meta">
                  {skill.sourceLabel} · {skill.relativePath}
                </div>
              </div>
              {skill.writable ? <div className="badge-writable" title="可编辑" aria-label="可编辑" role="img" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

