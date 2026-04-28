import { webContents, BrowserWindow } from "electron";
import { CDPClient } from "./cdp-client";
import { AccessibilityTree, type AXSnapshot } from "./accessibility-tree";
import { Logger } from "../utils/logger";

const logger = new Logger("Browser");

export interface PageState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export class BrowserManager {
  private cdp: CDPClient;
  private axTree: AccessibilityTree;
  private currentUrl = "about:blank";
  private currentTitle = "";
  private currentSnapshot: AXSnapshot | null = null;
  private cleanupFns: Array<() => void> = [];
  private webviewWcId: number | null = null;

  constructor(cdp: CDPClient) {
    this.cdp = cdp;
    this.axTree = new AccessibilityTree(cdp);
  }

  /**
   * Attach CDP to the webview's webContents (called from renderer via IPC).
   */
  async attachToWebview(webContentsId: number): Promise<void> {
    if (this.cdp.isAttached()) {
      this.cdp.detach();
    }

    const wc = webContents.fromId(webContentsId);
    if (!wc) {
      throw new Error(`No webContents found for ID ${webContentsId}`);
    }

    this.webviewWcId = webContentsId;
    this.cdp.attach(wc);
    await this.cdp.enableDomains();

    // Listen for frame navigations
    const unsub = this.cdp.onFrameNavigated((url) => {
      if (url && !url.startsWith("devtools://")) {
        this.currentUrl = url;
        logger.info(`Navigated to: ${url}`);
      }
    });
    this.cleanupFns.push(unsub);
    logger.info(`CDP attached to webview webContents ${webContentsId}`);
  }

  /**
   * Initialize: wait for webview to be ready.
   */
  async initialize(): Promise<void> {
    // The actual CDP attachment happens when the renderer sends us
    // the webview's webContents ID via BROWSER_ATTACH_WEBVIEW IPC.
    // This method is now a no-op placeholder.
    logger.info("BrowserManager initialized, waiting for webview attach...");
  }

  /**
   * Navigate to a URL and return the page snapshot.
   */
  async navigate(url: string): Promise<{ pageState: PageState; snapshot: AXSnapshot }> {
    // Validate URL
    let normalizedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      normalizedUrl = `https://${url}`;
    }

    // Block dangerous URLs
    if (normalizedUrl.startsWith("file://") || normalizedUrl.startsWith("javascript:")) {
      throw new Error(`Blocked URL: ${normalizedUrl}`);
    }

    logger.info(`Navigating to: ${normalizedUrl}`);

    // Navigate via CDP
    await this.cdp.send("Page.navigate", { url: normalizedUrl });

    // Wait for page to load
    await this.waitForLoad();

