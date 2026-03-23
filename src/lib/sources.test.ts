import { describe, expect, it } from 'vitest'

import { getSourceBadge } from './sources'
import type { SourceConfig } from '../types'

const base = (overrides: Partial<SourceConfig>): SourceConfig => ({
  id: 'x',
  label: 'X',
  rootPath: '/tmp',
  writable: true,
  kind: 'custom',
  enabled: true,
  ...overrides,
})

describe('getSourceBadge', () => {
  it('returns badge labels for agents, windsurf, and amp kinds', () => {
    expect(getSourceBadge(base({ kind: 'agents' }))).toBe('Agents')
    expect(getSourceBadge(base({ kind: 'windsurf' }))).toBe('Windsurf')
    expect(getSourceBadge(base({ kind: 'amp' }))).toBe('Amp')
  })
})
