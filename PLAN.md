# Browser Secretary Agent — Development Plan

## Project Overview

An Electron-based AI desktop application where an LLM-powered agent controls an embedded Chromium browser via CDP (Chrome DevTools Protocol) to automate web tasks on behalf of the user. The user communicates with the agent through a chat panel, and the agent executes browser operations (navigate, click, type, scroll, extract data, etc.) while streaming its thinking, tool calls, and results in real time.

## Current Architecture

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Electron 33 |
| Language | TypeScript 5.x (strict) |
| Build | Electron Forge + Vite |
| UI | React 19 + Zustand + Tailwind CSS 3 |
| AI SDK | @anthropic-ai/sdk + openai |
| Browser Control | WebContentsView + CDP (`webContents.debugger`) |
| Element Discovery | Accessibility Tree (CDP `Accessibility.getFullAXTree`) |
| Markdown | react-markdown + remark-gfm |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        RENDERER PROCESS                          │
│  ┌──────────┐  ┌──────────────────────────────────────────────┐ │
│  │ ChatPanel│  │              Browser Chrome                   │ │
│  │  + Agent │  │  ┌──────────┐  ┌──────────────────────────┐  │ │
│  │ Thinking │  │  │  TabBar  │  │       AddressBar          │  │ │
│  │          │  │  └──────────┘  └──────────────────────────┘  │ │
│  │          │  │  ┌──────────────────────────────────────────┐ │ │
│  │          │  │  │          BrowserView (placeholder)        │ │ │
│  │          │  │  │     WebContentsView rendered by main     │ │ │
│  │          │  │  └──────────────────────────────────────────┘ │ │
│  └──────────┘  └──────────────────────────────────────────────┘ │
│                        ▲ contextBridge IPC                       │
├────────────────────────┼─────────────────────────────────────────┤
│                        │           MAIN PROCESS                   │
│  ┌─────────────────────┼──────────────────────────────────────┐ │
│  │              IPC Handlers                                   │ │
│  │  ┌──────────────────┴───────────────────────────────────┐  │ │
│  │  │                  AgentLoop                             │  │ │
│  │  │  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │  │ │
│  │  │  │LLMClient │  │ToolExecutor│  │ ContextManager   │  │  │ │
│  │  │  │          │  │            │  │                  │  │  │ │
│  │  │  │Anthropic │  │ 19 tools   │  │ System prompt    │  │  │ │
│  │  │  │OpenAI    │  │ registered │  │ Message history  │  │  │ │
│  │  │  └──────────┘  └─────┬──────┘  │ Token budget     │  │  │ │
│  │  │                      │         └──────────────────┘  │  │ │
│  │  └──────────────────────┼───────────────────────────────┘  │ │
│  │                         │                                   │ │
│  │  ┌──────────────────────┴───────────────────────────────┐  │ │
│  │  │              BrowserStateProvider                      │  │ │
│  │  │  ┌─────────────────────────────────────────────────┐  │  │ │
│  │  │  │              BrowserManager                       │  │  │ │
│  │  │  │  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │  │  │ │
│  │  │  │  │TabSession │  │TabSession │  │ TabSession  │  │  │  │ │
│  │  │  │  │cdp+axTree │  │cdp+axTree │  │ cdp+axTree  │  │  │  │ │
│  │  │  │  │WebContents│  │WebContents│  │ WebContents │  │  │  │ │
│  │  │  │  │   View    │  │   View    │  │    View     │  │  │  │ │
│  │  │  │  └───────────┘  └───────────┘  └─────────────┘  │  │  │ │
│  │  │  └─────────────────────────────────────────────────┘  │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Decoupling: StateProvider Pattern

The agent core (`AgentLoop`, `ToolExecutor`) is fully decoupled from browser-specific code:

- **`StateProvider`** interface — adapter-slot pattern. `AgentLoop` calls `getContextSections()`, `buildSnapshotSection()`, `isReady()`, `waitUntilReady()`, `cleanup()`. The `BrowserStateProvider` implements this interface by wrapping `BrowserManager`.
- **External tool registration** — `registerBrowserTools(executor, ctx)` is a standalone function. Tools are registered via `executor.register(handler)`. No browser dependency in `ToolExecutor`.

### Data Flow

```
User sends message
  → IPC SEND_MESSAGE
    → AgentLoop.run()
      → StateProvider.getContextSections() (tabs, page info)
      → StateProvider.buildSnapshotSection() (accessibility tree)
      → LLM streaming response (text + thinking + tool_calls)
      → ToolExecutor.execute() per tool call
      → ContextManager.addToolResults()
      → Loop back to LLM (up to MAX_AGENT_TOOL_TURNS)
  ← IPC AGENT_EVENT stream (thinking, tool-start, tool-result, response, done)
```

### File Structure

