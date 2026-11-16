import { directiveCollector, extractFrontmatter, parseCss, unquoteLabel, type ParseResult } from './parse';
import { quoteLabel } from './serialize';
import { cssToString, type Attr, type Card, type Css, type Direction, type GEdge, type GNode, type Graph } from './types';

const NAME = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_-]*)`;
const bare = (s: string) => (s.startsWith('"') ? s.slice(1, -1) : s);
const normDir = (d: string): Direction => (d.toUpperCase() === 'TB' ? 'TD' : d.toUpperCase()) as Direction;

const LEFT: Record<string, Card> = { '||': 'one', '|o': 'zero-one', '}o': 'zero-many', '}|': 'one-many' };
const RIGHT: Record<string, Card> = { '||': 'one', 'o|': 'zero-one', 'o{': 'zero-many', '|{': 'one-many' };
export const LEFT_SYM: Record<Card, string> = { one: '||', 'zero-one': '|o', 'zero-many': '}o', 'one-many': '}|' };
export const RIGHT_SYM: Record<Card, string> = { one: '||', 'zero-one': 'o|', 'zero-many': 'o{', 'one-many': '|{' };

/** Entity names may contain `-`; anything else odd gets quoted. */
export const entityName = (id: string) => (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(id) ? id : `"${id.replace(/"/g, "'")}"`);

const REL = new RegExp(
  `^(${NAME})\\s+(\\|\\||\\|o|\\}o|\\}\\|)(--|\\.\\.)(\\|\\||o\\||o\\{|\\|\\{)\\s+(${NAME})\\s*(?::\\s*(.*))?$`,
);
const OPEN = new RegExp(`^(${NAME})(?:\\[(.*)\\])?\\s*\\{\\s*$`);
const EMPTY = new RegExp(`^(${NAME})(?:\\[(.*)\\])?\\s*\\{\\s*\\}\\s*$`);
const ONELINE = new RegExp(`^(${NAME})(?:\\[(.*)\\])?\\s*\\{\\s*(.+?)\\s*\\}\\s*$`);
const SOLO = new RegExp(`^(${NAME})(?:\\[(.*)\\])?$`);
const ATTR = /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/;

export function parseEr(input: string): ParseResult {
  const warnings: string[] = [];
  const nodes = new Map<string, GNode>();
  const edges: GEdge[] = [];
  const extras: string[] = [];
  const classDefs: Record<string, Css> = {};
  const classStmts: [string[], string[]][] = [];
  let direction: Direction = 'TD';
  let current: GNode | null = null;

  const { text, frontmatter, lineOffset } = extractFrontmatter(input);
  const directives = directiveCollector();
  let lineNo = 0;
  const keep = (stmt: string, why: string) => {
    extras.push(stmt);
    warnings.push(`Line ${lineNo}: ${why} — kept as-is (not shown on the canvas): "${stmt}"`);
  };
  const entity = (rawName: string, alias?: string): GNode => {
    const id = bare(rawName);
    let n = nodes.get(id);
    if (!n) {
      n = { id, label: id, shape: 'entity', attrs: [], x: 0, y: 0 };
      nodes.set(id, n);
    }
    if (alias !== undefined) n.label = unquoteLabel(alias) || id;
    return n;
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    lineNo = i + 1 + lineOffset;
    let line = raw.trim();
    if (directives.feed(line)) return;
    line = line.replace(/^%%.*$/, '').trim();
    if (!line) return;
    let m: RegExpExecArray | null;

    if (current) {
      if (line === '}') {
        current = null;
        return;
      }
      if ((m = ATTR.exec(line))) {
        current.attrs!.push({
          type: m[1],
          name: m[2],
          ...(m[3] ? { keys: m[3] } : {}),
          ...(m[4] !== undefined ? { comment: m[4] } : {}),
        });
      } else {
        current.attrs!.push({ type: '', name: '', raw: line });
        warnings.push(`Line ${lineNo}: could not parse this attribute — kept as-is: "${line}"`);
      }
      return;
    }

    if (/^erDiagram\s*$/i.test(line)) return;
    if ((m = /^direction\s+(TB|TD|LR|RL|BT)\s*$/i.exec(line))) {
      direction = normDir(m[1]);
      return;
    }
    if ((m = /^classDef\s+(\S+)\s+(.+)$/i.exec(line))) {
      for (const name of m[1].split(',')) classDefs[name] = { ...classDefs[name], ...parseCss(m[2]) };
      return;
    }
    if ((m = /^class\s+(\S+)\s+(\S+)$/i.exec(line))) {
      classStmts.push([m[1].split(',').map(bare), m[2].split(',')]);
      return;
    }
    if ((m = REL.exec(line))) {
      const a = entity(m[1]);
      const b = entity(m[5]);
      edges.push({
        id: `e${edges.length + 1}`,
        source: a.id,
        target: b.id,
        label: m[6] ? unquoteLabel(m[6]) : '',
        line: m[3] === '..' ? 'dotted' : 'solid',
        head: 'none',
        tail: 'none',
        er: { from: LEFT[m[2]], to: RIGHT[m[4]] },
      });
      return;
    }
    if ((m = EMPTY.exec(line))) {
      entity(m[1], m[2]);
      return;
    }
    if ((m = ONELINE.exec(line)) && ATTR.test(m[3])) {
      // `NAME { type name KEY "comment" }` on one line
      const a = ATTR.exec(m[3])!;
      entity(m[1], m[2]).attrs!.push({
        type: a[1],
        name: a[2],
        ...(a[3] ? { keys: a[3] } : {}),
        ...(a[4] !== undefined ? { comment: a[4] } : {}),
      });
      return;
    }
    if ((m = OPEN.exec(line))) {
      current = entity(m[1], m[2]);
      return;
    }
    if ((m = SOLO.exec(line)) && !/^(style|classDef|class|click|direction|title|accTitle|accDescr)\b/i.test(line)) {
      entity(m[1], m[2]);
      return;
    }
    keep(line, 'could not parse');
  });

  for (const [ids, names] of classStmts)
    for (const id of ids) {
      const t = nodes.get(id);
      if (t) t.classes = [...new Set([...(t.classes ?? []), ...names])];
    }
  if (current) warnings.push('An entity block is missing its closing "}".');

  return {
    graph: {
      diagram: 'er',
      direction,
      nodes: [...nodes.values()],
      edges,
      groups: [],
      ...(frontmatter !== undefined ? { frontmatter } : {}),
      ...(directives.preamble.length ? { preamble: directives.preamble } : {}),
      ...(extras.length ? { extras } : {}),
      ...(Object.keys(classDefs).length ? { classDefs } : {}),
    },
    warnings,
  };
}

