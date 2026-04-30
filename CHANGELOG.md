# Browser Secretary Agent — 项目文档

## 概述

Browser Secretary Agent 是一个基于 Electron 的 AI 桌面应用。AI 助手通过 CDP（Chrome DevTools Protocol）控制内嵌 Chromium 浏览器，代替用户执行网页操作。支持文本/语音交互、人在回路审批（human-in-the-loop）、技能复用和记忆进化。

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 33+ |
| 语言 | TypeScript 5.x (strict) |
| 构建 | Electron Forge + Vite |
| UI | React 19 + Zustand + Tailwind CSS 3 |
| AI SDK | @anthropic-ai/sdk + openai |
| 浏览器控制 | CDP via `webContents.debugger` |
| 元素发现 | Accessibility Tree（CDP `Accessibility.getFullAXTree`） |
| Markdown | react-markdown + remark-gfm |

## 功能清单

### Phase 1 — Electron 外壳 + 浏览器嵌入
- [x] Electron 应用启动，BrowserWindow + 内嵌 `<webview>`
- [x] CDP 连接通过 `webContents.debugger`
- [x] 左右双面板布局（左侧聊天，右侧浏览器）
- [x] Preload 脚本 + contextBridge IPC 通信

### Phase 2 — AI Agent 核心
- [x] LLM 客户端：Anthropic + OpenAI 双 provider 抽象
- [x] 自定义 baseUrl 支持（DeepSeek、qwen 等兼容 API）
- [x] 流式消息处理（Anthropic streaming + OpenAI streaming）
- [x] DeepSeek thinking blocks 正确保留和回传
- [x] Tool registry 框架 + Tool executor 调度器
- [x] Agent orchestration loop（消息 → LLM → 工具 → 结果 → LLM）
- [x] Context manager 上下文管理 + token 预算
- [x] System prompt 构建器
- [x] 核心工具：`browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`、`browser_scroll`、`browser_back`、`browser_press`、`browser_wait`、`browser_get_page_state`、`browser_console`
- [x] Accessibility tree 解析器 + @ref ID 分配
- [x] IPC 事件流推送（agent events → renderer）

### Phase 3 — 完整浏览器工具
- [x] `browser_vision` — 截图 + 视觉 LLM 分析（CAPTCHA、画布 UI、视觉验证）
- [x] `browser_extract` — 结构化数据提取（通过 LLM 分析 snapshot）
- [x] `browser_fill_form` — 多字段表单填充（智能字段匹配）
- [x] `browser_request_review` — 敏感操作的用户审批门
- [x] LLMClient 新增 `simpleQuery()` 和 `visionQuery()` 单轮方法

### 流式 UI 实时展示
- [x] Agent 思考过程实时显示（collapsible thinking blocks）
- [x] 工具调用卡片（可展开查看参数和结果，状态指示器）
- [x] Markdown 渲染（react-markdown + GFM：表格、代码高亮、列表等）
- [x] 深色主题完整样式适配

### 持续改进
- [x] 用户配置持久化（`userData/settings.json`）
- [x] API Key 支持自定义 baseUrl
- [x] CDP 关键 bug 修复（正确使用 `debugger.sendCommand()` 原生 Promise）
- [x] Webview CDP 竞态条件修复

---

## 更新日志 (Changelog)

### v0.1.3 — 2026-04-28 — 流式 UI 与 Markdown 渲染

**新增**
- Agent 思考过程实时推送到聊天消息中，以可折叠区块展示
- 工具调用卡片：显示执行状态（蓝色脉冲=运行中 / 绿色=成功 / 红色=失败），点击展开查看参数和结果
- Markdown 渲染支持（react-markdown + remark-gfm），含表格、代码块、列表、引用等
- 自定义 markdown-body 深色主题样式

**改进**
- `ChatMessage` 类型新增 `blocks` 数组，支持富内容块（thinking / tool-call / text）
- Store 新增 `appendBlockToLastAssistant()` 和 `updateToolCallBlock()` 方法
- AgentThinking 组件简化为仅显示当前执行中的工具名
- ChatPanel 完全重写事件处理逻辑，所有 agent 事件实时推入消息流

