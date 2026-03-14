import type { RawSkillRecord, SkillRecord, SourceConfig } from '../types'

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
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
  const data = frontmatter.split('\n').reduce<Record<string, string>>((accumulator, line) => {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) {
      return accumulator
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')

    if (key) {
      accumulator[key] = value
    }

    return accumulator
  }, {})

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

export function normalizeSkills(
  rawSkills: RawSkillRecord[],
  sources: SourceConfig[],
): SkillRecord[] {
  const sourceMap = new Map(sources.map((source) => [source.id, source]))

  return rawSkills
    .flatMap((rawSkill) => {
      const source = sourceMap.get(rawSkill.sourceId)
      if (!source) {
        return []
      }

      const parsed = parseFrontmatter(rawSkill.rawContent)
      const name = readString(parsed.data.name) || getSkillFolderName(rawSkill.relativePath)
      const description =
        readString(parsed.data.description) || buildExcerpt(parsed.content) || 'No description'
      const namespace = inferNamespace(rawSkill.relativePath)
      const tags = [source.label, source.writable ? 'editable' : 'readonly']

      if (namespace) {
        tags.push(namespace)
      }

      return [{
        ...rawSkill,
        id: `${rawSkill.sourceId}:${rawSkill.relativePath}`,
        sourceLabel: source.label,
        sourceKind: source.kind,
        writable: source.writable,
        name,
        description,
        namespace,
        previewBody: buildExcerpt(parsed.content),
        tags,
      } satisfies SkillRecord]
    })
    .sort((left, right) => left.name.localeCompare(right.name))
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
