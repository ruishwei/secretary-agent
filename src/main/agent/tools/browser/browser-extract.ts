import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import { BROWSER_EXTRACT } from "../../../../shared/tool-schemas";

const MAX_CHARS = 15000;

export function executeBrowserExtract(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_EXTRACT,
    async execute(args) {
      const what = args.what as string;
      const tabId = args.tabId as string | undefined;

      // Fetch body text + shallow AXTree in parallel — no LLM call
      const [bodyText, snapshot] = await Promise.all([
        browser.evaluateJs("document.body.innerText", tabId).catch(() => ""),
        browser.getSnapshot(false, tabId),
      ]);

      // Strip JSON quotes from evaluateJs result if present
      let textContent = bodyText;
      if (textContent.startsWith('"') && textContent.endsWith('"')) {
        textContent = JSON.parse(textContent);
      }

      // Combine and truncate: body text (primary) + interactive elements (structure)
      let pageText = `### Page Text\n${textContent}\n\n### Interactive Elements\n${snapshot.text}`;
      if (pageText.length > MAX_CHARS) {
        const half = Math.floor(MAX_CHARS / 2);
        pageText = pageText.slice(0, half) + "\n... (truncated: middle)\n" + pageText.slice(-half);
      }

      const elementCount = snapshot.nodes.size;

      return {
        success: true,
        result: `Extraction target: ${what}\nElements: ${elementCount}\n\n${pageText}`,
        snapshot: snapshot.text,
      };
    },
  };
}
