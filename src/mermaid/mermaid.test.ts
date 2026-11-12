import { describe, expect, it } from 'vitest';
import { parseMermaid } from './parse';
import { toMermaid } from './serialize';
import type { Graph } from './types';

const sample: Graph = {
  direction: 'LR',
  nodes: [
    { id: 'A', label: 'Start', shape: 'stadium', x: 0, y: 0 },
    { id: 'B', label: 'Is it "ok"? (y/n)', shape: 'diamond', x: 0, y: 0 },
    { id: 'C', label: 'Line 1\nLine 2', shape: 'cylinder', x: 0, y: 0 },
    { id: 'D', label: 'Circle [x]', shape: 'circle', x: 0, y: 0 },
    { id: 'E', label: 'Hex', shape: 'hexagon', x: 0, y: 0 },
    { id: 'F', label: 'Round', shape: 'round', x: 0, y: 0 },
    { id: 'G', label: 'Box', shape: 'rect', x: 0, y: 0 },
  ],
  edges: [
    { id: 'e1', source: 'A', target: 'B', label: '', style: 'arrow' },
    { id: 'e2', source: 'B', target: 'C', label: 'yes | maybe', style: 'dotted' },
    { id: 'e3', source: 'B', target: 'D', label: 'no', style: 'thick' },
    { id: 'e4', source: 'D', target: 'E', label: '', style: 'open' },
  ],
};

describe('serialize', () => {
  it('emits a header, nodes, then edges', () => {
    const out = toMermaid(sample);
    expect(out.startsWith('flowchart LR\n')).toBe(true);
    expect(out).toContain('A(["Start"])');
    expect(out).toContain('B{"Is it #quot;ok#quot;? (y/n)"}');
    expect(out).toContain('C[("Line 1<br/>Line 2")]');
    expect(out).toContain('B -.->|"yes | maybe"| C');
    expect(out).toContain('D --- E');
  });

  it('sanitizes reserved and duplicate ids', () => {
    const out = toMermaid({
      direction: 'TD',
      nodes: [
        { id: 'end', label: 'x', shape: 'rect', x: 0, y: 0 },
        { id: 'a b', label: 'y', shape: 'rect', x: 0, y: 0 },
        { id: 'a_b', label: 'z', shape: 'rect', x: 0, y: 0 },
      ],
      edges: [{ id: 'e', source: 'end', target: 'a b', label: '', style: 'arrow' }],
    });
    expect(out).toContain('end_["x"]');
    expect(out).toContain('end_ --> a_b');
    expect(out).toContain('a_b_["z"]');
  });
});

describe('round trip', () => {
  it('parse(serialize(g)) preserves the graph', () => {
    const { graph, warnings } = parseMermaid(toMermaid(sample));
    expect(warnings).toEqual([]);
    expect(graph.direction).toBe('LR');
    expect(graph.nodes.map(({ id, label, shape }) => ({ id, label, shape }))).toEqual(
      sample.nodes.map(({ id, label, shape }) => ({ id, label, shape })),
    );
    expect(graph.edges.map(({ source, target, label, style }) => ({ source, target, label, style }))).toEqual(
      sample.edges.map(({ source, target, label, style }) => ({ source, target, label, style })),
    );
  });
});

describe('parse hand-written mermaid', () => {
  it('handles chains, inline nodes, and label styles', () => {
    const { graph, warnings } = parseMermaid(`
      graph TB
      %% a comment
      A[Start] --> B{Ok?} -->|yes| C(Done);
      B -- no --> D((Retry))
      D -. later .-> A
      C ==> E
    `);
    expect(warnings).toEqual([]);
    expect(graph.direction).toBe('TD');
    expect(graph.nodes.map((n) => n.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(graph.nodes.find((n) => n.id === 'B')?.shape).toBe('diamond');
    expect(graph.edges.map((e) => [e.source, e.target, e.label, e.style])).toEqual([
      ['A', 'B', '', 'arrow'],
      ['B', 'C', 'yes', 'arrow'],
      ['B', 'D', 'no', 'arrow'],
      ['D', 'A', 'later', 'dotted'],
      ['C', 'E', '', 'thick'],
    ]);
  });

  it('supports & fan-out and warns on unsupported lines', () => {
    const { graph, warnings } = parseMermaid(`flowchart TD
      A & B --> C
      classDef x fill:#f00
      subgraph S
        C --> D
      end`);
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toEqual(['A>C', 'B>C', 'C>D']);
    expect(warnings.length).toBe(2);
  });
});
