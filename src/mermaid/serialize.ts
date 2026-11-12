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
  const ids = new Map<string, string>();
  const used = new Set<string>();
  for (const n of graph.nodes) {
    let id = safeId(n.id);
    while (used.has(id)) id += '_';
    used.add(id);
    ids.set(n.id, id);
  }

  const lines = [`flowchart ${graph.direction}`];
  for (const n of graph.nodes) {
    const [open, close] = WRAP[n.shape];
    lines.push(`    ${ids.get(n.id)}${open}${quoteLabel(n.label)}${close}`);
  }
  for (const e of graph.edges) {
    const s = ids.get(e.source);
    const t = ids.get(e.target);
    if (!s || !t) continue;
    const label = e.label.trim() ? `|${quoteLabel(e.label.trim())}|` : '';
    lines.push(`    ${s} ${OP[e.style]}${label} ${t}`);
  }
  return lines.join('\n') + '\n';
}