```
src/
├── main/                              # Electron main process
│   ├── index.ts                       # App entry, lifecycle
│   ├── preload.ts                     # contextBridge IPC API
│   ├── ipc/
│   │   └── handlers.ts                # All IPC handler registration
│   ├── agent/                         # Agent subsystem (generic, no browser deps)
│   │   ├── agent-loop.ts              # Core orchestration loop
│   │   ├── tool-executor.ts           # Tool dispatch (generic registry)
│   │   ├── llm-client.ts              # Anthropic + OpenAI abstraction
│   │   ├── prompt-templates.ts        # System prompt builder
│   │   ├── context-manager.ts         # Token budget + compaction
│   │   ├── state-provider.ts          # StateProvider interface
│   │   └── tools/
│   │       └── browser/               # 19 browser tools + registration
│   ├── browser/                       # Browser subsystem
│   │   ├── browser-manager.ts         # Multi-tab manager + TabSession
│   │   ├── browser-state-provider.ts  # StateProvider adapter
│   │   ├── cdp-client.ts              # CDP low-level wrapper
│   │   └── accessibility-tree.ts      # AXTree → text snapshot
│   └── utils/                         # Logger, settings-store, config
├── renderer/                          # React UI
│   ├── App.tsx                        # Main layout (left panel + right browser)
│   ├── components/
│   │   ├── ChatPanel/                 # Chat messages + input
│   │   ├── BrowserView/              # TabBar, AddressBar, BrowserView
│   │   ├── ControlBar/               # App header + settings entry
│   │   ├── AgentThinking/            # Agent status display
│   │   ├── ReviewDialog/             # Human approval modal
│   │   └── Settings/                 # API keys + model config
│   ├── store/                         # Zustand state management
│   └── global.css                     # Tailwind + custom styles
└── shared/                            # Main/renderer shared code
    ├── ipc-channels.ts                # IPC channel name constants
    ├── types.ts                       # Shared type definitions
    ├── tool-schemas.ts                # Tool JSON schemas
    └── constants.ts                   # Configuration constants
```

## Completed Features

### Agent Core
- [x] LLM client with Anthropic + OpenAI dual provider abstraction
- [x] Custom baseUrl support (DeepSeek, Qwen, etc.)
- [x] Streaming message processing (text, thinking, tool calls)
- [x] DeepSeek thinking blocks pass-through (inline content + `reasoning_content`)
- [x] Generic tool registry + executor (no browser dependency)
- [x] Agent orchestration loop (message → LLM → tools → results → LLM)
- [x] Context manager with token budget and auto-compaction
- [x] System prompt built from `StateProvider` sections
- [x] `browser_todo_write` tool for structured agent planning
- [x] Plan items with pending/in_progress/completed status
- [x] Review/inspection dialog for sensitive operations
- [x] Agent abort (mid-stream cancellation)

### Browser Control
- [x] WebContentsView-based multi-tab browser (migrated from deprecated `<webview>`)
- [x] CDP via `webContents.debugger` for deep browser access
- [x] Accessibility tree parsing with @ref ID assignment
- [x] Element interaction: click, type, scroll, keyboard press
- [x] Page navigation (URL entry, back, forward, refresh, stop)
- [x] Real-time navigation state sync (URL, title, loading, canGoBack/Forward)
- [x] Redirect tracking (`did-redirect-navigation`)
- [x] Popup interception + automatic new tab creation
- [x] Screenshot capture + vision analysis
- [x] Structured data extraction from pages
- [x] Form filling with smart field matching
- [x] Console message capture + JavaScript evaluation
- [x] Tab lifecycle management (create, close, switch)
- [x] Loading progress bar (simulated progress animation)

### UI/UX
- [x] Dark theme with Tailwind CSS
- [x] Left panel (400px): Chat + Agent Thinking
- [x] Right panel: TabBar + AddressBar + BrowserView
- [x] Real-time thinking streaming (purple dot animation)
- [x] Collapsible thinking blocks (collapsed by default, click to expand)
- [x] Tool call cards with status indicators (blue pulse = running, green = success, red = error)
- [x] Tool execution duration display
- [x] Markdown rendering with full GFM support
- [x] Plan items with checkmarks (○ pending / ● in-progress / ✓ completed)
- [x] Refresh ↔ Stop toggle button (red X when loading)
- [x] Back/Forward disabled states
- [x] Tab close button (✕, shown on hover)
- [x] Settings persistence (`userData/settings.json`)
- [x] Settings panel (API key, provider, model, baseUrl, maxTokens)

### 19 Registered Browser Tools

