import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import { BROWSER_LIST_TABS } from "../../../../shared/tool-schemas";

export function executeBrowserListTabs(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_LIST_TABS,
    async execute(_args) {
      const tabs = browser.getAllTabs();
      if (tabs.length === 0) {
        return { success: true, result: "No open tabs." };
      }
      const lines = tabs.map((t) =>
        `${t.isActive ? "> " : "  "}[${t.tabId}] ${t.title || "(no title)"} — ${t.url}${t.isActive ? " (active)" : ""}`
      );
      return { success: true, result: `${tabs.length} tab(s):\n${lines.join("\n")}` };
    },
  };
}
