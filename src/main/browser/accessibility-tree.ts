import type { CDPClient } from "./cdp-client";

/**
 * A flattened node from the accessibility tree with @ref ID assignment.
 */
export interface AXNode {
  ref: string; // @e1, @e2, etc.
  role: string;
  name: string;
  description: string;
  value: string;
  checked: string;
  expanded: boolean;
  selected: boolean;
  level: number;
  children: string[]; // child @ref IDs
  backendNodeId: number;
}

/**
 * Result of parsing a full AXTree from CDP.
 */
export interface AXSnapshot {
  nodes: Map<string, AXNode>;
  text: string;
  rootRef: string;
}

// Interactive roles that get @ref IDs
const INTERACTIVE_ROLES = new Set([
  "link", "button", "textbox", "searchbox", "combobox", "listbox",
  "menuitem", "menuitemcheckbox", "menuitemradio", "option",
  "radio", "checkbox", "switch", "tab", "treeitem", "slider",
  "spinbutton", "scrollbar", "listitem", "gridcell", "rowheader",
  "columnheader", "row", "menu", "navigation",
]);

// Roles that always produce meaningful output (skip others if nameless)
const MEANINGFUL_ROLES = new Set([
  "heading", "link", "button", "textbox", "searchbox", "checkbox", "radio",
  "switch", "combobox", "listbox", "image", "paragraph", "statictext",
  "inlineTextBox", "navigation", "list", "listitem", "table", "alert",
  "note", "menu", "menubar", "tab",
]);

// Roles that are pure containers — never render themselves, just pass through to children
const PASS_THROUGH_ROLES = new Set([
  "generic", "group", "none", "section", "div", "span", "article", "main",
  "header", "footer", "aside", "region", "form", "figure", "details",
  "summary", "blockquote", "caption",
]);

// Roles that contain text content to display
const TEXT_ROLES = new Set([
  "paragraph", "heading", "statictext", "label", "note", "article",
  "listmarker", "cell", "gridcell",
]);

// Inline text roles
const INLINE_TEXT_ROLES = new Set(["inlineTextBox", "text", "statictext"]);

let refCounter = 0;

function nextRef(): string {
  return `@e${++refCounter}`;
}

export class AccessibilityTree {
  private cdp: CDPClient;

  constructor(cdp: CDPClient) {
    this.cdp = cdp;
  }

  /**
   * Get a full AXTree snapshot with @ref IDs for interactive elements.
   */
  async snapshot(full = false): Promise<AXSnapshot> {
    refCounter = 0;
    const result = await this.cdp.send<any>("Accessibility.getFullAXTree", {
      max_depth: full ? 12 : 6,
    });

    const axNodes = result?.nodes || [];
    const nodes = new Map<string, AXNode>();
    const rootRef = nextRef();

    // First pass: create all nodes with basic info
    const rawNodes = new Map<string, any>();
    for (const raw of axNodes) {
      rawNodes.set(raw.nodeId, raw);
    }

    // Map backendNodeId -> @ref for interactive elements
    const backendToRef = new Map<number, string>();

    // Build the tree from root
    const root = rawNodes.get(result.root?.nodeId || axNodes[0]?.nodeId);
    if (root) {
      this.buildNode(root, rawNodes, nodes, backendToRef, null, 0, rootRef);
    }

    // Generate text representation
    const lines: string[] = [];
    this.renderTree(rootRef, nodes, lines, "", true);

    return {
      nodes,
      text: lines.join("\n"),
      rootRef,
    };
  }

  /**
   * Resolve a @ref ID to a backendNodeId for interaction.
   */
  resolveRef(ref: string, nodes: Map<string, AXNode>): number | null {
    const node = nodes.get(ref);
    return node?.backendNodeId ?? null;
  }

