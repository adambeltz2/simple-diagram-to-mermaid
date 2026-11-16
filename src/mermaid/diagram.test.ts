// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { convertDiagram, toDiagram } from './diagram';
import { parseMermaid } from './parse';
import { parseState } from './state';
import { assertValid } from './validity.test';

describe('convertDiagram', () => {
  it('flowchart -> state: diamonds become choices, styling is dropped, output is valid', async () => {
    const { graph } = parseMermaid(`flowchart TD
      A[Start]:::hot --> B{Ok?}
      B -->|yes| C[(DB)]
      B -.->|no| D
      subgraph S [Box]
        D
      end
      classDef hot fill:#f00
      style C fill:#0f0
      linkStyle 0 stroke:#f00`);
    const st = convertDiagram(graph, 'state');
    expect(st.diagram).toBe('state');
    expect(st.nodes.map((n) => [n.id, n.shape])).toEqual([['A', 'round'], ['B', 'choice'], ['C', 'round'], ['D', 'round']]);
    expect(st.nodes.every((n) => !n.css)).toBe(true);
    expect(st.edges.every((e) => e.line === 'solid' && e.head === 'arrow' && !e.css)).toBe(true);
    const text = toDiagram(st);
    expect(text.startsWith('stateDiagram-v2')).toBe(true);
    await assertValid(text);
  });

  it('state -> flowchart: start/end/choice/fork become real flowchart nodes, output is valid', async () => {
    const { graph } = parseState(`stateDiagram-v2
      [*] --> A
      A --> c
      state c <<choice>>
      c --> f
      state f <<fork>>
      f --> [*]`);
    const fc = convertDiagram(graph, 'flowchart');
    expect(fc.diagram).toBeUndefined();
    expect(fc.nodes.map((n) => [n.id, n.shape, n.label])).toEqual([
      ['_start', 'circle', 'Start'],
      ['A', 'round', 'A'],
      ['c', 'diamond', 'c'],
      ['f', 'rect', 'f'],
      ['_end', 'doublecircle', 'End'],
    ]);
    const text = toDiagram(fc);
    expect(text.startsWith('flowchart')).toBe(true);
    await assertValid(text);
  });

  it('is a no-op when the type is unchanged', () => {
    const { graph } = parseMermaid('flowchart TD\nA --> B');
    expect(convertDiagram(graph, 'flowchart')).toBe(graph);
  });
});
