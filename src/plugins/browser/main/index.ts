/**
 * Browser Plugin — wraps BrowserManager, tools, state provider, and IPC handlers
 * into the Plugin interface for the core framework.
 *
 * This is the single entry point. The core framework calls init → enable → disable → cleanup.
 */
import type { Plugin, PluginContext, PluginToolContext } from "../../../main/core/plugin";
import type { ToolHandler } from "../../../main/agent/tool-executor";
import { BrowserManager } from "../../../main/browser/browser-manager";
import { BrowserStateProvider } from "../../../main/browser/browser-state-provider";
import { registerBrowserTools } from "../../../main/agent/tools/browser/register-browser-tools";

export function createBrowserPlugin(): Plugin {
  let browserManager: BrowserManager;
  let stateProvider: BrowserStateProvider;

  return {
    manifest: {
      id: "browser",
      name: "Browser",
      version: "1.0.0",
      description: "Web browser automation with CDP integration",
    },

    stateProviders: [], // populated after init

    toolFactories: [
      (ctx: PluginToolContext): ToolHandler[] => {
        const handlers: ToolHandler[] = [];
        const toolExecutor = { register: (h: ToolHandler) => handlers.push(h) } as any;
        registerBrowserTools(toolExecutor, {
          browser: browserManager,
          llmClient: ctx.llmClient,
          sendToRenderer: ctx.sendToRenderer,
        });
        return handlers;
      },
    ],

    uiContributions: {
      panels: [
        { containerId: "main", id: "browser:tab-bar", title: "Tab Bar", order: 0 },
        { containerId: "main", id: "browser:address-bar", title: "Address Bar", order: 1 },
        { containerId: "main", id: "browser:browser-view", title: "Browser View", order: 2 },
      ],
      settingsSections: [
        { id: "browser", title: "Browser", order: 30 },
      ],
    },

    async init(ctx: PluginContext) {
      browserManager = new BrowserManager();
      stateProvider = new BrowserStateProvider(browserManager);
      this.stateProviders = [stateProvider];

      // Wire state push callback so tab navigation events reach the renderer
      browserManager.setStatePushCallback((state) => {
        ctx.sendToRenderer("browser:state-changed", state);
      });

      // Wire popup callback: create a new tab + notify renderer
      browserManager.setPopupCallback((tabId, url, sourceTabId) => {
        browserManager.createTab(tabId, url);
        browserManager.setActiveTab(tabId);
        ctx.sendToRenderer("browser:popup-open", { tabId, url, sourceTabId });
        ctx.sendToRenderer("browser:tab-list-changed", {
          tabs: browserManager.getAllTabs(),
          activeTabId: tabId,
        });
      });
    },

    async enable() {
      const { BrowserWindow } = await import("electron");
      const win = BrowserWindow.getAllWindows()[0];
      if (win) browserManager.setMainWindow(win);
      await browserManager.initialize();
      if (browserManager.tabCount === 0) {
        browserManager.createTab("tab-initial");
      }
    },

    async disable() {
      browserManager.cleanup();
    },

    async cleanup() {
      browserManager.cleanup();
    },
  };
}
