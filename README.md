<p align="center">
  <img src="./src-tauri/icons/skills_icon_terminal.svg" alt="Skills Manager logo" width="88" />
</p>

<h1 align="center">Skills Manager</h1>

<p align="center">
  一个基于 <code>Tauri</code> + <code>React</code> 构建的桌面技能包管理器，用来集中管理 <code>Cursor</code>、<code>Codex</code> 和自定义目录中的 <code>SKILL.md</code>。
</p>

<p align="center">
  <a href="#概览">概览</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#使用方式">使用方式</a> •
  <a href="#skill-目录结构">Skill 目录结构</a> •
  <a href="#开发说明">开发说明</a>
</p>

## 概览

`Skills Manager` 面向以目录形式组织的 agent skills。

在这个项目里，一个 skill 不是单独的一段文本，而是一个目录。目录中必须包含一个名为 `SKILL.md` 的核心文件，还可以附带示例、素材、说明文档或其他补充文件。应用会扫描多个来源目录，把这些 skill 聚合到一个桌面面板中进行浏览、搜索、预览、编辑和同步。

它特别适合下面这些场景：

- 同时维护 `~/.cursor/skills`、`~/.codex/skills` 和团队自定义技能目录
- 快速查看某个 skill 的原始内容、路径、命名空间和附件
- 把个人 skill 从一个来源复制到另一个来源，并处理命名冲突
- 用一个轻量桌面面板代替在文件系统里来回翻目录

> [!IMPORTANT]
> `npm run dev` 只会启动浏览器预览，用于查看前端界面。真正的扫描、保存、同步、打开路径和托盘功能依赖 Tauri 运行时，请使用 `npm run tauri dev`。

## 功能特性

- 多来源聚合：同时扫描多个 skill 根目录，并支持按来源筛选
- 默认来源开箱即用：内置 `Cursor / Personal`、`Codex / Personal` 和 `Cursor / Built-in`
- 自定义来源管理：支持手动添加、启用/停用和删除自定义目录
- Skill 检索：按名称、描述、来源、相对路径和正文摘要进行搜索
- 只看可编辑内容：一键过滤只读来源，聚焦可修改的 skill
- 原始内容预览：查看完整 `SKILL.md`、路径、命名空间和目录附件
- 新建与编辑：自动生成标准模板，并按 `[namespace/]<slug>/SKILL.md` 组织路径
- 跨来源同步：把整个 skill 目录复制到目标来源，支持 `rename`、`overwrite`、`skip`
- 桌面托盘交互：支持显示/隐藏窗口、重新扫描和退出应用
- 快捷浏览：支持 `J / K` 或方向键在 skill 列表间移动

## 快速开始

### 前置要求

- `Node.js` 20+（推荐）
- `npm`
- `Rust` stable 1.77.2+
- Tauri 2 的系统依赖，参考官方文档：[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### 安装依赖

```bash
npm install
```

### 启动桌面应用

```bash
npm run tauri dev
```

应用启动后会以托盘面板形式运行。点击托盘图标可显示或隐藏窗口。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run tauri dev` | 启动 Tauri 桌面开发环境 |
| `npm run dev` | 仅启动 Vite 浏览器预览 |
| `npm run build` | 构建前端资源 |
| `npm run tauri build` | 打包桌面应用 |
| `npm run lint` | 运行 ESLint |

## 使用方式

### 1. 默认来源

应用首次启动会自动加载以下来源：

| 来源 | 默认路径 | 可写 | 说明 |
| --- | --- | --- | --- |
| `Cursor / Personal` | `~/.cursor/skills` | 是 | 个人 Cursor skills |
| `Codex / Personal` | `~/.codex/skills` | 是 | 个人 Codex skills |
| `Cursor / Built-in` | `~/.cursor/skills-cursor` | 否 | 内置技能，默认只读 |

> [!NOTE]
> `~` 表示当前用户目录。在 Windows 上通常对应 `C:\Users\<你的用户名>`。

### 2. 添加自定义来源

在“来源”区域中可以手动输入：

- 来源名称
- 文件夹路径
- 是否为可编辑来源

来源配置和启用状态会保存在本地 `localStorage` 中，因此重新打开应用后仍会保留。

### 3. 浏览与筛选

你可以通过以下方式缩小范围：

- 搜索关键字
- 按来源筛选
- 仅显示可编辑来源

技能列表会显示匹配结果数量，详情区会展示：

- `SKILL.md` 原文
- 相对路径
- 命名空间
- 来源权限
- 同目录下的附件名称

### 4. 新建或编辑 skill

对于可写来源，你可以：

- 新建一个 skill
- 直接编辑现有 `SKILL.md`
- 基于当前 skill 再创建一个新 skill

创建时会自动生成如下结构的路径：

```text
[namespace/]<slug>/SKILL.md
```

例如：

```text
.system/tools/my-skill/SKILL.md
```

### 5. 同步 skill

同步不是只复制 `SKILL.md`，而是复制整个 skill 目录。

支持三种冲突策略：

- `rename`：保留目标已有目录，为新副本自动追加 `-copy`
- `overwrite`：覆盖目标已有 skill 目录
- `skip`：跳过已存在目标

### 6. 托盘行为

- 关闭主窗口时，应用不会退出，而是隐藏到托盘
- 托盘菜单支持“显示 / 隐藏”、“重新扫描”和“退出”
- 点击托盘图标可快速切换窗口显示状态

> [!TIP]
> 如果你关闭窗口后“看起来像退出了”，其实应用仍在托盘中运行，需要通过托盘菜单执行真正的退出。

## Skill 目录结构

应用以目录为单位识别和同步 skill。最小可用结构如下：

```text
my-skill/
├─ SKILL.md
└─ notes.md
```

也支持带命名空间的层级组织：

```text
.system/
└─ tools/
   └─ my-skill/
      ├─ SKILL.md
      ├─ examples.md
      └─ assets/
```

`SKILL.md` 推荐使用 frontmatter 来声明基础元数据：

```md
---
name: my-skill
description: Explain when and how this skill should be used.
---

# My Skill

## Instructions
Describe how the agent should use this skill.
```

如果没有 frontmatter，应用会回退到目录名和正文摘录来生成标题与描述。

## 开发说明

### 技术栈

- 前端：`React 19`、`TypeScript 5.9`、`Vite 8`
- 桌面层：`Tauri 2`
- 后端：`Rust 2021`
- 主要依赖：`@tauri-apps/api`、`lucide-react`、`clsx`、`walkdir`、`serde`

### 代码职责

- `src/`：前端界面、来源管理、搜索筛选、预览、编辑和同步弹窗
- `src/lib/`：skill 元数据解析、来源持久化、UI 状态持久化
- `src-tauri/src/lib.rs`：本地文件扫描、写入、目录同步、打开路径、托盘与窗口行为

### 当前实现注意点

- 浏览器模式下不提供真实文件系统能力，仅用于 UI 预览
- 打开路径功能当前只实现了 Windows 分支，属于 Windows-first 桌面工具
- 自定义来源是手动输入路径，不是原生目录选择器
- 不存在或不可访问的来源目录会在扫描时被跳过

## 为什么这个项目有用

如果你经常在不同 agent 生态之间维护技能包，`Skills Manager` 能把分散在文件系统中的 `SKILL.md` 重新组织成一个统一的工作台，让你更快完成：

- 查看已有 skill
- 复制和迁移 skill
- 维护个人 skill 库
- 区分只读内置技能和可编辑技能

对于重度使用 `Cursor`、`Codex` 或自定义 skills 工作流的人来说，它比单纯打开文件夹更直接，也更适合作为日常维护入口。
