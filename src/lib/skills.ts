import type { RawSkillRecord, SkillRecord, SourceConfig } from '../types'

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

/** Matches YAML `|` / `>` block scalar headers (e.g. `|`, `|-`, `>`, `|2`). */
function isYamlBlockScalarIndicator(value: string) {
  return /^[|>](?:[-+]|[1-9]\d*)?$/.test(value)
}

function dedentYamlBlock(lines: string[]): string {
  const trimmed = lines.map((line) => line.replace(/\s+$/, ''))
  const meaningful = trimmed.filter((line) => line.length > 0)
  if (meaningful.length === 0) return ''

  const minIndent = Math.min(
    ...meaningful.map((line) => {
      const leading = /^(\s*)/.exec(line)
      return leading ? leading[1].length : 0
    }),
  )

  return trimmed.map((line) => (line.length === 0 ? line : line.slice(minIndent))).join('\n').trim()
}

function parseYamlFlatStringMap(frontmatter: string): Record<string, string> {
  const lines = frontmatter.replace(/\r/g, '').split('\n')
  const data: Record<string, string> = {}
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) {
      i += 1
      continue
    }

    const key = line.slice(0, colonIdx).trim()
    if (!key || key.startsWith('#')) {
      i += 1
      continue
    }

    let value = line.slice(colonIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (isYamlBlockScalarIndicator(value)) {
      const folded = value.startsWith('>')
      i += 1
      const blockLines: string[] = []
      while (i < lines.length) {
        const blockLine = lines[i]
        if (blockLine.length > 0 && !/^\s/.test(blockLine)) break
        blockLines.push(blockLine)
        i += 1
      }
      const rawBlock = dedentYamlBlock(blockLines)
      data[key] = folded ? rawBlock.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim() : rawBlock
      continue
    }

    data[key] = value
    i += 1
  }

  return data
}

function parseFrontmatter(rawContent: string) {
  const normalized = rawContent.replace(/\r/g, '')
  if (!normalized.startsWith('---\n')) {
    return {
      data: {} as Record<string, string>,
      content: normalized,
    }
  }

  const closingIndex = normalized.indexOf('\n---\n', 4)
  if (closingIndex === -1) {
    return {
      data: {} as Record<string, string>,
      content: normalized,
    }
  }

  const frontmatter = normalized.slice(4, closingIndex)
  const content = normalized.slice(closingIndex + 5)
  const data = parseYamlFlatStringMap(frontmatter)

  return { data, content }
}

function getSkillFolderName(relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean)
  return parts.at(-2) ?? 'untitled-skill'
}

function buildExcerpt(content: string) {
  return content
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ')
    .slice(0, 220)
}

function inferNamespace(relativePath: string) {
  const parts = relativePath.split('/').filter(Boolean)
  const namespaceParts = parts.slice(0, -2)
  return namespaceParts.length > 0 ? namespaceParts.join('/') : undefined
}

function comparableRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, '/')
}

/** When the same skill `name` appears more than once under one source, keep a single row. */
function pickPreferredDuplicate(candidates: SkillRecord[]): SkillRecord {
  if (candidates.length <= 1) {
    return candidates[0]!
  }

  const rank = (skill: SkillRecord) => {
    const rel = comparableRelativePath(skill.relativePath)
    const inAgentsSkills = rel.includes('/.agents/skills/')
    return {
      inAgentsSkills,
      pathLen: rel.length,
      rel,
    }
  }

  return [...candidates].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    if (ra.inAgentsSkills !== rb.inAgentsSkills) {
      return Number(ra.inAgentsSkills) - Number(rb.inAgentsSkills)
    }
    if (ra.pathLen !== rb.pathLen) return ra.pathLen - rb.pathLen
    return ra.rel.localeCompare(rb.rel)
  })[0]!
}

function dedupeBySourceAndName(skills: SkillRecord[]): SkillRecord[] {
  const groups = new Map<string, SkillRecord[]>()
  for (const skill of skills) {
    const key = `${skill.sourceId}::${skill.name.trim().toLowerCase()}`
    const list = groups.get(key)
    if (list) {
      list.push(skill)
    } else {
      groups.set(key, [skill])
    }
  }

  const kept: SkillRecord[] = []
  for (const group of groups.values()) {
    kept.push(pickPreferredDuplicate(group))
  }
  return kept
}

export function normalizeSkills(
  rawSkills: RawSkillRecord[],
  sources: SourceConfig[],
): SkillRecord[] {
  const sourceMap = new Map(sources.map((source) => [source.id, source]))

  const skills = rawSkills
    .flatMap((rawSkill) => {
      const source = sourceMap.get(rawSkill.sourceId)
      if (!source) {
        return []
      }

      const parsed = parseFrontmatter(rawSkill.rawExcerpt)
      const name = readString(parsed.data.name) || getSkillFolderName(rawSkill.relativePath)
      const description =
        readString(parsed.data.description) || buildExcerpt(parsed.content) || 'No description'
      const namespace = inferNamespace(comparableRelativePath(rawSkill.relativePath))
      const tags = [source.label, source.writable ? 'editable' : 'readonly']

      if (namespace) {
        tags.push(namespace)
      }

      const previewBody = buildExcerpt(parsed.content)
      const searchIndex = [name, description, source.label, rawSkill.relativePath, previewBody]
        .join(' ')
        .toLowerCase()

      return [{
        ...rawSkill,
        id: `${rawSkill.sourceId}:${rawSkill.relativePath}`,
        sourceLabel: source.label,
        sourceKind: source.kind,
        writable: source.writable,
        name,
        description,
        namespace,
        previewBody,
        tags,
        searchIndex,
      } satisfies SkillRecord]
    })

  return dedupeBySourceAndName(skills).sort((left, right) => left.name.localeCompare(right.name))
}

export function buildSkillTemplate(name: string, description: string, body: string) {
  const trimmedBody = body.trim()

  return `---\nname: ${slugify(name)}\ndescription: ${description.trim()}\n---\n\n# ${name.trim()}\n\n${
    trimmedBody || '## Instructions\nDescribe how this skill should be used.'
  }\n`
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function buildRelativeSkillPath(name: string, namespace?: string) {
  const safeName = slugify(name) || 'untitled-skill'
  const segments = namespace
    ? namespace
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean)
    : []

  return [...segments, safeName, 'SKILL.md'].join('/')
}
