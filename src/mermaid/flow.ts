import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Direction, EdgeStyle, GEdge, GNode, Graph, Shape } from './types';

export type ShapeNodeData = { label: string; shape: Shape };
export type FlowNode = Node<ShapeNodeData, 'shape'>;
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

export function graphToFlow(graph: Graph, resetHandles = true): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const [sh, th] = HANDLES[graph.direction];
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      type: 'shape' as const,
      position: { x: n.x, y: n.y },
      data: { label: n.label, shape: n.shape },
    })),
    edges: graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      ...(resetHandles ? { sourceHandle: sh, targetHandle: th } : {}),
      label: e.label || undefined,
      data: { style: e.style },
      ...styleEdge(e.style),
    })),
  };
}

export function flowToGraph(direction: Direction, nodes: FlowNode[], edges: FlowEdge[]): Graph {
  const gn: GNode[] = nodes.map((n) => ({
    id: n.id,
    label: n.data.label,
    shape: n.data.shape,
    x: n.position.x,
    y: n.position.y,
  }));
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
  return { direction, nodes: gn, edges: ge };
}
