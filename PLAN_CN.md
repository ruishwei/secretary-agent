# Browser Secretary Agent — 开发规划

## 项目概述

基于 Electron 的 AI 桌面应用。AI 助手通过 CDP（Chrome DevTools Protocol）控制内嵌 Chromium 浏览器，代替用户执行网页操作。用户通过聊天面板与 Agent 交互，Agent 实时流式展示思考过程、工具调用和结果，执行浏览器操作（导航、点击、输入、滚动、数据提取等）。

## 当前架构

### 技术栈

| 层 | 技术 |
|-------|-----------|
| 桌面框架 | Electron 33 |
| 语言 | TypeScript 5.x (strict) |
| 构建 | Electron Forge + Vite |
| UI | React 19 + Zustand + Tailwind CSS 3 |
| AI SDK | @anthropic-ai/sdk + openai |
| 浏览器控制 | WebContentsView + CDP（`webContents.debugger`） |
| 元素发现 | Accessibility Tree（CDP `Accessibility.getFullAXTree`） |
| Markdown | react-markdown + remark-gfm |

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        渲染进程 (RENDERER)                        │
│  ┌──────────┐  ┌──────────────────────────────────────────────┐ │
│  │ ChatPanel│  │              浏览器外壳                        │ │
│  │  + Agent │  │  ┌──────────┐  ┌──────────────────────────┐  │ │
│  │ Thinking │  │  │  TabBar  │  │       AddressBar          │  │ │
│  │          │  │  └──────────┘  └──────────────────────────┘  │ │
│  │          │  │  ┌──────────────────────────────────────────┐ │ │
│  │          │  │  │          BrowserView（占位容器）           │ │ │
│  │          │  │  │     主进程在此区域渲染 WebContentsView     │ │ │
│  │          │  │  └──────────────────────────────────────────┘ │ │
│  └──────────┘  └──────────────────────────────────────────────┘ │
│                        ▲ contextBridge IPC                       │
├────────────────────────┼─────────────────────────────────────────┤
│                        │           主进程 (MAIN)                   │
│  ┌─────────────────────┼──────────────────────────────────────┐ │
│  │              IPC Handlers                                   │ │
│  │  ┌──────────────────┴───────────────────────────────────┐  │ │
│  │  │                  AgentLoop                             │  │ │
│  │  │  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │  │ │
│  │  │  │LLMClient │  │ToolExecutor│  │ ContextManager   │  │  │ │
│  │  │  │          │  │            │  │                  │  │  │ │
│  │  │  │Anthropic │  │ 19 个工具  │  │ 系统提示词        │  │  │ │
│  │  │  │OpenAI    │  │ 已注册     │  │ 对话历史          │  │  │ │
│  │  │  └──────────┘  └─────┬──────┘  │ Token 预算        │  │  │ │
│  │  │                      │         └──────────────────┘  │  │ │
│  │  └──────────────────────┼───────────────────────────────┘  │ │
│  │                         │                                   │ │
│  │  ┌──────────────────────┴───────────────────────────────┐  │ │
│  │  │              BrowserStateProvider                      │  │ │
│  │  │  ┌─────────────────────────────────────────────────┐  │  │ │
│  │  │  │              BrowserManager                       │  │  │ │
│  │  │  │  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │  │  │ │
│  │  │  │  │TabSession │  │TabSession │  │ TabSession  │  │  │  │ │
│  │  │  │  │CDP+AXTree │  │CDP+AXTree │  │ CDP+AXTree  │  │  │  │ │
│  │  │  │  │WebContents│  │WebContents│  │ WebContents │  │  │  │ │
│  │  │  │  │   View    │  │   View    │  │    View     │  │  │  │ │
│  │  │  │  └───────────┘  └───────────┘  └─────────────┘  │  │  │ │
│  │  │  └─────────────────────────────────────────────────┘  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 解耦设计：StateProvider 模式

Agent 核心（`AgentLoop`、`ToolExecutor`）与浏览器代码完全解耦：

