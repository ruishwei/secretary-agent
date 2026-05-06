import { BROWSER_WAIT } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../../../main/agent/tool-executor";
import type { BrowserManager } from "../../../../main/browser/browser-manager";
import { DEFAULT_WAIT_TIMEOUT_MS } from "../../../../shared/constants";

export function executeBrowserWait(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_WAIT,
    async execute(args) {
      const timeoutMs = (args.timeoutMs as number) || DEFAULT_WAIT_TIMEOUT_MS;
      const text = args.text as string | undefined;
      const tabId = args.tabId as string | undefined;
      const session = browser.resolveSession(tabId);

      if (text) {
        // Wait for page load first (CDP navigation may still be in-flight)
        try {
          const loadResult = await session.cdp.send<any>("Runtime.evaluate", {
            expression: "document.readyState",
            returnByValue: true,
          });
          if (loadResult?.result?.value !== "complete") {
            // Page is still loading — wait up to 10s for it to settle
            const loadStart = Date.now();
            while (Date.now() - loadStart < 10000) {
              await new Promise((r) => setTimeout(r, 500));
              try {
                const r = await session.cdp.send<any>("Runtime.evaluate", {
                  expression: "document.readyState",
                  returnByValue: true,
                });
                if (r?.result?.value === "complete") {
                  await new Promise((r) => setTimeout(r, 500)); // let post-load JS render
                  break;
                }
              } catch {
                // DOM not available yet during navigation
              }
            }
          }
        } catch {
          // CDP may not be available yet — proceed to polling
        }

        // Now poll for the text
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          try {
            const snapshot = await browser.getSnapshot(false, tabId);
            if (snapshot.text.includes(text)) {
              return {
                success: true,
                result: `Found "${text}" on page after ${Date.now() - start}ms.`,
                snapshot: snapshot.text,
              };
            }
          } catch {
            // Transient error during page transition — retry
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        return {
          success: false,
          result: "",
          error: `Timed out waiting for "${text}" after ${timeoutMs}ms.`,
        };
      }

      await new Promise((r) => setTimeout(r, timeoutMs));
      const snapshot = await browser.getSnapshot(false, tabId);
      return {
        success: true,
        result: `Waited ${timeoutMs}ms.`,
        snapshot: snapshot.text,
      };
    },
  };
}
