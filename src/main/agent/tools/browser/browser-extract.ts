import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import type { LLMClient } from "../../llm-client";
import { BROWSER_EXTRACT } from "../../../../shared/tool-schemas";

const MAX_SNAPSHOT_CHARS = 15000;

export function executeBrowserExtract(browser: BrowserManager, llm: LLMClient): ToolHandler {
  return {
    definition: BROWSER_EXTRACT,
    async execute(args) {
      const what = args.what as string;
      const tabId = args.tabId as string | undefined;
      const snapshot = await browser.getSnapshot(true, tabId);

      // Truncate snapshot text to prevent LLM timeouts on complex pages
      let pageText = snapshot.text;
      if (pageText.length > MAX_SNAPSHOT_CHARS) {
        pageText = pageText.slice(0, MAX_SNAPSHOT_CHARS) + "\n... (truncated)";
      }

      const systemPrompt = `You are a precise data extraction tool. Extract the requested information from the page content provided. Return ONLY valid JSON — no markdown, no explanation, no code fences. If the data is not found, return {"error": "not found"}. Use the exact format the user requests.`;

      const userMessage = `Page content (accessibility tree text representation):
${pageText}

Extract this information: ${what}`;

      try {
        const answer = await llm.simpleQuery(systemPrompt, userMessage);
        return { success: true, result: answer, snapshot: snapshot.text };
      } catch (err: any) {
        return {
          success: false,
          result: "",
          error: `Extraction failed: ${err.message}`,
        };
      }
    },
  };
}