| # | Tool | Function |
|---|------|----------|
| 1 | `browser_navigate` | Navigate to URL, return page snapshot |
| 2 | `browser_snapshot` | Get current page AXTree snapshot |
| 3 | `browser_click` | Click element by @ref ID |
| 4 | `browser_type` | Type text into element by @ref ID |
| 5 | `browser_scroll` | Scroll page up/down |
| 6 | `browser_back` | Navigate back in history |
| 7 | `browser_press` | Press keyboard key |
| 8 | `browser_wait` | Wait for condition or timeout |
| 9 | `browser_get_page_state` | Get full page state (URL, title, loading) |
| 10 | `browser_console` | Get console messages / execute JS |
| 11 | `browser_vision` | Screenshot + visual AI analysis |
| 12 | `browser_extract` | Extract structured data from page |
| 13 | `browser_fill_form` | Multi-field form filling |
| 14 | `browser_request_review` | Request user approval (pre-submit gate) |
| 15 | `browser_new_tab` | Open a new browser tab |
| 16 | `browser_close_tab` | Close a browser tab |
| 17 | `browser_switch_tab` | Switch to a specific tab |
| 18 | `browser_list_tabs` | List all open tabs |
| 19 | `browser_todo_write` | Manage structured plan items |

## Known Issues & Technical Debt

### Current Bugs
- Platform-specific keyboard shortcuts (macOS Cmd vs Windows Ctrl)
- Settings import validation missing (no type checking on loaded JSON)

### Testing
- No automated test coverage (unit, integration, or E2E)
- Test infrastructure exists (`vitest`) but no tests written

### Packaging
- No production build or installer configuration
- `forge.config.ts` exists but not configured for distribution

## Roadmap

### Phase 1: Stabilization & Polish (Priority: HIGH)

**Goal**: Make the current feature set reliable and production-ready.

| Task | Description |
|------|-------------|
| Fix window resize | WebContentsView bounds should update on window resize |
| Fix DPI scaling | WebContentsView positioning should account for DPI |
| Address bar URL sync | URL should update during redirects (not just after) |
| Tab favicon sync | Favicon should be pushed from main to renderer |
| Drag to reorder tabs | TabBar should support drag-reorder |
| Keyboard shortcuts | Ctrl+L = focus address bar, Ctrl+T = new tab, Ctrl+W = close tab |
| Error boundary | React error boundary for crash recovery |
| Settings validation | Validate settings on load, show errors for invalid config |

### Phase 2: Testing (Priority: HIGH)

**Goal**: Establish test coverage for reliability.

| Task | Description |
|------|-------------|
| Unit tests | Tool handlers, context manager, CDP client, AXTree parser |
| Integration tests | Agent loop with mock LLM, tool execution pipeline |
| E2E tests | App launch, chat flow, browser navigation |
| CI setup | GitHub Actions for lint + test + build |

### Phase 3: Browser Experience (Priority: MEDIUM)

**Goal**: Make the embedded browser feel like a real browser.

| Task | Description |
|------|-------------|
| Bookmarks | Save and manage bookmarks |
| History | Browsing history with search |
| Downloads | Download manager with progress |
| Find in page | Ctrl+F text search |
| Zoom controls | Page zoom in/out/reset |
| Context menu | Right-click context menu (back, forward, reload, etc.) |
| Certificate handling | HTTPS certificate error pages |

### Phase 4: Human-in-the-Loop (Priority: MEDIUM)

**Goal**: Full human oversight for sensitive operations.

| Task | Description |
|------|-------------|
| Take Over mode | User temporarily takes manual control of the browser |
| Hand Back | Return control to the agent after manual intervention |
| Review queue | Pending reviews shown in sidebar with accept/reject/modify |
| Approval rules | Auto-approve domains, auto-reject patterns |
| Audit log | Record all agent actions with timestamps |

### Phase 5: Skills System (Priority: LOW)

**Goal**: Reusable, shareable automation skills.

| Task | Description |
|------|-------------|
| Skill definition | YAML/JSON schema for defining reusable workflows |
| Skill discovery | Agent can find and invoke skills from a library |
| Skill creation | Agent can create new skills from observed patterns |
| Skill marketplace | Import/export skills |

### Phase 6: Memory System (Priority: LOW)

**Goal**: Persistent memory across sessions for personalized assistance.

| Task | Description |
|------|-------------|
| User profile | Persistent user preferences and context |
| Session memory | Remember past interactions and decisions |
| Knowledge graph | Structured knowledge from web interactions |
| Memory decay | Time-based relevance scoring |

### Phase 7: Voice + Multimedia (Priority: LOW)

**Goal**: Voice interaction and richer media support.

| Task | Description |
|------|-------------|
| Speech-to-text | Voice input via Web Speech API or Whisper |
| Text-to-speech | Agent responses read aloud |
| Video capture | Record browser sessions |
| Screenshot annotation | Draw/highlight on screenshots before review |

### Phase 8: Packaging & Distribution (Priority: MEDIUM)

**Goal**: Ship as a standalone application.

| Task | Description |
|------|-------------|
| Windows installer | Squirrel.Windows or NSIS installer |
| macOS DMG | Signed DMG for macOS distribution |
| Linux AppImage | AppImage or deb package |
| Auto-update | electron-updater for automatic updates |
| Code signing | Certificates for Windows and macOS |

## Development Commands

```bash
# Start development
npm run dev

# Type check
npx tsc --noEmit

# Run tests (when available)
npm test

# Build for production
npm run build

# Package for distribution
npm run package
```
