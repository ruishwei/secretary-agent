import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import { BROWSER_SWITCH_TAB } from "../../../../shared/tool-schemas";

export function executeBrowserSwitchTab(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_SWITCH_TAB,
    async execute(args) {
      const tabId = args.tabId as string | undefined;
      const match = args.match as string | undefined;

      if (tabId) {
        const session = browser.getSession(tabId);
        if (!session) return { success: false, result: "", error: `Tab ${tabId} not found` };
        browser.setActiveTab(tabId);
        const snapshot = await session.getSnapshot();
        return {
          success: true,
          result: `Switched to tab ${tabId}: ${session.title} — ${session.url}`,
          snapshot: snapshot.text,
        };
      }

      if (match) {
        const found = browser.findTab(match);
        if (!found) return { success: false, result: "", error: `No tab matching "${match}"` };
        browser.setActiveTab(found);
        const session = browser.getSession(found)!;
        const snapshot = await session.getSnapshot();
        return {
          success: true,
          result: `Switched to tab ${found}: ${session.title} — ${session.url}`,
          snapshot: snapshot.text,
        };
      }

      return { success: false, result: "", error: "Provide tabId or match to switch tabs" };
    },
  };
}
