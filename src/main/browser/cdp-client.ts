import type { Debugger } from "electron";
import { Logger } from "../utils/logger";
import { CDP_TIMEOUT_MS } from "../../shared/constants";

const logger = new Logger("CDP");

export interface CDPResponse<T = unknown> {
  id: number;
  result: T;
  error?: { code: number; message: string };
}

export class CDPClient {
  private debugger: Debugger | null = null;
  private attached = false;
  private consoleMessages: string[] = [];

  attach(wc: Electron.WebContents): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.debugger = wc.debugger;
        this.debugger.on("message", (_event, method, params) => {
          this.handleMessage(method, params as Record<string, unknown>);
        });
        this.debugger.on("detach", () => {
          logger.info("Debugger detached");
          this.attached = false;
        });
        this.debugger.attach("1.3");
        this.attached = true;
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  detach() {
    if (this.debugger && this.attached) {
      this.debugger.detach();
      this.attached = false;
    }
  }

  isAttached(): boolean {
    return this.attached;
  }

  private handleMessage(method: string, params: Record<string, unknown>) {
    if (method === "Runtime.consoleAPICalled" || method === "Log.entryAdded") {
      const text = (params as any)?.entry?.text || (params as any)?.args?.[0]?.value;
      if (text) {
        this.consoleMessages.push(`[${method}] ${text}`);
        if (this.consoleMessages.length > 200) {
          this.consoleMessages.shift();
        }
      }
    }
  }

  async send<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.debugger || !this.attached) {
      throw new Error("Debugger not attached");
    }

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`CDP command ${method} timed out after ${CDP_TIMEOUT_MS}ms`)), CDP_TIMEOUT_MS)
    );

    const command = this.debugger.sendCommand(method, params);

    const result = await Promise.race([command, timeout]);
    return result as T;
  }

  getConsoleMessages(): string[] {
    return [...this.consoleMessages];
  }

  clearConsoleMessages() {
    this.consoleMessages = [];
  }

  /**
   * Enable relevant CDP domains for browser automation.
   */
  async enableDomains() {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Accessibility.enable");
    await this.send("DOM.enable");
    await this.send("Log.enable");
    logger.info("CDP domains enabled");
  }

  /**
   * Set up listener for new page/frame navigations.
   */
  onFrameNavigated(callback: (url: string) => void): () => void {
    if (!this.debugger) return () => {};
    const handler = (_event: Electron.Event, method: string, params: any) => {
      if (method === "Page.frameNavigated" && params?.frame?.url) {
        callback(params.frame.url);
      }
    };
    this.debugger.on("message", handler);
    return () => {
      this.debugger?.removeListener("message", handler);
    };
  }
}
