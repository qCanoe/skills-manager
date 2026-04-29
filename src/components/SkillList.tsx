import { Library, GitMerge } from 'lucide-react'
import clsx from 'clsx'

import { filterPathEntriesBySourceSkillCount, pathEntriesForSkill } from '../lib/skills'
import type { SkillRecord } from '../types'

interface SkillListProps {
  skills: SkillRecord[]
  selectedSkillId?: string
  onSelectSkill: (skillId: string) => void
  skillCountBySourceId: Record<string, number>
  /** One-line reason from「推荐」模式（与列表样式一致）。 */
  recommendHintBySkillId?: Record<string, string>
}

export function SkillList({
  skills,
  selectedSkillId,
  onSelectSkill,
  skillCountBySourceId,
  recommendHintBySkillId,
}: SkillListProps) {
  return (
    <div className="tray-section">
      <div className="tray-section-header">
        <div className="tray-section-header__left">
          <Library size={14} style={{ color: 'var(--text-faint)' }} />
          <span className="tray-section-label">Skills</span>
        </div>
        <div className="tray-section-header__right">
          <span className="tray-section-status">{skills.length} 条</span>
        </div>
      </div>

      <div
        className="skill-list-region"
        role="region"
        aria-label={`Skills 列表，${skills.length} 条`}
      >
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
              {recommendHintBySkillId?.[skill.id] ? (
                <div
                  className="skill-row__recommend-hint"
                  title={recommendHintBySkillId[skill.id]}
                >
                  {recommendHintBySkillId[skill.id]}
                </div>
              ) : null}
              <div className="skill-row__meta">
                {(() => {
                  const paths = filterPathEntriesBySourceSkillCount(
                    pathEntriesForSkill(skill),
                    skillCountBySourceId,
                  )
                  if (paths.length > 1) {
                    return (
                      <span className="skill-row__meta-merged">
                        <GitMerge size={10} aria-hidden="true" />
                        {paths.length} 个路径
                      </span>
                    )
                  }
                  if (paths.length === 1) {
                    const p = paths[0]!
                    return (
                      <>
                        {p.sourceLabel} · {p.relativePath}
                      </>
                    )
                  }
                  return <>{skill.sourceLabel} · {skill.relativePath}</>
                })()}
              </div>
            </div>
            {skill.writable ? <span className="badge-writable" title="可编辑" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
    </div>
  )
}

