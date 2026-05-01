# Browser Tools Reference

## 性能优化 (2026-05-01)

| 优化项 | 改动 | 效果 |
|--------|------|------|
| **browser_vision 截图** | PNG → JPEG quality 70 | 体积缩小 5-10 倍 (1-2MB → 150-300KB)，视觉 AI 文本/UI 识别准确率几乎不受影响 |
| **browser_snapshot 文本** | 跳过空容器节点 (generic/group/div 等) + 无名称非交互节点；单空格缩进；去除 emoji | 文本输出减少 30-50%，LLM 处理更快 |
| **browser_get_page_state** | full: true → full: false (depth 6) | 页面摘要只需要统计信息，不需要完整树文本 |
| **browser_extract** | document.body.innerText + 浅层 AXTree 并行获取 | 纯文本比完整 AXTree 紧凑 10-50 倍，LLM 2-3 秒内完成提取 |
| **Post-action 快照** | 所有交互工具 (click/type/scroll/press/wait/back) 默认 full: false | 操作后只需确认变化，不需要深层树 |

---

## 页面导航

### `browser_navigate`
**用途：** 导航到指定 URL，返回页面标题 + 无障碍树快照（含 @ref 标记）

**参数：** `url` (必填), `tabId` (可选)

**潜在问题：**
- 页面加载可能不完整就开始解析（没有等待 readyState）
- 部分 SPA 页面导航后内容异步加载，快照可能为空
- 重定向链不透明

### `browser_back`
**用途：** 后退到上一页

**参数：** `tabId` (可选)

**潜在问题：**
- SPA 内 history.pushState 导航无法后退（需用 browser_click 点返回按钮）
- 后退后页面可能从 bfcache 恢复，快照可能反映旧状态

---

## 页面感知

### `browser_snapshot`
**用途：** 获取当前页面的无障碍树文本表示，交互元素带 @ref ID

**参数：** `full` (是否完整深度，默认 false = depth 6), `tabId` (可选)

**潜在问题：**
- 复杂页面（百度、淘宝）即使 `full: false` 也可能产生大量文本（5K+）
- `ignored` 节点在某些页面占大多数（已修复不过滤）
- @ref ID 是临时的，每次 snapshot 重新分配，不能跨 turn 保存
- 动态加载内容（无限滚动）可能不在快照中

### `browser_vision`
**用途：** 截图后发送给视觉 LLM 分析，用于 CAPTCHA、复杂布局、视觉验证

**参数：** `question` (必填), `tabId` (可选)

**潜在问题：**
- 依赖 LLM vision API，需模型支持（`supportsVision` 未充分暴露）
- 截图 base64 体积大（>1MB），网络慢时请求慢
- 视觉分析不适用于提取大量结构化文本（用 `browser_extract` 更合适）
- 无法"看到"滚动区域外的内容

### `browser_console`
**用途：** 读取浏览器 console 日志，或在页面上下文中执行任意 JavaScript

**参数：** `expression` (可选 JS 表达式), `tabId` (可选)

**潜在问题：**
- JS 表达式执行结果用 `JSON.stringify` 包装，返回值有字符串转义
- 如果 expression 抛异常，返回 `Error: {...}` 字符串但标记 `success: true`
- 无 expression 时返回 console 日志，但日志上限不明确
- 执行大计算量的 JS 可能阻塞页面渲染

### `browser_extract`
**用途：** 用 LLM 从页面提取结构化数据（"所有文章标题"、"表格数据"等）

**参数：** `what` (必填，描述要提取的数据), `tabId` (可选)

**潜在问题：**
- 依赖 LLM 单次调用，复杂提取可能超时
- 页面纯文本 + 浅层 AXTree 合并后截断到 12K，超大页面可能丢失底部内容
- LLM 返回格式不一定为合法 JSON（prompt 要求了但无格式校验）
- evaluateJs 获取 `document.body.innerText` 失败时静默降级为空字符串

### `browser_get_page_state`
**用途：** 获取页面综合摘要：URL、标题、加载状态、元素数量

**参数：** `tabId` (可选)

**潜在问题：**
- 返回的 `elementCount` 是无障碍树节点数，不是 DOM 元素数
- 用 `full: true` 获取快照，大页面可能慢

---

## 页面交互

### `browser_click`
**用途：** 通过 @ref ID 点击元素

**参数：** `ref` (必填，如 `@e5`), `tabId` (可选)

**潜在问题：**
- @ref 每次 snapshot 重分配，用旧的 ref 会失败（"element not found"）
- 点击后页面可能跳转/刷新，如果不等待新内容加载完成就用 snapshot，会拿到过渡态
- 通过 CDP DOM.resolveNode → getBoxModel → dispatchMouseEvent 实现，某些元素（SVG、iframe 内、Shadow DOM）可能解析失败
- 无双重确认机制，可能误点删除按钮等危险操作

### `browser_type`
**用途：** 向输入框键入文本（先清空，逐字输入）

**参数：** `ref` (必填), `text` (必填), `tabId` (可选)

