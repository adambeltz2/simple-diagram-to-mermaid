import { describe, expect, it } from 'vitest';
import { autoLayout, nodeSize } from './layout';
import { parseMermaid } from './parse';

describe('autoLayout with subgraphs', () => {
  it('places every node inside its group box', () => {
    const { graph } = parseMermaid(`flowchart LR
      subgraph a [Backend]
        API --> DB
      end
      subgraph b [Frontend]
        UI
      end
      UI --> API`);
    const laid = autoLayout(graph);
    for (const n of laid.nodes) {
      const g = laid.groups.find((x) => x.id === n.parent)!;
      const { w, h } = nodeSize(n.label, n.shape);
      expect(n.x).toBeGreaterThanOrEqual(g.x);
      expect(n.y).toBeGreaterThanOrEqual(g.y);
      expect(n.x + w).toBeLessThanOrEqual(g.x + g.w);
      expect(n.y + h).toBeLessThanOrEqual(g.y + g.h);
    }
  });
});
