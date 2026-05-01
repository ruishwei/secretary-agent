import fs from "node:fs";
import path from "node:path";
import TurndownService from "turndown";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import { BROWSER_EXPORT_MARKDOWN } from "../../../../shared/tool-schemas";
import { getConfig } from "../../../utils/config";

function resolvePath(filePath: string | undefined, ext: string, browser: BrowserManager, tabId?: string): string {
  if (filePath) return filePath;

  const exportsDir = path.join(getConfig().userDataPath, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });

  const session = tabId ? browser.getSession(tabId) : browser.getActiveSession();
  const domain = session ? new URL(session.url).hostname : "page";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(exportsDir, `${domain}_${ts}.${ext}`);
}

export function executeBrowserExportMarkdown(browser: BrowserManager, turndown: TurndownService): ToolHandler {
  return {
    definition: BROWSER_EXPORT_MARKDOWN,
    async execute(args) {
      const filePath = args.filePath as string | undefined;
      const tabId = args.tabId as string | undefined;

      const dest = resolvePath(filePath, "md", browser, tabId);

      const html = await browser.getPageHtml(tabId);
      const markdown = turndown.turndown(html);

      // Add source URL as reference
      const session = tabId ? browser.getSession(tabId) : browser.getActiveSession();
      const header = session ? `> Source: ${session.url}\n> Title: ${session.title}\n> Exported: ${new Date().toISOString()}\n\n` : "";

      fs.writeFileSync(dest, header + markdown, "utf-8");

      const size = fs.statSync(dest).size;
      return {
        success: true,
        result: `Page content saved as Markdown to ${dest} (${(size / 1024).toFixed(1)} KB)`,
      };
    },
  };
}
