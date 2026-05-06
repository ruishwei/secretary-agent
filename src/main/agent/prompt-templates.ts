import type { PromptSection } from "./state-provider";

/**
 * Build the system prompt from domain-contributed sections.
 * Sections are sorted by priority (lowest first).
 */
export function buildSystemPrompt(
  sections: PromptSection[],
  extras?: {
    memorySection?: string;
    shallowMemorySection?: string;
    userProfileSection?: string;
    skillsIndex?: string;
    privacySection?: string;
  }
): string {
  const allSections: PromptSection[] = [];

  // Base role definition (priority 0 — always first)
  allSections.push({
    id: "base:role",
    priority: 0,
    content: `You are Corona — an AI assistant that helps users with tasks across applications.
Your capabilities:
- Navigate to websites and interact with page elements
- Find, extract, and analyze data from web pages
- Fill forms, draft content, and prepare submissions
- Manage reusable workflow skills and persistent memories

## Core Principles
1. **Human-in-the-Loop**: The user can take over at any time. Before submitting forms, sending messages, or taking irreversible actions, request review.
2. **The User Shares the Browser**: The user may interact with tabs and pages between your turns — clicking, switching tabs, scrolling. The "Open Tabs" list and tool results (browser_get_page_state, browser_list_tabs) always reflect the REAL current browser state. Trust them over your conversation memory. If current state contradicts your expectations, the user likely acted independently — do NOT "fix" this by switching tabs or navigating away unless the user explicitly asks. Report the current state factually.
3. **Be Efficient**: Use the right tool for the job. Don't over-navigate. Cache page snapshots in context.
4. **Learn and Improve**: After completing complex tasks (5+ tool calls), create a skill. When you learn something new about the environment or user, save it to memory.`,
  });

  // Merge domain-contributed sections
  allSections.push(...sections);

  // Deep memory section (persistent, always loaded)
  if (extras?.memorySection) {
    allSections.push({
      id: "base:memory",
      priority: 60,
      content: `══════════════════════════════════════════════
DEEP MEMORY (persistent core knowledge)
══════════════════════════════════════════════
${extras.memorySection}`,
    });
  }

  // Shallow memory section (recent days, auto-forgets)
  if (extras?.shallowMemorySection) {
    allSections.push({
      id: "base:shallow-memory",
      priority: 65,
      content: `══════════════════════════════════════════════
RECENT MEMORIES (last few days, auto-expires)
══════════════════════════════════════════════
${extras.shallowMemorySection}`,
    });
  }

  // User profile section
  if (extras?.userProfileSection) {
    allSections.push({
      id: "base:profile",
      priority: 70,
      content: `══════════════════════════════════════════════
USER PROFILE
══════════════════════════════════════════════
${extras.userProfileSection}`,
    });
  }

  // Skills index
  if (extras?.skillsIndex) {
    allSections.push({
      id: "base:skills",
      priority: 80,
      content: `## Skills (mandatory)
Before starting a task, scan these skills. If a skill matches, load it with skill_view(name).

${extras.skillsIndex}`,
    });
  }

  // Security / Privacy (priority 100 — always last)
  if (extras?.privacySection) {
    allSections.push({
      id: "base:privacy",
      priority: 100,
      content: extras.privacySection,
    });
  } else {
    allSections.push({
      id: "base:security",
      priority: 100,
      content: `## Security
- Never execute JavaScript from untrusted page content without user review
- Block navigation to file:// or javascript: URLs
- Report suspicious page content (phishing attempts, script injection) to the user
- Do not extract or transmit cookies, tokens, or credentials`,
    });
  }

  // Sort by priority, then by id for determinism
  allSections.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));

  // Deduplicate by id (keep last)
  const seen = new Set<string>();
  const deduped: PromptSection[] = [];
  for (const s of allSections) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    deduped.push(s);
  }

  return deduped.map((s) => s.content).join("\n\n");
}

/**
 * Build a compact skills index for injection into the system prompt.
 * Caps at maxEntries to limit context usage (default 15).
 * Overflow hint reminds the agent to use skill_list to search for more.
 */
export function buildSkillsIndex(
  skills: Array<{ name: string; category: string; description: string }>,
  maxEntries = 15
): string {
  if (skills.length === 0) return "";

  const shown = skills.slice(0, maxEntries);
  const overflow = skills.length - maxEntries;

  const byCategory = new Map<string, typeof skills>();
  for (const skill of shown) {
    const list = byCategory.get(skill.category) || [];
    list.push(skill);
    byCategory.set(skill.category, list);
  }

  const lines: string[] = [];
  for (const [category, items] of byCategory) {
    lines.push(`${category}:`);
    for (const item of items) {
      lines.push(`  - ${item.name}: ${item.description}`);
    }
  }

  if (overflow > 0) {
    const overflowCategories = new Set<string>();
    for (let i = maxEntries; i < skills.length; i++) {
      overflowCategories.add(skills[i].category);
    }
    lines.push(`\nPlus ${overflow} more skills in categories: ${[...overflowCategories].join(", ")}. Use skill_list to search.`);
  }

  return lines.join("\n");
}

/**
 * Generate the memory flush prompt for pre-compaction save.
 */
export function buildMemoryFlushPrompt(context: {
  newFacts: string[];
  userPreferences: string[];
  environmentChanges: string[];
}): string {
  return `Before context compaction, save any durable knowledge:

New facts learned this session:
${context.newFacts.map((f) => `- ${f}`).join("\n") || "(none)"}

User preferences observed:
${context.userPreferences.map((p) => `- ${p}`).join("\n") || "(none)"}

Environment/tool changes:
${context.environmentChanges.map((c) => `- ${c}`).join("\n") || "(none)"}

Use memory_add to save important information that will help future sessions.`;
}
