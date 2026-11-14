import dagre from '@dagrejs/dagre';
import type { GGroup, GNode, Graph, Shape } from './types';

export function nodeSize(label: string, shape?: Shape): { w: number; h: number } {
  const lines = label.split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 4);
  let w = Math.max(110, longest * 8 + 40);
  let h = 40 + lines.length * 18;
  if (shape === 'diamond') {
    w += 50;
    h += 30;
  }
  return { w, h };
}

const RANKDIR = { TD: 'TB', LR: 'LR', BT: 'BT', RL: 'RL' } as const;

export const GROUP_PAD = { side: 24, top: 44, bottom: 24 };

/** Refit group boxes around their children (deepest groups first). */
export function fitGroups(graph: Graph): Graph {
  const byId = new Map<string, GGroup>(graph.groups.map((g) => [g.id, { ...g }]));
  const depth = (id: string) => {
    let d = 0;
    for (let p = byId.get(id)?.parent; p && byId.has(p) && d < 50; p = byId.get(p)?.parent) d++;
    return d;
  };
  const order = [...byId.keys()].sort((a, b) => depth(b) - depth(a));
  const nodeBox = (n: GNode) => ({ x: n.x, y: n.y, ...(() => { const s = nodeSize(n.label, n.shape); return { w: s.w, h: s.h }; })() });
  for (const id of order) {
    const g = byId.get(id)!;
    const boxes = [
      ...graph.nodes.filter((n) => n.parent === id).map(nodeBox),
      ...[...byId.values()].filter((c) => c.parent === id).map((c) => ({ x: c.x, y: c.y, w: c.w, h: c.h })),
    ];
    if (!boxes.length) continue;
    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.w));
    const maxY = Math.max(...boxes.map((b) => b.y + b.h));
    g.x = Math.round(minX - GROUP_PAD.side);
    g.y = Math.round(minY - GROUP_PAD.top);
    g.w = Math.round(Math.max(140, maxX - minX + GROUP_PAD.side * 2));
    g.h = Math.round(Math.max(90, maxY - minY + GROUP_PAD.top + GROUP_PAD.bottom));
  }
  return { ...graph, groups: graph.groups.map((g) => byId.get(g.id)!) };
}

/** Auto-position nodes (used on import and via the "Auto layout" button). */
export function autoLayout(graph: Graph): Graph {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: RANKDIR[graph.direction], nodesep: 60, ranksep: 80 });
  g.setDefaultEdgeLabel(() => ({}));
  const groupIds = new Set(graph.groups.map((x) => x.id));
  for (const gr of graph.groups) g.setNode(gr.id, { width: gr.w, height: gr.h });
  for (const n of graph.nodes) {
    const { w, h } = nodeSize(n.label, n.shape);
    g.setNode(n.id, { width: w, height: h });
  }
  for (const gr of graph.groups) if (gr.parent && groupIds.has(gr.parent)) g.setParent(gr.id, gr.parent);
  for (const n of graph.nodes) if (n.parent && groupIds.has(n.parent)) g.setParent(n.id, n.parent);
  for (const e of graph.edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const laid: Graph = {
    ...graph,
    nodes: graph.nodes.map((n) => {
      const p = g.node(n.id);
      const { w, h } = nodeSize(n.label, n.shape);
      return { ...n, x: Math.round(p.x - w / 2), y: Math.round(p.y - h / 2) };
    }),
  };
  return fitGroups(laid);
}
