import { BROWSER_SNAPSHOT } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

const INTERACTIVE_ROLES = new Set([
  "link", "button", "textbox", "searchbox", "combobox", "listbox",
  "menuitem", "menuitemcheckbox", "menuitemradio", "option",
  "radio", "checkbox", "switch", "tab", "treeitem", "slider",
  "spinbutton", "scrollbar", "listitem", "gridcell", "rowheader",
  "columnheader", "row", "menu", "navigation",
]);

export function executeBrowserSnapshot(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_SNAPSHOT,
    async execute(args) {
      const full = args.full === true;
      const tabId = args.tabId as string | undefined;
      const includeRefs = args.includeRefs !== false;
      const snapshot = await browser.getSnapshot(full, tabId, includeRefs);

      // Compact interactive ref list for result (not full tree — that's in snapshot field)
      const items: string[] = [];
      for (const [ref, node] of snapshot.nodes) {
        if (INTERACTIVE_ROLES.has(node.role)) {
          items.push(`${ref} ${node.role} ${node.name || "(unnamed)"}`);
        }
      }

      return {
        success: true,
        result: `Page snapshot: ${snapshot.nodes.size} elements, ${items.length} interactive.\n${items.join("\n")}`,
        snapshot: snapshot.text,
      };
    },
  };
}
