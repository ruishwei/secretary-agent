import type { ToolHandler } from "../../../../main/agent/tool-executor";
import type { BrowserManager } from "../../../../main/browser/browser-manager";
import { BROWSER_FILL_FORM } from "../../../../shared/tool-schemas";

export function executeBrowserFillForm(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_FILL_FORM,
    async execute(args) {
      const fields = args.fields as Record<string, string>;
      const tabId = args.tabId as string | undefined;
      const snapshot = await browser.getSnapshot(true, tabId);

      const filledFields: string[] = [];
      const skippedFields: string[] = [];

      for (const [label, value] of Object.entries(fields)) {
        const ref = findFieldRef(snapshot.nodes, label);

        if (!ref) {
          skippedFields.push(`${label} (no matching field found)`);
          continue;
        }

        const node = snapshot.nodes.get(ref);
        if (!node) {
          skippedFields.push(`${label} (element not found)`);
          continue;
        }

        try {
          if (node.role === "textbox" || node.role === "searchbox") {
            await browser.typeByRef(ref, value, tabId);
            filledFields.push(`${label} = "${value}"`);
          } else if (node.role === "checkbox" || node.role === "radio" || node.role === "switch") {
            const shouldCheck = value === "true" || value === "checked" || value === "1" || value === "yes";
            const isChecked = node.checked === "true";
            if (shouldCheck !== isChecked) {
              await browser.clickByRef(ref, tabId);
            }
            filledFields.push(`${label} = ${shouldCheck ? "checked" : "unchecked"}`);
          } else if (node.role === "combobox" || node.role === "listbox") {
            await browser.clickByRef(ref, tabId);
            const updatedSnapshot = await browser.getSnapshot(true, tabId);
            const optionRef = findFieldRef(updatedSnapshot.nodes, value);
            if (optionRef) {
              await browser.clickByRef(optionRef, tabId);
            }
            filledFields.push(`${label} = "${value}"`);
          } else {
            await browser.typeByRef(ref, value, tabId);
            filledFields.push(`${label} = "${value}"`);
          }
        } catch (err: any) {
          skippedFields.push(`${label} (error: ${err.message})`);
        }
      }

      const finalSnapshot = await browser.getSnapshot(true, tabId);

      let resultMsg = `Filled ${filledFields.length}/${Object.keys(fields).length} fields.\n`;
      if (filledFields.length > 0) {
        resultMsg += `Filled: ${filledFields.join(", ")}\n`;
      }
      if (skippedFields.length > 0) {
        resultMsg += `Skipped: ${skippedFields.join(", ")}`;
      }
      resultMsg += `\n\nIMPORTANT: The form has been filled but NOT submitted. Use browser_request_review to ask the user to approve before submitting.`;

      return { success: true, result: resultMsg, snapshot: finalSnapshot.text };
    },
  };
}

function findFieldRef(
  nodes: Map<string, import("../../../../main/browser/accessibility-tree").AXNode>,
  label: string
): string | null {
  const labelLower = label.toLowerCase().trim();

  for (const [ref, node] of nodes) {
    if (node.name.toLowerCase().trim() === labelLower) {
      return ref;
    }
  }

  for (const [ref, node] of nodes) {
    const nameLower = node.name.toLowerCase().trim();
    if (nameLower && (nameLower.includes(labelLower) || labelLower.includes(nameLower))) {
      return ref;
    }
  }

  return null;
}
