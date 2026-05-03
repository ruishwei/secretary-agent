import type { Plugin, PluginContext, PluginToolContext, PluginIPCChannel } from "./plugin";
import type { StateProvider } from "./state-provider";
import type { ToolHandler } from "../agent/tool-executor";
import { ToolExecutor } from "../agent/tool-executor";

export class PluginRegistry {
  private plugins = new Map<string, Plugin>();
  private enabled = new Set<string>();

  // ===== Registration =====

  async register(plugin: Plugin, ctx: PluginContext): Promise<void> {
    if (this.plugins.has(plugin.manifest.id)) {
      throw new Error(`Plugin "${plugin.manifest.id}" is already registered.`);
    }
    this.plugins.set(plugin.manifest.id, plugin);
    await plugin.init(ctx);
  }

  async enable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Plugin "${id}" not found.`);
    if (this.enabled.has(id)) return;
    await plugin.enable();
    this.enabled.add(id);
  }

  async disable(id: string): Promise<void> {
    const plugin = this.plugins.get(id);
    if (!plugin) return;
    await plugin.disable();
    this.enabled.delete(id);
  }

  isEnabled(id: string): boolean {
    return this.enabled.has(id);
  }

  // ===== Aggregation: State Providers =====

  getStateProviders(): StateProvider[] {
    const providers: StateProvider[] = [];
    for (const id of this.enabled) {
      const plugin = this.plugins.get(id);
      if (plugin?.stateProviders) {
        providers.push(...plugin.stateProviders);
      }
    }
    return providers;
  }

  // ===== Aggregation: Tools =====

  registerAllTools(executor: ToolExecutor, ctx: PluginToolContext): void {
    for (const id of this.enabled) {
      const plugin = this.plugins.get(id);
      if (plugin?.toolFactories) {
        for (const factory of plugin.toolFactories) {
          const handlers = factory(ctx);
          for (const h of handlers) {
            executor.register(h);
          }
        }
      }
    }
  }

  // ===== Aggregation: IPC Handlers =====

  getIpcHandlers(): PluginIPCChannel[] {
    const channels: PluginIPCChannel[] = [];
    for (const id of this.enabled) {
      const plugin = this.plugins.get(id);
      if (plugin?.ipcHandlers) {
        channels.push(...plugin.ipcHandlers);
      }
    }
    return channels;
  }

  // ===== Aggregation: UI Contributions =====

  getUIContributions(): Array<{
    pluginId: string;
    panels?: Array<import("./plugin").UIPanelContribution>;
    settingsSections?: Array<import("./plugin").SettingsSectionContribution>;
  }> {
    const result: Array<{
      pluginId: string;
      panels?: Array<import("./plugin").UIPanelContribution>;
      settingsSections?: Array<import("./plugin").SettingsSectionContribution>;
    }> = [];
    for (const id of this.enabled) {
      const plugin = this.plugins.get(id);
      if (plugin?.uiContributions) {
        result.push({
          pluginId: id,
          panels: plugin.uiContributions.panels,
          settingsSections: plugin.uiContributions.settingsSections,
        });
      }
    }
    return result;
  }

  // ===== Lookup =====

  getPlugin<T extends Plugin = Plugin>(id: string): T | undefined {
    return this.plugins.get(id) as T | undefined;
  }

  // ===== Cleanup =====

  async cleanupAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await plugin.cleanup();
      } catch {
        // best-effort cleanup
      }
    }
    this.plugins.clear();
    this.enabled.clear();
  }
}
