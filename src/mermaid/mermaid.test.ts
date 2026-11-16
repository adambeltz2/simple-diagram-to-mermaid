import { describe, expect, it } from 'vitest';
import { parseMermaid } from './parse';
import { toMermaid } from './serialize';
import type { Graph } from './types';

const sample: Graph = {
  direction: 'LR',
  groups: [],
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
    { id: 'e1', source: 'A', target: 'B', label: '', line: 'solid', head: 'arrow', tail: 'none' },
    { id: 'e2', source: 'B', target: 'C', label: 'yes | maybe', line: 'dotted', head: 'arrow', tail: 'none' },
    { id: 'e3', source: 'B', target: 'D', label: 'no', line: 'thick', head: 'arrow', tail: 'none' },
    { id: 'e4', source: 'D', target: 'E', label: '', line: 'solid', head: 'none', tail: 'none' },
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
      groups: [],
      nodes: [
        { id: 'end', label: 'x', shape: 'rect', x: 0, y: 0 },
        { id: 'a b', label: 'y', shape: 'rect', x: 0, y: 0 },
        { id: 'a_b', label: 'z', shape: 'rect', x: 0, y: 0 },
      ],
      edges: [{ id: 'e', source: 'end', target: 'a b', label: '', line: 'solid', head: 'arrow', tail: 'none' }],
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
    expect(graph.edges.map(({ source, target, label, line, head, tail }) => ({ source, target, label, line, head, tail }))).toEqual(
      sample.edges.map(({ source, target, label, line, head, tail }) => ({ source, target, label, line, head, tail })),
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
    expect(graph.edges.map((e) => [e.source, e.target, e.label, `${e.line}:${e.head}`])).toEqual([
      ['A', 'B', '', 'solid:arrow'],
      ['B', 'C', 'yes', 'solid:arrow'],
      ['B', 'D', 'no', 'solid:arrow'],
      ['D', 'A', 'later', 'dotted:arrow'],
      ['C', 'E', '', 'thick:arrow'],
    ]);
  });

  it('supports & fan-out and warns on unsupported lines', () => {
    const { graph, warnings } = parseMermaid(`flowchart TD
      A & B --> C
      click A href "https://example.com"
      subgraph S
        C --> D
      end`);
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toEqual(['A>C', 'B>C', 'C>D']);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('kept as-is');
    expect(graph.extras).toEqual(['click A href "https://example.com"']);
  });
});

describe('subgraphs', () => {
  it('parses titles, nesting and membership', () => {
    const { graph, warnings } = parseMermaid(`flowchart TD
      X --> A
      subgraph one [First Group]
        A --> B
        subgraph "Inner Box"
          C
        end
      end
      subgraph two["Second"]
        D
      end
      B --> D`);
    expect(warnings).toEqual([]);
    expect(graph.groups.map((g) => [g.id, g.label, g.parent])).toEqual([
      ['one', 'First Group', undefined],
      ['Inner_Box', 'Inner Box', 'one'],
      ['two', 'Second', undefined],
    ]);
    const parent = Object.fromEntries(graph.nodes.map((n) => [n.id, n.parent]));
    // X was first seen outside; A first seen outside too (via X --> A)
    expect(parent).toEqual({ X: undefined, A: 'one', B: 'one', C: 'Inner_Box', D: 'two' });
  });

  it('warns and ignores edges to a subgraph, and unclosed subgraphs', () => {
    const { graph, warnings } = parseMermaid(`flowchart TD
      subgraph S
        A
      end
      B --> S
      subgraph T
        C`);
    expect(graph.edges).toEqual([]);
    expect(warnings.some((w) => w.includes('edges to/from a subgraph'))).toBe(true);
    expect(warnings.some((w) => w.includes('missing its "end"'))).toBe(true);
  });

  it('serializes nested groups and round-trips', () => {
    const g: Graph = {
      direction: 'TD',
      groups: [
        { id: 'outer', label: 'Outer (1)', x: 0, y: 0, w: 10, h: 10 },
        { id: 'inner', label: 'Inner', parent: 'outer', x: 0, y: 0, w: 10, h: 10 },
      ],
      nodes: [
        { id: 'A', label: 'a', shape: 'rect', parent: 'inner', x: 0, y: 0 },
        { id: 'B', label: 'b', shape: 'round', parent: 'outer', x: 0, y: 0 },
        { id: 'C', label: 'c', shape: 'rect', x: 0, y: 0 },
      ],
      edges: [{ id: 'e1', source: 'A', target: 'C', label: '', line: 'solid', head: 'arrow', tail: 'none' }],
    };
    const text = toMermaid(g);
    expect(text).toContain('subgraph outer["Outer (1)"]');
    expect(text.indexOf('subgraph inner')).toBeGreaterThan(text.indexOf('subgraph outer'));
    expect(text.match(/\bend\b/g)?.length).toBe(2);
    const back = parseMermaid(text);
    expect(back.warnings).toEqual([]);
    expect(back.graph.groups.map((x) => [x.id, x.label, x.parent])).toEqual([
      ['outer', 'Outer (1)', undefined],
      ['inner', 'Inner', 'outer'],
    ]);
    expect(Object.fromEntries(back.graph.nodes.map((n) => [n.id, n.parent]))).toEqual({
      A: 'inner',
      B: 'outer',
      C: undefined,
    });
  });
});

