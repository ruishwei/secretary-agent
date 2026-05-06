import { Logger } from "../utils/logger";
import type { TabSession } from "./browser-manager";

const logger = new Logger("Recorder");

// ---- Types ----

export interface RecordedAction {
  type: "navigate" | "click" | "input" | "select" | "scroll" | "submit";
  timestamp: number;
  /** Full URL at time of action. */
  url?: string;
  /** Page title at time of action. */
  pageTitle?: string;
  /** Visible text label (from aria-label, associated label, placeholder, etc.). */
  label?: string;
  /** Computed ARIA role or implicit HTML role. */
  role?: string;
  /** Tag name in lowercase. */
  tagName?: string;
  /** CSS selector (best-effort, NOT for agent use — for debugging only). */
  selector?: string;
  /** Nearest preceding heading text (h1-h6) for context. */
  nearbyHeading?: string;
  /** For input/select: the entered/selected value. */
  value?: string;
  /** For input: the input type (text, email, password, etc.). */
  inputType?: string;
  /** For select: the option text that was chosen. */
  selectedOption?: string;
  /** For scroll: direction. */
  direction?: string;
  /** For scroll: scroll depth percentage. */
  scrollDepth?: string;
  /** The visible text content of the element (truncated). */
  textContent?: string;
  /** The element's name attribute or id. */
  elementName?: string;
}

export interface RecordingSession {
  startedAt: number;
  startUrl: string;
  startTitle: string;
  /** AXTree snapshot at recording start (JSON string). */
  startSnapshot?: string;
  /** AXTree snapshot at recording stop (JSON string). */
  endSnapshot?: string;
  actions: RecordedAction[];
  tabId: string;
}

// ---- Content script injected into the webview ----

