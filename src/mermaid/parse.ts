import type { Direction, EdgeStyle, GEdge, GNode, Graph, Shape } from './types';

export interface ParseResult {
  graph: Graph;
  warnings: string[];
}

// Longest opener first so "((" wins over "(".
const SHAPES: { open: string; close: string; shape: Shape }[] = [
  { open: '((', close: '))', shape: 'circle' },
  { open: '([', close: '])', shape: 'stadium' },
  { open: '[(', close: ')]', shape: 'cylinder' },
  { open: '{{', close: '}}', shape: 'hexagon' },
  { open: '[', close: ']', shape: 'rect' },
  { open: '(', close: ')', shape: 'round' },
  { open: '{', close: '}', shape: 'diamond' },
];

export function unquoteLabel(raw: string): string {
  let s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"');
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
}

/** Parse `id` or `id[label]` etc. at the start of `s`. */
function parseNode(s: string): { ref: NodeRef; rest: string } | null {
  const m = /^[A-Za-z0-9_]+/.exec(s);
  if (!m) return null;
  const id = m[0];
  const after = s.slice(id.length);
  for (const sh of SHAPES) {
    if (!after.startsWith(sh.open)) continue;
    const body = after.slice(sh.open.length);
    let end: number;
    if (body.startsWith('"')) {
      const q = body.indexOf('"', 1);
      if (q < 0) return null;
      end = body.indexOf(sh.close, q + 1);
    } else {
      end = body.indexOf(sh.close);
    }
    if (end < 0) return null;
    return {
      ref: { id, label: unquoteLabel(body.slice(0, end)), shape: sh.shape },
      rest: body.slice(end + sh.close.length),
    };
  }
  return { ref: { id }, rest: after };
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

function styleOf(op: string): EdgeStyle {
  if (op.includes('.')) return 'dotted';
  if (op.startsWith('=')) return 'thick';
  return op.endsWith('>') ? 'arrow' : 'open';
}

/** Parse an edge operator (with optional label) at the start of `s`. */
function parseEdgeOp(s: string): { style: EdgeStyle; label: string; rest: string } | null {
  // Plain operator, optionally followed by |label|
  let m = /^(-{2,}>|-{3,}|-\.+->|-\.+-|={2,}>|={3,})/.exec(s);
  if (m) {
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
    return { style: styleOf(m[0]), label, rest };
  }
  // Text-in-the-middle forms: `-- text -->`, `-. text .->`, `== text ==>`
  m =
    /^--\s+(.+?)\s+(-{2,}>|-{3,})/.exec(s) ||
    /^-\.\s+(.+?)\s+(\.+->|\.+-)/.exec(s) ||
    /^==\s+(.+?)\s+(={2,}>|={3,})/.exec(s);
  if (m) {
    return { style: styleOf(m[2].replace(/^\./, '-.')), label: unquoteLabel(m[1]), rest: s.slice(m[0].length) };
  }
  return null;
}

export function parseMermaid(text: string): ParseResult {
  const warnings: string[] = [];
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  let direction: Direction = 'TD';
  let sawHeader = false;
  let sawSubgraph = false;

  const touch = (r: NodeRef) => {
    const existing = nodes.get(r.id);
    if (!existing) {
      nodes.set(r.id, { id: r.id, label: r.label ?? r.id, shape: r.shape ?? 'rect', x: 0, y: 0 });
    } else if (r.shape) {
      existing.label = r.label ?? existing.label;
      existing.shape = r.shape;
    }
  };

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const lineNo = i + 1;
    const line = rawLine.replace(/^\s*%%.*$/, '').trim();
    if (!line) return;

    for (const stmt of splitStatements(line)) {
      const header = /^(?:flowchart|graph)(?:\s+(TD|TB|LR|RL|BT))?\s*$/i.exec(stmt);
      if (header) {
        sawHeader = true;
        const d = (header[1] ?? 'TD').toUpperCase();
        direction = (d === 'TB' ? 'TD' : d) as Direction;
        continue;
      }
      if (/^(end)$/i.test(stmt)) continue;
      if (/^subgraph\b/i.test(stmt)) {
        sawSubgraph = true;
        continue;
      }
      if (/^(direction|classDef|class|style|linkStyle|click)\b/i.test(stmt)) {
        warnings.push(`Line ${lineNo}: "${stmt.split(/\s/)[0]}" is not supported and was ignored.`);
        continue;
      }
      if (!sawHeader && /^[A-Za-z]+Diagram/i.test(stmt)) {
        warnings.push(`Line ${lineNo}: only flowcharts are supported.`);
        continue;
      }

      let group = parseNodeGroup(stmt);
      if (!group) {
        warnings.push(`Line ${lineNo}: could not parse "${stmt}".`);
        continue;
      }
      group.refs.forEach(touch);
      let rest = group.rest.trim();
      while (rest) {
        const op = parseEdgeOp(rest);
        if (!op) {
          warnings.push(`Line ${lineNo}: could not parse "${rest}".`);
          break;
        }
        const next = parseNodeGroup(op.rest);
        if (!next) {
          warnings.push(`Line ${lineNo}: edge has no target.`);
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
              style: op.style,
            });
        group = next;
        rest = next.rest.trim();
      }
    }
  });

  if (!sawHeader && nodes.size > 0) warnings.push('No "flowchart TD" header found; assumed TD.');
  if (sawSubgraph) warnings.push('Subgraphs are not supported yet; their nodes were flattened.');

  return { graph: { direction, nodes: [...nodes.values()], edges }, warnings };
}
