import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Direction, EdgeStyle, GEdge, GGroup, GNode, Graph, Shape } from './types';

/**
 * One data shape for both node kinds: `type: 'shape'` is a normal node,
 * `type: 'group'` is a subgraph box (its `shape` is unused).
 */
export type NodeData = { label: string; shape: Shape };
export type FlowNode = Node<NodeData, 'shape' | 'group'>;
export type EdgeData = { style: EdgeStyle };
export type FlowEdge = Edge<EdgeData>;

const HANDLES: Record<Direction, [string, string]> = {
  TD: ['b', 't'],
  BT: ['t', 'b'],
  LR: ['r', 'l'],
  RL: ['l', 'r'],
};

export function styleEdge(style: EdgeStyle): Pick<FlowEdge, 'style' | 'markerEnd'> {
  return {
    style: {
      strokeWidth: style === 'thick' ? 4 : 2,
      strokeDasharray: style === 'dotted' ? '6 5' : undefined,
    },
    markerEnd: style === 'open' ? undefined : { type: MarkerType.ArrowClosed },
  };
}

export function newId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

/** Next free A, B, … Z, A1, B1, … id. */
export function nextNodeId(existing: Iterable<string>): string {
  const used = new Set(existing);
  for (let i = 0; ; i++) {
    for (let c = 65; c <= 90; c++) {
      const id = String.fromCharCode(c) + (i ? i : '');
      if (!used.has(id)) return id;
    }
  }
}

/** Next free sub1, sub2, … id for a subgraph (can't clash with nextNodeId). */
export function nextGroupId(existing: Iterable<string>): string {
  const used = new Set(existing);
  for (let i = 1; ; i++) if (!used.has(`sub${i}`)) return `sub${i}`;
}

export function sizeOf(n: FlowNode): { w: number; h: number } {
  const fallback = n.type === 'group' ? { w: 200, h: 120 } : { w: 120, h: 50 };
  return {
    w: n.width ?? n.measured?.width ?? fallback.w,
    h: n.height ?? n.measured?.height ?? fallback.h,
  };
}

/** Absolute canvas position (React Flow stores children relative to their parent). */
export function absPos(n: FlowNode, byId: Map<string, FlowNode>): { x: number; y: number } {
  let { x, y } = n.position;
  const seen = new Set<string>([n.id]);
  for (let p = n.parentId; p && byId.has(p) && !seen.has(p); ) {
    seen.add(p);
    const pn = byId.get(p)!;
    x += pn.position.x;
    y += pn.position.y;
    p = pn.parentId;
  }
  return { x, y };
}

/** React Flow needs parents before children; keep all groups ahead of shapes. */
export function orderNodes(ns: FlowNode[]): FlowNode[] {
  const byId = new Map(ns.map((n) => [n.id, n]));
  const depth = (n: FlowNode) => {
    let d = 0;
    for (let p = n.parentId; p && byId.has(p) && d < 50; p = byId.get(p)!.parentId) d++;
    return d;
  };
  const groups = ns.filter((n) => n.type === 'group').sort((a, b) => depth(a) - depth(b));
  return [...groups, ...ns.filter((n) => n.type !== 'group')];
}

/** True when the edge points "backwards" against the flow direction. */
function isBackEdge(dir: Direction, s: GNode, t: GNode): boolean {
  switch (dir) {
    case 'TD': return t.y < s.y;
    case 'BT': return t.y > s.y;
    case 'LR': return t.x < s.x;
    case 'RL': return t.x > s.x;
  }
}

export function graphToFlow(graph: Graph, resetHandles = true): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const [sh, th] = HANDLES[graph.direction];
  // Back-edges loop around the outer side so they don't cut through the nodes.
  const vertical = graph.direction === 'TD' || graph.direction === 'BT';
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const groupById = new Map(graph.groups.map((g) => [g.id, g]));

  const rel = (x: number, y: number, parent?: string) => {
    const p = parent ? groupById.get(parent) : undefined;
    return p ? { x: x - p.x, y: y - p.y } : { x, y };
  };

  const groupNodes: FlowNode[] = graph.groups.map((g) => ({
    id: g.id,
    type: 'group' as const,
    position: rel(g.x, g.y, g.parent),
    width: g.w,
    height: g.h,
    parentId: g.parent && groupById.has(g.parent) ? g.parent : undefined,
    data: { label: g.label, shape: 'rect' as Shape },
  }));
  const shapeNodes: FlowNode[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'shape' as const,
    position: rel(n.x, n.y, n.parent),
    parentId: n.parent && groupById.has(n.parent) ? n.parent : undefined,
    data: { label: n.label, shape: n.shape },
  }));

  return {
    nodes: orderNodes([...groupNodes, ...shapeNodes]),
    edges: graph.edges.map((e) => {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      const back = !!s && !!t && s !== t && isBackEdge(graph.direction, s, t);
      const side = !s || !t ? 'r' : vertical ? (s.x <= t.x ? 'l' : 'r') : s.y <= t.y ? 't' : 'b';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        ...(resetHandles
          ? back
            ? { sourceHandle: side, targetHandle: side }
            : { sourceHandle: sh, targetHandle: th }
          : {}),
        label: e.label || undefined,
        data: { style: e.style },
        ...styleEdge(e.style),
      };
    }),
  };
}

export function flowToGraph(direction: Direction, nodes: FlowNode[], edges: FlowEdge[]): Graph {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isGroup = (id?: string) => !!id && byId.get(id)?.type === 'group';

  const groups: GGroup[] = nodes
    .filter((n) => n.type === 'group')
    .map((n) => {
      const { x, y } = absPos(n, byId);
      const { w, h } = sizeOf(n);
      return {
        id: n.id,
        label: n.data.label,
        parent: isGroup(n.parentId) ? n.parentId : undefined,
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(w),
        h: Math.round(h),
      };
    });

  const gn: GNode[] = nodes
    .filter((n) => n.type !== 'group')
    .map((n) => {
      const { x, y } = absPos(n, byId);
      return {
        id: n.id,
        label: n.data.label,
        shape: n.data.shape,
        parent: isGroup(n.parentId) ? n.parentId : undefined,
        x,
        y,
      };
    });

  const ids = new Set(gn.map((n) => n.id));
  const ge: GEdge[] = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : '',
      style: e.data?.style ?? 'arrow',
    }));
  return { direction, nodes: gn, edges: ge, groups };
}
