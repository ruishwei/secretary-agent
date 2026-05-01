import { webContents, BrowserWindow, WebContentsView } from "electron";
import { CDPClient } from "./cdp-client";
import { AccessibilityTree, type AXSnapshot } from "./accessibility-tree";
import { Logger } from "../utils/logger";

const logger = new Logger("Browser");

export interface PageState {
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface BrowserState {
  tabId: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

// ===== TabSession — per-tab WebContentsView + CDP connection =====

export class TabSession {
  readonly tabId: string;
  readonly cdp: CDPClient;
  readonly axTree: AccessibilityTree;
  readonly view: WebContentsView;
  url = "about:blank";
  title = "";
  favicon = "";
  snapshot: AXSnapshot | null = null;
  isLoading = false;
  canGoBack = false;
  canGoForward = false;
  private readyPromise: Promise<void>;
  private readyResolve: (() => void) | null = null;
  private cleanupFns: Array<() => void> = [];
  private attached = false;
  private stateCallback?: (tabId: string, state: Partial<BrowserState>) => void;

  private popupCallback?: (tabId: string, url: string, sourceTabId: string) => void;

  constructor(
    tabId: string,
    view: WebContentsView,
    stateCallback?: (tabId: string, state: Partial<BrowserState>) => void,
    popupCallback?: (tabId: string, url: string, sourceTabId: string) => void,
  ) {
    this.tabId = tabId;
    this.view = view;
    this.cdp = new CDPClient();
    this.axTree = new AccessibilityTree(this.cdp);
    this.stateCallback = stateCallback;
    this.popupCallback = popupCallback;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    this.setupNavigationListeners();
  }

  private setupNavigationListeners() {
    const wc = this.view.webContents;

    // Attach CDP when the page finishes loading for the first time
    const onFinishLoad = async () => {
      if (!this.attached) {
        try {
          await this.cdp.attach(wc);
          await this.cdp.enableDomains();
          this.attached = true;

          // Listen for frame navigations via CDP
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
          logger.info(`[${this.tabId}] CDP attached`);
        } catch (err) {
          logger.error(`[${this.tabId}] CDP attach failed: ${err}`);
        }
      }
    };
    wc.on("did-finish-load", onFinishLoad);

    // Navigation events — track state and push to renderer
    wc.on("did-start-loading", () => {
      this.isLoading = true;
      this.emitState();
    });

    wc.on("did-stop-loading", () => {
      this.isLoading = false;
      this.emitState();
    });

    wc.on("did-navigate", (_e, url) => {
      if (url && !url.startsWith("devtools://")) {
        this.url = url;
        this.emitState();
      }
    });

    wc.on("did-navigate-in-page", (_e, url) => {
      if (url) {
        this.url = url;
        this.emitState();
      }
    });

    wc.on("did-redirect-navigation", (_e, url) => {
      if (url) {
        this.url = url;
        logger.info(`[${this.tabId}] Redirect: ${url}`);
        this.emitState();
      }
    });

    // Track title changes
    wc.on("page-title-updated", (_e, title) => {
      this.title = title;
      this.emitState();
    });

    // Track favicon
    wc.on("page-favicon-updated", (_e, favicons) => {
      if (favicons && favicons.length > 0) {
        this.favicon = favicons[0];
        this.emitState();
      }
    });

    // Popup / new-window interception
    wc.setWindowOpenHandler(({ url }) => {
      if (url && url !== "about:blank" && !url.startsWith("devtools://")) {
        const newTabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        this.popupCallback?.(newTabId, url, this.tabId);
      }
      return { action: "deny" };
    });

    // Clean up on destroyed
    wc.on("destroyed", () => {
      this.cleanup();
    });

    // After construction, load initial URL
    wc.loadURL("about:blank");
  }

  private emitState() {
    // Read live navigation state from webContents (works for both user and CDP navigations)
    try {
      const nh = this.view.webContents.navigationHistory;
      this.canGoBack = nh.canGoBack();
      this.canGoForward = nh.canGoForward();
    } catch {
      // navigationHistory may not be available immediately
    }
    this.stateCallback?.(this.tabId, {
      url: this.url,
      title: this.title,
      favicon: this.favicon,
      isLoading: this.isLoading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
    });
  }

  /** ID of the underlying webContents (for CDP-based tools). */
  get webContentsId(): number {
    return this.view.webContents.id;
  }

  get webContents() {
    return this.view.webContents;
  }

  waitUntilReady(timeoutMs = 15000): Promise<void> {
    const timeout = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error(`Tab ${this.tabId} timed out waiting for CDP`)), timeoutMs),
    );
    return Promise.race([this.readyPromise, timeout]);
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
      favicon: this.favicon,
      isLoading: this.isLoading,
      canGoBack: this.canGoBack,
      canGoForward: this.canGoForward,
    };
  }

  async getSnapshot(full = false, includeRefs = true): Promise<AXSnapshot> {
    const snapshot = await this.axTree.snapshot(full, includeRefs);
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
      // Select all + insert text atomically — avoids triggering per-character
      // auto-suggest / autocomplete that would replace the typed text
      await this.cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 });
      await this.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
      await this.cdp.send("Input.insertText", { text });
    } catch (err) {
      throw new Error(`Failed to type into ${ref}: ${err}`);
    }
    await this.delay(300);
    return this.getSnapshot();
  }

  async scroll(direction: "up" | "down", amount?: number): Promise<void> {
    const pixels = amount || 600;
    const deltaY = direction === "down" ? pixels : -pixels;
    await this.cdp.send("Input.dispatchMouseEvent", {
      type: "mouseWheel", x: 400, y: 300, deltaX: 0, deltaY,
    });
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

  async screenshot(quality = 70): Promise<string> {
    const { data } = await this.cdp.send<{ data: string }>("Page.captureScreenshot", {
      format: "jpeg",
      quality,
    });
    return `data:image/jpeg;base64,${data}`;
  }

  async refresh(): Promise<void> {
    await this.cdp.send("Page.reload");
    await this.waitForLoad();
  }

  /** User-initiated navigation (via webContents, updates navigation history properly). */
  loadURL(url: string): void {
    let normalizedUrl = url;
    if (!url.startsWith("http://") && !url.startsWith("https://") && url !== "about:blank") {
      normalizedUrl = `https://${url}`;
    }
    this.url = normalizedUrl;
    this.view.webContents.loadURL(normalizedUrl);
  }

  /** UI-initiated reload (via webContents). */
  reload(): void {
    this.view.webContents.reload();
  }

  /** UI-initiated stop. */
  stop(): void {
    this.view.webContents.stop();
  }

  /** UI-initiated goBack via webContents navigation controller. */
  goBack(): void {
    if (this.view.webContents.navigationHistory.canGoBack()) {
      this.view.webContents.navigationHistory.goBack();
    }
  }

  /** UI-initiated goForward via webContents navigation controller. */
  goForward(): void {
    if (this.view.webContents.navigationHistory.canGoForward()) {
      this.view.webContents.navigationHistory.goForward();
    }
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

// ===== BrowserManager — multi-tab registry with WebContentsView =====

export class BrowserManager {
  private sessions = new Map<string, TabSession>();
  private activeTabId: string | null = null;
  private mainWindow: BrowserWindow | null = null;
  private layoutBounds = { x: 0, y: 80, width: 800, height: 600 };
  private visible = true;
  private statePushCallback?: (state: BrowserState) => void;
  private popupCallback?: (tabId: string, url: string, sourceTabId: string) => void;
  private _screenshotQuality = 80;

  setScreenshotQuality(quality: number): void {
    this._screenshotQuality = Math.max(10, Math.min(100, quality));
  }

  setMainWindow(win: BrowserWindow) {
    this.mainWindow = win;
    // Set initial layout based on window size.
    // Left panel (chat) ≈ 400px. Browser starts at x=400.
    // Top chrome: TabBar(~32) + AddressBar(~28) ≈ 60px. Actual measurement via ResizeObserver.
    const [w, h] = win.getContentSize();
    this.layoutBounds = { x: 400, y: 60, width: w - 400, height: h - 60 };
  }

  setStatePushCallback(cb: (state: BrowserState) => void) {
    this.statePushCallback = cb;
  }

  setPopupCallback(cb: (tabId: string, url: string, sourceTabId: string) => void) {
    this.popupCallback = cb;
  }

  setLayoutBounds(bounds: { x: number; y: number; width: number; height: number }) {
    this.layoutBounds = bounds;
    this.repositionViews();
  }

  /** Hide/show all browser views (used when settings modal overlays the browser). */
  setVisible(visible: boolean) {
    this.visible = visible;
    this.repositionViews();
  }

  private getStateCallback() {
    return (tabId: string, state: Partial<BrowserState>) => {
      this.statePushCallback?.({ tabId, ...state } as BrowserState);
    };
  }

  private repositionViews() {
    const offscreen = { x: -9999, y: -9999, width: 1, height: 1 };
    for (const [tabId, session] of this.sessions) {
      if (!this.visible) {
        session.view.setBounds(offscreen);
      } else if (tabId === this.activeTabId) {
        session.view.setBounds(this.layoutBounds);
      } else {
        session.view.setBounds(offscreen);
      }
    }
  }

  // ---- Tab lifecycle ----

  createTab(tabId?: string, url?: string): TabSession {
    const id = tabId || `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Don't create duplicate tabs
    if (this.sessions.has(id)) {
      logger.info(`Tab ${id} already exists, skipping creation`);
      return this.sessions.get(id)!;
    }

    const view = new WebContentsView({
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        partition: "persist:browser-sec",
      },
    });

    const session = new TabSession(
      id,
      view,
      this.getStateCallback(),
      (tabId: string, url: string, sourceTabId: string) => {
        this.popupCallback?.(tabId, url, sourceTabId);
      },
    );
    this.sessions.set(id, session);

    // Add to window
    if (this.mainWindow) {
      this.mainWindow.contentView.addChildView(view);
      if (id === this.activeTabId || !this.activeTabId) {
        view.setBounds(this.layoutBounds);
      } else {
        view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
      }
    }

    if (!this.activeTabId) {
      this.activeTabId = id;
    }

    // Navigate to initial URL if provided
    if (url && url !== "about:blank") {
      view.webContents.loadURL(url);
    }

    logger.info(`Tab created: ${id} (total: ${this.sessions.size})`);
    return session;
  }

  closeTab(tabId: string): void {
    const session = this.sessions.get(tabId);
    if (!session) return;
    if (this.sessions.size <= 1) {
      logger.info(`Cannot close last tab: ${tabId}`);
      return;
    }

    // Remove view from window
    if (this.mainWindow) {
      this.mainWindow.contentView.removeChildView(session.view);
    }

    session.cleanup();
    this.sessions.delete(tabId);

    if (this.activeTabId === tabId) {
      const remaining = [...this.sessions.keys()];
      this.activeTabId = remaining[0];
      this.repositionViews();
    }

    logger.info(`Tab closed: ${tabId} (remaining: ${this.sessions.size})`);
  }

  setActiveTab(tabId: string): void {
    if (this.sessions.has(tabId)) {
      this.activeTabId = tabId;
      this.repositionViews();
    }
  }

  getActiveSession(): TabSession | null {
    return this.activeTabId ? this.sessions.get(this.activeTabId) ?? null : null;
  }

  getSession(tabId: string): TabSession | undefined {
    return this.sessions.get(tabId);
  }

  getAllTabs(): Array<{ tabId: string; url: string; title: string; favicon?: string; isActive: boolean }> {
    const result: Array<{ tabId: string; url: string; title: string; favicon?: string; isActive: boolean }> = [];
    for (const [tabId, session] of this.sessions) {
      result.push({
        tabId,
        url: session.url,
        title: session.title,
        favicon: session.favicon || undefined,
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

  // ---- Delegation methods ----

  /** User-initiated navigation (non-CDP, updates navigation history). */
  loadURL(url: string, tabId?: string): void {
    this.resolveSession(tabId).loadURL(url);
  }

  async navigate(url: string, tabId?: string): Promise<{ pageState: PageState; snapshot: AXSnapshot }> {
    return this.resolveSession(tabId).navigate(url);
  }

  getPageState(tabId?: string): PageState {
    return this.resolveSession(tabId).getPageState();
  }

  async getSnapshot(full = false, tabId?: string, includeRefs = true): Promise<AXSnapshot> {
    return this.resolveSession(tabId).getSnapshot(full, includeRefs);
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

  async screenshot(tabId?: string, quality?: number): Promise<string> {
    return this.resolveSession(tabId).screenshot(quality ?? this._screenshotQuality);
  }

  async refresh(tabId?: string): Promise<void> {
    return this.resolveSession(tabId).refresh();
  }

  // ---- CDP lifecycle ----

  async waitUntilReady(timeoutMs = 15000): Promise<void> {
    const active = this.getActiveSession();
    if (active) {
      return active.waitUntilReady(timeoutMs);
    }
    throw new Error("No active tab");
  }

  /**
   * Initialize: wire up the manager. Tab creation is driven by the renderer.
   */
  async initialize(): Promise<void> {
    logger.info("BrowserManager: initialized with WebContentsView");
  }

  /**
   * Attach to an externally-created WebContentsView (backward compat, used during migration).
   * @deprecated Use createTab() instead.
   */
  async attachToWebview(tabId: string, _webContentsId: number): Promise<void> {
    // In the WebContentsView model, tabs are created by the main process.
    // This method exists only for any remaining callers during migration.
    logger.warn(`attachToWebview called for ${tabId} — creating tab instead`);
    this.createTab(tabId);
  }

  isReady(): boolean {
    const active = this.getActiveSession();
    return active?.isReady() ?? false;
  }

  cleanup() {
    for (const session of this.sessions.values()) {
      if (this.mainWindow) {
        this.mainWindow.contentView.removeChildView(session.view);
      }
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
      if (
        session.url.toLowerCase().includes(lower) ||
        session.title.toLowerCase().includes(lower)
      ) {
        return tabId;
      }
    }
    return null;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
