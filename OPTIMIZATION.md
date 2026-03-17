# 项目轻量化检查与优化方向

> 审查日期：2026-03-17
> 项目版本：0.0.0（开发中）
> 技术栈：Tauri 2 + React 19 + Rust

---

## 一、现状评估

### 整体结论

项目**总体轻量**，架构设计清晰，依赖管控较好。主要技术选型合理：

- 仅 7 个运行时依赖，无 Redux / MobX 等重型状态库
- Rust 后端仅 6 个依赖，无 ORM / HTTP 框架
- 使用原生 CSS 变量，无 CSS-in-JS 运行时开销
- React 19 Hooks 模式，无 HOC 嵌套

但仍存在若干**可量化的轻量化改进点**，分为：IPC 数据传输、前端渲染性能、依赖体积、代码结构四个维度。

---

## 二、问题清单

### 2.1 IPC 数据传输冗余（高优先级）

**问题：** `scan_skills` 命令将每个 `SKILL.md` 的**完整文件内容**通过 IPC 传回前端（`lib.rs:171-180`），而列表视图仅需摘要（`previewBody`），完整内容仅在预览单个 skill 时才用到。

```rust
// lib.rs:171 - 传输了完整 rawContent
discovered.push(DiscoveredSkill {
    ...
    raw_content,   // ← 所有 skill 的全文一次性传输
    ...
});
```

**影响：** 若每个 SKILL.md 平均 2KB，100 个 skill 即 200KB IPC 负载，且每次刷新都重复传输。

**优化方向：**
- 在 Rust 侧截取前 300 字符作为摘要字段，减少 IPC 数据量
- 拆分为两个命令：`scan_skills`（仅元数据+摘要）和 `get_skill_content(id)`（按需加载全文）
- 或增加内容长度阈值：小文件全传，大文件只传摘要

---

### 2.2 `copy_source` 双重目录遍历（中优先级）

**问题：** `copy_source` 对源目录做了**两次 WalkDir 遍历**（`lib.rs:272-302`）：第一遍收集所有 SKILL.md 路径，第二遍检查冲突。

```rust
// lib.rs:272-303
// 第一次遍历：发现所有 skill_paths
for entry in WalkDir::new(&source_root) { ... }

// 第二次遍历冲突检查（对每个 skill_path 调用 inspect_copy_target）
for relative_path in &skill_paths {
    let inspection = inspect_copy_target(...);
```

**优化方向：** 在第一次遍历时同步进行冲突检查，合并为单次遍历。

---

### 2.3 前端搜索低效（中优先级）

**问题：** `visibleSkills` 的 memo（`App.tsx:180-193`）每次过滤时将 5 个字段拼接成一个大字符串再 `includes()` 搜索：

```ts
// App.tsx:188
return [skill.name, skill.description, skill.sourceLabel, skill.relativePath, skill.previewBody]
  .join(' ')        // ← 每次过滤都重新拼接
  .toLowerCase()
  .includes(term)
```

**影响：** 每次搜索词变化，所有 skill 重新拼接字符串。虽有 `useDeferredValue` 兜底，但字符串分配仍是浪费。

**优化方向：**
- 在 `normalizeSkills`（`lib/skills.ts`）时预计算 `searchIndex` 字段（拼接后的小写字符串），避免过滤时重复拼接
- 字段过滤提前短路：先判断 `name.includes(term)`，命中即返回，不继续其他字段

---

### 2.4 Tauri 事件监听器重复注册（中优先级）

**问题：** `refresh-requested` 事件监听器在 `sources` 变化时每次都重新注册（`App.tsx:160-176`），因为 `sources` 在 effect 依赖中：

```ts
// App.tsx:160-176
useEffect(() => {
  const setupListener = async () => {
    const unlisten = await listen('refresh-requested', () => {
      void refreshSkills(sources)  // ← 捕获了 sources 闭包
    })
    return unlisten
  }
  ...
}, [refreshSkills, sources])  // ← sources 变化时重新注册
```

