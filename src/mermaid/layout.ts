import dagre from '@dagrejs/dagre';
import type { Graph } from './types';

export function nodeSize(label: string): { w: number; h: number } {
  const lines = label.split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 4);
  return { w: Math.max(110, longest * 8 + 40), h: 40 + lines.length * 18 };
}

const RANKDIR = { TD: 'TB', LR: 'LR', BT: 'BT', RL: 'RL' } as const;

/** Auto-position nodes (used on import and via the "Auto layout" button). */
export function autoLayout(graph: Graph): Graph {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: RANKDIR[graph.direction], nodesep: 50, ranksep: 70 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of graph.nodes) {
    const { w, h } = nodeSize(n.label);
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of graph.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = g.node(n.id);
      const { w, h } = nodeSize(n.label);
      return { ...n, x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) };
    }),
  };
}
