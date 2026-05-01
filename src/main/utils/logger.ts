import fs from "node:fs";
import path from "node:path";

let logFilePath: string | null = null;

export function setLogDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  logFilePath = path.join(dir, "app.log");
  // Truncate log file on startup
  fs.writeFileSync(logFilePath, "", "utf-8");
}

function appendToFile(line: string): void {
  if (!logFilePath) return;
  try {
    fs.appendFileSync(logFilePath, line + "\n", "utf-8");
  } catch {
    // silent — don't let file I/O break the app
  }
}

export class Logger {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  private write(level: string, msg: string, ...args: unknown[]): void {
    const line = `[${this.prefix}] ${msg} ${args.length ? args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") : ""}`.trimEnd();
    const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
    out.write(line + "\n", "utf-8");
    appendToFile(line);
  }

  info(msg: string, ...args: unknown[]): void {
    this.write("info", msg, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    this.write("warn", msg, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    this.write("error", msg, ...args);
  }

  debug(msg: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV === "development") {
      this.write("debug", msg, ...args);
    }
  }
}
