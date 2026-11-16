// @vitest-environment jsdom
// Checks our generated text against Mermaid's own parser, so we know it is real, valid syntax.
import mermaid from 'mermaid';
import { describe, it } from 'vitest';
import { parseMermaid } from './parse';
import { toMermaid } from './serialize';
import type { Graph, Shape } from './types';

/** Throws with Mermaid's error message if the text is invalid. */
export async function assertValid(text: string) {
  try {
    await mermaid.parse(text);
  } catch (e) {
    throw new Error(`Mermaid rejected:\n${text}\n--\n${e instanceof Error ? e.message : String(e)}`);
  }
}

const ALL_SHAPES: Shape[] = [
  'rect', 'round', 'stadium', 'diamond', 'circle', 'cylinder', 'hexagon', 'subroutine',
  'parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt', 'asymmetric', 'doublecircle',
];

describe('generated flowchart text is accepted by Mermaid', () => {
  it('every shape, with awkward labels', async () => {
    const g: Graph = {
      direction: 'LR',
      groups: [],
      edges: [],
      nodes: ALL_SHAPES.map((shape, i) => ({ id: `N${i}`, label: `a/b\\c]) (x) "q"\nline2`, shape, x: 0, y: 0 })),
    };
    await assertValid(toMermaid(g));
  });

  it('every arrow type, labels, styles, classes and subgraphs', async () => {
    const { graph } = parseMermaid(`flowchart TD
      subgraph one [First]
        direction LR
        A[Start]:::hot --> B{Ok?}
        subgraph two ["Inner box"]
          C[(DB)]
        end
      end
      B -->|yes| C
      B -.-> D
      C <--> D
      D --o E
      E --x A
      D ==> F
      F === G
      G o--o H
      H <-.-> I
      one --> J
      classDef hot fill:#f96,stroke:#333,stroke-width:4px
      style C fill:#9f6,stroke:#060
      linkStyle 0 stroke:#f00,stroke-width:3px
      click A href "https://example.com" "tip"`);
    await assertValid(toMermaid(graph));
  });
});
