# Corona

AI desktop assistant with browser control, multi-task scheduling, self-evolution, and floating window mode. Built on Electron + React.

Corona sits between you and the browser — it can navigate pages, fill forms, extract data, and execute multi-step workflows while you watch or step away. You chat in natural language; the agent plans, uses tools, and streams its thinking in real time.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                   Renderer (React 19)                 │
│  ┌─────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │  Chat   │  │  Task List   │  │  Floating Mode  │  │
│  │  Panel  │  │  Tab         │  │  Overlay        │  │
│  └─────────┘  └──────────────┘  └─────────────────┘  │
│  ┌──────────────────────────────────────────────────┐ │
│  │              Browser Viewport                    │ │
│  │  ┌────────┐  ┌───────────┐  ┌────────────────┐  │ │
│  │  │ TabBar │  │ AddressBar│  │  WebContents   │  │ │
│  │  └────────┘  └───────────┘  │  View           │  │ │
│  │                              └────────────────┘  │ │
│  └──────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│                   Main Process                        │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Agent    │  │ Task      │  │ Plugin           │  │
│  │ Loop     │  │ Scheduler │  │ Registry         │  │
│  └──────────┘  └───────────┘  └──────────────────┘  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Self-    │  │ Memory    │  │ Security         │  │
│  │ Evolution│  │ Store     │  │ Guard            │  │
│  └──────────┘  └───────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────────┐ │
│  │  CDP (Accessibility Tree + Debugger)             │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Features

### Browser Automation
- Full Chromium control via CDP — navigate, click, type, scroll, extract
- Accessibility-tree-based element discovery (no DOM injection, no visual models)
- Multi-tab support with tab switching, history, and popup interception
- Screenshot capture and element highlighting
- Operation recorder for skill creation from demonstrations

### Agent Core
- Streaming chat with real-time thinking, tool calls, and results
- Multi-model support (Anthropic Claude, OpenAI) with configurable API endpoints
- Plan-then-execute workflow with user review checkpoints for sensitive actions
- Tool system: 19 browser tools, skill management, memory query/update, task orchestration
- Human-in-the-loop: the agent asks permission before destructive actions

### Multi-Task Queue
- Send messages while the agent is working — new requests queue as pending tasks
- Agent events carry task IDs, so each task's messages stay isolated
- Task relationships: supersede, depend on, or continue from previous tasks
- Task context auto-injected when a queued task starts ("recently completed tasks…")

### Plugin System
- Browser is a plugin — everything domain-specific lives in plugins, not core
- Plugin interface: state providers, tool factories, IPC handlers, UI contributions, settings schema
- Skills umbrella: plain markdown skills, MCP server connections, and full plugins

### Self-Evolution
- Scheduled daily reflection ("日三省吾身") — reviews decisions, identifies improvements
- Agent can create/upgrade its own skills based on experience
- Memory hierarchy: working (current conversation), shallow (days, auto-decay), deep (persistent core knowledge)
- Privacy guard: user data never leaks to external entities

### UI
- Floating window mode: 420×56 OS-level overlay for quick commands while using other apps
- Chat + Tasks tabs with persistent component state (no unmount on switch)
- Settings panel for LLM config, shortcuts, and plugin preferences
- Dark theme with corona/solar-eclipse visual identity

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop | Electron 33 |
| Language | TypeScript 5.7 (strict) |
| Build | Electron Forge + Vite |
| UI | React 19 + Zustand 5 + Tailwind CSS 3 |
| AI SDK | @anthropic-ai/sdk + openai |
| Browser | WebContentsView + CDP (`webContents.debugger`) |
| Element Discovery | Accessibility Tree (`Accessibility.getFullAXTree`) |
| Markdown | react-markdown + remark-gfm |

## Getting Started

### Prerequisites
- Node.js 20+
- An Anthropic or OpenAI API key

### Setup

```bash
cd corona
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

## Project Structure

```
corona/
├── src/
│   ├── main/                    # Main process
│   │   ├── agent/               # Agent loop, tool executor, prompt templates
│   │   │   └── tools/           # Tool implementations (browser, skills, memory, tasks)
│   │   ├── browser/             # Browser manager (tabs, CDP, accessibility)
│   │   ├── core/                # Plugin registry & interfaces
│   │   ├── ipc/                 # IPC handlers (chat, browser, tasks, settings)
│   │   ├── learning/            # Self-evolution & daily reflection
│   │   ├── memory/              # Memory store (working/shallow/deep hierarchy)
│   │   ├── security/            # Privacy guard & content filtering
│   │   ├── skills/              # Skill manager & skill hub client
│   │   ├── task/                # Task scheduler with priority queue & relationships
│   │   └── utils/               # Config, logging, settings persistence
│   ├── plugins/
│   │   └── browser/             # Browser plugin (state provider, tools, UI)
│   │       └── main/tools/      # 19 browser automation tools
│   ├── renderer/                # Renderer process
│   │   ├── components/
│   │   │   ├── BrowserView/     # Tab bar, address bar, embed viewport
│   │   │   ├── ChatPanel/       # Chat messages, input bar, task list
│   │   │   ├── FloatingMode/    # Compact floating overlay
│   │   │   ├── Settings/        # Settings layout & panels
│   │   │   ├── AgentThinking/   # Live thinking display
│   │   │   └── ReviewDialog/    # User review checkpoints
│   │   ├── hooks/               # Shared hooks (useSendMessage)
│   │   ├── store/               # Zustand store (chat, browser, session slices)
│   │   └── services/            # IPC bridge wrappers
│   └── shared/                  # Shared types, IPC channels, tool schemas
├── resources/                   # App icon (corona eclipse SVG)
├── docs/                        # Tool reference docs
└── package.json
```

## How It Works

1. **You type a command** — "Go to github.com and find the most starred TypeScript project"
2. **Agent plans** — streams a step-by-step plan in the thinking panel
3. **Agent executes** — calls browser tools (navigate, scroll, extract accessibility tree), streams results
4. **Review checkpoints** — for destructive actions (form submit, delete), the agent pauses and asks you
5. **Done** — task completes, summary saved, next queued task auto-starts

The agent controls the browser through **CDP** (Chrome DevTools Protocol), using the accessibility tree to discover and interact with page elements. No DOM injection, no brittle selectors, no visual ML models.

## Floating Mode

Click the 🪟 button (or toggle from the main process) to enter floating mode. The window shrinks to a 420×56 overlay pinned to the top of the screen — type a quick command while using other apps. Messages sent from floating mode appear in the full chat history and queue as tasks.
