import { LoaderCircle, Sparkles, X } from 'lucide-react'
import { useId, useMemo, useState, type FormEvent } from 'react'

import { isAiRecommendConfigured, loadAiRecommendSettings } from '../lib/ai-settings'
import { RECOMMEND_ALL_SCOPE_ID, RECOMMEND_PLUGIN_SCOPE_ID } from '../lib/recommend'
import type { SourceConfig } from '../types'
import { Select, type SelectOption } from './Select'

export interface RecommendRunPayload {
  prompt: string
  scopeId: string
}

interface RecommendPanelProps {
  sources: SourceConfig[]
  busy: boolean
  onRecommend: (payload: RecommendRunPayload) => void | Promise<void>
  /** 最近一次推荐流程失败说明（与顶部横幅可同时存在，便于在表单旁对照）。 */
  lastError?: string | null
  onDismissError?: () => void
}

export function RecommendPanel({
  sources,
  busy,
  onRecommend,
  lastError,
  onDismissError,
}: RecommendPanelProps) {
  const formId = useId()
  const [prompt, setPrompt] = useState('')
  const [scopeId, setScopeId] = useState(RECOMMEND_ALL_SCOPE_ID)
  const enabledSources = useMemo(() => sources.filter((source) => source.enabled), [sources])
  const scopeOptions = useMemo<SelectOption[]>(
    () => [
      { value: RECOMMEND_ALL_SCOPE_ID, label: '全部' },
      ...enabledSources.map((source) => ({ value: source.id, label: source.label })),
      { value: RECOMMEND_PLUGIN_SCOPE_ID, label: '插件缓存' },
    ],
    [enabledSources],
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!prompt.trim() || busy || !isAiRecommendConfigured(loadAiRecommendSettings())) return
    void onRecommend({
      prompt: prompt.trim(),
      scopeId,
    })
  }

  const ai = loadAiRecommendSettings()
  const apiReady = isAiRecommendConfigured(ai)
  const apiHintId = `${formId}-api-hint`
  const describedBy = !apiReady ? apiHintId : undefined

  return (
    <div className="recommend-panel" role="region" aria-label="按任务推荐 skills">
      <form
        id={formId}
        className="recommend-panel__form"
        onSubmit={handleSubmit}
        aria-busy={busy}
        data-busy={busy ? 'true' : 'false'}
        aria-describedby={describedBy}
      >
        {lastError ? (
          <div className="recommend-panel__error" role="alert">
            <span className="recommend-panel__error-text">{lastError}</span>
            {onDismissError ? (
              <button
                type="button"
                className="recommend-panel__error-dismiss icon-button"
                aria-label="关闭本条错误说明"
                onClick={onDismissError}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="recommend-panel__main">
          <label className="field-label recommend-panel__field" htmlFor={`${formId}-prompt`}>
            <span>任务</span>
            <textarea
              id={`${formId}-prompt`}
              className="field-textarea recommend-panel__prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="输入任务描述"
              rows={2}
              spellCheck={false}
              disabled={busy}
              aria-required="true"
            />
          </label>

          <label className="field-label recommend-panel__filter" htmlFor={`${formId}-scope`}>
            <span>范围</span>
            <Select
              id={`${formId}-scope`}
              value={scopeId}
              options={scopeOptions}
              onChange={setScopeId}
              disabled={busy}
              menuAriaLabel="选择推荐范围"
            />
          </label>
        </div>

        {!apiReady ? (
          <p id={apiHintId} className="recommend-panel__api-hint" role="status">
            请先在设置中配置 API。
          </p>
        ) : null}

        <div className="recommend-panel__actions">
          <button
            type="submit"
            className="accent-button recommend-panel__submit"
            disabled={busy || !prompt.trim() || !apiReady}
            aria-label={
              busy
                ? '正在推荐，请稍候'
                : !apiReady
                  ? '请先完成模型 API 配置'
                  : !prompt.trim()
                    ? '请先填写任务描述'
                    : '根据当前任务生成推荐列表'
            }
          >
            {busy ? (
              <>
                <LoaderCircle size={14} className="spin" aria-hidden="true" />
                推荐中…
              </>
            ) : (
              <>
                <Sparkles size={14} aria-hidden="true" />
                推荐
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
