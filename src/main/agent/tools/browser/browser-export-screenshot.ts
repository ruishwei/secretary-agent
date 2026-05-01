import fs from "node:fs";
import path from "node:path";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import { BROWSER_EXPORT_SCREENSHOT } from "../../../../shared/tool-schemas";
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

export function executeBrowserExportScreenshot(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_EXPORT_SCREENSHOT,
    async execute(args) {
      const filePath = args.filePath as string | undefined;
      const tabId = args.tabId as string | undefined;

      const dest = resolvePath(filePath, "png", browser, tabId);

      const dataUrl = await browser.screenshot(tabId);
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(dest, Buffer.from(base64, "base64"));

      const size = fs.statSync(dest).size;
      return {
        success: true,
        result: `Screenshot saved to ${dest} (${(size / 1024).toFixed(1)} KB)`,
      };
    },
  };
}