const RECORDER_INJECT_SCRIPT = `
(function () {
  if (window.__recorderActive) return;
  window.__recorderActive = true;
  window.__recorderEvents = [];
  window.__recorderLastClick = null;

  // ---- Element describer: builds agent-friendly semantic description ----

  function describe(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    if (el.closest('[data-recorder-ignore]')) return null;

    var tag = el.tagName.toLowerCase();

    // Resolve the visible label using multiple strategies
    var label = '';
    // 1. aria-label
    label = el.getAttribute('aria-label') || '';
    // 2. Associated <label for="id">
    if (!label && el.id) {
      var lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lbl) label = lbl.textContent.trim();
    }
    // 3. Wrapping <label>
    if (!label) {
      var wrapper = el.closest('label');
      if (wrapper) {
        label = wrapper.textContent.trim();
        // Remove the input's own value from the label text
        if (el.value) label = label.replace(el.value, '').trim();
        if (el.textContent) label = label.replace(el.textContent, '').trim();
      }
    }
    // 4. placeholder
    if (!label) label = el.getAttribute('placeholder') || '';
    // 5. title attribute
    if (!label) label = el.getAttribute('title') || '';
    // 6. preceding sibling text
    if (!label) {
      var prev = el.previousElementSibling;
      if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN' || prev.tagName === 'DIV')) {
        var t = prev.textContent.trim();
        if (t.length < 80) label = t;
      }
    }
    // 7. For buttons/links: their own text
    if (!label && (tag === 'button' || tag === 'a')) {
      label = (el.textContent || '').trim().substring(0, 80);
    }

    // Resolve ARIA role
    var role = el.getAttribute('role') || '';
    if (!role) {
      // Implicit roles
      var type = (el.getAttribute('type') || '').toLowerCase();
      if (tag === 'button' || (tag === 'input' && (type === 'button' || type === 'submit' || type === 'reset'))) role = 'button';
      else if (tag === 'a' && el.href) role = 'link';
      else if (tag === 'input' && type === 'checkbox') role = 'checkbox';
      else if (tag === 'input' && type === 'radio') role = 'radio';
      else if ((tag === 'input' && type !== 'hidden' && type !== 'submit' && type !== 'button' && type !== 'reset' && type !== 'checkbox' && type !== 'radio') || tag === 'textarea') role = 'textbox';
      else if (tag === 'select') role = 'combobox';
      else if (tag === 'img') role = 'img';
      else role = tag;
    }

    // Find nearest heading for context
    var heading = '';
    var headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    var bestDist = Infinity;
    var elRect = el.getBoundingClientRect();
    for (var i = 0; i < headings.length; i++) {
      var hRect = headings[i].getBoundingClientRect();
      if (hRect.top < elRect.top && hRect.bottom < elRect.bottom) {
        var dist = elRect.top - hRect.bottom;
        if (dist >= 0 && dist < bestDist) {
          bestDist = dist;
          heading = headings[i].textContent.trim().substring(0, 80);
        }
      }
    }

    // CSS selector (best-effort, for debugging)
    var sel = tag;
    if (el.id) sel += '#' + el.id;
    else if (el.className && typeof el.className === 'string') {
      var cls = el.className.trim().split(/\\s+/).filter(function(c) { return c.length > 0 && c.length < 30; }).slice(0, 2).join('.');
      if (cls) sel += '.' + cls;
    }

    return {
      label: label.substring(0, 150),
      role: role,
      tagName: tag,
      selector: sel,
      textContent: (el.textContent || '').trim().substring(0, 150),
      elementName: el.getAttribute('name') || el.id || '',
      inputType: el.getAttribute('type') || '',
      nearbyHeading: heading
    };
  }

  // ---- Event listeners (capture phase, debounced) ----

  document.addEventListener('click', function (e) {
    var info = describe(e.target);
    if (!info) return;

    // Deduplicate rapid clicks on the same element (double-click)
    var now = Date.now();
    var last = window.__recorderLastClick;
    if (last && last.selector === info.selector && (now - last.time) < 600) {
      window.__recorderLastClick = null;
      return; // Skip double-click
    }
    window.__recorderLastClick = { selector: info.selector, time: now };

    window.__recorderEvents.push({
      type: 'click',
      timestamp: now,
      url: location.href,
      pageTitle: document.title,
      label: info.label,
      role: info.role,
      tagName: info.tagName,
      selector: info.selector,
      textContent: info.textContent,
      elementName: info.elementName,
      nearbyHeading: info.nearbyHeading
    });
  }, true);

  // Track input/change with debounce (capture final value after typing pause)
  var inputTimers = {};
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.tagName) return;
    var tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'textarea') return;

    var info = describe(el);
    if (!info) return;

    var key = info.selector || info.elementName || 'unknown';
    clearTimeout(inputTimers[key]);
    inputTimers[key] = setTimeout(function () {
      delete inputTimers[key];
      window.__recorderEvents.push({
        type: 'input',
        timestamp: Date.now(),
        url: location.href,
        pageTitle: document.title,
        label: info.label,
        role: info.role,
        tagName: info.tagName,
        selector: info.selector,
        value: (el.value || '').substring(0, 500),
        inputType: info.inputType,
        elementName: info.elementName,
        nearbyHeading: info.nearbyHeading
      });
    }, 600); // Wait for 600ms pause
  }, true);

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.tagName) return;
    var tag = el.tagName.toLowerCase();
    // Only for select/checkbox/radio — text inputs handled by 'input' above
    if (tag !== 'select' && tag !== 'input') return;
    if (tag === 'input') {
      var type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type !== 'checkbox' && type !== 'radio') return;
    }

    var info = describe(el);
    if (!info) return;

    var val = '';
    if (tag === 'select') {
      val = el.options && el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : (el.value || '');
    } else {
      val = el.checked ? 'checked' : 'unchecked';
    }

    window.__recorderEvents.push({
      type: tag === 'select' ? 'select' : 'input',
      timestamp: Date.now(),
      url: location.href,
      pageTitle: document.title,
      label: info.label,
      role: info.role,
      tagName: info.tagName,
      selector: info.selector,
      value: val.substring(0, 500),
      selectedOption: tag === 'select' ? val : undefined,
      inputType: info.inputType,
      elementName: info.elementName,
      nearbyHeading: info.nearbyHeading
    });
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.tagName) return;
    window.__recorderEvents.push({
      type: 'submit',
      timestamp: Date.now(),
      url: location.href,
      pageTitle: document.title,
      tagName: 'form',
      selector: form.id ? 'form#' + form.id : 'form',
      label: (form.getAttribute('aria-label') || 'form')
    });
  }, true);

  // Scroll tracking (only record significant scrolls)
  var scrollTimer = null;
  var lastScrollPct = 0;
  window.addEventListener('scroll', function () {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      var pct = Math.round((window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1)) * 100);
      // Only record if scrolled significantly (> 30% of page) from last recorded position
      if (Math.abs(pct - lastScrollPct) > 30 && pct > 15) {
        lastScrollPct = pct;
        window.__recorderEvents.push({
          type: 'scroll',
          timestamp: Date.now(),
          url: location.href,
          pageTitle: document.title,
          direction: 'down',
          scrollDepth: pct + '%'
        });
      }
    }, 2000); // 2-second debounce
  }, { passive: true });
})();
`;

