import clsx from 'clsx'
import { useMemo } from 'react'

import type { SkillRecord } from '../types'

interface ExploreSkillListProps {
  skills: SkillRecord[]
  selectedSkillId?: string
  onSelectSkill: (id: string) => void
  /** True when the search bar has an active query — flat list + category pill. */
  isSearching: boolean
}

export function ExploreSkillList({
  skills,
  selectedSkillId,
  onSelectSkill,
  isSearching,
}: ExploreSkillListProps) {
  const grouped = useMemo(() => {
    if (isSearching || skills.length === 0) return null
    const map = new Map<string, SkillRecord[]>()
    for (const skill of skills) {
      const cat = skill.exploreCategory ?? 'other'
      const existing = map.get(cat) ?? []
      existing.push(skill)
      map.set(cat, existing)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [skills, isSearching])

  return (
    <div className="tray-section">
      <div
        className="explore-skill-list-region"
        role="region"
        aria-label={`Skills 探索列表，${skills.length} 条`}
      >
        {skills.length === 0 ? null : !grouped ? (
          <div className="explore-skill-list" role="list">
            {skills.map((skill) => (
              <ExploreSkillRow
                key={skill.id}
                skill={skill}
                selected={selectedSkillId === skill.id}
                onSelect={onSelectSkill}
                showCategory
              />
            ))}
          </div>
        ) : (
          <div className="explore-skill-groups">
            {grouped.map(([category, catSkills]) => (
              <div key={category} className="explore-skill-group">
                <div
                  className="explore-skill-group__header"
                  aria-label={`${category} 分类，共 ${catSkills.length} 条`}
                >
                  <span className="explore-skill-group__name">{category}</span>
                  <span className="explore-skill-group__count">{catSkills.length}</span>
                </div>
                <div className="explore-skill-group__items" role="list">
                  {catSkills.map((skill) => (
                    <ExploreSkillRow
                      key={skill.id}
                      skill={skill}
                      selected={selectedSkillId === skill.id}
                      onSelect={onSelectSkill}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

interface ExploreSkillRowProps {
  skill: SkillRecord
  selected: boolean
  onSelect: (id: string) => void
  showCategory?: boolean
}

function ExploreSkillRow({ skill, selected, onSelect, showCategory }: ExploreSkillRowProps) {
  const descriptionLoaded = Boolean(skill.description || skill.previewBody)

  return (
    <button
      role="listitem"
      type="button"
      className={clsx('explore-skill-row', selected && 'is-selected')}
      onClick={() => onSelect(skill.id)}
      aria-pressed={selected}
    >
      <div className="explore-skill-row__content">
        <div className="explore-skill-row__top">
          <span className="explore-skill-row__name">{skill.name}</span>
          {showCategory && skill.exploreCategory ? (
            <span className="explore-skill-row__cat" aria-label={`分类：${skill.exploreCategory}`}>
              {skill.exploreCategory}
            </span>
          ) : null}
        </div>
        {descriptionLoaded ? (
          skill.description ? (
            <div className="explore-skill-row__desc">{skill.description}</div>
          ) : null
        ) : (
          <div className="explore-skill-row__skeleton" aria-hidden="true" />
        )}
      </div>
    </button>
  )
}
