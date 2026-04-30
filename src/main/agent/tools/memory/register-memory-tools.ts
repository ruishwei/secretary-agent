import type { ToolExecutor } from "../../tool-executor";
import type { MemoryStore } from "../../../memory/memory-store";
import { Logger } from "../../../utils/logger";
import { executeMemorySearch } from "./memory-search";
import { executeMemoryGet } from "./memory-get";
import { executeMemoryAdd } from "./memory-add";
import { executeMemoryReplace } from "./memory-replace";
import { executeSessionSearch } from "./session-search";

const logger = new Logger("MemoryTools");

export function registerMemoryTools(executor: ToolExecutor, memoryStore: MemoryStore): void {
  const tools = [
    executeMemorySearch(memoryStore),
    executeMemoryGet(memoryStore),
    executeMemoryAdd(memoryStore),
    executeMemoryReplace(memoryStore),
    executeSessionSearch(memoryStore),
  ];

  for (const tool of tools) {
    executor.register(tool);
  }

  logger.info(`Registered ${tools.length} memory tools`);
}