// ---- LLM synthesis prompt builder (static, no external deps) ----

export function buildSynthesisPrompt(session: RecordingSession): string {
  const actionLines = session.actions.map((a, i) => {
    const ts = new Date(a.timestamp).toISOString().substring(11, 23);
    const context = [
      a.nearbyHeading ? `section: "${a.nearbyHeading}"` : "",
      a.pageTitle ? `title: "${a.pageTitle}"` : "",
    ].filter(Boolean).join(", ");

    switch (a.type) {
      case "navigate":
        return `${i + 1}. [${ts}] NAVIGATE to ${a.url} (${a.pageTitle || ""})`;
      case "click":
        return `${i + 1}. [${ts}] CLICK <${a.role || a.tagName}> "${a.label || a.textContent || "unnamed"}" — selector: ${a.selector}${context ? ` [${context}]` : ""}`;
      case "input":
        return `${i + 1}. [${ts}] TYPE "${a.value || ""}" into <${a.role || "textbox"}> "${a.label || a.elementName || "field"}" — selector: ${a.selector}${context ? ` [${context}]` : ""}`;
      case "select":
        return `${i + 1}. [${ts}] SELECT "${a.selectedOption || a.value || ""}" from <combobox> "${a.label || a.elementName || "dropdown"}" — selector: ${a.selector}${context ? ` [${context}]` : ""}`;
      case "scroll":
        return `${i + 1}. [${ts}] SCROLL down to ${a.scrollDepth || "further"}${context ? ` [${context}]` : ""}`;
      case "submit":
        return `${i + 1}. [${ts}] SUBMIT form — selector: ${a.selector}${context ? ` [${context}]` : ""}`;
      default:
        return `${i + 1}. [${ts}] ${a.type}`;
    }
  });

  return `You are creating a reusable skill for an AI browser agent. Analyze the recorded user actions below and produce a polished SKILL.md that teaches the agent how to perform this workflow autonomously.

## The Agent's Tools

The agent has these tools:
- \`browser_navigate(url)\` — navigate to a URL
- \`browser_snapshot(full=true)\` — get accessibility tree with @ref IDs for all interactive elements
- \`browser_click(ref)\` — click element by @ref ID
- \`browser_type(ref, text)\` — type into field by @ref ID
- \`browser_fill_form({fields})\` — fill multiple form fields by label matching
- \`browser_wait(text)\` — wait for text to appear on page
- \`browser_scroll(direction)\` — scroll page
- \`browser_extract(what)\` — extract structured data from page
- \`browser_request_review(reason, reviewType)\` — request user approval before submission

## Context

- Start URL: ${session.startUrl}
- Start page title: ${session.startTitle}
- Total actions captured: ${session.actions.length}
- Recording duration: ${Math.round((Date.now() - session.startedAt) / 1000)}s

## Recorded User Actions

${actionLines.join("\n")}

## Instructions

1. Identify the high-level goal of this workflow (what is the user trying to accomplish?)
2. Group related actions into logical steps. For example, multiple inputs in a form = one "fill form" step.
3. For each step, describe elements by their VISIBLE LABEL, ROLE, or TEXT (e.g., 'click the "Sign In" button', NOT 'click button.btn-primary'). The agent sees an accessibility tree with element names and roles — it does NOT use CSS selectors.
4. Mark steps where browser_request_review is needed (form submissions, purchases, deletions).
5. Note any wait conditions after navigations or dynamic content loads.
6. Include practical tips and common pitfalls for this specific website.

Return ONLY valid SKILL.md markdown with YAML frontmatter in this format:

\`\`\`markdown
---
name: <kebab-case-name>
category: <logical-group>
description: <one-line description of what this skill accomplishes>
version: 1.0.0
---

# <Title>

## Goal
<1-2 sentences>

## Prerequisites
- <any required accounts, data, or conditions>

## Workflow

1. **Navigate** to \`<url>\` using \`browser_navigate\`
2. **Wait** for \`<text>\` to appear using \`browser_wait\`
3. ...

## Tips
- <practical advice>
- <common pitfalls to avoid>
\`\`\``;
}

