import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import { BROWSER_FILL_FORM } from "../../../../shared/tool-schemas";

export function executeBrowserFillForm(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_FILL_FORM,
    async execute(args) {
      const fields = args.fields as Record<string, string>;
      const snapshot = await browser.getSnapshot(true);

      const filledFields: string[] = [];
      const skippedFields: string[] = [];

      for (const [label, value] of Object.entries(fields)) {
        // Find the best-matching element by name or nearby label text
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
            await browser.typeByRef(ref, value);
            filledFields.push(`${label} = "${value}"`);
          } else if (node.role === "checkbox" || node.role === "radio" || node.role === "switch") {
            const shouldCheck = value === "true" || value === "checked" || value === "1" || value === "yes";
            const isChecked = node.checked === "true";
            if (shouldCheck !== isChecked) {
              await browser.clickByRef(ref);
            }
            filledFields.push(`${label} = ${shouldCheck ? "checked" : "unchecked"}`);
          } else if (node.role === "combobox" || node.role === "listbox") {
            await browser.clickByRef(ref);
            // After expanding, try to find and click the option
            const updatedSnapshot = await browser.getSnapshot(true);
            const optionRef = findFieldRef(updatedSnapshot.nodes, value);
            if (optionRef) {
              await browser.clickByRef(optionRef);
            }
            filledFields.push(`${label} = "${value}"`);
          } else {
            // Generic: try typing into it
            await browser.typeByRef(ref, value);
            filledFields.push(`${label} = "${value}"`);
          }
        } catch (err: any) {
          skippedFields.push(`${label} (error: ${err.message})`);
        }
      }

      const finalSnapshot = await browser.getSnapshot(true);

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

/**
 * Find the @ref ID of an element whose name matches the given label.
 * Case-insensitive, handles partial matches.
 */
function findFieldRef(
  nodes: Map<string, import("../../../browser/accessibility-tree").AXNode>,
  label: string
): string | null {
  const labelLower = label.toLowerCase().trim();

  // First pass: exact name match
  for (const [ref, node] of nodes) {
    if (node.name.toLowerCase().trim() === labelLower) {
      return ref;
    }
  }

  // Second pass: name contains label or label contains name (for labels like "Title *")
  for (const [ref, node] of nodes) {
    const nameLower = node.name.toLowerCase().trim();
    if (nameLower && (nameLower.includes(labelLower) || labelLower.includes(nameLower))) {
      return ref;
    }
  }

  return null;
}