describe('arrowheads', () => {
  const cases: [string, string, string, string][] = [
    ['A --> B', 'solid', 'arrow', 'none'],
    ['A --- B', 'solid', 'none', 'none'],
    ['A --o B', 'solid', 'circle', 'none'],
    ['A --x B', 'solid', 'cross', 'none'],
    ['A <--> B', 'solid', 'arrow', 'arrow'],
    ['A o--o B', 'solid', 'circle', 'circle'],
    ['A x--x B', 'solid', 'cross', 'cross'],
    ['A -.-> B', 'dotted', 'arrow', 'none'],
    ['A -.- B', 'dotted', 'none', 'none'],
    ['A <-.-> B', 'dotted', 'arrow', 'arrow'],
    ['A ==> B', 'thick', 'arrow', 'none'],
    ['A === B', 'thick', 'none', 'none'],
    ['A <==> B', 'thick', 'arrow', 'arrow'],
    ['A ==o B', 'thick', 'circle', 'none'],
    ['A -- hi --> B', 'solid', 'arrow', 'none'],
    ['A -. hi .-> B', 'dotted', 'arrow', 'none'],
    ['A == hi ==> B', 'thick', 'arrow', 'none'],
  ];
  it.each(cases)('parses %s', (text, line, head, tail) => {
    const { graph, warnings } = parseMermaid(`flowchart TD\n${text}`);
    expect(warnings).toEqual([]);
    expect(graph.edges).toHaveLength(1);
    expect([graph.edges[0].line, graph.edges[0].head, graph.edges[0].tail]).toEqual([line, head, tail]);
  });

  it.each(cases.filter((c) => !c[0].includes('hi')))('round-trips %s', (text) => {
    const first = parseMermaid(`flowchart TD\n${text}`).graph;
    const again = parseMermaid(toMermaid(first)).graph;
    expect(again.edges.map((e) => [e.line, e.head, e.tail])).toEqual(first.edges.map((e) => [e.line, e.head, e.tail]));
  });
});