// ---- OperationRecorder class ----

export class OperationRecorder {
  private activeSession: RecordingSession | null = null;
  private onSkillSave?: (name: string, category: string, content: string) => Promise<void>;
  private onLLMSynthesis?: (prompt: string) => Promise<string>;
  /** Pending skill content awaiting user review. */
  pendingSkillContent: string | null = null;
  pendingSkillName: string | null = null;

  /** Callback for saving a generated skill to disk (wired to SkillManager). */
  setSkillSaveCallback(cb: (name: string, category: string, content: string) => Promise<void>): void {
    this.onSkillSave = cb;
  }

  /** Callback for LLM synthesis (wired to LLMClient.simpleQuery). */
  setLLMSynthesisCallback(cb: (prompt: string) => Promise<string>): void {
    this.onLLMSynthesis = cb;
  }

  get isRecording(): boolean {
    return this.activeSession !== null;
  }

  get currentSession(): RecordingSession | null {
    return this.activeSession;
  }

  /** Start recording on a tab. Injects DOM listener + captures start snapshot. */
  async start(session: TabSession): Promise<void> {
    if (this.activeSession) {
      logger.warn("Already recording, stopping previous session");
      await this.stop(session);
    }

    const url = session.url;
    const title = session.title;

    // Capture start snapshot via CDP
    let startSnapshot: string | undefined;
    try {
      const axSnapshot = await session.getSnapshot(true);
      startSnapshot = JSON.stringify(axSnapshot);
    } catch (err: any) {
      logger.warn(`Could not capture start snapshot: ${err.message}`);
    }

    this.activeSession = {
      startedAt: Date.now(),
      startUrl: url,
      startTitle: title,
      startSnapshot,
      actions: [],
      tabId: session.tabId,
    };

    try {
      await session.webContents.executeJavaScript(RECORDER_INJECT_SCRIPT);
      logger.info(`Recording started on tab ${session.tabId} at ${url}`);
    } catch (err: any) {
      logger.error(`Failed to inject recorder script: ${err.message}`);
      this.activeSession = null;
      throw err;
    }
  }

  /** Stop recording, retrieve captured events, capture end snapshot, and clean up. */
  async stop(session: TabSession): Promise<RecordingSession | null> {
    if (!this.activeSession) return null;

    const recording = this.activeSession;

    // Capture end snapshot via CDP
    try {
      const axSnapshot = await session.getSnapshot(true);
      recording.endSnapshot = JSON.stringify(axSnapshot);
    } catch (err: any) {
      logger.warn(`Could not capture end snapshot: ${err.message}`);
    }

    // Retrieve captured events from the page
    try {
      const eventsJson = await session.webContents.executeJavaScript(
        "JSON.stringify(window.__recorderEvents || [])",
      );
      const events: RecordedAction[] = JSON.parse(eventsJson);
      recording.actions = this.postProcessActions(events);

      // Clean up the injected script
      await session.webContents.executeJavaScript(`
        window.__recorderActive = false;
        delete window.__recorderEvents;
        delete window.__recorderLastClick;
      `).catch(() => {});
    } catch (err: any) {
      logger.error(`Failed to retrieve recorded events: ${err.message}`);
    }

    this.activeSession = null;
    logger.info(`Recording stopped: ${recording.actions.length} actions captured`);
    return recording;
  }

