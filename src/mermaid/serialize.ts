import type { EdgeStyle, Graph, Shape } from './types';

const WRAP: Record<Shape, [string, string]> = {
  rect: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  diamond: ['{', '}'],
  circle: ['((', '))'],
  cylinder: ['[(', ')]'],
  hexagon: ['{{', '}}'],
};

const OP: Record<EdgeStyle, string> = {
  arrow: '-->',
  open: '---',
  dotted: '-.->',
  thick: '==>',
};

const RESERVED = new Set(['end', 'graph', 'flowchart', 'subgraph', 'style', 'class', 'click']);

/** Make an id safe for Mermaid: word chars only, not a reserved word. */
export function safeId(id: string): string {
  let out = id.replace(/[^A-Za-z0-9_]/g, '_');
  if (!out) out = 'n';
  if (RESERVED.has(out.toLowerCase())) out = `${out}_`;
  return out;
}

/** Labels are always quoted so brackets, pipes, etc. can't break the syntax. */
export function quoteLabel(label: string): string {
  const escaped = label
    .replace(/"/g, '#quot;')
    .replace(/\r?\n/g, '<br/>');
  return `"${escaped}"`;
}

export function toMermaid(graph: Graph): string {
  // Nodes and subgraphs share one id namespace in Mermaid.
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const assign = (raw: string) => {
    let id = safeId(raw);
    while (used.has(id)) id += '_';
    used.add(id);
    ids.set(raw, id);
  };
  graph.groups.forEach((g) => assign(g.id));
  graph.nodes.forEach((n) => assign(n.id));

  const groupIds = new Set(graph.groups.map((g) => g.id));
  const parentOf = (p?: string) => (p && groupIds.has(p) ? p : undefined);

  const lines = [`flowchart ${graph.direction}`];

  const emitNodes = (parent: string | undefined, indent: string) => {
    for (const n of graph.nodes) {
      if (parentOf(n.parent) !== parent) continue;
      const [open, close] = WRAP[n.shape];
      lines.push(`${indent}${ids.get(n.id)}${open}${quoteLabel(n.label)}${close}`);
    }
  };
  const emitGroups = (parent: string | undefined, indent: string, seen: Set<string>) => {
    for (const g of graph.groups) {
      if (parentOf(g.parent) !== parent || seen.has(g.id)) continue;
      seen.add(g.id);
      lines.push(`${indent}subgraph ${ids.get(g.id)}[${quoteLabel(g.label)}]`);
      emitNodes(g.id, indent + '    ');
      emitGroups(g.id, indent + '    ', seen);
      lines.push(`${indent}end`);
    }
  };

  emitNodes(undefined, '    ');
  emitGroups(undefined, '    ', new Set());

  for (const e of graph.edges) {
    const s = ids.get(e.source);
    const t = ids.get(e.target);
    if (!s || !t) continue;
    const label = e.label.trim() ? `|${quoteLabel(e.label.trim())}|` : '';
    lines.push(`    ${s} ${OP[e.style]}${label} ${t}`);
  }
  return lines.join('\n') + '\n';
}
