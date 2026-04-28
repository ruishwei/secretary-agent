import { BROWSER_GET_PAGE_STATE } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserGetPageState(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_GET_PAGE_STATE,
    async execute(_args) {
      const pageState = browser.getPageState();
      const snapshot = await browser.getSnapshot(true);
      return {
        success: true,
        result: JSON.stringify(
          {
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
