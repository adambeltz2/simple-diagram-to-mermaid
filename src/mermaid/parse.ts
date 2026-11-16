import type { Css, Direction, End, GEdge, GGroup, GNode, Graph, Line, Shape } from './types';

export interface ParseResult {
  graph: Graph;
  warnings: string[];
}

// Longest opener first so "(((" wins over "((" wins over "(". Several shapes share an
// opener and differ only in the closer; if one closer isn't found we try the next.
const SHAPES: { open: string; close: string; shape: Shape }[] = [
  { open: '(((', close: ')))', shape: 'doublecircle' },
  { open: '((', close: '))', shape: 'circle' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '[[', close: ']]', shape: 'subroutine' },
  { open: '[/', close: '/]', shape: 'parallelogram' },
  { open: '[/', close: '\\]', shape: 'trapezoid' },
  { open: '[\\', close: '\\]', shape: 'parallelogram-alt' },
  { open: '[\\', close: '/]', shape: 'trapezoid-alt' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'round' },
  { open: '{', close: '}', shape: 'diamond' },
  { open: '>', close: ']', shape: 'asymmetric' },
];

/** Names accepted by the newer `A@{ shape: name }` syntax, mapped to our shapes. */
const SHAPE_NAMES: Record<string, Shape> = {
  rect: 'rect', rectangle: 'rect', proc: 'rect', process: 'rect',
  rounded: 'round', event: 'round',
  stadium: 'stadium', terminal: 'stadium', pill: 'stadium',
  cyl: 'cylinder', cylinder: 'cylinder', db: 'cylinder', database: 'cylinder',
  circle: 'circle', circ: 'circle',
  diam: 'diamond', diamond: 'diamond', decision: 'diamond', question: 'diamond',
  hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon',
  'lean-r': 'parallelogram', 'in-out': 'parallelogram',
  'lean-l': 'parallelogram-alt', 'out-in': 'parallelogram-alt',
  'trap-b': 'trapezoid', 'trapezoid-bottom': 'trapezoid', priority: 'trapezoid',
  'trap-t': 'trapezoid-alt', 'trapezoid-top': 'trapezoid-alt', manual: 'trapezoid-alt',
  'fr-rect': 'subroutine', subproc: 'subroutine', subroutine: 'subroutine', 'framed-rectangle': 'subroutine',
  'dbl-circ': 'doublecircle', 'double-circle': 'doublecircle',
  odd: 'asymmetric',
};

export function unquoteLabel(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"');
}

/** `fill:#f9f,stroke:#333,stroke-width:4px` -> object. Commas inside (...) are kept. */
export function parseCss(s: string): Css {
  const parts: string[] = [];
  let cur = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  const out: Css = {};
  for (const p of parts) {
    const i = p.indexOf(':');
    if (i < 0) continue;
    const k = p.slice(0, i).trim();
    const v = p.slice(i + 1).trim().replace(/;$/, '');
    if (k && v) out[k] = v;
  }
  return out;
}

/** Pull a leading `---` YAML frontmatter block off the text. */
export function extractFrontmatter(input: string): { text: string; frontmatter?: string; lineOffset: number } {
  const fm = /^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(input);
  if (!fm) return { text: input, lineOffset: 0 };
  return { text: input.slice(fm[0].length), frontmatter: fm[1], lineOffset: fm[0].split('\n').length - 1 };
}

/** Collects `%%{ ... }%%` directives (possibly spanning lines); `feed` returns true if it consumed the line. */
export function directiveCollector() {
  const preamble: string[] = [];
  let open: string[] | null = null;
  const feed = (line: string): boolean => {
    if (open) {
      open.push(line);
      if (line.includes('}%%')) {
        preamble.push(open.join('\n'));
        open = null;
      }
      return true;
    }
    if (line.startsWith('%%{')) {
      if (line.includes('}%%')) preamble.push(line);
      else open = [line];
      return true;
    }
    return false;
  };
  return { preamble, feed };
}

