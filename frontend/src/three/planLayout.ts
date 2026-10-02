import type { Leg, OrderDocument, Part } from '../api/types';

/** One node of the drawn tree: the order itself, a plan part, or a leg role of a non-plan order. */
export interface TreeNode {
  path: string;
  label: string;
  parentPath: string | null;
  children: TreeNode[];
  depth: number;
  column: number;
  part: Part | null;
  legs: Leg[];
}

const ROOT_PATH = 'root';

/** Works out the tree of an order's parts and where each node sits. */
export class PlanLayout {
  /**
   * Builds the tree from the order's parts and its legs' roles, and places each node.
   * @param order The order.
   * @returns Every node, the root first, with depth and column set. A leaf takes the next free column and a parent sits in the middle of its children.
   */
  build(order: OrderDocument): TreeNode[] {
    const nodesByPath = new Map<string, TreeNode>();
    const root = this.node(ROOT_PATH, order.synthetic_type ?? 'order', null);
    nodesByPath.set(ROOT_PATH, root);

    for (const part of order.parts) {
      this.ensurePath(part.path, nodesByPath).part = part;
    }
    for (const leg of order.legs) {
      const path = leg.role ?? ROOT_PATH;
      this.ensurePath(path, nodesByPath).legs.push(leg);
    }

    const ordered: TreeNode[] = [];
    let nextColumn = 0;
    const place = (node: TreeNode, depth: number): void => {
      node.depth = depth;
      ordered.push(node);
      if (node.children.length === 0) {
        node.column = nextColumn;
        nextColumn += 1 + Math.max(0, node.legs.length - 1) * 0.5;
        return;
      }
      for (const child of node.children) {
        place(child, depth + 1);
      }
      const first = node.children[0].column;
      const last = node.children[node.children.length - 1].column;
      node.column = (first + last) / 2;
    };
    place(root, 0);
    return ordered;
  }

  /**
   * Finds the node for a path, creating it and any missing ancestors.
   * @param path The part path or leg role.
   * @param nodesByPath The nodes made so far, which this adds to.
   * @returns The node.
   */
  private ensurePath(path: string, nodesByPath: Map<string, TreeNode>): TreeNode {
    const existing = nodesByPath.get(path);
    if (existing !== undefined) {
      return existing;
    }
    const parentPath = this.parentOf(path);
    const parent = this.ensurePath(parentPath, nodesByPath);
    const node = this.node(path, this.labelOf(path), parentPath);
    parent.children.push(node);
    nodesByPath.set(path, node);
    return node;
  }

  /**
   * Finds a path's parent, skipping the "children" step that a join's list of parts adds.
   * @param path A part path such as "root.each_fill.children.0", or a plain role such as "stop".
   * @returns The parent's path, which is the root for a plain role.
   */
  private parentOf(path: string): string {
    const segments = path.split('.');
    if (segments.length >= 3 && segments[segments.length - 2] === 'children') {
      return segments.slice(0, -2).join('.');
    }
    if (segments.length >= 2) {
      return segments.slice(0, -1).join('.');
    }
    return ROOT_PATH;
  }

  /**
   * Chooses the short label drawn beside a node.
   * @param path The node's path.
   * @returns The last step of the path, with a list position written as "child 0".
   */
  private labelOf(path: string): string {
    const segments = path.split('.');
    const last = segments[segments.length - 1];
    if (/^\d+$/.test(last)) {
      return `child ${last}`;
    }
    return last;
  }

  /**
   * Makes an unplaced node.
   * @param path The node's path.
   * @param label The node's label.
   * @param parentPath The parent's path, or null for the root.
   * @returns The node.
   */
  private node(path: string, label: string, parentPath: string | null): TreeNode {
    return {
      path,
      label,
      parentPath,
      children: [],
      depth: 0,
      column: 0,
      part: null,
      legs: [],
    };
  }
}
