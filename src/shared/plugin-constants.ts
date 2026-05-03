/**
 * Plugin system constants shared between main and renderer.
 */

/** Predefined container slots that plugins render into. */
export const PLUGIN_CONTAINERS = ["sidebar", "main", "bottom-panel", "float-panel"] as const;
export type PluginContainerId = (typeof PLUGIN_CONTAINERS)[number];

/** IPC channels for plugin lifecycle communication. */
export const PLUGIN_IPC = {
  /** Main → Renderer: broadcast enabled plugins list + UI contributions. */
  PLUGIN_STATE_CHANGED: "plugin:state-changed",
  /** Main → Renderer: plugin settings contributions for the settings nav. */
  PLUGIN_SETTINGS_CONTRIBUTIONS: "plugin:settings-contributions",
} as const;
