import type { Graph, GraphMeta } from './types';

/**
 * Accept a saved graph from any earlier version (or a hand-edited project file)
 * and return a current Graph, or null if it isn't one.
 */
export function normalizeGraph(raw: unknown): Graph | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = raw as any;
  if (!g || !Array.isArray(g.nodes) || !Array.isArray(g.edges)) return null;
  return {
    ...g,
    direction: ['TD', 'LR', 'BT', 'RL'].includes(g.direction) ? g.direction : 'TD',
    groups: Array.isArray(g.groups) ? g.groups : [],
    // v0.3 and earlier stored a single `style` per edge.
    edges: g.edges.map((e: Record<string, unknown>) => ({
      ...e,
      line: e.line ?? (e.style === 'dotted' ? 'dotted' : e.style === 'thick' ? 'thick' : 'solid'),
      head: e.head ?? (e.style === 'open' ? 'none' : 'arrow'),
      tail: e.tail ?? 'none',
    })),
  };
}

/** The parts of a graph the canvas doesn't edit but must carry along. */
export function metaOf(g: GraphMeta): GraphMeta {
  const out: GraphMeta = {};
  if (g.diagram === 'state' || g.diagram === 'er') out.diagram = g.diagram;
  if (g.keyword) out.keyword = g.keyword;
  if (g.frontmatter !== undefined) out.frontmatter = g.frontmatter;
  if (g.preamble?.length) out.preamble = g.preamble;
  if (g.extras?.length) out.extras = g.extras;
  if (g.classDefs && Object.keys(g.classDefs).length) out.classDefs = g.classDefs;
  return out;
}
