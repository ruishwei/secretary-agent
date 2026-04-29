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

// ===== TabSession — per-tab CDP connection and page state =====

export class TabSession {
  readonly tabId: string;
  readonly cdp: CDPClient;
  readonly axTree: AccessibilityTree;
  url = "about:blank";
  title = "";
  snapshot: AXSnapshot | null = null;
  webContentsId: number | null = null;
  isLoading = false;
  canGoBack = false;
  canGoForward = false;
  private readyPromise: Promise<void>;
  private readyResolve: (() => void) | null = null;
  private cleanupFns: Array<() => void> = [];
  private attached = false;

  constructor(tabId: string) {
    this.tabId = tabId;
    this.cdp = new CDPClient();
    this.axTree = new AccessibilityTree(this.cdp);
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  waitUntilReady(timeoutMs = 15000): Promise<void> {
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`Tab ${this.tabId} timed out waiting for CDP`)), timeoutMs)
    );
    return Promise.race([this.readyPromise, timeout]);
  }

  async attachToWebview(wc: Electron.WebContents): Promise<void> {
    if (this.attached) return;
    this.webContentsId = wc.id;
    await this.cdp.attach(wc);
    await this.cdp.enableDomains();
    this.attached = true;

    const unsub = this.cdp.onFrameNavigated((url) => {
      if (url && !url.startsWith("devtools://")) {
        this.url = url;
        logger.info(`[${this.tabId}] Navigated to: ${url}`);
      }
    });
    this.cleanupFns.push(unsub);

    if (this.readyResolve) {
      this.readyResolve();
      this.readyResolve = null;
    }
  }

  isReady(): boolean {
    return this.attached && this.cdp.isAttached();
  }

  async navigate(url: string): Promise<{ pageState: PageState; snapshot: AXSnapshot }> {
    let normalizedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      normalizedUrl = `https://${url}`;
    }
    if (normalizedUrl.startsWith("file://") || normalizedUrl.startsWith("javascript:")) {
      throw new Error(`Blocked URL: ${normalizedUrl}`);
    }

    await this.cdp.send("Page.navigate", { url: normalizedUrl });
    await this.waitForLoad();

    const titleResult = await this.cdp.send<any>("Runtime.evaluate", {
      expression: "document.title",
      returnByValue: true,
    });

    this.url = normalizedUrl;
    this.title = titleResult?.result?.value || "";
    this.isLoading = false;

    const snapshot = await this.axTree.snapshot();
    this.snapshot = snapshot;

    return { pageState: this.getPageState(), snapshot };
  }

  getPageState(): PageState {
    return {
      url: this.url,
      title: this.title,
      isLoading: this.isLoading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
    };
  }

  async getSnapshot(full = false): Promise<AXSnapshot> {
    const snapshot = await this.axTree.snapshot(full);
    this.snapshot = snapshot;
    return snapshot;
  }

  async clickByRef(ref: string): Promise<AXSnapshot> {
    if (!this.snapshot) {
      throw new Error("No page snapshot available. Navigate first.");
    }
    const backendNodeId = this.axTree.resolveRef(ref, this.snapshot.nodes);
    if (!backendNodeId) {
      throw new Error(`Element ${ref} not found. Try refreshing with browser_snapshot.`);
    }
    try {
      const resolveResult = await this.cdp.send<any>("DOM.resolveNode", { backendNodeId });
      const objectId = resolveResult?.object?.objectId;
      if (!objectId) throw new Error(`Could not resolve ${ref} to a DOM node`);

      const boxModel = await this.cdp.send<any>("DOM.getBoxModel", { objectId });
      if (boxModel?.model?.content) {
        const quad = boxModel.model.content;
        const x = (quad[0] + quad[4]) / 2;
        const y = (quad[1] + quad[5]) / 2;
        await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
        await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      } else {
        await this.cdp.send("DOM.focus", { backendNodeId });
        await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
      }
    } catch (err) {
      throw new Error(`Failed to click ${ref}: ${err}`);
    }
    await this.delay(500);
    return this.getSnapshot();
  }

  async typeByRef(ref: string, text: string): Promise<AXSnapshot> {
    if (!this.snapshot) {
      throw new Error("No page snapshot available. Navigate first.");
    }
    const backendNodeId = this.axTree.resolveRef(ref, this.snapshot.nodes);
    if (!backendNodeId) throw new Error(`Element ${ref} not found.`);

    try {
      await this.cdp.send("DOM.focus", { backendNodeId });
      await this.delay(100);
      await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 });
      await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
      for (const char of text) {
        await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: char, text: char });
        await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: char });
      }
    } catch (err) {
      throw new Error(`Failed to type into ${ref}: ${err}`);
    }
    await this.delay(300);
    return this.getSnapshot();
  }

  async scroll(direction: "up" | "down", amount?: number): Promise<void> {
    const pixels = amount || 600;
    const deltaY = direction === "down" ? pixels : -pixels;
    await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 400, y: 300, deltaX: 0, deltaY });
  }

  async back(): Promise<AXSnapshot> {
    await this.cdp.send("Page.navigateToHistoryEntry", { direction: "back" });
    await this.waitForLoad();
    return this.getSnapshot();
  }

  async forward(): Promise<AXSnapshot> {
    await this.cdp.send("Page.navigateToHistoryEntry", { direction: "forward" });
    await this.waitForLoad();
    return this.getSnapshot();
  }

  async pressKey(key: string): Promise<void> {
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
    await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
  }

  getConsoleMessages(): string[] {
    return this.cdp.getConsoleMessages();
  }

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

  async screenshot(): Promise<string> {
    const result = await this.cdp.send<string>("Page.captureScreenshot", { format: "png" });
    return `data:image/png;base64,${result}`;
  }

  async refresh(): Promise<void> {
    await this.cdp.send("Page.reload");
    await this.waitForLoad();
  }

  cleanup() {
    this.cleanupFns.forEach((fn) => fn());
    this.cleanupFns = [];
    this.cdp.detach();
    this.attached = false;
  }

  private async waitForLoad(): Promise<void> {
    await this.cdp.send("Page.stopLoading").catch(() => {});
    await this.delay(1000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===== BrowserManager — multi-tab registry =====

export class BrowserManager {
  private sessions = new Map<string, TabSession>();
  private activeTabId: string | null = null;

  // ---- Tab lifecycle ----

  createTab(tabId: string): TabSession {
    const session = new TabSession(tabId);
    this.sessions.set(tabId, session);
    if (!this.activeTabId) {
      this.activeTabId = tabId;
    }
    logger.info(`Tab created: ${tabId} (total: ${this.sessions.size})`);
    return session;
  }

  closeTab(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    if (this.sessions.size <= 1) {
      logger.info(`Cannot close last tab: ${tabId}`);
      return;
    }
    session.cleanup();
    this.sessions.delete(tabId);
    if (this.activeTabId === tabId) {
      const remaining = [...this.sessions.keys()];
      this.activeTabId = remaining[0];
    }
    logger.info(`Tab closed: ${tabId} (remaining: ${this.sessions.size})`);
  }

  setActiveTab(tabId: string): void {
    if (this.sessions.has(tabId)) {
      this.activeTabId = tabId;
    }
  }

  getActiveSession(): TabSession | null {
    return this.activeTabId ? this.sessions.get(this.activeTabId) ?? null : null;
  }

  getSession(tabId: string): TabSession | undefined {
    return this.sessions.get(tabId);
  }

  getAllTabs(): Array<{ tabId: string; url: string; title: string; isActive: boolean }> {
    const result: Array<{ tabId: string; url: string; title: string; isActive: boolean }> = [];
    for (const [tabId, session] of this.sessions) {
      result.push({
        tabId,
        url: session.url,
        title: session.title,
        isActive: tabId === this.activeTabId,
      });
    }
    return result;
  }

  get tabCount(): number {
    return this.sessions.size;
  }

  resolveSession(tabId?: string): TabSession {
    if (tabId) {
      const session = this.sessions.get(tabId);
      if (!session) throw new Error(`Tab ${tabId} not found`);
      return session;
    }
    const active = this.getActiveSession();
    if (!active) throw new Error("No active tab");
    return active;
  }

  // ---- Delegation methods (tabId is always optional, defaults to active tab) ----

  async navigate(url: string, tabId?: string): Promise<{ pageState: PageState; snapshot: AXSnapshot }> {
    return this.resolveSession(tabId).navigate(url);
  }

  getPageState(tabId?: string): PageState {
    return this.resolveSession(tabId).getPageState();
  }

  async getSnapshot(full = false, tabId?: string): Promise<AXSnapshot> {
    return this.resolveSession(tabId).getSnapshot(full);
  }

  async clickByRef(ref: string, tabId?: string): Promise<AXSnapshot> {
    return this.resolveSession(tabId).clickByRef(ref);
  }

  async typeByRef(ref: string, text: string, tabId?: string): Promise<AXSnapshot> {
    return this.resolveSession(tabId).typeByRef(ref, text);
  }

  async scroll(direction: "up" | "down", amount?: number, tabId?: string): Promise<void> {
    return this.resolveSession(tabId).scroll(direction, amount);
  }

  async back(tabId?: string): Promise<AXSnapshot> {
    return this.resolveSession(tabId).back();
  }

  async forward(tabId?: string): Promise<AXSnapshot> {
    return this.resolveSession(tabId).forward();
  }

  async pressKey(key: string, tabId?: string): Promise<void> {
    return this.resolveSession(tabId).pressKey(key);
  }

  getConsoleMessages(tabId?: string): string[] {
    return this.resolveSession(tabId).getConsoleMessages();
  }

  async evaluateJs(expression: string, tabId?: string): Promise<string> {
    return this.resolveSession(tabId).evaluateJs(expression);
  }

  async screenshot(tabId?: string): Promise<string> {
    return this.resolveSession(tabId).screenshot();
  }

  async refresh(tabId?: string): Promise<void> {
    return this.resolveSession(tabId).refresh();
  }

  // ---- CDP lifecycle (backward compat with existing initialize flow) ----

  /**
   * Wait until the browser is ready (any tab has CDP attached).
   * @deprecated Use waitUntilReady on a specific TabSession via getSession(tabId).
   */
  async waitUntilReady(timeoutMs = 15000): Promise<void> {
    const active = this.getActiveSession();
    if (active) {
      return active.waitUntilReady(timeoutMs);
    }
    throw new Error("No active tab");
  }

  /**
   * Initialize: find the webview's webContents and attach CDP to the default tab.
   * @deprecated Use createTab + attachToWebview on individual tabs.
   */
  async initialize(defaultTabId = "tab-initial"): Promise<void> {
    logger.info("BrowserManager: looking for webview...");
    const mainWin = BrowserWindow.getAllWindows()[0];
    if (!mainWin) {
      logger.info("BrowserManager: no window yet, will retry on first use");
      return;
    }

    const session = this.createTab(defaultTabId);

    const maxAttempts = 30;
    for (let i = 0; i < maxAttempts; i++) {
      const allWCs = webContents.getAllWebContents();
      const webviewWc = allWCs.find((wc) => {
        return (wc as any).hostWebContents?.id === mainWin.webContents.id;
      });

      if (webviewWc) {
        await session.attachToWebview(webviewWc);
        logger.info(`BrowserManager: attached default tab to webview (webContents ${webviewWc.id})`);
        return;
      }

      await this.delay(1000);
    }

    logger.error("BrowserManager: webview not found after 30s");
  }

  /**
   * Attach CDP to a specific webview for a given tab.
   */
  async attachToWebview(tabId: string, webContentsId: number): Promise<void> {
    // Find or create session
    let session = this.sessions.get(tabId);
    if (!session) {
      session = this.createTab(tabId);
    }

    if (session.webContentsId === webContentsId && session.isReady()) {
      return; // Already attached
    }

    if (session.isReady()) {
      session.cleanup();
    }

    const wc = webContents.fromId(webContentsId);
    if (!wc) {
      throw new Error(`No webContents found for ID ${webContentsId}`);
    }

    await session.attachToWebview(wc);
    logger.info(`CDP attached: tab ${tabId} -> webContents ${webContentsId}`);
  }

  isReady(): boolean {
    const active = this.getActiveSession();
    return active?.isReady() ?? false;
  }

  cleanup() {
    for (const session of this.sessions.values()) {
      session.cleanup();
    }
    this.sessions.clear();
    this.activeTabId = null;
  }

  /**
   * Find a tab by matching a substring against URLs and titles.
   */
  findTab(match: string): string | null {
    const lower = match.toLowerCase();
    for (const [tabId, session] of this.sessions) {
      if (session.url.toLowerCase().includes(lower) || session.title.toLowerCase().includes(lower)) {
        return tabId;
      }
    }
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
