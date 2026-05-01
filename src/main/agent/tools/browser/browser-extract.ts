import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import type { LLMClient } from "../../llm-client";
import { BROWSER_EXTRACT } from "../../../../shared/tool-schemas";

const MAX_TEXT_CHARS = 12000;

export function executeBrowserExtract(browser: BrowserManager, llm: LLMClient): ToolHandler {
  return {
    definition: BROWSER_EXTRACT,
    async execute(args) {
      const what = args.what as string;
      const tabId = args.tabId as string | undefined;

      // Get compact body text (fast, small) + lightweight AXTree for structure
      const [bodyText, snapshot] = await Promise.all([
        browser.evaluateJs("document.body.innerText", tabId).catch(() => ""),
        browser.getSnapshot(false, tabId),
      ]);

      // Strip JSON quotes from evaluateJs result if present
      let textContent = bodyText;
      if (textContent.startsWith('"') && textContent.endsWith('"')) {
        textContent = JSON.parse(textContent);
      }

      // Combine: body text (primary) + AXTree summary (structural context)
      let pageText = `### Page Text\n${textContent}\n\n### Interactive Elements\n${snapshot.text}`;
      if (pageText.length > MAX_TEXT_CHARS) {
        const half = Math.floor(MAX_TEXT_CHARS / 2);
        pageText = pageText.slice(0, half) + "\n... (truncated)\n" + pageText.slice(-half);
      }

      const systemPrompt = `You are a precise data extraction tool. Extract the requested information from the page content provided. Return ONLY valid JSON — no markdown, no explanation, no code fences. If the data is not found, return {"error": "not found"}. Use the exact format the user requests.`;

      const userMessage = `Page content:
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
