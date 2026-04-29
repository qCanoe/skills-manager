import { ExploreSkillList } from './ExploreSkillList'
import { EmptyState } from './EmptyState'
import { SkillList } from './SkillList'
import {
  exploreBrowseEmptyCopy,
  recommendBrowseEmptyCopy,
  sourcesBrowseEmptyCopy,
} from '../lib/browse-empty-copy'
import { isAiRecommendConfigured, loadAiRecommendSettings } from '../lib/ai-settings'
import type { BrowseMode, SkillRecord } from '../types'

interface TraySkillsPaneProps {
  browseMode: BrowseMode
  visibleSkills: SkillRecord[]
  isExploreLoading: boolean
  exploreLoadError: string | null
  searchValue: string
  enabledSourceCount: number
  skillsTotal: number
  isIndexing: boolean
  effectiveSelectedSkillId?: string
  onSelectSkill: (skillId: string) => void
  skillCountBySourceId: Record<string, number>
  recommendHintBySkillId?: Record<string, string>
  activeCollectionId: string
  recommendBusy: boolean
  onCreateSkill: () => void
}

export function TraySkillsPane({
  browseMode,
  visibleSkills,
  isExploreLoading,
  exploreLoadError,
  searchValue,
  enabledSourceCount,
  skillsTotal,
  isIndexing,
  effectiveSelectedSkillId,
  onSelectSkill,
  skillCountBySourceId,
  recommendHintBySkillId,
  activeCollectionId,
  recommendBusy,
  onCreateSkill,
}: TraySkillsPaneProps) {
  const trimmedSearch = searchValue.trim()

  if (browseMode === 'explore') {
    if (isExploreLoading && visibleSkills.length === 0) {
      return (
        <div className="tray-section">
          <EmptyState eyebrow={null} title="正在加载探索仓库" />
        </div>
      )
    }
    if (visibleSkills.length > 0) {
      return (
        <div className="tray-section">
          <ExploreSkillList
            skills={visibleSkills}
            selectedSkillId={effectiveSelectedSkillId}
            onSelectSkill={onSelectSkill}
            isSearching={trimmedSearch !== ''}
          />
        </div>
      )
    }
    const exploreCopy = exploreBrowseEmptyCopy({
      hasLoadError: Boolean(exploreLoadError),
      isSearching: trimmedSearch !== '',
    })
    return (
      <div className="tray-section">
        <EmptyState title={exploreCopy.title} description={exploreCopy.description} />
      </div>
    )
  }

  if (visibleSkills.length > 0) {
    return (
      <SkillList
        skills={visibleSkills}
        selectedSkillId={effectiveSelectedSkillId}
        onSelectSkill={onSelectSkill}
        skillCountBySourceId={skillCountBySourceId}
        recommendHintBySkillId={browseMode === 'recommend' ? recommendHintBySkillId : undefined}
      />
    )
  }

  if (browseMode === 'collections' && !activeCollectionId) {
    return (
      <div className="tray-section">
        <EmptyState
          className="empty-state--folder"
          eyebrow={null}
          title="请选择文件夹"
          description="在上方选择或新建；来源模式可勾选加入。"
          actionLabel="新建 skill"
          onAction={onCreateSkill}
        />
      </div>
    )
  }

  if (browseMode === 'collections' && activeCollectionId) {
    return (
      <div className="tray-section">
        <EmptyState
          className="empty-state--folder"
          title="该文件夹暂无 skill"
          description="在预览勾选加入，或切至来源浏览全部。"
          actionLabel="新建 skill"
          onAction={onCreateSkill}
        />
      </div>
    )
  }

  const apiConfigured = isAiRecommendConfigured(loadAiRecommendSettings())

  if (browseMode === 'recommend') {
    const rec = recommendBrowseEmptyCopy({ busy: recommendBusy, apiConfigured })
    return (
      <div className="tray-section">
        <EmptyState
          className="empty-state--recommend"
          eyebrow={null}
          title={rec.title}
          description={rec.description}
        />
      </div>
    )
  }

  const src = sourcesBrowseEmptyCopy({
    enabledSourceCount,
    skillsTotal,
    isLoading: isIndexing,
  })

  return (
    <div className="tray-section">
      <EmptyState title={src.title} description={src.description} actionLabel="新建 skill" onAction={onCreateSkill} />
    </div>
  )
}
