// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { convertDiagram, detectDiagram, parseDiagram, toDiagram } from './diagram';
import { parseEr, toEr } from './er';
import { parseMermaid } from './parse';
import { CARDS, type Card, type Graph } from './types';
import { assertValid } from './validity.test';

const SAMPLE = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
    CUSTOMER {
        string name
        string custNumber PK
        int id PK, FK "internal id"
    }
    p[Person] {
        varchar(255) email UK
    }`;

describe('parseEr', () => {
  it('parses relationships, line styles, hyphenated names, attributes and aliases', () => {
    const { graph, warnings } = parseEr(SAMPLE);
    expect(warnings).toEqual([]);
    expect(graph.diagram).toBe('er');
    expect(graph.edges.map((e) => [e.source, e.target, e.label, e.line, e.er])).toEqual([
      ['CUSTOMER', 'ORDER', 'places', 'solid', { from: 'one', to: 'zero-many' }],
      ['ORDER', 'LINE-ITEM', 'contains', 'solid', { from: 'one', to: 'one-many' }],
      ['CUSTOMER', 'DELIVERY-ADDRESS', 'uses', 'dotted', { from: 'one-many', to: 'one-many' }],
    ]);
    const cust = graph.nodes.find((n) => n.id === 'CUSTOMER')!;
    expect(cust.shape).toBe('entity');
    expect(cust.attrs).toEqual([
      { type: 'string', name: 'name' },
      { type: 'string', name: 'custNumber', keys: 'PK' },
      { type: 'int', name: 'id', keys: 'PK, FK', comment: 'internal id' },
    ]);
    const p = graph.nodes.find((n) => n.id === 'p')!;
    expect(p.label).toBe('Person');
    expect(p.attrs).toEqual([{ type: 'varchar(255)', name: 'email', keys: 'UK' }]);
  });

  it.each(CARDS.flatMap((a) => CARDS.map((b) => [a.value, b.value] as [Card, Card])))(
    'round-trips cardinality %s -> %s (both line styles) and Mermaid accepts it',
    async (from, to) => {
      for (const line of ['solid', 'dotted'] as const) {
        const g: Graph = {
          diagram: 'er',
          direction: 'TD',
          groups: [],
          nodes: [
            { id: 'A', label: 'A', shape: 'entity', attrs: [], x: 0, y: 0 },
            { id: 'B', label: 'B', shape: 'entity', attrs: [], x: 0, y: 0 },
          ],
          edges: [{ id: 'e', source: 'A', target: 'B', label: 'rel', line, head: 'none', tail: 'none', er: { from, to } }],
        };
        const text = toEr(g);
        await assertValid(text);
        const back = parseEr(text).graph.edges[0];
        expect([back.er, back.line, back.label]).toEqual([{ from, to }, line, 'rel']);
      }
    },
  );

  it('keeps attribute lines it cannot parse, plus notes/unknown lines, frontmatter and directives', () => {
    const { graph, warnings } = parseEr(`---