- **`StateProvider`** 接口 — 适配器插槽模式（adapter-slot pattern）。`AgentLoop` 调用 `getContextSections()`、`buildSnapshotSection()`、`isReady()`、`waitUntilReady()`、`cleanup()`。`BrowserStateProvider` 通过封装 `BrowserManager` 实现此接口。
- **外部化工具注册** — `registerBrowserTools(executor, ctx)` 是独立函数。工具通过 `executor.register(handler)` 注册。`ToolExecutor` 中无浏览器依赖。

### 数据流

```
用户发送消息
  → IPC SEND_MESSAGE
    → AgentLoop.run()
      → StateProvider.getContextSections()（标签列表、页面信息）
      → StateProvider.buildSnapshotSection()（无障碍树快照）
      → LLM 流式响应（文本 + 思考 + 工具调用）
      → ToolExecutor.execute() 执行每个工具
      → ContextManager.addToolResults()
      → 循环回到 LLM（最多 MAX_AGENT_TOOL_TURNS 轮）
  ← IPC AGENT_EVENT 流（thinking, tool-start, tool-result, response, done）
```

### 文件结构

```
src/
├── main/                              # Electron 主进程
│   ├── index.ts                       # 应用入口、生命周期
│   ├── preload.ts                     # contextBridge IPC API
│   ├── ipc/
│   │   └── handlers.ts                # 所有 IPC handler 注册
│   ├── agent/                         # Agent 子系统（通用，无浏览器依赖）
│   │   ├── agent-loop.ts              # 核心编排循环
│   │   ├── tool-executor.ts           # 工具调度（通用注册表）
│   │   ├── llm-client.ts              # Anthropic + OpenAI 抽象层
│   │   ├── prompt-templates.ts        # 系统提示词构建
│   │   ├── context-manager.ts         # Token 预算 + 压缩
│   │   ├── state-provider.ts          # StateProvider 接口
│   │   └── tools/
│   │       └── browser/               # 19 个浏览器工具 + 注册函数
│   ├── browser/                       # 浏览器子系统
│   │   ├── browser-manager.ts         # 多标签管理器 + TabSession
│   │   ├── browser-state-provider.ts  # StateProvider 适配器
│   │   ├── cdp-client.ts              # CDP 底层封装
│   │   └── accessibility-tree.ts      # AXTree → 文本快照
│   └── utils/                         # Logger、settings-store、config
├── renderer/                          # React UI
│   ├── App.tsx                        # 主布局（左面板 + 右浏览器）
│   ├── components/
│   │   ├── ChatPanel/                 # 聊天消息 + 输入
│   │   ├── BrowserView/              # 标签栏、地址栏、浏览器视图
│   │   ├── ControlBar/               # 应用标题栏 + 设置入口
│   │   ├── AgentThinking/            # Agent 状态显示
│   │   ├── ReviewDialog/             # 人工审批弹窗
│   │   └── Settings/                 # API Key + 模型配置
│   ├── store/                         # Zustand 状态管理
│   └── global.css                     # Tailwind + 自定义样式
└── shared/                            # 主进程/渲染进程共享
    ├── ipc-channels.ts                # IPC 通道常量
    ├── types.ts                       # 共享类型定义
    ├── tool-schemas.ts                # 工具 JSON Schema
    └── constants.ts                   # 配置常量
```

## 已完成功能

### Agent 核心
- [x] LLM 客户端：Anthropic + OpenAI 双 provider 抽象
- [x] 自定义 baseUrl 支持（DeepSeek、Qwen 等兼容 API）
- [x] 流式消息处理（文本、思考、工具调用）
- [x] DeepSeek thinking blocks 透传（内联 content + `reasoning_content`）
- [x] 通用工具注册表 + 执行器（无浏览器依赖）
- [x] Agent 编排循环（消息 → LLM → 工具 → 结果 → LLM）
- [x] 上下文管理器：Token 预算 + 自动压缩
- [x] 系统提示词基于 `StateProvider` sections 动态构建
- [x] `browser_todo_write` 工具：Agent 的结构化计划管理
- [x] 计划项状态：待处理 / 进行中 / 已完成
- [x] 敏感操作审查/审批弹窗
- [x] Agent 中止（流式取消）

