import {
  directiveCollector,
  extractFrontmatter,
  parseCss,
  unquoteLabel,
  type ParseResult,
} from './parse';
import { quoteLabel } from './serialize';
import { cssToString, type Css, type Direction, type GGroup, type GNode, type Graph, type GEdge, type Shape } from './types';

const ID = '[A-Za-z0-9_]+';
const normDir = (d: string): Direction => (d.toUpperCase() === 'TB' ? 'TD' : d.toUpperCase()) as Direction;

/** Reserved by the state grammar; an id equal to one of these would break the text. */
const STATE_RESERVED = new Set([
  'state', 'note', 'end', 'direction', 'classdef', 'class', 'click', 'hide', 'scale', 'as', 'left', 'right', 'of', 'title',
]);

export function safeStateId(id: string): string {
  let out = id.replace(/[^A-Za-z0-9_]/g, '_') || 'n';
  if (STATE_RESERVED.has(out.toLowerCase())) out += '_';
  return out;
}

export const startId = (scope?: string) => (scope ? `${scope}_start` : '_start');
export const endId = (scope?: string) => (scope ? `${scope}_end` : '_end');

export function parseState(input: string): ParseResult {
  const warnings: string[] = [];
  const nodes = new Map<string, GNode>();
  const groups = new Map<string, GGroup>();
  const edges: GEdge[] = [];
  const extras: string[] = [];
  const classDefs: Record<string, Css> = {};
  const classStmts: [string[], string[]][] = [];
  const stack: string[] = [];
  const groupLabels = new Map<string, string>();
  let direction: Direction = 'TD';

  const { text, frontmatter, lineOffset } = extractFrontmatter(input);
  const directives = directiveCollector();
  const lines = text.split(/\r?\n/);

  // Composite ids may be used as transition endpoints before they are declared.
  const declared = new Set<string>();
  for (const l of lines) {
    const m = new RegExp(`^\\s*state\\s+(?:"[^"]*"\\s+as\\s+)?(${ID})\\s*\\{\\s*$`, 'i').exec(l);
    if (m) declared.add(m[1]);
  }
  const isGroup = (id: string) => declared.has(id) || groups.has(id);

  const scope = () => stack[stack.length - 1];
  let lineNo = 0;
  const keep = (stmt: string, why: string) => {
    extras.push(stmt);
    warnings.push(`Line ${lineNo}: ${why} — kept as-is (not shown on the canvas): "${stmt}"`);
  };

  const node = (id: string, shape: Shape = 'round', label?: string): GNode => {
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: label ?? id, shape, parent: scope(), x: 0, y: 0 };
      nodes.set(id, n);
    } else {
      if (label !== undefined) n.label = label;
    }
    return n;
  };

  /** `[*]` or a state id (optionally `:::class`); returns the id used by the edge. */
  const endpoint = (tok: string, role: 'src' | 'dst'): string => {
    if (tok === '[*]') {
      const id = role === 'src' ? startId(scope()) : endId(scope());
      if (!nodes.has(id)) node(id, role === 'src' ? 'start' : 'end', '');
      return id;
    }
    const m = new RegExp(`^(${ID})(?::::([A-Za-z0-9_-]+))?$`).exec(tok)!;
    if (isGroup(m[1])) return m[1];
    const n = node(m[1]);
    if (m[2]) n.classes = [...new Set([...(n.classes ?? []), m[2]])];
    return m[1];
  };

  const openGroup = (id: string, label: string) => {
    groups.set(id, { id, label: groupLabels.get(id) ?? label, parent: scope(), x: 0, y: 0, w: 200, h: 120 });
    stack.push(id);
  };

  let note: string[] | null = null;
  const TOKEN = `(?:\\[\\*\\]|${ID}(?::::[A-Za-z0-9_-]+)?)`;
  const transition = new RegExp(`^(${TOKEN})\\s*-->\\s*(${TOKEN})\\s*(?::\\s*(.*))?$`);

  lines.forEach((raw, i) => {
    lineNo = i + 1 + lineOffset;
    let line = raw.trim();
    if (note) {
      note.push(line);
      if (/^end\s+note$/i.test(line)) {
        extras.push(note.join('\n'));
        warnings.push(`Line ${lineNo}: notes aren't editable here — kept as-is.`);
        note = null;
      }
      return;
    }
    if (directives.feed(line)) return;
    line = line.replace(/^%%.*$/, '').trim();
    if (!line) return;

    let m: RegExpExecArray | null;
    if (/^stateDiagram(?:-v2)?\s*$/i.test(line)) return;
    if (line === '}') {
      stack.pop();
      return;
    }
    if (line === '--') {
      warnings.push(`Line ${lineNo}: concurrent regions ("--") aren't supported; the separator was dropped.`);
      return;
    }
    if ((m = /^direction\s+(TB|TD|LR|RL|BT)\s*$/i.exec(line))) {
      if (scope()) groups.get(scope())!.direction = normDir(m[1]);
      else direction = normDir(m[1]);
      return;
    }
    if ((m = /^classDef\s+(\S+)\s+(.+)$/i.exec(line))) {
      for (const name of m[1].split(',')) classDefs[name] = { ...classDefs[name], ...parseCss(m[2]) };
      return;
    }
    if ((m = /^class\s+(\S+)\s+(\S+)$/i.exec(line))) {
      classStmts.push([m[1].split(','), m[2].split(',')]);
      return;
    }
    if (/^note\s/i.test(line)) {
      if (line.includes(':')) keep(line, 'notes aren\'t editable here');
      else {
        note = [line];
      }
      return;
    }
    if ((m = new RegExp(`^state\\s+"([^"]*)"\\s+as\\s+(${ID})\\s*\\{$`, 'i').exec(line))) {
      openGroup(m[2], unquoteLabel(m[1]));
      return;
    }
    if ((m = new RegExp(`^state\\s+(${ID})\\s*\\{$`, 'i').exec(line))) {
      openGroup(m[1], m[1]);
      return;
    }
    if ((m = new RegExp(`^state\\s+"([^"]*)"\\s+as\\s+(${ID})$`, 'i').exec(line))) {
      if (isGroup(m[2])) groupLabels.set(m[2], unquoteLabel(m[1]));
      else node(m[2], 'round', unquoteLabel(m[1]));
      return;
    }
    if ((m = new RegExp(`^state\\s+(${ID})\\s+<<(choice|fork|join)>>$`, 'i').exec(line))) {
      const n = node(m[1], m[2].toLowerCase() === 'choice' ? 'choice' : 'fork');
      n.shape = m[2].toLowerCase() === 'choice' ? 'choice' : 'fork';
      return;
    }
    if ((m = transition.exec(line))) {
      const source = endpoint(m[1], 'src');
      const target = endpoint(m[2], 'dst');
      edges.push({
        id: `e${edges.length + 1}`,
        source,
        target,
        label: m[3] ? unquoteLabel(m[3]) : '',
        line: 'solid',
        head: 'arrow',
        tail: 'none',
      });
      return;
    }
    if ((m = new RegExp(`^(${ID})\\s*:\\s*(.*)$`).exec(line))) {
      // `id : description` — the description is what the state displays.
      const desc = unquoteLabel(m[2]);
      const existing = nodes.get(m[1]);
      if (isGroup(m[1])) groupLabels.set(m[1], desc);
      else if (existing && existing.label !== existing.id) existing.label += `\n${desc}`;
      else node(m[1], 'round', desc);
      return;
    }
    if ((m = new RegExp(`^(${ID})(?::::([A-Za-z0-9_-]+))?$`).exec(line))) {
      if (!isGroup(m[1])) {
        const n = node(m[1]);
        if (m[2]) n.classes = [...new Set([...(n.classes ?? []), m[2]])];
      }
      return;
    }
    keep(line, 'could not parse');
  });

  for (const [ids, names] of classStmts)
    for (const id of ids) {
      const t = nodes.get(id) ?? groups.get(id);
      if (t) t.classes = [...new Set([...(t.classes ?? []), ...names])];
    }
  if (stack.length) warnings.push('A composite state is missing its closing "}".');

  return {
    graph: {
      diagram: 'state',
      direction,
      nodes: [...nodes.values()],
      edges,
      groups: [...groups.values()],
      ...(frontmatter !== undefined ? { frontmatter } : {}),
      ...(directives.preamble.length ? { preamble: directives.preamble } : {}),
      ...(extras.length ? { extras } : {}),
      ...(Object.keys(classDefs).length ? { classDefs } : {}),
    },
    warnings,
  };
}