title: T
---
%%{init: {"theme": "dark"}}%%
erDiagram
    A {
        string ok
        this is not valid at all really
    }
    title Something
    A ||--|| B : ""`);
    expect(graph.frontmatter).toBe('title: T');
    expect(graph.preamble).toHaveLength(1);
    expect(graph.nodes.find((n) => n.id === 'A')!.attrs![1]).toEqual({ type: '', name: '', raw: 'this is not valid at all really' });
    expect(graph.extras).toEqual(['title Something']);
    expect(warnings).toHaveLength(2);
    expect(toEr(graph)).toContain('this is not valid at all really');
  });

  it('parses the one-line entity form', () => {
    const { graph, warnings } = parseEr('erDiagram\n    PRODUCT { string sku PK "stock id" }\n    PRODUCT ||--o{ X : has');
    expect(warnings).toEqual([]);
    expect(graph.nodes.find((n) => n.id === 'PRODUCT')!.attrs).toEqual([
      { type: 'string', name: 'sku', keys: 'PK', comment: 'stock id' },
    ]);
  });

  it('handles direction, classDef/class and empty entity blocks', () => {
    const { graph, warnings } = parseEr(`erDiagram
    direction LR
    A {}
    B
    A ||--o| B : r
    classDef hot fill:#f96
    class A hot`);
    expect(warnings).toEqual([]);
    expect(graph.direction).toBe('LR');
    expect(graph.classDefs).toEqual({ hot: { fill: '#f96' } });
    expect(graph.nodes.find((n) => n.id === 'A')!.classes).toEqual(['hot']);
  });
});

describe('toEr', () => {
  it('produces valid Mermaid for the full sample and survives a round trip', async () => {
    const first = parseEr(SAMPLE).graph;
    const text = toEr(first);
    expect(text).toContain('CUSTOMER ||--o{ ORDER : "places"');
    expect(text).toContain('CUSTOMER }|..|{ DELIVERY-ADDRESS : "uses"');
    expect(text).toContain('int id PK, FK "internal id"');
    expect(text).toContain('p["Person"] {');
    await assertValid(text);
    const second = parseEr(text).graph;
    const sig = (g: Graph) => ({
      nodes: g.nodes.map((n) => [n.id, n.label, n.attrs]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      edges: g.edges.map((e) => [e.source, e.target, e.label, e.line, e.er]),
    });
    expect(sig(second)).toEqual(sig(first));
  });

  it('sanitises attribute types/names and quotes odd entity names', async () => {
    const g: Graph = {
      diagram: 'er',
      direction: 'LR',
      groups: [],
      nodes: [
        { id: 'My Entity', label: 'My Entity', shape: 'entity', x: 0, y: 0, attrs: [{ type: 'var char', name: 'a b', keys: 'PK', comment: 'say "hi"' }, { type: '', name: '' }] },
        { id: 'B', label: 'Bee', shape: 'entity', x: 0, y: 0, attrs: [] },
      ],
      edges: [{ id: 'e', source: 'My Entity', target: 'B', label: 'has "many"', line: 'solid', head: 'none', tail: 'none' }],
    };
    const text = toEr(g);
    expect(text).toContain('"My Entity" {');
    expect(text).toContain('var_char a_b PK');
    expect(text).toContain('string attr');
    expect(text).toContain('direction LR');
    await assertValid(text);
  });

  it('routes through parseDiagram / toDiagram / detectDiagram', () => {
    expect(detectDiagram(SAMPLE)).toBe('er');
    expect(parseDiagram(SAMPLE).graph.diagram).toBe('er');
    expect(toDiagram(parseDiagram(SAMPLE).graph).startsWith('erDiagram')).toBe(true);
  });
});

describe('convertDiagram with ER', () => {
  it('flowchart -> ER makes entities and one-to-many relationships; valid output', async () => {
    const { graph } = parseMermaid('flowchart TD\nA[Order] -->|places| B[Item]\nB -.-> C');
    const er = convertDiagram(graph, 'er');
    expect(er.diagram).toBe('er');
    expect(er.nodes.every((n) => n.shape === 'entity' && Array.isArray(n.attrs))).toBe(true);
    expect(er.edges.map((e) => [e.line, e.er])).toEqual([
      ['solid', { from: 'one', to: 'zero-many' }],
      ['dotted', { from: 'one', to: 'zero-many' }],
    ]);
    await assertValid(toDiagram(er));
  });

  it('ER -> flowchart drops attributes and cardinality; valid output', async () => {
    const fc = convertDiagram(parseEr(SAMPLE).graph, 'flowchart');
    expect(fc.diagram).toBeUndefined();
    expect(fc.nodes.every((n) => n.shape === 'rect' && !n.attrs)).toBe(true);
    expect(fc.edges.every((e) => e.head === 'arrow' && !e.er)).toBe(true);
    await assertValid(toDiagram(fc));
  });

  it('ER -> state works via the flowchart form', async () => {
    const st = convertDiagram(parseEr(SAMPLE).graph, 'state');
    expect(st.diagram).toBe('state');
    await assertValid(toDiagram(st));
  });
});
