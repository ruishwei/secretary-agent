import { Logger } from "../utils/logger";

const logger = new Logger("Recorder");

// ---- Types ----

export interface RecordedAction {
  type: "navigate" | "click" | "input" | "select" | "scroll" | "submit";
  timestamp: number;
  url?: string;
  selector?: string;
  tagName?: string;
  textContent?: string;
  fieldLabel?: string;
  fieldName?: string;
  inputType?: string;
  value?: string;
  direction?: string;
}

export interface RecordingSession {
  startedAt: number;
  startUrl: string;
  actions: RecordedAction[];
  tabId: string;
}

// ---- Content script injected into the webview ----

const RECORDER_INJECT_SCRIPT = `
(function () {
  if (window.__recorderActive) return;
  window.__recorderActive = true;
  window.__recorderEvents = [];

  function describe(el) {
    if (!el || el === document.body || el === document.documentElement) return null;
    var label = "";
    // Associated <label>
    if (el.id) {
      var lbl = document.querySelector('label[for="' + el.id + '"]');
      if (lbl) label = lbl.textContent.trim();
    }
    // Wrapping label
    if (!label) {
      var parent = el.closest('label');
      if (parent) label = parent.textContent.trim().replace(el.value || el.textContent || '', '').trim();
    }
    // aria-label
    if (!label) label = el.getAttribute('aria-label') || '';
    // placeholder
    if (!label) label = el.getAttribute('placeholder') || '';
    // name attribute
    var name = el.getAttribute('name') || '';
    // nearby text
    if (!label && !name) {
      var prev = el.previousElementSibling;
      if (prev && (prev.tagName === 'LABEL' || prev.tagName === 'SPAN')) label = prev.textContent.trim();
    }

    // Build a rough CSS selector
    var sel = el.tagName.toLowerCase();
    if (el.id) sel += '#' + el.id;
    else if (el.className && typeof el.className === 'string') {
      var cls = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
      if (cls) sel += '.' + cls;
    }

    return {
      selector: sel,
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || '').trim().substring(0, 120),
      fieldLabel: label.substring(0, 120),
      fieldName: name,
      inputType: el.getAttribute('type') || el.tagName.toLowerCase()
    };
  }

  document.addEventListener('click', function (e) {
    var info = describe(e.target);
    if (!info) return;
    window.__recorderEvents.push({
      type: 'click',
      timestamp: Date.now(),
      url: location.href,
      selector: info.selector,
      tagName: info.tagName,
      textContent: info.textContent,
      fieldLabel: info.fieldLabel
    });
  }, true);

  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.tagName) return;
    var tag = el.tagName.toLowerCase();
    var info = describe(el);
    if (!info) return;
    var val = '';
    if (tag === 'select') {
      val = el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : el.value;
    } else {
      val = el.value || '';
    }
    window.__recorderEvents.push({
      type: tag === 'select' ? 'select' : 'input',
      timestamp: Date.now(),
      url: location.href,
      selector: info.selector,
      tagName: info.tagName,
      fieldLabel: info.fieldLabel,
      fieldName: info.fieldName,
      inputType: info.inputType,
      value: val.substring(0, 500)
    });
  }, true);

  document.addEventListener('submit', function (e) {
    var form = e.target;
    window.__recorderEvents.push({
      type: 'submit',
      timestamp: Date.now(),
      url: location.href,
      selector: form.tagName ? form.tagName.toLowerCase() : 'form',
      tagName: 'form'
    });
  }, true);

  // Track scroll depth changes (debounced)
  var scrollTimeout;
  window.addEventListener('scroll', function () {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(function () {
      scrollTimeout = null;
      var pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (pct > 10) {
        window.__recorderEvents.push({
          type: 'scroll',
          timestamp: Date.now(),
          url: location.href,
          direction: 'down',
          value: pct + '%'
        });
      }
    }, 1500);
  }, { passive: true });
})();
`;

// ---- Skill template generator (static, no external deps) ----

