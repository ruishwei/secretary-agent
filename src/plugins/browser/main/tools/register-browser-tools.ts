import type { ToolExecutor, ToolHandler } from "../../../../main/agent/tool-executor";
import type { ToolFactoryContext } from "../../../../main/agent/state-provider";
import { Logger } from "../../../../main/utils/logger";
import { executeBrowserNavigate } from "./browser-navigate";
import { executeBrowserSnapshot } from "./browser-snapshot";
import { executeBrowserClick } from "./browser-click";
import { executeBrowserType } from "./browser-type";
import { executeBrowserScroll } from "./browser-scroll";
import { executeBrowserBack } from "./browser-back";
import { executeBrowserPress } from "./browser-press";
import { executeBrowserWait } from "./browser-wait";
import { executeBrowserGetPageState } from "./browser-get-page-state";
import { executeBrowserConsole } from "./browser-console";
import { executeBrowserVision } from "./browser-vision";
import { executeBrowserExportScreenshot } from "./browser-export-screenshot";
import { executeBrowserExportHtml } from "./browser-export-html";
import { executeBrowserExportMarkdown } from "./browser-export-markdown";

import { executeBrowserFillForm } from "./browser-fill-form";
import { executeBrowserRequestReview } from "./browser-request-review";
import { executeBrowserNewTab } from "./browser-new-tab";
import { executeBrowserCloseTab } from "./browser-close-tab";
import { executeBrowserSwitchTab } from "./browser-switch-tab";
import { executeBrowserListTabs } from "./browser-list-tabs";
import { executeBrowserTodoWrite } from "./browser-todo-write";
import TurndownService from "turndown";

const logger = new Logger("BrowserTools");

/**
 * Register all 18 browser tools with the given ToolExecutor.
 * Standalone function — no dependency on ToolExecutor internals.
 */
export function registerBrowserTools(executor: ToolExecutor, ctx: ToolFactoryContext): void {
  const browser = ctx.browser!;
  const llm = ctx.llmClient;
  const sendToRenderer = ctx.sendToRenderer;

  const tools: ToolHandler[] = [
    executeBrowserNavigate(browser),
    executeBrowserSnapshot(browser),
    executeBrowserClick(browser),
    executeBrowserType(browser),
    executeBrowserScroll(browser),
    executeBrowserBack(browser),
    executeBrowserPress(browser),
    executeBrowserWait(browser),
    executeBrowserGetPageState(browser),
    executeBrowserConsole(browser),
    executeBrowserVision(browser, llm!),

    executeBrowserFillForm(browser),
    executeBrowserRequestReview(),
    executeBrowserNewTab(browser, (tabId, url) => {
      if (sendToRenderer) {
        sendToRenderer("browser:tab-list-changed", {
          action: "tab-created",
          tabId,
          url,
          tabs: browser.getAllTabs(),
          activeTabId: browser.getActiveSession()?.tabId ?? null,
        });
      }
    }),
    executeBrowserCloseTab(browser),
    executeBrowserSwitchTab(browser),
    executeBrowserListTabs(browser),
    executeBrowserTodoWrite(),

    executeBrowserExportScreenshot(browser),
    executeBrowserExportHtml(browser),
    executeBrowserExportMarkdown(browser, new TurndownService()),
  ];

  for (const tool of tools) {
    executor.register(tool);
  }

  logger.info(`Registered ${tools.length} browser tools`);
}
