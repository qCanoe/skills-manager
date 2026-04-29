import { isTauriRuntime } from './tauri-env'

/** `browseMode === 'sources'` with `visibleSkills.length === 0`. */
export function sourcesBrowseEmptyCopy(input: {
  enabledSourceCount: number
  skillsTotal: number
  isLoading: boolean
}): { title: string; description: string } {
  if (input.enabledSourceCount === 0) {
    return {
      title: '请先启用来源',
      description: isTauriRuntime()
        ? '在上方面板展开来源列表，启用至少一个目录，或添加自定义路径。来源配置的导入与导出在右上角命令栏。'
        : '请在桌面应用中管理来源。',
    }
  }

  if (!input.isLoading && input.skillsTotal === 0 && input.enabledSourceCount > 0) {
    return {
      title: '未索引到 skill',
      description:
        '已在启用的目录中没有发现 SKILL.md。确认路径与文件后，点击上方刷新重新扫描。',
    }
  }

  return {
    title: '没有匹配的 skills',
    description: '尝试切换来源或「全部」、关闭「仅可写」或清空搜索；也可新建 skill。',
  }
}

export function recommendBrowseEmptyCopy(input: {
  busy: boolean
  apiConfigured: boolean
}): { title: string; description: string } {
  if (input.busy) {
    return { title: '推荐中', description: '正在匹配技能…' }
  }
  if (!input.apiConfigured) {
    return {
      title: '暂无推荐',
      description: '请先在侧栏完成模型 API 配置，再填写任务并点击「推荐」。',
    }
  }
  return {
    title: '暂无推荐',
    description: '在侧栏输入任务描述后点击「推荐」。',
  }
}

export function exploreBrowseEmptyCopy(input: {
  hasLoadError: boolean
  isSearching: boolean
}): { title: string; description: string } {
  const searchHint = input.isSearching ? '尝试清空搜索。' : ''
  if (input.hasLoadError) {
    return {
      title: '没有可用的探索条目',
      description: `最近一次加载遇到问题，请留意已弹出的提示。${searchHint || '可检查网络或分类后点击刷新重试。'}`,
    }
  }
  return {
    title: '没有匹配的 skills',
    description: `${searchHint ? `${searchHint} ` : ''}切换侧栏分类或仓库；远端不可达时请检查网络后点击刷新。`,
  }
}