/** Split on `;` outside of double quotes. */
function splitStatements(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    if (ch === ';' && !inQ) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

interface NodeRef {
  id: string;
  label?: string;
  shape?: Shape;
  classes?: string[];
  /** an `A@{ ... }` definition we can't represent; kept verbatim */
  raw?: string;
}

/** Parse the `{ shape: cyl, label: "x" }` body of `A@{ ... }`; null if we can't map it. */
function parseShapeProps(body: string): { shape: Shape; label?: string } | null {
  const props: Record<string, string> = {};
  let cur = '';
  let inQ = false;
  const parts: string[] = [];
  for (const ch of body) {
    if (ch === '"') inQ = !inQ;
    if (ch === ',' && !inQ) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  parts.push(cur);
  for (const part of parts) {
    const i = part.indexOf(':');
    if (i > 0) props[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  const shape = SHAPE_NAMES[(props.shape ?? '').replace(/^"|"$/g, '').toLowerCase()];
  if (!shape) return null;
  // Anything besides shape/label (icon, img, pos, ...) can't be shown, so keep the original line.
  if (Object.keys(props).some((k) => k !== 'shape' && k !== 'label')) return null;
  return { shape, label: props.label !== undefined ? unquoteLabel(props.label) : undefined };
}

/** Parse `id` or `id[label]` etc. at the start of `s`. */
function parseNodeBase(s: string): { ref: NodeRef; rest: string } | null {
  const m = /^[A-Za-z0-9_]+/.exec(s);
  if (!m) return null;
  const id = m[0];
  const after = s.slice(id.length);

  if (after.startsWith('@{')) {
    let end = -1;
    let inQ = false;
    for (let k = 2; k < after.length; k++) {
      if (after[k] === '"') inQ = !inQ;
      else if (after[k] === '}' && !inQ) {
        end = k;
        break;
      }
    }
    if (end < 0) return null;
    const parsed = parseShapeProps(after.slice(2, end));
    const rest = after.slice(end + 1);
    if (parsed) return { ref: { id, shape: parsed.shape, label: parsed.label ?? id }, rest };
    return { ref: { id, raw: `${id}${after.slice(0, end + 1)}` }, rest };
  }

  for (const sh of SHAPES) {
    if (!after.startsWith(sh.open)) continue;
    const body = after.slice(sh.open.length);
    let end: number;
    if (body.startsWith('"')) {
      const q = body.indexOf('"', 1);
      end = q < 0 ? -1 : body.indexOf(sh.close, q + 1);
    } else {
      end = body.indexOf(sh.close);
    }
    if (end < 0) continue;
    return {
      ref: { id, label: unquoteLabel(body.slice(0, end)), shape: sh.shape },
      rest: body.slice(end + sh.close.length),
    };
  }
  return { ref: { id }, rest: after };
}

/** Node with an optional `:::className` suffix. */
function parseNode(s: string): { ref: NodeRef; rest: string } | null {
  const r = parseNodeBase(s);
  if (!r) return null;
  const c = /^:::([A-Za-z0-9_-]+)/.exec(r.rest);
  if (c) {
    r.ref.classes = [c[1]];
    r.rest = r.rest.slice(c[0].length);
  }
  return r;
}

/** Parse `A & B & C`. */
function parseNodeGroup(s: string): { refs: NodeRef[]; rest: string } | null {
  const refs: NodeRef[] = [];
  let rest = s.trimStart();
  for (;;) {
    const n = parseNode(rest);
    if (!n) return null;
    refs.push(n.ref);
    rest = n.rest.trimStart();
    if (rest.startsWith('&')) rest = rest.slice(1).trimStart();
    else break;
  }
  return { refs, rest };
}

const END_OF: Record<string, End> = { '>': 'arrow', '<': 'arrow', o: 'circle', x: 'cross' };
const endOf = (ch?: string): End => (ch && END_OF[ch]) || 'none';

interface Op {
  line: Line;
  head: End;
  tail: End;
  label: string;
  rest: string;
}

/** Parse an edge operator (with optional label) at the start of `s`. */
function parseEdgeOp(s: string): Op | null {
  // Plain operator: -->  ---  --o  --x  <-->  o--o  -.->  ==>  ===  ...
  let m = /^([<ox])?(?:(-{2,})([>ox])|(-{3,})|(-\.+-)([>ox])?|(={2,})([>ox])|(={3,}))/.exec(s);
  if (m) {
    const line: Line = m[2] || m[4] ? 'solid' : m[5] ? 'dotted' : 'thick';
    const head = endOf(m[3] ?? m[6] ?? m[8]);
    const tail = endOf(m[1]);
    let rest = s.slice(m[0].length);
    let label = '';
    const pipe = /^\s*\|/.exec(rest);
    if (pipe) {
      const body = rest.slice(pipe[0].length);
      let end: number;
      if (body.startsWith('"')) {
        const q = body.indexOf('"', 1);
        end = q < 0 ? -1 : body.indexOf('|', q + 1);
      } else end = body.indexOf('|');
      if (end >= 0) {
        label = unquoteLabel(body.slice(0, end));
        rest = body.slice(end + 1);
      }
    }
    return { line, head, tail, label, rest };
  }
  // Text-in-the-middle forms: `-- text -->`, `-. text .->`, `== text ==>`
  const forms: [RegExp, Line][] = [
    [/^([<ox])?--\s+(.+?)\s+(-{2,}[>ox]|-{3,})/, 'solid'],
    [/^([<ox])?-\.\s+(.+?)\s+(\.+-[>ox]?)/, 'dotted'],
    [/^([<ox])?==\s+(.+?)\s+(={2,}[>ox]|={3,})/, 'thick'],
  ];
  for (const [re, line] of forms) {
    m = re.exec(s);
    if (m) {
      return {
        line,
        head: endOf(m[3].slice(-1)),
        tail: endOf(m[1]),
        label: unquoteLabel(m[2]),
        rest: s.slice(m[0].length),
      };
    }
  }
  return null;
}

const DIRS = /^(TD|TB|LR|RL|BT)$/i;
const normDir = (d: string): Direction => (d.toUpperCase() === 'TB' ? 'TD' : d.toUpperCase()) as Direction;

export function parseMermaid(input: string): ParseResult {
  const warnings: string[] = [];
  const nodes = new Map<string, GNode>();
  const groups = new Map<string, GGroup>();
  const stack: string[] = [];
  const edges: GEdge[] = [];
  const extras: string[] = [];
  const classDefs: Record<string, Css> = {};
  const classStmts: [string[], string[]][] = [];
  const styleStmts: [string[], Css][] = [];
  const linkStmts: [string, Css][] = [];
  let keyword: string | undefined;
  let direction: Direction = 'TD';
  let sawHeader = false;

  const { text, frontmatter, lineOffset } = extractFrontmatter(input);
  const directives = directiveCollector();
  const preamble = directives.preamble;

  const current = () => stack[stack.length - 1];
  const keep = (lineNo: number, stmt: string, why: string) => {
    extras.push(stmt);
    warnings.push(`Line ${lineNo}: ${why} — kept as-is (not shown on the canvas): "${stmt}"`);
  };

  let lineNo = 0;
  let isGroupId: (id: string) => boolean = () => false;
  const touch = (r: NodeRef) => {
    if (isGroupId(r.id)) return; // a subgraph used as an edge endpoint, not a node
    if (r.raw) {
      extras.push(r.raw);
      warnings.push(`Line ${lineNo}: this shape definition isn't supported here — kept as-is: "${r.raw}"`);
    }
    const existing = nodes.get(r.id);
    if (!existing) {
      nodes.set(r.id, {
        id: r.id,
        label: r.label ?? r.id,
        shape: r.shape ?? 'rect',
        parent: current(),
        x: 0,
        y: 0,
        ...(r.classes ? { classes: [...r.classes] } : {}),
      });
    } else {
      if (r.shape) {
        existing.label = r.label ?? existing.label;
        existing.shape = r.shape;
      }
      if (!existing.parent && current()) existing.parent = current();
      if (r.classes) existing.classes = [...new Set([...(existing.classes ?? []), ...r.classes])];
    }
  };

  const openGroup = (rest: string) => {
    let id: string | undefined;
    let label: string;
    let m: RegExpExecArray | null;
    if ((m = /^([A-Za-z0-9_]+)\s*\[(.*)\]\s*$/.exec(rest))) {
      id = m[1];
      label = unquoteLabel(m[2]);
    } else if (/^[A-Za-z0-9_]+$/.test(rest)) {
      id = rest;
      label = rest;
    } else {
      label = unquoteLabel(rest);
    }
    const base = id ?? (label.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'group');
    let unique = base;
    for (let n = 2; groups.has(unique) || nodes.has(unique); n++) unique = `${base}_${n}`;
    groups.set(unique, { id: unique, label, parent: current(), x: 0, y: 0, w: 200, h: 120 });
    stack.push(unique);
  };

  const lines = text.split(/\r?\n/);
  // Subgraph ids can be used as edge endpoints before the subgraph is declared.
  const declared = new Set<string>();
  for (const l of lines) {
    const m = /^\s*subgraph\s+([A-Za-z0-9_]+)\s*(?:\[.*\])?\s*$/i.exec(l);
    if (m) declared.add(m[1]);
  }
  isGroupId = (id: string) => declared.has(id) || groups.has(id);

  lines.forEach((rawLine, i) => {
    lineNo = i + 1 + lineOffset;
    let line = rawLine.trim();

    if (directives.feed(line)) return;
    line = line.replace(/^%%.*$/, '').trim(); // plain comment lines are dropped
    if (!line) return;

    for (const stmt of splitStatements(line)) {
      const header = /^(flowchart(?:-elk)?|graph)(?:\s+(TD|TB|LR|RL|BT))?\s*$/i.exec(stmt);
      if (header) {
        sawHeader = true;
        if (/-elk$/i.test(header[1])) keyword = 'flowchart-elk';
        direction = normDir(header[2] ?? 'TD');
        continue;
      }
      if (/^end$/i.test(stmt)) {
        stack.pop();
        continue;
      }
      const sub = /^subgraph\s+(.+)$/i.exec(stmt);
      if (sub) {
        openGroup(sub[1].trim());
        continue;
      }
      const dir = /^direction\s+(\S+)$/i.exec(stmt);
      if (dir && DIRS.test(dir[1]) && current()) {
        groups.get(current())!.direction = normDir(dir[1]);
        continue;
      }
      let m: RegExpExecArray | null;
      if ((m = /^classDef\s+(\S+)\s+(.+)$/i.exec(stmt))) {
        for (const name of m[1].split(',')) classDefs[name] = { ...classDefs[name], ...parseCss(m[2]) };
        continue;
      }
      if ((m = /^class\s+(\S+)\s+(\S+)$/i.exec(stmt))) {
        classStmts.push([m[1].split(','), m[2].split(',')]);
        continue;
      }
      if ((m = /^style\s+(\S+)\s+(.+)$/i.exec(stmt))) {
        styleStmts.push([m[1].split(','), parseCss(m[2])]);
        continue;
      }
      if ((m = /^linkStyle\s+(default|[\d,\s]+?)\s+(.+)$/i.exec(stmt))) {
        linkStmts.push([m[1].trim(), parseCss(m[2])]);
        continue;
      }
      if (/^(click|accTitle|accDescr|direction|linkStyle|class|style|classDef)\b/i.test(stmt)) {
        keep(lineNo, stmt, `"${stmt.split(/\s/)[0]}" isn't editable here`);
        continue;
      }
      if (!sawHeader && /^[A-Za-z]+Diagram/i.test(stmt)) {
        warnings.push(`Line ${lineNo}: only flowcharts are supported.`);
        continue;
      }

      let group = parseNodeGroup(stmt);
      if (!group) {
        keep(lineNo, stmt, 'could not parse');
        continue;
      }
      group.refs.forEach(touch);
      let rest = group.rest.trim();
      while (rest) {
        const op = parseEdgeOp(rest);
        if (!op) {
          keep(lineNo, rest, 'could not parse the rest of this line');
          break;
        }
        const next = parseNodeGroup(op.rest);
        if (!next) {
          keep(lineNo, rest, 'edge has no target');
          break;
        }
        next.refs.forEach(touch);
        for (const s of group.refs)
          for (const t of next.refs)
            edges.push({
              id: `e${edges.length + 1}`,
              source: s.id,
              target: t.id,
              label: op.label,
              line: op.line,
              head: op.head,
              tail: op.tail,
            });
        group = next;
        rest = next.rest.trim();
      }
    }
  });

  // Resolve statements that may refer to things defined later.
  const target = (id: string) => nodes.get(id) ?? groups.get(id);
  for (const [ids, names] of classStmts)
    for (const id of ids) {
      const t = target(id);
      if (t) t.classes = [...new Set([...(t.classes ?? []), ...names])];
    }
  for (const [ids, css] of styleStmts)
    for (const id of ids) {
      const t = target(id);
      if (t) t.css = { ...t.css, ...css };
    }
  for (const [which, css] of linkStmts) {
    if (which === 'default') edges.forEach((e) => (e.css = { ...css, ...e.css }));
    else
      for (const n of which.split(',')) {
        const e = edges[Number(n.trim())];
        if (e) e.css = { ...e.css, ...css };
      }
  }

  if (!sawHeader && nodes.size > 0) warnings.push('No "flowchart TD" header found; assumed TD.');
  if (stack.length) warnings.push('A "subgraph" is missing its "end".');

  return {
    graph: {
      direction,
      nodes: [...nodes.values()],
      edges,
      groups: [...groups.values()],
      ...(keyword ? { keyword } : {}),
      ...(frontmatter !== undefined ? { frontmatter } : {}),
      ...(preamble.length ? { preamble } : {}),
      ...(extras.length ? { extras } : {}),
      ...(Object.keys(classDefs).length ? { classDefs } : {}),
    },
    warnings,
  };
}
