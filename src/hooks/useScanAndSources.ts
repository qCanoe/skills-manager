import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { type Dispatch, type SetStateAction, useCallback, useEffect, useRef, useState } from 'react'

import { normalizeSkills } from '../lib/skills'
import { loadStoredSources, persistSources } from '../lib/sources'
import { isTauriRuntime } from '../lib/tauri-env'
import type { RawSkillRecord, SkillRecord, SourceConfig } from '../types'

export function useScanAndSources(setSelectedSkillId: Dispatch<SetStateAction<string | undefined>>) {
  const [sources, setSources] = useState<SourceConfig[]>([])
  const sourcesRef = useRef(sources)
  const [skills, setSkills] = useState<SkillRecord[]>([])
  const [refreshSeq, setRefreshSeq] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [bootstrapped, setBootstrapped] = useState(false)
  const [statusLine, setStatusLine] = useState('准备来源...')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    sourcesRef.current = sources
  }, [sources])

  const refreshSkills = useCallback(
    async (
      currentSources: SourceConfig[],
      nextSelectedId?: string,
      quiet?: boolean,
    ): Promise<{ ok: true; count: number } | { ok: false }> => {
      if (!quiet) {
        setIsLoading(true)
        setErrorMessage(null)
        setStatusLine('扫描中...')
      }

      try {
        const rawSkills = await invoke<RawSkillRecord[]>('scan_skills', {
          sources: currentSources.filter((source) => source.enabled),
        })
        const normalized = normalizeSkills(rawSkills, currentSources)
        setSkills(normalized)
        setRefreshSeq((n) => n + 1)
        setSelectedSkillId((previous) => nextSelectedId ?? previous ?? normalized[0]?.id)
        setStatusLine(`已索引 ${normalized.length} 个 skills`)
        return { ok: true, count: normalized.length }
      } catch (error) {
        if (!quiet) {
          setErrorMessage(error instanceof Error ? error.message : String(error))
          setStatusLine('扫描失败。')
        }
        return { ok: false }
      } finally {
        if (!quiet) {
          setIsLoading(false)
        }
      }
    },
    [setSelectedSkillId],
  )

  useEffect(() => {
    const bootstrap = async () => {
      if (!isTauriRuntime()) {
        setStatusLine('浏览器预览模式。运行 `npm run tauri dev` 以启用桌面功能。')
        setSources([])
        setBootstrapped(true)
        setIsLoading(false)
        return
      }

      try {
        const defaultSources = await invoke<SourceConfig[]>('get_default_sources')
        const resolvedSources = loadStoredSources(defaultSources)
        setSources(resolvedSources)
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error))
      } finally {
        setBootstrapped(true)
      }
    }

    void bootstrap()
  }, [])

  useEffect(() => {
    if (!bootstrapped) return

    persistSources(sources)
    if (!isTauriRuntime()) return

    void refreshSkills(sources)
  }, [bootstrapped, refreshSkills, sources])

  useEffect(() => {
    if (!isTauriRuntime()) return

    const setupListener = async () => {
      const unlisten = await listen('refresh-requested', () => {
        void refreshSkills(sourcesRef.current)
      })
      return unlisten
    }

    let cleanup: (() => void) | undefined
    void setupListener().then((unlisten) => {
      cleanup = unlisten
    })

    return () => cleanup?.()
  }, [refreshSkills])

  useEffect(() => {
    if (!bootstrapped || !isTauriRuntime()) return

    let wasHidden = document.visibilityState === 'hidden'

    const onVisibility = () => {
      const hidden = document.visibilityState === 'hidden'
      if (wasHidden && !hidden) {
        void refreshSkills(sourcesRef.current, undefined, true)
      }
      wasHidden = hidden
    }

    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [bootstrapped, refreshSkills])

  return {
    sources,
    setSources,
    sourcesRef,
    skills,
    refreshSeq,
    setRefreshSeq,
    isLoading,
    bootstrapped,
    statusLine,
    setStatusLine,
    errorMessage,
    setErrorMessage,
    refreshSkills,
  }
}
