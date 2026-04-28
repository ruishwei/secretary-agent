import { app, BrowserWindow, session, ipcMain } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./ipc/handlers";
import { Logger } from "./utils/logger";

const logger = new Logger("Main");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Browser Secretary Agent",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to use Node APIs via contextBridge
      webviewTag: true, // enable <webview> for embedded browser
    },
  });

  // Set Content Security Policy
  const csp = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? [
        "default-src 'self';",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: https:;",
        "media-src 'self' blob:;",
        "connect-src 'self' ws://localhost:5173 wss://localhost:5173 http://localhost:5173;",
        "font-src 'self' data:;",
      ].join(" ")
    : [
        "default-src 'self';",
        "script-src 'self';",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: https:;",
        "media-src 'self' blob:;",
        "font-src 'self' data:;",
      ].join(" ");

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp],
      },
    });
  });

  // Load the renderer
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Register IPC handlers before creating the window
registerIpcHandlers();

app.whenReady().then(() => {
  logger.info("App ready, creating window");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  logger.info("App quitting");
});
