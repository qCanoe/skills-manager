import { invoke } from '@tauri-apps/api/core'
import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'

import type { RecommendRunPayload } from '../components/RecommendPanel'
import { loadAiRecommendSettings, isAiRecommendConfigured } from '../lib/ai-settings'
import {
  RECOMMEND_NO_SCOPE_ID,
  buildRecommendCandidatePayload,
  buildRecommendScanScope,
  mergeAiRecommendations,
  mergeSourcesForRecommend,
  rankRecommendCandidates,
  type AiRerankResponse,
} from '../lib/recommend'
import { normalizeSkills } from '../lib/skills'
import { isTauriRuntime } from '../lib/tauri-env'
import type { RawSkillRecord, SkillRecord, SkillRecommendationMeta, SourceConfig } from '../types'

interface UseRecommendFlowOptions {
  sources: SourceConfig[]
  pushToast: (title: string, detail?: string, variant?: 'success' | 'error') => void
  setStatusLine: (value: string) => void
  setErrorMessage: Dispatch<SetStateAction<string | null>>
  setSelectedSkillId: Dispatch<SetStateAction<string | undefined>>
}

export function useRecommendFlow({
  sources,
  pushToast,
  setStatusLine,
  setErrorMessage,
  setSelectedSkillId,
}: UseRecommendFlowOptions) {
  const [recommendList, setRecommendList] = useState<SkillRecord[]>([])
  const [recommendMetaById, setRecommendMetaById] = useState<Record<string, SkillRecommendationMeta>>({})
  const [recommendBusy, setRecommendBusy] = useState(false)
  const [recommendPanelError, setRecommendPanelError] = useState<string | null>(null)

  const resetRecommendResults = useCallback(() => {
    setRecommendList([])
    setRecommendMetaById({})
  }, [])

  const runRecommend = useCallback(
    async (payload: RecommendRunPayload) => {
      if (payload.scopeId === RECOMMEND_NO_SCOPE_ID) {
        setRecommendPanelError('暂无可扫描的范围。')
        return
      }
      if (!isTauriRuntime()) {
        const msg = '请在桌面应用中打开后再使用推荐。'
        setRecommendPanelError(msg)
        pushToast('推荐', '请在桌面端使用推荐。', 'error')
        return
      }
      setRecommendBusy(true)
      setErrorMessage(null)
      setRecommendPanelError(null)
      const aiSettings = loadAiRecommendSettings()
      if (!isAiRecommendConfigured(aiSettings)) {
        const msg = '请先在右上角设置中填写 API Base、API Key 与模型。'
        setRecommendPanelError(msg)
        pushToast('尚未配置 API', '请在设置中填写 API Base、API Key 与模型后再使用推荐。', 'error')
        setStatusLine('推荐需先配置模型 API。')
        setRecommendBusy(false)
        return
      }
      setStatusLine('正在扫描技能…')
      try {
        const scanScope = buildRecommendScanScope(sources, payload.scopeId)
        const raw = await invoke<RawSkillRecord[]>('scan_recommend_inventory', {
          request: {
            sources: scanScope.sources,
            workspaceRoot: null,
          },
        })
        const mergedSources = mergeSourcesForRecommend(scanScope.sources)
        const normalized = normalizeSkills(raw, mergedSources)
        setStatusLine(`候选 ${normalized.length} 个，匹配中…`)

        const projectContext = ''
        const candidates = rankRecommendCandidates(normalized, payload.prompt, projectContext, 30)

        setStatusLine('模型排序中…')
        let aiResponse: AiRerankResponse
        try {
          aiResponse = await invoke<AiRerankResponse>('recommend_ai_rerank', {
            request: {
              apiBase: aiSettings.apiBase.trim(),
              apiKey: aiSettings.apiKey.trim(),
              model: aiSettings.model.trim(),
              userPrompt: payload.prompt,
              projectContext,
              candidatesJson: JSON.stringify(buildRecommendCandidatePayload(candidates)),
            },
          })
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err)
          setRecommendPanelError(detail)
          pushToast('模型 API 调用失败', detail, 'error')
          setStatusLine('推荐失败。')
          return
        }

        const { ordered, metaBySkillId } = mergeAiRecommendations(candidates, aiResponse)
        setRecommendList(ordered)
        setRecommendMetaById(metaBySkillId)
        setSelectedSkillId(ordered[0]?.id)
        setRecommendPanelError(null)
        setStatusLine(`推荐完成 · ${ordered.length} 个`)
        pushToast('推荐完成', `已选出 ${ordered.length} 个`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setErrorMessage(msg)
        setRecommendPanelError(msg)
        setStatusLine('推荐失败。')
        pushToast('推荐失败', msg, 'error')
      } finally {
        setRecommendBusy(false)
      }
    },
    [pushToast, setErrorMessage, setSelectedSkillId, setStatusLine, sources],
  )

  return {
    recommendList,
    recommendMetaById,
    recommendBusy,
    recommendPanelError,
    setRecommendPanelError,
    runRecommend,
    resetRecommendResults,
  }
}
