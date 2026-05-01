import { BROWSER_GET_PAGE_STATE } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserGetPageState(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_GET_PAGE_STATE,
    async execute(args) {
      const tabId = args.tabId as string | undefined;
      const pageState = browser.getPageState(tabId);
      const snapshot = await browser.getSnapshot(false, tabId);
      const resolvedTabId = tabId || browser.getActiveSession()?.tabId || "unknown";
      const isActive = !tabId || tabId === browser.getActiveSession()?.tabId;
      return {
        success: true,
        result: JSON.stringify(
          {
            tabId: resolvedTabId,
            active: isActive,
            url: pageState.url,
            title: pageState.title,
            isLoading: pageState.isLoading,
            elementCount: snapshot.nodes.size,
          },
          null,
          2
        ),
        snapshot: snapshot.text,
      };
    },
  };
}