  private buildNode(
    raw: any,
    rawNodes: Map<string, any>,
    nodes: Map<string, AXNode>,
    backendToRef: Map<number, string>,
    parentRef: string | null,
    depth: number,
    assignedRef?: string
  ): string | null {
    if (depth > 16) return null; // Prevent infinite recursion

    const role = (raw.role?.value || "unknown").toLowerCase();
    const name = raw.name?.value || "";
    const description = raw.description?.value || "";
    const value = raw.value?.value || "";
    const checked = raw.checked?.value || "";
    const expanded = raw.expanded?.value === true;
    const selected = raw.selected?.value === true;
    const backendNodeId = raw.backendDOMNodeId || 0;

    const isInteractive = INTERACTIVE_ROLES.has(role);
    const hasName = name.length > 0;
    const childCount = (raw.childIds || raw.children || []).length;
    // Assign a ref to interactive elements, named headings/images, and any container
    // that has children (otherwise intermediate nodes block tree traversal).
    const shouldAssignRef = isInteractive || (hasName && (role === "heading" || role === "image")) || childCount > 0;

    const ref = assignedRef || (shouldAssignRef ? nextRef() : "");

    if (backendNodeId > 0 && shouldAssignRef) {
      backendToRef.set(backendNodeId, ref);
    }

    const childRefs: string[] = [];
    const rawChildren = raw.childIds || raw.children || [];
    for (const childId of rawChildren) {
      const rawChild = rawNodes.get(typeof childId === "string" ? childId : String(childId));
      if (rawChild) {
        const childRef = this.buildNode(
          rawChild, rawNodes, nodes, backendToRef, ref, depth + 1
        );
        if (childRef) childRefs.push(childRef);
      }
    }

    if (ref) {
      nodes.set(ref, {
        ref,
        role,
        name,
        description,
        value,
        checked,
        expanded,
        selected,
        level: depth,
        children: childRefs,
        backendNodeId,
      });
    }

    return ref || null;
  }

  private renderTree(
    ref: string,
    nodes: Map<string, AXNode>,
    lines: string[],
    indent: string,
    isRoot: boolean
  ) {
    const node = nodes.get(ref);
    if (!node) return;

    const role = node.role;
    const name = node.name;
    const value = node.value;
    const checked = node.checked;
    const hasChildren = node.children.length > 0;
    const isInteractive = INTERACTIVE_ROLES.has(role);

    // Pass-through containers: skip rendering this node but still recurse into children
    if (PASS_THROUGH_ROLES.has(role) && !name && !isInteractive) {
      for (const childRef of node.children) {
        this.renderTree(childRef, nodes, lines, indent, false);
      }
      return;
    }

    // Non-meaningful, non-interactive node with no name/value → skip but recurse
    if (!MEANINGFUL_ROLES.has(role) && !isInteractive && !name && !value && hasChildren) {
      for (const childRef of node.children) {
        this.renderTree(childRef, nodes, lines, indent, false);
      }
      return;
    }

    let line = indent;

    // Add @ref tag for interactive elements
    if (isInteractive) {
      line += `[${ref}] `;
    }

    // Role icon/indicator (compact format, no emoji)
    switch (role) {
      case "heading":
        line += `# ${name}`;
        break;
      case "link":
        line += `LINK ${name || "(link)"}`;
        break;
      case "button":
        line += `BTN "${name || "(button)"}"`;
        break;
      case "textbox":
      case "searchbox":
        line += `INPUT ${name || "(text field)"}${value ? ` = "${value}"` : ""}`;
        break;
      case "checkbox":
      case "radio":
      case "switch":
        line += `[${checked === "true" ? "x" : " "}] ${name || role}`;
        break;
      case "combobox":
      case "listbox":
        line += `SELECT ${name || role}${value ? ` = "${value}"` : ""}`;
        break;
      case "image":
        line += `IMG ${name || "(image)"}`;
        break;
      case "paragraph":
        line += name || "";
        break;
      case "statictext":
      case "inlineTextBox":
        line += `"${name}"`;
        break;
      case "navigation":
        line += `NAV ${name || "navigation"}`;
        break;
      case "list":
        line += `LIST`;
        break;
      case "listitem":
        line += `- ${name || ""}`;
        break;
      case "table":
        line += `TABLE ${name || ""}`;
        break;
      case "alert":
      case "note":
        line += `NOTE ${name}`;
        break;
      case "menu":
      case "menubar":
        line += `MENU ${name || ""}`;
        break;
      case "tab":
        line += `TAB ${name || ""}${node.selected ? " (selected)" : ""}`;
        break;
      default:
        if (name) line += `${role}: ${name}`;
        else line += `${role}`;
    }

    line = line.trim();
    if (line) lines.push(line);

    const childIndent = indent + " ";
    for (const childRef of node.children) {
      this.renderTree(childRef, nodes, lines, childIndent, false);
    }
  }
}
