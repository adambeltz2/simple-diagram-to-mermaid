import { directiveCollector, extractFrontmatter, parseMermaid, type ParseResult } from './parse';
import { toMermaid } from './serialize';
import { parseState, toState } from './state';
import type { Graph } from './types';

/** Look at the first real line (after frontmatter, directives and comments). */
export function detectDiagram(text: string): 'flowchart' | 'state' {
  const { text: body } = extractFrontmatter(text);
  const d = directiveCollector();
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (d.feed(line) || !line || line.startsWith('%%')) continue;
    return /^stateDiagram/i.test(line) ? 'state' : 'flowchart';
  }
  return 'flowchart';
}

export function parseDiagram(text: string): ParseResult {
  return detectDiagram(text) === 'state' ? parseState(text) : parseMermaid(text);
}

export function toDiagram(graph: Graph): string {
  return graph.diagram === 'state' ? toState(graph) : toMermaid(graph);
}

/** Convert the open diagram to another type, mapping node kinds sensibly. */
export function convertDiagram(graph: Graph, to: 'flowchart' | 'state'): Graph {
  const from = graph.diagram ?? 'flowchart';
  if (from === to) return graph;
  const { diagram: _drop, ...rest } = graph;
  if (to === 'state') {
    return {
      ...rest,
      diagram: 'state',
      nodes: graph.nodes.map(({ css: _c, ...n }) => ({
        ...n,
        shape: n.shape === 'diamond' ? 'choice' : 'round',
      })),
      groups: graph.groups.map(({ css: _c, ...g }) => g),
      edges: graph.edges.map(({ css: _c, ...e }) => ({ ...e, line: 'solid', head: 'arrow', tail: 'none' })),
    };
  }
  return {
    ...rest,
    nodes: graph.nodes.map((n) => {
      switch (n.shape) {
        case 'start': return { ...n, shape: 'circle', label: 'Start' };
        case 'end': return { ...n, shape: 'doublecircle', label: 'End' };
        case 'choice': return { ...n, shape: 'diamond', label: n.label || 'Choice' };
        case 'fork': return { ...n, shape: 'rect', label: n.label || 'Fork' };
        default: return n;
      }
    }),
  };
}
