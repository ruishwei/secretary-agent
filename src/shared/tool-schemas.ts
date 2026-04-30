/**
 * JSON Schema definitions for all AI tools.
 * Compatible with both Anthropic and OpenAI function-calling formats.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ===== Browser Tools =====

export const TAB_ID_PROPERTY = {
  tabId: {
    type: "string",
    description: "Optional. The ID of the tab to operate on. Uses the active tab if not specified.",
  },
};

export const BROWSER_NAVIGATE: ToolDefinition = {
  name: "browser_navigate",
  description:
    "Navigate the browser to a URL. Returns a compact accessibility tree snapshot with interactive elements marked with @ref IDs. Use this as the first step for any browser task.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL to navigate to.",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["url"],
  },
};

export const BROWSER_SNAPSHOT: ToolDefinition = {
  name: "browser_snapshot",
  description:
    "Get a text-based snapshot of the current page's accessibility tree. Returns interactive elements with @ref IDs. Use full=true for complete page content (large pages may be summarized).",
  input_schema: {
    type: "object",
    properties: {
      full: {
        type: "boolean",
        description: "If true, return the full page snapshot. Default false (compact mode).",
      },
      ...TAB_ID_PROPERTY,
    },
  },
};

export const BROWSER_CLICK: ToolDefinition = {
  name: "browser_click",
  description:
    "Click an element identified by its @ref ID from the snapshot. For example, click(ref='@e5') clicks the element marked as [@e5] in the snapshot.",
  input_schema: {
    type: "object",
    properties: {
      ref: {
        type: "string",
        description: "The @ref ID of the element to click (e.g., '@e5').",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["ref"],
  },
};

export const BROWSER_TYPE: ToolDefinition = {
  name: "browser_type",
  description:
    "Type text into an input field identified by its @ref ID. Clears the field first, then types the text character by character for realism.",
  input_schema: {
    type: "object",
    properties: {
      ref: {
        type: "string",
        description: "The @ref ID of the input element.",
      },
      text: {
        type: "string",
        description: "The text to type into the field.",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["ref", "text"],
  },
};

export const BROWSER_SCROLL: ToolDefinition = {
  name: "browser_scroll",
  description: "Scroll the page up or down to reveal content.",
  input_schema: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: ["up", "down"],
        description: "Direction to scroll.",
      },
      amount: {
        type: "number",
        description: "Pixels to scroll. Default: one viewport height.",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["direction"],
  },
};

export const BROWSER_BACK: ToolDefinition = {
  name: "browser_back",
  description: "Navigate back to the previous page in browser history.",
  input_schema: {
    type: "object",
    properties: { ...TAB_ID_PROPERTY },
  },
};

export const BROWSER_PRESS: ToolDefinition = {
  name: "browser_press",
  description:
    "Press a keyboard key. Common uses: Enter (submit forms), Tab (navigate fields), Escape (close dialogs), arrow keys.",
  input_schema: {
    type: "object",
    properties: {
      key: {
        type: "string",
        description: "Key name (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown').",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["key"],
  },
};

export const BROWSER_VISION: ToolDefinition = {
  name: "browser_vision",
  description:
    "Take a screenshot and analyze it with vision AI. Use when the accessibility tree is insufficient — CAPTCHAs, complex visual layouts, visual verification.",
  input_schema: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "What to look for or verify in the screenshot.",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["question"],
  },
};

export const BROWSER_CONSOLE: ToolDefinition = {
  name: "browser_console",
  description:
    "Get browser console messages (errors, warnings, logs) and optionally evaluate JavaScript expressions in the page context.",
  input_schema: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Optional JavaScript expression to evaluate in the page context.",
      },
      ...TAB_ID_PROPERTY,
    },
  },
};

export const BROWSER_EXTRACT: ToolDefinition = {
  name: "browser_extract",
  description:
    "Extract structured content from the current page. Specify what data to extract (e.g., 'table of recent orders', 'all article titles', 'form field labels and values').",
  input_schema: {
    type: "object",
    properties: {
      what: {
        type: "string",
        description: "Description of what data to extract from the page.",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["what"],
  },
};

export const BROWSER_FILL_FORM: ToolDefinition = {
  name: "browser_fill_form",
  description:
    "Fill multiple form fields at once. Handles text inputs, radio buttons, checkboxes, selects, and text areas. Always requests user review before submitting any form.",
  input_schema: {
    type: "object",
    properties: {
      fields: {
        type: "object",
        description:
          "Key-value mapping of field labels/names to values. e.g., {'title': 'Weekly Report', 'recipient': 'All Staff'}",
      },
      ...TAB_ID_PROPERTY,
    },
    required: ["fields"],
  },
};

export const BROWSER_WAIT: ToolDefinition = {
  name: "browser_wait",
  description:
    "Wait for a condition: specific text to appear, or a timeout in milliseconds. Use after clicks that trigger page loads or dynamic content.",
  input_schema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "Wait until this text appears on the page.",
      },
      timeoutMs: {
        type: "number",
        description: "Milliseconds to wait. Default: 3000.",
      },
      ...TAB_ID_PROPERTY,
    },
  },
};

export const BROWSER_GET_PAGE_STATE: ToolDefinition = {
  name: "browser_get_page_state",
  description:
    "Get a comprehensive summary of the current page: URL, title, all form field values, interactive elements, and a content summary. Useful when the user takes over and hands back.",
  input_schema: {
    type: "object",
    properties: { ...TAB_ID_PROPERTY },
  },
};

export const BROWSER_REQUEST_REVIEW: ToolDefinition = {
  name: "browser_request_review",
  description:
    "Pause AI control and request user review. Required before: submitting forms, sending messages, making purchases, deleting data, or navigating to sensitive URLs.",
  input_schema: {
    type: "object",
    properties: {
      reason: {
        type: "string",
        description: "Why review is needed and what the user should check.",
      },
      reviewType: {
        type: "string",
        enum: ["form-submit", "content-draft", "navigation", "delete-action"],
        description: "The type of action requiring review.",
      },
    },
    required: ["reason", "reviewType"],
  },
};

// ===== Tab Management Tools =====

export const BROWSER_NEW_TAB: ToolDefinition = {
  name: "browser_new_tab",
  description: "Open a new browser tab. Optionally specify a URL to navigate the new tab to. The new tab becomes the active tab.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Optional URL to load in the new tab. Omit for a blank tab.",
      },
    },
  },
};

export const BROWSER_CLOSE_TAB: ToolDefinition = {
  name: "browser_close_tab",
  description: "Close a browser tab by its ID. Cannot close the last remaining tab.",
  input_schema: {
    type: "object",
    properties: {
      tabId: {
        type: "string",
        description: "The tab ID to close.",
      },
    },
    required: ["tabId"],
  },
};

export const BROWSER_SWITCH_TAB: ToolDefinition = {
  name: "browser_switch_tab",
  description: "Switch the active browser tab by its tab ID, or by matching a substring against tab URLs and titles.",
  input_schema: {
    type: "object",
    properties: {
      tabId: {
        type: "string",
        description: "Exact tab ID to switch to.",
      },
      match: {
        type: "string",
        description: "Substring to match against tab URLs and titles (case-insensitive).",
      },
    },
  },
};

export const BROWSER_LIST_TABS: ToolDefinition = {
  name: "browser_list_tabs",
  description: "List all open browser tabs with their IDs, URLs, and titles. The active tab is marked.",
  input_schema: {
    type: "object",
    properties: {},
  },
};

// ===== Skill Tools =====

export const SKILL_LIST: ToolDefinition = {
  name: "skill_list",
  description:
    "List all available skills with names and descriptions. Scan this list before every task to check if a matching skill exists.",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: "string",
        description: "Optional category filter.",
      },
    },
  },
};

export const SKILL_VIEW: ToolDefinition = {
  name: "skill_view",
  description:
    "Load a skill's full content (SKILL.md). Use when a skill matches the current task. Progressive disclosure: call without file_path first to get the main instructions, then with file_path for specific references.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the skill to load.",
      },
      file_path: {
        type: "string",
        description: "Optional: specific file within the skill directory to load.",
      },
    },
    required: ["name"],
  },
};

export const SKILL_CREATE: ToolDefinition = {
  name: "skill_create",
  description:
    "Create a new skill from a completed task. Use after finishing a complex task (5+ tool calls), solving a tricky error, or discovering a non-obvious workflow. The skill will be available in future sessions.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Skill name: lowercase letters, digits, dots, underscores, dashes (max 64 chars).",
      },
      category: {
        type: "string",
        description: "Category folder name (e.g., 'browser-tasks', 'data-extraction').",
      },
      content: {
        type: "string",
        description: "Full SKILL.md content with YAML frontmatter and markdown body.",
      },
    },
    required: ["name", "category", "content"],
  },
};

export const SKILL_PATCH: ToolDefinition = {
  name: "skill_patch",
  description:
    "Update a skill with targeted changes using fuzzy matching. Preferred over skill_edit for small fixes. If you used a skill and it had wrong steps or missing pitfalls, patch it immediately.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the skill to patch.",
      },
      old_string: {
        type: "string",
        description: "Text to find and replace (fuzzy matching handles whitespace differences).",
      },
      new_string: {
        type: "string",
        description: "Replacement text.",
      },
    },
    required: ["name", "old_string", "new_string"],
  },
};

export const SKILL_DELETE: ToolDefinition = {
  name: "skill_delete",
  description: "Remove an obsolete skill entirely.",
  input_schema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Name of the skill to delete.",
      },
    },
    required: ["name"],
  },
};

// ===== Memory Tools =====

export const MEMORY_SEARCH: ToolDefinition = {
  name: "memory_search",
  description:
    "Search across all memory files (MEMORY.md, USER.md, daily files, session transcripts) using hybrid search (semantic + full-text). Use before answering questions about past work, user preferences, or prior decisions.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query.",
      },
      maxResults: {
        type: "number",
        description: "Maximum results to return. Default: 5.",
      },
      minScore: {
        type: "number",
        description: "Minimum relevance score (0-1). Default: 0.3.",
      },
    },
    required: ["query"],
  },
};

export const MEMORY_GET: ToolDefinition = {
  name: "memory_get",
  description: "Read specific lines from a memory file.",
  input_schema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Path to the memory file (relative to the memory directory).",
      },
      fromLine: {
        type: "number",
        description: "Starting line number (1-based). Default: 1.",
      },
      lines: {
        type: "number",
        description: "Number of lines to read. Default: 50.",
      },
    },
    required: ["path"],
  },
};

export const MEMORY_ADD: ToolDefinition = {
  name: "memory_add",
  description:
    "Add a durable memory entry to MEMORY.md (agent notes) or USER.md (user profile). Prioritize what reduces future user steering — the best memory prevents the user from correcting you again.",
  input_schema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["memory", "user"],
        description: "Which file to write to.",
      },
      entry: {
        type: "string",
        description: "The memory entry to append. Will be separated with a '§' delimiter.",
      },
    },
    required: ["target", "entry"],
  },
};

export const MEMORY_REPLACE: ToolDefinition = {
  name: "memory_replace",
  description: "Find and replace a specific memory entry by substring match.",
  input_schema: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: ["memory", "user"],
      },
      old: {
        type: "string",
        description: "Substring to find.",
      },
      new: {
        type: "string",
        description: "Replacement text.",
      },
    },
    required: ["target", "old", "new"],
  },
};

export const SESSION_SEARCH: ToolDefinition = {
  name: "session_search",
  description:
    "Search past conversation sessions using full-text search. Use to recall what was discussed in previous sessions — past tasks, errors encountered, workflows completed.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query for past conversations.",
      },
      maxResults: {
        type: "number",
        description: "Maximum results. Default: 5.",
      },
    },
    required: ["query"],
  },
};

export const BROWSER_TODO_WRITE: ToolDefinition = {
  name: "browser_todo_write",
  description:
    "Create and manage a task list for your current browsing session. Use this to plan multi-step tasks and track progress. Items with status 'completed' will show as checked off with strikethrough.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        description: "The full list of plan items (replaces previous list).",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Unique identifier (e.g., '1', 'search')" },
            text: { type: "string", description: "Task description" },
            status: { type: "string", enum: ["pending", "in_progress", "completed"] },
          },
          required: ["id", "text", "status"],
        },
      },
    },
    required: ["items"],
  },
};

// ===== Tool Collections =====

export const BROWSER_TOOLS: ToolDefinition[] = [
  BROWSER_NAVIGATE,
  BROWSER_SNAPSHOT,
  BROWSER_CLICK,
  BROWSER_TYPE,
  BROWSER_SCROLL,
  BROWSER_BACK,
  BROWSER_PRESS,
  BROWSER_VISION,
  BROWSER_CONSOLE,
  BROWSER_EXTRACT,
  BROWSER_FILL_FORM,
  BROWSER_WAIT,
  BROWSER_GET_PAGE_STATE,
  BROWSER_REQUEST_REVIEW,
  BROWSER_NEW_TAB,
  BROWSER_CLOSE_TAB,
  BROWSER_SWITCH_TAB,
  BROWSER_LIST_TABS,
  BROWSER_TODO_WRITE,
];

export const SKILL_TOOLS: ToolDefinition[] = [
  SKILL_LIST,
  SKILL_VIEW,
  SKILL_CREATE,
  SKILL_PATCH,
  SKILL_DELETE,
];

export const MEMORY_TOOLS: ToolDefinition[] = [
  MEMORY_SEARCH,
  MEMORY_GET,
  MEMORY_ADD,
  MEMORY_REPLACE,
  SESSION_SEARCH,
];

export const ALL_TOOLS: ToolDefinition[] = [
  ...BROWSER_TOOLS,
  ...SKILL_TOOLS,
  ...MEMORY_TOOLS,
];