**优化方向：** 使用 `useRef` 存储最新的 `sources`，将 listener 注册从 sources 依赖中解耦，仅注册一次。

---

### 2.5 列表未虚拟化（低优先级，面向未来）

**问题：** `SkillList`（`components/SkillList.tsx:38-57`）直接渲染所有 skill 为 DOM 节点，无窗口化处理。

**影响：** 当 skill 总数超过 500 时，滚动性能可能下降，DOM 节点过多导致内存上升。

**优化方向：** 引入 `react-window` 或 `@tanstack/virtual` 实现虚拟列表（仅在 skill 数量超过 200 时有实际意义）。

---

### 2.6 `marked` 库加载时机（低优先级）

**问题：** `marked` 在模块加载时立即初始化（`components/SkillPreview.tsx:7`）：

```ts
marked.setOptions({ breaks: true })  // 模块级调用，立即执行
```

且 `marked` 是相对较重的 Markdown 解析库（~60KB min+gzip），而实际使用仅限于预览面板。

**优化方向：**
- 考虑替换为 `micromark`（更小，~15KB）或自定义轻量解析器，因为 skill 文件结构简单（标题 + 代码块 + 段落）
- 或使用动态 `import()` 延迟加载 `marked`，减少初始包体积

---

### 2.7 `open_path` 跨平台缺失（低优先级）

**问题：** `open_path` 命令仅实现了 Windows 逻辑，macOS/Linux 直接返回错误（`lib.rs:361-380`）。

**优化方向：** 添加 macOS（`open`）和 Linux（`xdg-open`）支持，或使用 `tauri-plugin-opener` 替代（该插件已在依赖中）。

---

### 2.8 `App.tsx` 状态分散（重构建议）

**问题：** `App.tsx` 有 **12 个 `useState`** 调用（含 bootstrapped、errorMessage、toasts 等），多个 useEffect 处理副作用，组件职责过于宽泛（574 行）。

**优化方向：**
- 将复制流程状态（`copyingSkill`、`copyingSource`、`copyConflict`）提取为 `useCopyFlow` 自定义 Hook
- 将 skill 数据加载（`skills`、`isLoading`、`statusLine`）提取为 `useSkillData` Hook
- `App.tsx` 仅保留布局组合，降低维护复杂度

---

## 三、优先级汇总

| 编号 | 问题 | 优先级 | 预期收益 |
|------|------|--------|---------|
| 2.1 | IPC 全文传输冗余 | 🔴 高 | 减少内存占用，加快刷新速度 |
| 2.2 | copy_source 双重遍历 | 🟡 中 | 减少文件系统 I/O |
| 2.3 | 搜索字段重复拼接 | 🟡 中 | 减少 GC 压力 |
| 2.4 | 事件监听重复注册 | 🟡 中 | 消除潜在内存泄漏风险 |
| 2.5 | 列表未虚拟化 | 🟢 低 | 大数据场景才有意义 |
| 2.6 | marked 加载时机 | 🟢 低 | 减少初始包体积约 45KB |
| 2.7 | open_path 跨平台 | 🟢 低 | 功能完整性 |
| 2.8 | App.tsx 状态分散 | 🟢 低 | 可维护性提升 |

---

## 四、无需改动的部分

以下设计已经合理，不建议过度优化：

- **7 个运行时依赖**：选型精准，clsx / lucide-react / marked 均有明确用途
- **`useDeferredValue` + `useMemo`**：搜索防抖已正确处理
- **`useCallback` 缓存**：`pushToast`、`dismissToast`、`refreshSkills` 已正确包裹
- **CSS 变量设计系统**：tokens.css 设计清晰，无冗余
- **Rust 依赖**：6 个依赖均为必要，无重型框架引入
- **localStorage 持久化**：轻量方案，无需引入 IndexedDB