### 浏览器控制
- [x] 基于 WebContentsView 的多标签浏览器（从已弃用的 `<webview>` 迁移）
- [x] 通过 `webContents.debugger` 的 CDP 深度浏览器访问
- [x] 无障碍树解析 + @ref ID 分配
- [x] 元素交互：点击、输入、滚动、按键
- [x] 页面导航（URL 输入、后退、前进、刷新、停止）
- [x] 实时导航状态同步（URL、标题、加载状态、前进/后退可用性）
- [x] 重定向跟踪（`did-redirect-navigation`）
- [x] 弹窗拦截 + 自动创建新标签
- [x] 截图捕获 + 视觉分析
- [x] 页面结构化数据提取
- [x] 表单填充（智能字段匹配）
- [x] 控制台消息捕获 + JavaScript 执行
- [x] 标签生命周期管理（创建、关闭、切换）
- [x] 加载进度条（模拟进度动画）

### UI/UX
- [x] Tailwind CSS 深色主题
- [x] 左面板（400px）：聊天 + Agent 思考状态
- [x] 右面板：标签栏 + 地址栏 + 浏览器视图
- [x] 实时思考流式显示（紫色脉冲动画）
- [x] 可折叠思考块（默认折叠，点击展开）
- [x] 工具调用卡片（状态指示：蓝色脉冲=运行中 / 绿色=成功 / 红色=错误）
- [x] 工具执行耗时显示
- [x] Markdown 渲染（完整 GFM 支持）
- [x] 计划项勾选标记（○ 待处理 / ● 进行中 / ✓ 已完成）
- [x] 刷新 ↔ 停止切换按钮（加载时显示红色 ✕）
- [x] 前进/后退按钮禁用状态
- [x] 标签关闭按钮（✕，悬停显示）
- [x] 设置持久化（`userData/settings.json`）
- [x] 设置面板（API Key、provider、模型、baseUrl、maxTokens）

### 19 个已注册的浏览器工具

| # | 工具 | 功能 |
|---|------|----------|
| 1 | `browser_navigate` | 导航到 URL，返回页面快照 |
| 2 | `browser_snapshot` | 获取当前页面 AXTree 快照 |
| 3 | `browser_click` | 按 @ref ID 点击元素 |
| 4 | `browser_type` | 按 @ref ID 输入文本 |
| 5 | `browser_scroll` | 页面上下滚动 |
| 6 | `browser_back` | 返回上一页 |
| 7 | `browser_press` | 按键盘按键 |
| 8 | `browser_wait` | 等待条件或超时 |
| 9 | `browser_get_page_state` | 获取完整页面状态 |
| 10 | `browser_console` | 获取控制台消息 / 执行 JS |
| 11 | `browser_vision` | 截图 + 视觉 AI 分析 |
| 12 | `browser_extract` | 从页面提取结构化数据 |
| 13 | `browser_fill_form` | 多字段表单填充 |
| 14 | `browser_request_review` | 请求用户审批（提交前门禁） |
| 15 | `browser_new_tab` | 打开新标签页 |
| 16 | `browser_close_tab` | 关闭标签页 |
| 17 | `browser_switch_tab` | 切换到指定标签 |
| 18 | `browser_list_tabs` | 列出所有标签 |
| 19 | `browser_todo_write` | 管理结构化计划项 |

## 已知问题与技术债务

### 当前缺陷
- 平台特定快捷键（macOS Cmd vs Windows Ctrl）未处理
- 设置导入缺少校验（加载的 JSON 无类型检查）

### 测试
- 无自动化测试覆盖（单元、集成或端到端）
- 测试基础设施已存在（`vitest`）但未编写测试

### 打包
- 无生产构建或安装器配置
- `forge.config.ts` 存在但未配置分发

## 路线图

### Phase 1：稳定性与打磨（优先级：高）

**目标**：使当前功能集可靠且接近生产就绪。