    // Get page title
    const titleResult = await this.cdp.send<string>("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true,
    });

    this.currentUrl = normalizedUrl;
    this.currentTitle = (titleResult as any)?.result?.value || "";

    // Get snapshot
    const snapshot = await this.axTree.snapshot();
    this.currentSnapshot = snapshot;

    return {
      pageState: this.getPageState(),
      snapshot,
    };
  }

  /**
   * Get current page state (URL, title, loading status).
   */
  getPageState(): PageState {
    return {
      url: this.currentUrl,
      title: this.currentTitle,
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };
  }

  /**
   * Get a fresh snapshot of the current page.
   */
  async getSnapshot(full = false): Promise<AXSnapshot> {
    const snapshot = await this.axTree.snapshot(full);
    this.currentSnapshot = snapshot;
    return snapshot;
  }

  /**
   * Click an element by @ref ID.
   */
  async clickByRef(ref: string): Promise<AXSnapshot> {
    if (!this.currentSnapshot) {
      throw new Error("No page snapshot available. Navigate first.");
    }

    const backendNodeId = this.axTree.resolveRef(ref, this.currentSnapshot.nodes);
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found in the current snapshot. Try refreshing with browser_snapshot.`);
    }

    // Get the DOM node for the backendNodeId
    try {
      // Use DOM.resolveNode to get objectId, then get box model for coordinates
      const resolveResult = await this.cdp.send<any>("DOM.resolveNode", {
        backendNodeId,
      });

      const objectId = resolveResult?.object?.objectId;
      if (!objectId) {
        throw new Error(`Could not resolve ${ref} to a DOM node`);
      }

      // Get box model for coordinates
      const boxModel = await this.cdp.send<any>("DOM.getBoxModel", {
        objectId,
      });

      if (boxModel?.model?.content) {
        const quad = boxModel.model.content;
        const x = (quad[0] + quad[4]) / 2;
        const y = (quad[1] + quad[5]) / 2;

        // Simulate click via mouse events
        await this.cdp.send("Input.dispatchMouseEvent", {
          type: "mousePressed",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        await this.cdp.send("Input.dispatchMouseEvent", {
          type: "mouseReleased",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
      } else {
        // Fallback: try focusing and pressing Enter
        await this.cdp.send("DOM.focus", { backendNodeId });
        await this.cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Enter",
          code: "Enter",
        });
      }
    } catch (err) {
      throw new Error(`Failed to click ${ref}: ${err}`);
    }

    // Wait a bit for the page to react
    await this.delay(500);

    // Return fresh snapshot
    return this.getSnapshot();
  }

  /**
   * Type text into an input element by @ref ID.
   */
  async typeByRef(ref: string, text: string): Promise<AXSnapshot> {
    if (!this.currentSnapshot) {
      throw new Error("No page snapshot available. Navigate first.");
    }

    const backendNodeId = this.axTree.resolveRef(ref, this.currentSnapshot.nodes);
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found in the current snapshot.`);
    }

    try {
      // Focus the element
      await this.cdp.send("DOM.focus", { backendNodeId });
      await this.delay(100);

      // Clear the field: select all and delete
      await this.cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "a",
        code: "KeyA",
        modifiers: 2, // Ctrl
      });
      await this.cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "a",
        code: "KeyA",
        modifiers: 2,
      });

      // Type the text character by character
      for (const char of text) {
        await this.cdp.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: char,
          text: char,
        });
        await this.cdp.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: char,
        });
      }
    } catch (err) {
      throw new Error(`Failed to type into ${ref}: ${err}`);
    }

    await this.delay(300);
    return this.getSnapshot();
  }

  /**
   * Scroll the page.
   */
  async scroll(direction: "up" | "down", amount?: number): Promise<void> {
    const pixels = amount || 600;
    const deltaY = direction === "down" ? pixels : -pixels;

    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      x: 400,
      y: 300,
      deltaX: 0,
      deltaY,
    });
  }

  /**
   * Navigate back.
   */
  async back(): Promise<AXSnapshot> {
    await this.cdp.send("Page.navigateToHistoryEntry", { direction: "back" });
    await this.waitForLoad();
    return this.getSnapshot();
  }

  /**
   * Press a keyboard key.
   */
  async pressKey(key: string): Promise<void> {
    await this.cdp.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key,
      code: key,
    });
    await this.cdp.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code: key,
    });
  }

  /**
   * Get console messages.
   */
  getConsoleMessages(): string[] {
    return this.cdp.getConsoleMessages();
  }

  /**
   * Execute JavaScript in the page.
   */
  async evaluateJs(expression: string): Promise<string> {
    const result = await this.cdp.send<any>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      return `Error: ${JSON.stringify(result.exceptionDetails)}`;
    }
    return JSON.stringify(result?.result?.value ?? null);
  }

  /**
   * Capture a screenshot as base64 data URL.
   */
  async screenshot(): Promise<string> {
    const result = await this.cdp.send<string>("Page.captureScreenshot", {
      format: "png",
    });
    return `data:image/png;base64,${result}`;
  }

  cleanup() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.cdp.detach();
  }

  private async waitForLoad(timeoutMs = 10000): Promise<void> {
    await this.cdp.send("Page.stopLoading").catch(() => {});
    await this.delay(1000); // Simple wait; production would use Page.loadEventFired
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
