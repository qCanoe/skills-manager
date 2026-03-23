# Multi-tool default source presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `get_default_sources` so the app ships with additional built-in filesystem roots (aligned with common agent tools like Chops: Windsurf, Amp, Cursor rules, Claude agents path), stable IDs for `localStorage` merge, and correct UI badges for new `kind` values.

**Architecture:** Keep a single source of truth in Rust (`get_default_sources`) returning a longer `Vec<SourceConfig>`; extend the TypeScript `SourceKind` union and `getSourceBadge` for labels; add Rust unit tests for ID/path stability and frontend tests only where pure TS changes. No change to scan logic (still `SKILL.md`-only); missing directories continue to be skipped at scan time.

**Tech Stack:** Rust (Tauri 2), TypeScript/React 19, Vitest.

---

## File structure (create / modify)

| Path | Responsibility |
|------|------------------|
| `src-tauri/src/lib.rs` | `get_default_sources()` entries; optional `#[cfg(test)]` module |
| `src/types.ts` | Extend `SourceKind` with new string literal union members |
| `src/lib/sources.ts` | `getSourceBadge` switch arms for new kinds |
| `README.md` | Document new default roots (「默认来源」一节) |
| `docs/superpowers/plans/2026-03-23-multitool-default-sources.md` | This plan |

---

### Task 1: Rust — default sources list + tests

**Files:**
- Modify: `src-tauri/src/lib.rs` (`get_default_sources` and add `#[cfg(test)] mod default_sources_tests` at end of file or before `fn main` if any)
- Test: inline `cargo test` in `src-tauri`

**Preset table (stable IDs, paths via `home_join`):**

| `id` | `label` | `home_join` parts | `kind` | `writable` | `enabled` |
|------|---------|-------------------|--------|------------|-----------|
| `cursor-personal` | Cursor | `.cursor`, `skills` | `cursor` | true | true |
| `codex-personal` | Codex | `.codex`, `skills` | `codex` | true | true |
| `claude-personal` | Claude | `.claude`, `skills` | `claude` | true | true |
| `cursor-rules` | Cursor Rules | `.cursor`, `rules` | `cursor` | true | true |
| `agents-skills` | Agents | `.agents`, `skills` | `agents` | true | true |
| `windsurf-codeium` | Windsurf (Codeium) | `.codeium`, `windsurf`, `memories` | `windsurf` | true | true |
| `windsurf-rules` | Windsurf (rules) | `.windsurf`, `rules` | `windsurf` | true | true |
| `amp-config` | Amp | `.config`, `amp` | `amp` | true | true |

Rationale: IDs are new and stable; `cursor-rules` reuses `kind: "cursor"` so badge stays「Cursor」unless you prefer a distinct badge (then use a new kind and Task 2). Paths mirror [Chops `ToolSource` documentation](https://github.com/Shpigford/chops) (`~/.cursor/rules`, `~/.agents/skills`, Codeium/Windsurf, `~/.config/amp`).

- [ ] **Step 1: Write the failing test**

At bottom of `lib.rs` (before closing of file, inside `#[cfg(test)] mod tests`):

```rust
#[cfg(test)]
mod default_sources_tests {
  use super::get_default_sources;

  #[test]
  fn default_sources_has_expected_ids_and_order() {
    let sources = get_default_sources().expect("home");
    let ids: Vec<_> = sources.iter().map(|s| s.id.as_str()).collect();
    assert_eq!(
      ids,
      vec![
        "cursor-personal",
        "codex-personal",
        "claude-personal",
        "cursor-rules",
        "agents-skills",
        "windsurf-codeium",
        "windsurf-rules",
        "amp-config",
      ]
    );
  }

  #[test]
  fn default_sources_kinds_match_new_tools() {
    let sources = get_default_sources().expect("home");
    let agents = sources.iter().find(|s| s.id == "agents-skills").unwrap();
    assert_eq!(agents.kind, "agents");
    let ws = sources.iter().find(|s| s.id == "windsurf-codeium").unwrap();
    assert_eq!(ws.kind, "windsurf");
    let amp = sources.iter().find(|s| s.id == "amp-config").unwrap();
    assert_eq!(amp.kind, "amp");
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd src-tauri && cargo test default_sources_ -- --nocapture
```

Expected: **FAIL** (assertion on `ids` length or content vs current three entries).

- [ ] **Step 3: Implement `get_default_sources`**

Replace the body of `get_default_sources` with a `vec![]` containing all eight `SourceConfig { ... }` entries per the table above, preserving existing field order in struct literals.

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd src-tauri && cargo test default_sources_ -v
```

Expected: **PASS**

- [ ] **Step 5: Run full Rust CI checks**

Run:

```bash
cd src-tauri && cargo clippy -- -D warnings && cargo test
```

Expected: **PASS**

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add multi-tool default source presets (Windsurf, Amp, etc.)"
```

---

### Task 2: TypeScript — `SourceKind` + badges

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/sources.ts`
- Test: add or extend `src/lib/sources.test.ts` (create if missing)

- [ ] **Step 1: Write the failing test**

Create `src/lib/sources.test.ts`:

```typescript
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
  it('returns Chinese labels for new tool kinds', () => {
    expect(getSourceBadge(base({ kind: 'agents' }))).toBe('Agents')
    expect(getSourceBadge(base({ kind: 'windsurf' }))).toBe('Windsurf')
    expect(getSourceBadge(base({ kind: 'amp' }))).toBe('Amp')
  })
})
```

Run: `npm test -- src/lib/sources.test.ts`

Expected: **FAIL** (exhaustive switch or wrong label).

- [ ] **Step 2: Extend types**

In `src/types.ts`, extend:

```typescript
export type SourceKind =
  | 'cursor'
  | 'codex'
  | 'claude'
  | 'agents'
  | 'windsurf'
  | 'amp'
  | 'custom'
```

- [ ] **Step 3: Implement `getSourceBadge` cases**

In `src/lib/sources.ts`, inside `switch (source.kind)`, add:

```typescript
case 'agents':
  return 'Agents'
case 'windsurf':
  return 'Windsurf'
case 'amp':
  return 'Amp'
```

- [ ] **Step 4: Run tests**

Run: `npm test -- src/lib/sources.test.ts`

Expected: **PASS**

Run: `npm test` and `npm run lint`

Expected: **PASS**

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/sources.ts src/lib/sources.test.ts
git commit -m "feat(types): badge labels for agents, windsurf, and amp sources"
```

---

### Task 3: Documentation

**Files:**
- Modify: `README.md` (功能特性 / 默认来源相关段落)

- [ ] **Step 1: Update README**

Add one bullet under 功能特性: 内置路径覆盖 Cursor skills/rules、Codex、Claude、`~/.agents/skills`、Windsurf（Codeium memories 与 rules）、Amp（`~/.config/amp`）等，并注明仅识别含 `SKILL.md` 的目录结构。

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document multi-tool default source roots"
```

---

### Task 4: Manual verification (Tauri)

- [ ] **Step 1: Run app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Confirm**

In 来源管理, list shows eight built-in entries (or fewer if merge logic hides something — should not). Toggle one new source; restart app; `enabled` state persists. Run「重新扫描」with only new roots enabled if those dirs are empty — list should stay empty without errors.

- [ ] **Step 3: Optional commit**

No code change if verification only; otherwise fix and commit.

---

## Plan review loop

After implementation, optionally re-read this plan against the diff for YAGNI (no `.mdc` parsing, no file watcher — out of scope for「功能 1」).

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-03-23-multitool-default-sources.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
