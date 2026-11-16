import { cssToString, type End, type Graph, type Line, type Shape } from './types';

const WRAP: Record<Shape, [string, string]> = {
  rect: ['[', ']'],
  round: ['(', ')'],
  stadium: ['([', '])'],
  diamond: ['{', '}'],
  circle: ['((', '))'],
  cylinder: ['[(', ')]'],
  hexagon: ['{{', '}}'],
  subroutine: ['[[', ']]'],
  parallelogram: ['[/', '/]'],
  'parallelogram-alt': ['[\\', '\\]'],
  trapezoid: ['[/', '\\]'],
  'trapezoid-alt': ['[\\', '/]'],
  asymmetric: ['>', ']'],
  doublecircle: ['(((', ')))'],
};

const HEAD: Record<Exclude<End, 'none'>, string> = { arrow: '>', circle: 'o', cross: 'x' };
const TAIL: Record<Exclude<End, 'none'>, string> = { arrow: '<', circle: 'o', cross: 'x' };

/** e.g. solid/arrow/none -> `-->`, dotted/arrow/arrow -> `<-.->`, thick/none/none -> `===` */
export function edgeOp(line: Line, head: End, tail: End): string {
  const h = head === 'none' ? '' : HEAD[head];
  const body =
    line === 'solid' ? (h ? `--${h}` : '---') : line === 'dotted' ? `-.-${h}` : h ? `==${h}` : '===';
  return (tail === 'none' ? '' : TAIL[tail]) + body;
}

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

  const lines: string[] = [];
  if (graph.frontmatter?.trim()) lines.push('---', graph.frontmatter.replace(/\s+$/, ''), '---');
  lines.push(...(graph.preamble ?? []));
  lines.push(`${graph.keyword ?? 'flowchart'} ${graph.direction}`);

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
      if (g.direction) lines.push(`${indent}    direction ${g.direction}`);
      emitNodes(g.id, indent + '    ');
      emitGroups(g.id, indent + '    ', seen);
      lines.push(`${indent}end`);
    }
  };

  emitNodes(undefined, '    ');
  emitGroups(undefined, '    ', new Set());

  let edgeIndex = 0;
  const linkStyles: string[] = [];
  for (const e of graph.edges) {
    const s = ids.get(e.source);
    const t = ids.get(e.target);
    if (!s || !t) continue;
    const label = e.label.trim() ? `|${quoteLabel(e.label.trim())}|` : '';
    lines.push(`    ${s} ${edgeOp(e.line, e.head, e.tail)}${label} ${t}`);
    if (e.css && Object.keys(e.css).length) linkStyles.push(`    linkStyle ${edgeIndex} ${cssToString(e.css)}`);
    edgeIndex++;
  }

  for (const [name, css] of Object.entries(graph.classDefs ?? {})) {
    if (Object.keys(css).length) lines.push(`    classDef ${name} ${cssToString(css)}`);
  }
  const byClass = new Map<string, string[]>();
  for (const x of [...graph.groups, ...graph.nodes]) {
    for (const c of x.classes ?? []) byClass.set(c, [...(byClass.get(c) ?? []), ids.get(x.id)!]);
  }
  for (const [c, members] of byClass) lines.push(`    class ${members.join(',')} ${c}`);
  for (const x of [...graph.groups, ...graph.nodes]) {
    if (x.css && Object.keys(x.css).length) lines.push(`    style ${ids.get(x.id)} ${cssToString(x.css)}`);
  }
  lines.push(...linkStyles);
  for (const x of graph.extras ?? []) lines.push(`    ${x}`);

  return lines.join('\n') + '\n';
}
