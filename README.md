# Skills Manager

[Tauri](https://tauri.app) [React](https://react.dev) [TypeScript](https://www.typescriptlang.org/) [Rust](https://www.rust-lang.org/) [Vite](https://vitejs.dev/)

> 基于 Tauri + React 的轻量 Windows 桌面托盘应用，集中管理多个 AI Agent 工具的 `SKILL.md` 文件。

支持 Cursor、Codex、Claude Code、Windsurf、Amp 等工具的 skills 目录，统一扫描、浏览、编辑与跨来源复制。

左：主界面 · 右：探索 / 来源等视图示例

![主界面](assets/readme/image1.png)

![探索 / 来源等视图示例](assets/readme/image2.png)

## 功能特性

- **多来源与整理** — 聚合 Cursor / Codex / Claude / Agents 等常用 skills 目录与自定义路径；全部来源视图可合并相同内容；全文搜索、Collections、来源配置的导入导出（及推荐用 API，均在右上角设置）
- **探索** — 内置 GitHub 公共 skill 索引，浏览、预览并安装到本机可写目录（需联网）
- **按任务推荐** — 「推荐」模式下描述任务，可选扫描范围（已启用来源、单来源或 Cursor 插件缓存）；调用设置中配置的 API 生成推荐Skills排序与简要说明。（填写配置 — 在设置中填写相关的 API 配置）
- **编辑与复制** — 预览 / 新建 / 编辑 `SKILL.md`；跨来源复制 skill 或整库，支持冲突策略
- **托盘** — 关窗驻留，快速显示、扫描与退出

## 快速开始

### 前置要求

- Node.js 20+、npm
- Rust stable 1.77.2+
- [Tauri 2 系统依赖](https://v2.tauri.app/start/prerequisites/)

### 安装与运行

```bash
npm install
npm run tauri dev
```

> [!IMPORTANT]
> `npm run dev` 仅启动浏览器预览，文件扫描、保存、推荐（模型 API）等功能需通过 `npm run tauri dev` 启动 Tauri 运行时。

### 构建

```bash
npm run tauri build
```

构建产物位于 `src-tauri/target/release/`，包含便携版 exe、NSIS 安装包和 MSI 安装包。

### 常用命令


| 命令                    | 说明             |
| --------------------- | -------------- |
| `npm run tauri dev`   | 启动桌面开发环境       |
| `npm run tauri build` | 构建并打包桌面应用      |
| `npm run dev`         | 仅启动 Vite 浏览器预览 |
| `npm run build`       | 构建前端资源         |
| `npm run lint`        | 运行 ESLint      |
| `npm run test`        | 运行测试           |


## 安全与权限

> [!NOTE]
> 以下仅说明本应用如何访问磁盘与网络；不包含 Cursor / Claude 等各工具自身的服务条款。

- **本地文件**：仅处理您在应用中**启用**的各**来源根目录**（默认如 `~/.cursor/skills` 等，以及自定义或经系统对话框添加的路径）。递归查找 `SKILL.md`，并跳过 `.git`；不会对未配置的磁盘路径做后台全盘扫描。
- **写入**：新建、保存与跨来源复制只会在您主动操作时执行，且目标来源须为可写。
- **网络**：不向本项目任何服务器上传 skill 内容。使用**探索**时通过 HTTPS 访问 GitHub（仓库目录树与原始 `SKILL.md`）；需公网，并可能受 GitHub API 常规速率限制。
- **推荐功能与第三方模型 API**：启用推荐时，应用会由 **Rust 后端**向您配置的 **API Base** 发起 HTTPS 请求，请求体中包含：任务描述、候选 skill 的摘要元数据（由本机构建），以及您的 **API Key**（Bearer）。密钥与 Base URL 保存在本机 WebView 的 `localStorage`，不会发往除您填写端点以外的地址；请自行评估服务商条款与数据出境要求。
- **本机状态**：来源列表、Collections、筛选与视图、推荐 API 配置等保存在 WebView `localStorage`，仅驻留本机。托盘与文件夹选择使用系统原生能力。

## Skill 目录结构

```text
my-skill/
├─ SKILL.md
└─ notes.md        # 可选附件
```

支持带命名空间的层级：

```text
.system/tools/my-skill/
├─ SKILL.md
└─ examples.md
```

`SKILL.md` 推荐使用 frontmatter 声明元数据：

```md
---
name: my-skill
description: 描述该 skill 的用途
---

# My Skill

## Instructions
描述 agent 如何使用此 skill。
```

## 技术栈

- **前端**：React 19 · TypeScript 5.9 · Vite 8
- **桌面**：Tauri 2
- **后端**：Rust 2021（含 `reqwest` 阻塞客户端，用于推荐时调用 OpenAI 兼容 API）

## 开发说明

### 项目结构

根目录保留 Vite 约定的 `index.html`、npm 的 `package.json`，以及 TypeScript 的解决方案入口 `tsconfig.json`（通过 `references` 指向 `config/` 内的子配置）。具体工具配置均在 `config/` 目录。


| 目录                           | 职责                                                                   |
| ---------------------------- | -------------------------------------------------------------------- |
| `config/`                    | Vite / Vitest / ESLint / TypeScript 工程配置（除根级 `tsconfig.json` 解决方案入口） |
| `src/`                       | 前端界面、来源管理、搜索筛选、预览与编辑、探索模式、推荐面板                                       |
| `src/lib/`                   | Skill 元数据解析、探索 API 封装、来源持久化、推荐候选构建与合并、UI 状态、AI 推荐配置读存                |
| `src-tauri/src/`             | 文件扫描、写入、目录复制、GitHub 探索索引与拉取、**推荐库存扫描与模型 API 代理式调用**、托盘与窗口管理          |
| `src-tauri/src/recommend.rs` | 推荐专用：插件缓存扫描、候选去重、OpenAI 兼容 chat/completions 调用                       |
| `public/`                    | 静态资源（构建时原样复制）                                                        |
| `assets/readme/`             | README 截图等文档用资源                                                      |


使用 Cursor 时可在本地自建 `.cursor/`（含 `rules/` 等）；该目录已在 `.gitignore` 中忽略。

### 版本号同步

发布时需同步以下三处版本：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`。

## Roadmap（后续可能方向）

- 推荐模式更多优化联动
- 探索：更多精选源与离线缓存策略
- 可访问性与国际化细化
- UI组件打磨与优化