function generateSkillMarkdown(name: string, actions: RecordedAction[], startUrl: string): string {
  const steps: string[] = [];
  const seenUrls = new Set<string>();
  let currentUrl = startUrl;

  steps.push(`1. **Navigate** to the starting page using \`browser_navigate\` with URL: \`${currentUrl}\``);
  seenUrls.add(currentUrl);

  for (const action of actions) {
    // Track URL changes
    if (action.url && !seenUrls.has(action.url) && action.url !== currentUrl) {
      currentUrl = action.url;
      seenUrls.add(currentUrl);
      steps.push(`${steps.length + 1}. **Navigate** to \`${currentUrl}\` using \`browser_navigate\``);
    }

    switch (action.type) {
      case "click":
        if (action.fieldLabel) {
          steps.push(`${steps.length + 1}. **Click** the "${action.fieldLabel}" ${action.tagName || "element"} (selector: \`${action.selector || "N/A"}\`)`);
        } else if (action.textContent) {
          steps.push(`${steps.length + 1}. **Click** the "${action.textContent.substring(0, 80)}" ${action.tagName || "element"} (selector: \`${action.selector || "N/A"}\`)`);
        } else {
          steps.push(`${steps.length + 1}. **Click** the ${action.tagName || "element"} at \`${action.selector || "unknown"}\``);
        }
        break;
      case "input":
        steps.push(`${steps.length + 1}. **Type** "${action.value || ""}" into the "${action.fieldLabel || action.fieldName || action.selector || "field"}" field`);
        break;
      case "select":
        steps.push(`${steps.length + 1}. **Select** "${action.value || ""}" from the "${action.fieldLabel || action.fieldName || "dropdown"}" dropdown`);
        break;
      case "scroll":
        steps.push(`${steps.length + 1}. **Scroll** down to reveal more content${action.value ? ` (scrolled to ${action.value})` : ""}`);
        break;
      case "submit":
        steps.push(`${steps.length + 1}. **Review** the form with \`browser_request_review\` before submission`);
        steps.push(`${steps.length + 1}. **Submit** the form by clicking the submit button`);
        break;
    }
  }

  // Add final step with review reminder
  if (!actions.some((a) => a.type === "submit")) {
    steps.push(`${steps.length + 1}. **Wait** for the result page to load using \`browser_wait\``);
  }

  const now = new Date().toISOString().split("T")[0];
  const skillName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return `---
name: ${skillName}
description: Recorded workflow: ${name}. Auto-generated from user demonstration on ${now}.
version: 1.0.0
---

# ${name}

## Source
This skill was auto-generated from a user's browser actions recorded on ${now}.

## Starting Point
${startUrl}

## Workflow

${steps.join("\n")}

## Notes
- This skill was generated from user actions. Review and adjust @ref IDs after running \`browser_snapshot\`.
- Add \`browser_request_review\` before any form submission or sensitive action.
- Use \`browser_snapshot(full=true)\` at each step to get current @ref IDs for elements.
`;
}

// ---- OperationRecorder class ----

export class OperationRecorder {
  private activeSession: RecordingSession | null = null;
  private onSkillGenerated?: (name: string, category: string, content: string) => Promise<void>;

  /** Register a callback for when a skill is generated (typically saves via SkillManager). */
  setSkillCallback(cb: (name: string, category: string, content: string) => Promise<void>): void {
    this.onSkillGenerated = cb;
  }

  get isRecording(): boolean {
    return this.activeSession !== null;
  }

  get currentSession(): RecordingSession | null {
    return this.activeSession;
  }

  /** Start recording on a tab. Injects a content script to capture DOM events. */
  async start(tabId: string, webContents: Electron.WebContents): Promise<void> {
    if (this.activeSession) {
      logger.warn("Already recording, stopping previous session");
      await this.stop(webContents);
    }

    const url = webContents.getURL();
    this.activeSession = {
      startedAt: Date.now(),
      startUrl: url,
      actions: [],
      tabId,
    };

    try {
      await webContents.executeJavaScript(RECORDER_INJECT_SCRIPT);
      logger.info(`Recording started on tab ${tabId} at ${url}`);
    } catch (err: any) {
      logger.error(`Failed to inject recorder script: ${err.message}`);
      this.activeSession = null;
      throw err;
    }
  }

  /** Stop recording, retrieve captured events, and clean up. */
  async stop(webContents: Electron.WebContents): Promise<RecordingSession | null> {
    if (!this.activeSession) return null;

    const session = this.activeSession;

    try {
      // Retrieve captured events from the page
      const eventsJson = await webContents.executeJavaScript(
        "JSON.stringify(window.__recorderEvents || [])",
      );
      const events: RecordedAction[] = JSON.parse(eventsJson);
      session.actions = events;

      // Clean up the injected script
      await webContents.executeJavaScript(`
        window.__recorderActive = false;
        delete window.__recorderEvents;
      `).catch(() => {});

      logger.info(`Recording stopped: ${events.length} actions captured`);
    } catch (err: any) {
      logger.error(`Failed to retrieve recorded events: ${err.message}`);
    }

    this.activeSession = null;
    return session;
  }

  /** Generate a skill from the recorded session and save via callback. */
  async saveAsSkill(
    name: string,
    category: string,
    session?: RecordingSession,
  ): Promise<{ success: boolean; skillName: string; actionCount: number; error?: string }> {
    const s = session || this.activeSession;
    if (!s || s.actions.length === 0) {
      return { success: false, skillName: "", actionCount: 0, error: "No recorded actions to save" };
    }

    if (!this.onSkillGenerated) {
      return { success: false, skillName: "", actionCount: 0, error: "No skill callback configured" };
    }

    const content = generateSkillMarkdown(name, s.actions, s.startUrl);
    const skillName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    try {
      await this.onSkillGenerated(skillName, category, content);
      logger.info(`Skill "${skillName}" generated from recording (${s.actions.length} actions)`);
      return { success: true, skillName, actionCount: s.actions.length };
    } catch (err: any) {
      return { success: false, skillName, actionCount: s.actions.length, error: err.message };
    }
  }

  /** Cancel the current recording without saving. */
  cancel(webContents: Electron.WebContents): void {
    if (this.activeSession) {
      webContents.executeJavaScript(`
        window.__recorderActive = false;
        delete window.__recorderEvents;
      `).catch(() => {});
      this.activeSession = null;
      logger.info("Recording cancelled");
    }
  }
}