**潜在问题：**
- "逐字输入"只是 `Input.insertText`，不触发每个字符的 keydown/keyup 事件
- 某些前端框架（React/Vue）依赖 input 事件更新状态，insertText 可能不触发
- 中文输入法（IME）场景不支持
- 先清空再输入，对密码管理器自动填充的字段可能破坏

### `browser_press`
**用途：** 按键操作（Enter 提交表单、Tab 切换焦点、Escape 关闭弹窗等）

**参数：** `key` (必填，如 `Enter`, `Tab`, `ArrowDown`), `tabId` (可选)

**潜在问题：**
- 通过 `Input.dispatchKeyEvent` 发送，不保证被页面事件监听器正确捕获
- 聚焦元素不确定，按键可能作用于错误的目标
- 特殊组合键（Ctrl+C、Cmd+V）不支持
- 只发送 keydown + keyup，不发送 keypress

### `browser_scroll`
**用途：** 上下滚动页面

**参数：** `direction` (必填，`up`/`down`), `amount` (像素，默认一屏高度), `tabId` (可选)

**潜在问题：**
- 通过 CDP `Input.dispatchMouseEvent` (wheel) 实现，不适用于 JS 驱动的自定义滚动容器
- 在固定定位的弹窗/模态框内无法滚动
- 默认滚动一整个视口高度，可能跳过中间内容

### `browser_wait`
**用途：** 等待特定文本出现，或等待指定毫秒数

**参数：** `text` (等待文本出现), `timeoutMs` (默认 3000ms), `tabId` (可选)

**潜在问题：**
- 文本等待模式每 500ms 轮询一次快照（每次触发 CDP getFullAXTree），对服务器有压力
- 只匹配 `snapshot.text.includes(text)`，文本中偶然出现同样字符会误触发
- 等待文本出现后没有额外稳定延迟（可能文本刚渲染但关联资源未加载）
- 默认超时 3 秒，慢速网络可能不够

---

## 表单处理

### `browser_fill_form`
**用途：** 批量填写表单字段（输入框、复选框、下拉框等），填写完毕提示人工审核

**参数：** `fields` (必填，`{字段名: 值}` 映射), `tabId` (可选)

**潜在问题：**
- 字段匹配用模糊文本匹配（`includes` + `toLowerCase`），可能匹配到错误字段
- 下拉框（combobox）点击后立即获取快照，若选项异步加载可能拿不到选项
- 每次都获取 3 次完整快照（初始 + 下拉框操作后 + 最终），性能开销大
- 错误处理粗糙：单字段失败只记入 skippedFields 不重试
- 没有处理日期选择器、文件上传等特殊字段类型

---

## 标签页管理

### `browser_new_tab`
**用途：** 创建新标签页，可选加载 URL

**参数：** `url` (可选)

**潜在问题：**
- 创建 tab 后不等待导航完成就返回，后续操作可能因页面未加载而失败
- 没有 `tabId` 参数，新 tab 的 ID 由调用方传入（需协调 handleNewTab 回调）

### `browser_close_tab`
**用途：** 通过 tabId 关闭标签页

**参数：** `tabId` (必填)

**潜在问题：**
- 只能通过准确的 tabId 关闭，不能用标题/URL 匹配
- 关闭后如果切换到另一个 tab，没有返回新 tab 的快照

### `browser_switch_tab`
**用途：** 通过 tabId 或 URL/标题子串匹配切换标签页

**参数：** `tabId` (精确 ID), `match` (子串模糊匹配)

**潜在问题：**
- `match` 是简单子串匹配，多个 tab 匹配时只返回第一个
- 切换后自动获取快照，但大 tab 可能慢

### `browser_list_tabs`
**用途：** 列出所有打开的标签页及其 ID、URL、标题

**参数：** 无

**潜在问题：**
- 标签页 URL 可能很长，输出格式阅读性一般

---

## 规划与控制

### `browser_todo_write`
**用途：** 创建/更新任务列表，前端展示进度

**参数：** `items` (必填，`[{id, text, status}]` 数组)

**潜在问题：**
- 纯前端展示，不持久化（会话结束后丢失）
- 没有依赖关系或优先级字段
- 每次调用完全替换之前列表（不是增量更新）

### `browser_request_review`
**用途：** 暂停 AI 操作，请求用户审核（提交表单前、删除前、敏感操作前）

**参数：** `reason` (必填), `reviewType` (必填：`form-submit`/`content-draft`/`navigation`/`delete-action`)

**潜在问题：**
- 只是发出请求消息，不强制暂停（agent loop 层检查 `review-required` 事件才停止）
- `content-draft` 类型没有把草稿内容传给前端
- 用户响应后没有自动恢复机制

---

## 通用问题

1. **@ref ID 生命周期** — 所有交互工具依赖 @ref，但 ref 每次 snapshot 重分配。AI 跨 turn 使用旧 ref 会失败。
2. **CDP 连接不稳定** — 所有工具依赖 CDP WebSocket，连接断开后所有操作失败且无自动重连。
3. **无并发控制** — LLM 可能在单 turn 调用多个浏览器工具，一个失败可能导致后续工具结果丢失（已部分修复：agent-loop try-catch）。
4. **tabId 传递** — 几乎所有工具接受可选 `tabId`，但 AI 经常省略，导致操作作用于错误标签页。