  /** Synthesize a polished skill from the recording using LLM. */
  async synthesizeSkill(
    session: RecordingSession,
    customDescription?: string,
  ): Promise<{ success: boolean; skillName?: string; content?: string; actionCount: number; error?: string }> {
    if (session.actions.length === 0) {
      return { success: false, actionCount: 0, error: "No recorded actions to synthesize" };
    }

    if (!this.onLLMSynthesis) {
      return { success: false, actionCount: session.actions.length, error: "No LLM synthesis callback configured" };
    }

    try {
      const prompt = buildSynthesisPrompt(session);
      const llmResponse = await this.onLLMSynthesis(prompt);

      // Extract SKILL.md content from LLM response (may be wrapped in ```)
      const codeBlockMatch = llmResponse.match(/```(?:markdown)?\s*([\s\S]*?)```/);
      const skillContent = codeBlockMatch ? codeBlockMatch[1].trim() : llmResponse.trim();

      // Extract name from YAML frontmatter
      const nameMatch = skillContent.match(/^name:\s*(.+)$/m);
      const skillName = nameMatch ? nameMatch[1].trim() : "recorded-workflow";

      // Store pending for user review (NOT auto-saved)
      this.pendingSkillContent = skillContent;
      this.pendingSkillName = skillName;

      logger.info(`Skill "${skillName}" synthesized via LLM — awaiting user review (${session.actions.length} actions)`);

      return { success: true, skillName, content: skillContent, actionCount: session.actions.length };
    } catch (err: any) {
      return { success: false, actionCount: session.actions.length, error: `LLM synthesis failed: ${err.message}` };
    }
  }

  /** Commit the pending skill to disk after user approval. */
  async commitPendingSkill(): Promise<{ success: boolean; error?: string }> {
    if (!this.pendingSkillContent || !this.pendingSkillName) {
      return { success: false, error: "No pending skill to commit" };
    }
    if (!this.onSkillSave) {
      return { success: false, error: "No skill save callback configured" };
    }
    try {
      await this.onSkillSave(this.pendingSkillName, "recorded", this.pendingSkillContent);
      logger.info(`Skill "${this.pendingSkillName}" saved after user review`);
      this.pendingSkillContent = null;
      this.pendingSkillName = null;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /** Discard the pending skill after user rejection. */
  discardPendingSkill(): void {
    this.pendingSkillContent = null;
    this.pendingSkillName = null;
    logger.info("Pending skill discarded by user");
  }

  /** Cancel the current recording without saving. */
  cancel(session: TabSession): void {
    if (this.activeSession) {
      session.webContents.executeJavaScript(`
        window.__recorderActive = false;
        delete window.__recorderEvents;
        delete window.__recorderLastClick;
      `).catch(() => {});
      this.activeSession = null;
      logger.info("Recording cancelled");
    }
  }

  // ---- Private ----

  /** Post-process raw events: merge, deduplicate, filter noise. */
  private postProcessActions(raw: RecordedAction[]): RecordedAction[] {
    if (raw.length === 0) return [];

    const cleaned: RecordedAction[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < raw.length; i++) {
      const a = raw[i];

      // Skip non-meaningful events
      if (a.type === "click") {
        if (!a.label && !a.textContent) continue; // No way to describe the target
      }
      if (a.type === "scroll" && i > 0) {
        // Merge consecutive scrolls — keep only the last one
        const next = raw[i + 1];
        if (next && next.type === "scroll") continue;
      }

      // Deduplicate based on fingerprint
      const fp = `${a.type}|${a.selector || ""}|${a.label || ""}|${a.value || ""}`;
      if (seen.has(fp)) continue;
      seen.add(fp);

      cleaned.push(a);
    }

    return cleaned;
  }
}