| 任务 | 描述 |
|------|-------------|
| 窗口调整大小 | WebContentsView 边界应在窗口大小变化时更新 |
| DPI 缩放适配 | WebContentsView 定位应考虑 DPI 缩放 |
| 地址栏 URL 同步 | URL 应在重定向过程中更新（而非仅完成后） |
| 标签图标同步 | Favicon 应从主进程推送到渲染进程 |
| 标签拖拽重排 | TabBar 应支持拖拽重排序 |
| 键盘快捷键 | Ctrl+L = 聚焦地址栏，Ctrl+T = 新标签，Ctrl+W = 关闭标签 |
| 错误边界 | React error boundary 用于崩溃恢复 |
| 设置校验 | 加载设置时校验，对无效配置显示错误提示 |

### Phase 2：测试（优先级：高）

**目标**：建立测试覆盖以保证可靠性。

| 任务 | 描述 |
|------|-------------|
| 单元测试 | 工具 handler、context manager、CDP client、AXTree 解析器 |
| 集成测试 | Agent loop（mock LLM）、工具执行管道 |
| E2E 测试 | 应用启动、聊天流程、浏览器导航 |
| CI 配置 | GitHub Actions：lint + test + build |

### Phase 3：浏览器体验（优先级：中）

**目标**：使内嵌浏览器体验接近真实浏览器。

| 任务 | 描述 |
|------|-------------|
| 书签 | 保存和管理书签 |
| 历史记录 | 带搜索的浏览历史 |
| 下载管理 | 带进度的下载管理器 |
| 页内查找 | Ctrl+F 文本搜索 |
| 缩放控制 | 页面放大/缩小/重置 |
| 右键菜单 | 上下文菜单（后退、前进、刷新等） |
| 证书处理 | HTTPS 证书错误页面 |

### Phase 4：人在回路（优先级：中）

**目标**：完善敏感操作的人工监督。

| 任务 | 描述 |
|------|-------------|
| 接管模式 | 用户临时手动控制浏览器 |
| 交还控制 | 手动操作后将控制权交还 Agent |
| 审查队列 | 待审批项在侧边栏显示，支持通过/拒绝/修改 |
| 审批规则 | 自动批准域名、自动拒绝模式 |
| 审计日志 | 记录所有 Agent 操作及时间戳 |

### Phase 5：技能系统（优先级：低）

**目标**：可复用、可分享的自动化技能。

| 任务 | 描述 |
|------|-------------|
| 技能定义 | 用于定义可复用工作流的 YAML/JSON schema |
| 技能发现 | Agent 能发现并调用技能库中的技能 |
| 技能创建 | Agent 能从观察到的模式中创建新技能 |
| 技能市场 | 导入/导出技能 |

### Phase 6：记忆系统（优先级：低）

**目标**：跨会话持久记忆，实现个性化辅助。

| 任务 | 描述 |
|------|-------------|
| 用户档案 | 持久的用户偏好和上下文 |
| 会话记忆 | 记住过去的交互和决策 |
| 知识图谱 | 从网页交互中获取的结构化知识 |
| 记忆衰减 | 基于时间的相关性评分 |

### Phase 7：语音 + 多媒体（优先级：低）

**目标**：语音交互和更丰富的媒体支持。

| 任务 | 描述 |
|------|-------------|
| 语音转文字 | 通过 Web Speech API 或 Whisper 进行语音输入 |
| 文字转语音 | Agent 回复朗读 |
| 视频录制 | 录制浏览器会话 |
| 截图标注 | 审查前在截图上绘图/高亮 |

### Phase 8：打包与分发（优先级：中）

**目标**：作为独立应用发布。

| 任务 | 描述 |
|------|-------------|
| Windows 安装器 | Squirrel.Windows 或 NSIS 安装器 |
| macOS DMG | 用于 macOS 分发的签名 DMG |
| Linux AppImage | AppImage 或 deb 包 |
| 自动更新 | electron-updater 自动更新 |
| 代码签名 | Windows 和 macOS 证书 |

## 开发命令

```bash
# 启动开发
npm run dev

# 类型检查
npx tsc --noEmit

# 运行测试（可用时）
npm test

# 生产构建
npm run build

# 分发打包
npm run package
```