**依赖新增**
- `react-markdown`、`remark-gfm`

---

### v0.1.2 — 2026-04-28 — Phase 3: 完整浏览器工具

**新增**
- `browser_vision` 工具：截图捕获 + 视觉 LLM 分析
- `browser_extract` 工具：从页面提取结构化数据
- `browser_fill_form` 工具：多字段表单填充，智能匹配字段名
- `browser_request_review` 工具：敏感操作审批门
- `LLMClient.simpleQuery()` 单轮文本查询方法
- `LLMClient.visionQuery()` 单轮视觉查询方法（支持 Anthropic 和 OpenAI 两种 SDK）

**改进**
- `ToolExecutor` 支持接收 `LLMClient` 实例（用于 vision 和 extract 工具）
- `AgentLoop` 传递 `LLMClient` 给 `ToolExecutor`

---

### v0.1.1 — 2026-04-27 — Bug 修复

**修复**
- **关键 CDP bug**：`cdp-client.ts` 之前忽略了 `debugger.sendCommand()` 的原生 Promise，改用不存在的 pending-map 模式导致 CDP 命令永远超时。现改为正确 `await sendCommand()`（`cdp-client.ts:61-74`）
- **DeepSeek thinking blocks**：Anthropic 路径捕获 `thinking_delta`/`signature_delta` 流式事件并正确回传；OpenAI 路径同样处理 thinking blocks
- **Webview CDP 竞态条件**：`dom-ready` 监听器在设置 `src` 属性之前注册；`initialize()` 轮询 `webContents.getAllWebContents()` 自动发现 webview
- **配置持久化**：`settings.json` 写入 `app.getPath('userData')`，每次启动自动加载
- **CSP 安全策略**：开发模式下放宽 `script-src 'unsafe-inline' 'unsafe-eval'`

**新增**
- 自定义 baseUrl 支持（LLMConfig.baseUrl），兼容 DeepSeek、qwen 等 API
- 设置面板新增 Base URL 输入框

---

### v0.1.4 — 2026-04-30 — Phase 5: Skills System + Phase 6: Memory System

**新增 — Skills System (Phase 5)**
- `SkillManager` 技能管理服务：扫描 bundled + user 技能目录，解析 YAML frontmatter
- 5 个技能管理工具：`skill_list`、`skill_view`、`skill_create`、`skill_patch`、`skill_delete`
- 2 个内置示例技能：`form-filling`（表单填充工作流）、`data-extraction`（数据提取工作流）
- 技能索引注入 system prompt（按 category 分组展示 name + description）
- 渐进式 3 层加载：index → SKILL.md → 链接参考文件

**新增 — Memory System (Phase 6)**
- `MemoryStore` 记忆存储服务：管理 `MEMORY.md`（agent 笔记）和 `USER.md`（用户画像）
- 5 个记忆管理工具：`memory_search`、`memory_get`、`memory_add`、`memory_replace`、`session_search`
- Frozen snapshot 模式：会话启动时加载记忆，写入即时落盘但不刷新运行中 prompt
- `§` 分隔符追加 + 自动 LRU 裁剪（MEMORY.md ≤2200 字符，USER.md ≤1375 字符）
- Prompt 注入防护：过滤不可见 Unicode（ZWSP-RLM 范围）、拒绝角色注入标记
- 会话转录保存（JSONL）+ `session_search` 跨会话全文检索
- Context compaction 前触发 memory flush 提示

**新增 — Favicon 显示**
- TabSession 新增 `favicon` 字段，通过 CDP `page-favicon-updated` 事件捕获
- TabBar 组件：加载中显示蓝色旋转动画，有 favicon 显示图标（onError fallback 到 globe SVG），无 favicon 显示 globe SVG
- 修复 favicon 闪烁 bug：TAB_CREATE / TAB_SWITCH handler 中 `pushTabState()` 缺少 `favicon` 字段导致渲染层覆盖

