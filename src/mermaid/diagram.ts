import { directiveCollector, extractFrontmatter, parseMermaid, type ParseResult } from './parse';
import { toMermaid } from './serialize';
import { parseEr, toEr } from './er';
import { parseState, toState } from './state';
import type { DiagramKind, Graph } from './types';

/** The first real line of a Mermaid document (after frontmatter, directives and comments). */
export function firstDiagramLine(text: string): string {
  const { text: body } = extractFrontmatter(text);
  const d = directiveCollector();
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (d.feed(line) || !line || line.startsWith('%%')) continue;
    return line;
  }
  return '';
}

export function detectDiagram(text: string): DiagramKind {
  const line = firstDiagramLine(text);
  return /^stateDiagram/i.test(line) ? 'state' : /^erDiagram/i.test(line) ? 'er' : 'flowchart';
}

export function parseDiagram(text: string): ParseResult {
  const kind = detectDiagram(text);
  return kind === 'state' ? parseState(text) : kind === 'er' ? parseEr(text) : parseMermaid(text);
}

export function toDiagram(graph: Graph): string {
  return graph.diagram === 'state' ? toState(graph) : graph.diagram === 'er' ? toEr(graph) : toMermaid(graph);
}

/** Convert the open diagram to another type, mapping node kinds sensibly. */
export function convertDiagram(graph: Graph, to: DiagramKind): Graph {
  const from = graph.diagram ?? 'flowchart';
  if (from === to) return graph;
  // Go through flowchart as the common middle form.
  const fc = from === 'flowchart' ? graph : toFlowchart(graph);
  if (to === 'flowchart') return fc;
  return to === 'state' ? flowchartToState(fc) : flowchartToEr(fc);
}

function toFlowchart(graph: Graph): Graph {
  const { diagram: _d, ...rest } = graph;
  if (graph.diagram === 'er') {
    return {
      ...rest,
      nodes: graph.nodes.map(({ attrs: _a, ...n }) => ({ ...n, shape: 'rect' })),
      edges: graph.edges.map(({ er: _er, ...e }) => ({ ...e, line: 'solid', head: 'arrow', tail: 'none' })),
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

function flowchartToState(graph: Graph): Graph {
  return {
    ...graph,
    diagram: 'state',
    nodes: graph.nodes.map(({ css: _c, ...n }) => ({ ...n, shape: n.shape === 'diamond' ? 'choice' : 'round' })),
    groups: graph.groups.map(({ css: _c, ...g }) => g),
    edges: graph.edges.map(({ css: _c, ...e }) => ({ ...e, line: 'solid', head: 'arrow', tail: 'none' })),
  };
}

function flowchartToEr(graph: Graph): Graph {
  return {
    ...graph,
    diagram: 'er',
    groups: [],
    nodes: graph.nodes.map(({ css: _c, parent: _p, ...n }) => ({ ...n, shape: 'entity', attrs: n.attrs ?? [] })),
    edges: graph.edges.map(({ css: _c, ...e }) => ({
      ...e,
      line: e.line === 'dotted' ? 'dotted' : 'solid',
      head: 'none',
      tail: 'none',
      er: e.er ?? { from: 'one', to: 'zero-many' },
    })),
  };
}
