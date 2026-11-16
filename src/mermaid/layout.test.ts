import { describe, expect, it } from 'vitest';
import { autoLayout, nodeSize, shouldKeepPositions } from './layout';
import type { GNode } from './types';
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

describe('shouldKeepPositions', () => {
  const n = (id: string, label = id): GNode => ({ id, label, shape: 'rect', x: 1, y: 1 });
  const known = new Map([n('A', 'Start'), n('B', 'Ok?'), n('C', 'Ship'), n('D', 'Debug')].map((x) => [x.id, x]));

  it('keeps positions for a small edit (one node added)', () => {
    expect(shouldKeepPositions([n('A', 'Start'), n('B', 'Ok?'), n('C', 'Ship'), n('D', 'Debug'), n('E')], known)).toBe(true);
  });
  it('keeps positions when one label was edited', () => {
    expect(shouldKeepPositions([n('A', 'Begin'), n('B', 'Ok?'), n('C', 'Ship'), n('D', 'Debug')], known)).toBe(true);
  });
  it('re-lays-out an unrelated diagram that reuses ids A..D', () => {
    const other = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((id) => n(id));
    expect(shouldKeepPositions(other, known)).toBe(false);
  });
  it('re-lays-out when ids match but every label differs', () => {
    expect(shouldKeepPositions([n('A', 'x'), n('B', 'y'), n('C', 'z'), n('D', 'w')], known)).toBe(false);
  });
  it('is false for empty input or no overlap', () => {
    expect(shouldKeepPositions([], known)).toBe(false);
    expect(shouldKeepPositions([n('Z')], known)).toBe(false);
  });
});