describe('styles and classes', () => {
  const src = `flowchart TD
    A[Start]:::hot --> B
    B --> C
    classDef default fill:#eee
    classDef hot fill:#f96,stroke:#333,stroke-width:4px
    class B,C cool
    classDef cool fill:rgb(1,2,3)
    style C fill:#0f0,color:#fff
    linkStyle 1 stroke:#f00,stroke-width:3px
    linkStyle default stroke:#999`;

  it('parses classDef, class, :::, style and linkStyle', () => {
    const { graph, warnings } = parseMermaid(src);
    expect(warnings).toEqual([]);
    expect(graph.classDefs).toEqual({
      default: { fill: '#eee' },
      hot: { fill: '#f96', stroke: '#333', 'stroke-width': '4px' },
      cool: { fill: 'rgb(1,2,3)' },
    });
    const n = Object.fromEntries(graph.nodes.map((x) => [x.id, x]));
    expect(n.A.classes).toEqual(['hot']);
    expect(n.B.classes).toEqual(['cool']);
    expect(n.C.css).toEqual({ fill: '#0f0', color: '#fff' });
    expect(graph.edges[0].css).toEqual({ stroke: '#999' });
    expect(graph.edges[1].css).toEqual({ stroke: '#f00', 'stroke-width': '3px' });
  });

  it('re-emits styles so a second parse is identical', () => {
    const first = parseMermaid(src).graph;
    const text = toMermaid(first);
    expect(text).toContain('classDef hot fill:#f96,stroke:#333,stroke-width:4px');
    expect(text).toContain('class B,C cool');
    expect(text).toContain('style C fill:#0f0,color:#fff');
    expect(text).toContain('linkStyle 1 stroke:#f00,stroke-width:3px');
    const second = parseMermaid(text).graph;
    const strip = (g: typeof first) => ({
      classDefs: g.classDefs,
      nodes: g.nodes.map(({ id, classes, css }) => ({ id, classes, css })),
      edges: g.edges.map(({ css }) => css),
    });
    expect(strip(second)).toEqual(strip(first));
  });

  it('styles subgraphs too', () => {
    const { graph } = parseMermaid(`flowchart TD
      subgraph S [Box]
        A
      end
      style S fill:#fee
      class S hot`);
    expect(graph.groups[0].css).toEqual({ fill: '#fee' });
    expect(graph.groups[0].classes).toEqual(['hot']);
  });
});

describe('preserving what the canvas cannot show', () => {
  it('keeps frontmatter, directives, elk keyword, subgraph direction and extras', () => {
    const src = `---
title: My chart
config:
  theme: forest
---
%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart-elk LR
    subgraph S [Box]
        direction TB
        A
    end
    A --> B
    click A href "https://example.com" "tip"
    accTitle: Accessible title`;
    const { graph, warnings } = parseMermaid(src);
    expect(graph.keyword).toBe('flowchart-elk');
    expect(graph.frontmatter).toBe('title: My chart\nconfig:\n  theme: forest');
    expect(graph.preamble).toEqual(['%%{init: {"flowchart": {"curve": "basis"}}}%%']);
    expect(graph.groups[0].direction).toBe('TD'); // TB is normalised to TD
    expect(graph.extras).toEqual(['click A href "https://example.com" "tip"', 'accTitle: Accessible title']);
    expect(warnings).toHaveLength(2);

    const out = toMermaid(graph);
    expect(out.startsWith('---\ntitle: My chart\nconfig:\n  theme: forest\n---\n%%{init:')).toBe(true);
    expect(out).toContain('flowchart-elk LR');
    expect(out).toContain('direction TD');
    expect(out).toContain('click A href "https://example.com" "tip"');
    const again = parseMermaid(out).graph;
    expect(again.frontmatter).toBe(graph.frontmatter);
    expect(again.extras).toEqual(graph.extras);
    expect(again.groups[0].direction).toBe('TD');
  });

  it('keeps an unparseable tail of a line instead of dropping it', () => {
    const { graph, warnings } = parseMermaid('flowchart TD\nA --> B e1@--> C');
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toEqual(['A>B']);
    expect(graph.extras).toEqual(['e1@--> C']);
    expect(warnings).toHaveLength(1);
  });

  it('handles multi-line %%{ }%% directives', () => {
    const { graph } = parseMermaid('%%{init: {\n"theme": "dark"\n}}%%\nflowchart TD\nA --> B');
    expect(graph.preamble).toEqual(['%%{init: {\n"theme": "dark"\n}}%%']);
    expect(graph.edges).toHaveLength(1);
  });
});