const oneWord = (s: string, fallback: string) => s.trim().replace(/\s+/g, '_') || fallback;

function attrLine(a: Attr): string {
  if (a.raw) return a.raw;
  const parts = [oneWord(a.type, 'string'), oneWord(a.name, 'attr')];
  if (a.keys?.trim()) parts.push(a.keys.trim());
  if (a.comment?.trim()) parts.push(quoteLabel(a.comment.trim()).replace(/<br\/>/g, ' '));
  return parts.join(' ');
}

export function toEr(graph: Graph): string {
  const lines: string[] = [];
  if (graph.frontmatter?.trim()) lines.push('---', graph.frontmatter.replace(/\s+$/, ''), '---');
  lines.push(...(graph.preamble ?? []));
  lines.push('erDiagram');
  if (graph.direction !== 'TD') lines.push(`    direction ${graph.direction}`);

  const linked = new Set<string>();
  for (const e of graph.edges) {
    linked.add(e.source);
    linked.add(e.target);
  }
  for (const n of graph.nodes) {
    const head = entityName(n.id) + (n.label !== n.id ? `[${quoteLabel(n.label)}]` : '');
    const attrs = n.attrs ?? [];
    if (attrs.length) {
      lines.push(`    ${head} {`);
      for (const a of attrs) lines.push(`        ${attrLine(a)}`);
      lines.push('    }');
    } else if (n.label !== n.id || !linked.has(n.id)) {
      lines.push(`    ${head}`);
    }
  }
  const ids = new Set(graph.nodes.map((n) => n.id));
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue;
    const er = e.er ?? { from: 'one' as Card, to: 'zero-many' as Card };
    const op = `${LEFT_SYM[er.from]}${e.line === 'dotted' ? '..' : '--'}${RIGHT_SYM[er.to]}`;
    lines.push(`    ${entityName(e.source)} ${op} ${entityName(e.target)} : ${quoteLabel(e.label.trim())}`);
  }

  for (const [name, css] of Object.entries(graph.classDefs ?? {})) {
    if (Object.keys(css).length) lines.push(`    classDef ${name} ${cssToString(css)}`);
  }
  const byClass = new Map<string, string[]>();
  for (const n of graph.nodes) for (const c of n.classes ?? []) byClass.set(c, [...(byClass.get(c) ?? []), entityName(n.id)]);
  for (const [c, members] of byClass) lines.push(`    class ${members.join(',')} ${c}`);
  for (const x of graph.extras ?? []) lines.push(`    ${x}`);
  return lines.join('\n') + '\n';
}