export function toState(graph: Graph): string {
  const ids = new Map<string, string>();
  const used = new Set<string>();
  const assign = (raw: string) => {
    let id = safeStateId(raw);
    while (used.has(id)) id += '_';
    used.add(id);
    ids.set(raw, id);
  };
  graph.groups.forEach((g) => assign(g.id));
  graph.nodes.forEach((n) => assign(n.id));

  const byId = new Map<string, GNode>(graph.nodes.map((n) => [n.id, n]));
  const groupIds = new Set(graph.groups.map((g) => g.id));
  const parentOf = (id: string): string | undefined => {
    const p = byId.get(id)?.parent ?? graph.groups.find((g) => g.id === id)?.parent;
    return p && groupIds.has(p) ? p : undefined;
  };
  const linked = new Set<string>();
  for (const e of graph.edges) {
    linked.add(e.source);
    linked.add(e.target);
  }

  const lines: string[] = [];
  if (graph.frontmatter?.trim()) lines.push('---', graph.frontmatter.replace(/\s+$/, ''), '---');
  lines.push(...(graph.preamble ?? []));
  lines.push('stateDiagram-v2');
  if (graph.direction !== 'TD') lines.push(`    direction ${graph.direction}`);

  const ref = (id: string, role: 'src' | 'dst') => {
    const n = byId.get(id);
    if (role === 'src' && n?.shape === 'start') return '[*]';
    if (role === 'dst' && n?.shape === 'end') return '[*]';
    return ids.get(id);
  };

  const emitScope = (scope: string | undefined, indent: string) => {
    for (const n of graph.nodes) {
      if (parentOf(n.id) !== scope || n.shape === 'start' || n.shape === 'end') continue;
      const id = ids.get(n.id)!;
      if (n.shape === 'choice') lines.push(`${indent}state ${id} <<choice>>`);
      else if (n.shape === 'fork') lines.push(`${indent}state ${id} <<fork>>`);
      else if (n.label !== n.id) lines.push(`${indent}state ${quoteLabel(n.label)} as ${id}`);
      else if (!linked.has(n.id)) lines.push(`${indent}${id}`);
    }
    for (const g of graph.groups) {
      if (parentOf(g.id) !== scope) continue;
      const id = ids.get(g.id)!;
      lines.push(g.label !== g.id ? `${indent}state ${quoteLabel(g.label)} as ${id} {` : `${indent}state ${id} {`);
      if (g.direction) lines.push(`${indent}    direction ${g.direction}`);
      emitScope(g.id, indent + '    ');
      lines.push(`${indent}}`);
    }
    for (const e of graph.edges) {
      const ps = parentOf(e.source);
      const pt = parentOf(e.target);
      if ((ps === pt ? ps : undefined) !== scope) continue;
      const s = ref(e.source, 'src');
      const t = ref(e.target, 'dst');
      if (!s || !t) continue;
      const label = e.label.trim().replace(/\r?\n/g, '<br/>');
      lines.push(`${indent}${s} --> ${t}${label ? ` : ${label}` : ''}`);
    }
  };
  emitScope(undefined, '    ');

  for (const [name, css] of Object.entries(graph.classDefs ?? {})) {
    if (Object.keys(css).length) lines.push(`    classDef ${name} ${cssToString(css)}`);
  }
  const byClass = new Map<string, string[]>();
  for (const x of [...graph.groups, ...graph.nodes]) {
    for (const c of x.classes ?? []) byClass.set(c, [...(byClass.get(c) ?? []), ids.get(x.id)!]);
  }
  for (const [c, members] of byClass) lines.push(`    class ${members.join(',')} ${c}`);
  for (const x of graph.extras ?? []) lines.push(`    ${x}`);

  return lines.join('\n') + '\n';
}