**改进**
- `buildSystemPrompt()` 新增 `extras` 参数：`memorySection`、`userProfileSection`、`skillsIndex`
- `AgentLoop.runLoop()` 在每个 turn 构建 system prompt 时注入记忆 + 用户画像 + 技能索引
- `AgentLoop` 会话结束后自动保存 transcript 到 MemoryStore
- IPC handlers 初始化链集成 SkillManager 和 MemoryStore 注册

**文件变更**
- 新增 15 个文件（SkillManager, MemoryStore, 10 tool factories, 2 bundled skills）
- 修改 2 个文件（agent-loop.ts, handlers.ts）
- 修改 4 个文件（favicon 实现：browser-manager.ts, handlers.ts, types.ts, TabBar.tsx）

---

### v0.1.6 — 2026-04-30 — 操作录制增强：LLM 合成 + AXTree 快照

**重大改进 — 录制数据质量**
- 注入脚本升级：捕获 `aria-label`、计算 ARIA role、最近标题（h1-h6）、页面标题，生成 agent 可理解的语义元素描述
- 录制开始/结束时自动抓取 AXTree 全量快照（用于 LLM 理解页面结构）
- 事件去重优化：600ms 内双击合并、2 秒滚动防抖（仅记录 >30% 位移）、连续滚动自动合并
- 输入防抖：600ms 输入暂停后记录最终值，避免记录每个按键
- 噪音过滤：跳过无标签无文本的点击、重复事件指纹去重

**重大改进 — LLM 合成技能**
- 新增 `synthesizeSkill()`：将原始录制事件构建为结构化合成 prompt，调用 LLM 生成高质量 SKILL.md
- LLM 合成回调通过 `OperationRecorder.setLLMSynthesisCallback()` 注入（零耦合）
- 生成的技能包含：Goal 概述、Prerequisites 前置条件、带等待条件的完整 Workflow、实用 Tips
- 元素描述使用可见标签/role/文本（agent 友好），不再使用 CSS selector
- 自动识别表单提交点并标注 `browser_request_review`

**改进**
- `OperationRecorder.start()/stop()` 改为接收 `TabSession`（支持 CDP 快照能力）
- `generateSkillMarkdown()` 替换为 `buildSynthesisPrompt()`（静态方法，无副作用）
- `saveAsSkill()` 替换为 `synthesizeSkill()`（异步 LLM 合成 + 保存）

---

### v0.1.5 — 2026-04-30 — 浏览器技能优化 + 操作录制

**优化 — 技能 DOM-First 策略**
- `data-extraction` 技能更新至 v1.1.0：明确 DOM-first 三级策略（snapshot+extract → 手动交互 → vision 截图兜底）
- `form-filling` 技能更新至 v1.1.0：明确 DOM-first 策略，增加字段值被清除、自定义组件等故障处理指引
- 两个技能均新增"Strategy: DOM-First, Vision-Fallback"对照表，仅 canvas 渲染/CAPTCHA 才使用截图

**新增 — 操作录制 (Operation Recorder)**
- `OperationRecorder` 独立类（`src/main/browser/operation-recorder.ts`）：与 agent/skill/memory 系统零耦合
- 录制按钮集成到 AddressBar：红色脉冲指示器 + 实时操作计数
- 注入轻量 DOM 监听脚本（click/input/change/submit/scroll），通过 `webContents.executeJavaScript()` 完成注入和回收
- 停止录制时自动生成 SKILL.md（含 YAML frontmatter + 自然语言步骤），通过回调写入 SkillManager
- 新增 IPC 通道 `recording:start` / `recording:stop` / `recording:state-changed`
- Store 新增 `RecordingSlice`（`recordingState` + `setRecordingState`）

**设计原则**
- 操作录制器完全自包含，通过回调与 SkillManager 交互，不 import 任何 agent 模块
- 录制脚本为内联字符串常量，无外部文件依赖

---

### v0.1.0 — 2026-04-27 — 初始版本

**Phase 1 + 2 完整实现**

Electron 桌面 Shell：
- Electron 33 + Forge + Vite + React 19 项目骨架
- 内嵌 `<webview>` 浏览器面板 + 左侧聊天面板双栏布局
- contextBridge IPC 通信通道
- 主进程 webContents.debugger CDP 接入
- Tailwind CSS 3 深色主题

