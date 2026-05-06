import fs from "node:fs";
import path from "node:path";
import type { ToolHandler } from "../../../../main/agent/tool-executor";
import type { BrowserManager } from "../../../../main/browser/browser-manager";
import { BROWSER_EXPORT_HTML } from "../../../../shared/tool-schemas";
import { getConfig } from "../../../../main/utils/config";

function resolvePath(filePath: string | undefined, ext: string, browser: BrowserManager, tabId?: string): string {
  if (filePath) return filePath;

  const exportsDir = path.join(getConfig().userDataPath, "exports");
  fs.mkdirSync(exportsDir, { recursive: true });

  const session = tabId ? browser.getSession(tabId) : browser.getActiveSession();
  const domain = session ? new URL(session.url).hostname : "page";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return path.join(exportsDir, `${domain}_${ts}.${ext}`);
}

export function executeBrowserExportHtml(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_EXPORT_HTML,
    async execute(args) {
      const filePath = args.filePath as string | undefined;
      const tabId = args.tabId as string | undefined;

      const dest = resolvePath(filePath, "html", browser, tabId);
      const html = await browser.getPageHtml(tabId);

      // Wrap in a basic HTML structure if the page doesn't have one
      const wrapped = html.includes("<!DOCTYPE") || html.includes("<html")
        ? html
        : `<!DOCTYPE html>\n<html><head><meta charset="utf-8"></head><body>${html}</body></html>`;

      fs.writeFileSync(dest, wrapped, "utf-8");

      const size = fs.statSync(dest).size;
      return {
        success: true,
        result: `Page HTML saved to ${dest} (${(size / 1024).toFixed(1)} KB)`,
      };
    },
  };
}