AI Agent 核心：
- LLM 客户端：Anthropic + OpenAI 双 provider
- Agent orchestration loop（message → LLM → tool → result → LLM → response）
- Tool Registry + Tool Executor 框架
- Context Manager 上下文管理
- IPC 流式事件推送（thinking / tool-start / tool-result / response / error / done）

10 个浏览器工具：
- `browser_navigate`、`browser_snapshot`、`browser_click`、`browser_type`
- `browser_scroll`、`browser_back`、`browser_press`、`browser_wait`
- `browser_get_page_state`、`browser_console`

Accessibility Tree 引擎：
- `AccessibilityTree.snapshot()` — CDP `Accessibility.getFullAXTree()` 解析
- @ref ID 分配（@e1, @e2...）用于交互元素定位
- 文本表示生成（roles: button→[BTN], textbox→[INPUT], link→🔗 等）

CDP 客户端：
- `webContents.debugger.attach("1.3")`
- CDP Domain 管理（Page, Runtime, Accessibility, DOM, Log）
- Console 消息捕获、Frame 导航监听
- JS 表达式执行（`Runtime.evaluate`）

Browser Manager：
- 页面导航 + 等待加载
- @ref 定位 → DOM.resolveNode → box model 坐标
- Mouse event 模拟点击 + 键盘输入

---

## 项目结构

```
browser-secretary-agent/
├── src/
│   ├── main/                          # Electron 主进程
│   │   ├── index.ts                   # App 入口、生命周期
│   │   ├── preload.ts                 # contextBridge IPC
│   │   ├── ipc/
│   │   │   └── handlers.ts            # IPC handler 注册
│   │   ├── agent/
│   │   │   ├── agent-loop.ts          # 核心编排循环
│   │   │   ├── tool-executor.ts       # 工具调用调度
│   │   │   ├── llm-client.ts          # LLM 抽象层
│   │   │   ├── prompt-templates.ts    # System prompt
│   │   │   ├── context-manager.ts     # Token 预算 + 压缩
│   │   │   └── tools/
│   │   │       ├── browser/           # 14 个浏览器工具
│   │   │       ├── skill/             # 技能管理工具（Phase 5）
│   │   │       └── memory/            # 记忆工具（Phase 6）
│   │   ├── browser/
│   │   │   ├── browser-manager.ts     # 浏览器生命周期 + 页面 API
│   │   │   ├── cdp-client.ts          # CDP 底层封装
│   │   │   └── accessibility-tree.ts  # AXTree → text snapshot
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── settings-store.ts      # 配置持久化
│   ├── renderer/                      # React UI
│   │   ├── App.tsx                    # 双面板布局
│   │   ├── components/
│   │   │   ├── ChatPanel/             # 聊天 + 消息渲染
│   │   │   ├── BrowserView/           # <webview> 嵌入
│   │   │   ├── ControlBar/            # 模式切换 + 设置入口
│   │   │   ├── AgentThinking/         # 当前执行状态栏
│   │   │   ├── ReviewDialog/          # 审批弹窗
│   │   │   └── Settings/              # API Keys + 模型配置
│   │   ├── store/                     # Zustand 状态管理
│   │   └── global.css                 # Tailwind + markdown-body 样式
│   └── shared/                        # 主进程/渲染进程共享
│       ├── ipc-channels.ts            # IPC 通道常量
│       ├── types.ts                   # 共享类型定义
│       └── tool-schemas.ts            # 工具 JSON Schema
└── package.json
```

## 已注册的 14 个浏览器工具

| # | 工具名 | 功能 |
|---|---|---|
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

## 待实现 (Phase 4-8)

- Phase 4: Human-in-the-Loop（Take Over / Hand Back / Review 完整流程）
- Phase 7: Voice + Polish（语音 + 体验打磨）
- Phase 8: Build + Packaging（打包发布）
- Learning System: Recall Tracking（召回追踪 + 短期记忆评分）
- Memory Consolidation: 6-component scoring + promotion + temporal decay
