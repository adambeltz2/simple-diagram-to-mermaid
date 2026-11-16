import { describe, expect, it } from 'vitest';
import { metaOf, normalizeGraph } from './normalize';

describe('normalizeGraph', () => {
  it('migrates v0.3 edge styles and missing groups', () => {
    const g = normalizeGraph({
      direction: 'LR',
      nodes: [],
      edges: [
        { id: 'a', source: 'x', target: 'y', label: '', style: 'arrow' },
        { id: 'b', source: 'x', target: 'y', label: '', style: 'open' },
        { id: 'c', source: 'x', target: 'y', label: '', style: 'dotted' },
        { id: 'd', source: 'x', target: 'y', label: '', style: 'thick' },
      ],
    })!;
    expect(g.groups).toEqual([]);
    expect(g.edges.map((e) => [e.line, e.head, e.tail])).toEqual([
      ['solid', 'arrow', 'none'],
      ['solid', 'none', 'none'],
      ['dotted', 'arrow', 'none'],
      ['thick', 'arrow', 'none'],
    ]);
  });

  it('keeps current-format edges untouched and rejects junk', () => {
    const g = normalizeGraph({
      direction: 'TD',
      nodes: [],
      groups: [],
      edges: [{ id: 'a', source: 'x', target: 'y', label: '', line: 'dotted', head: 'circle', tail: 'cross' }],
    })!;
    expect([g.edges[0].line, g.edges[0].head, g.edges[0].tail]).toEqual(['dotted', 'circle', 'cross']);
    expect(normalizeGraph(null)).toBeNull();
    expect(normalizeGraph({ nodes: 1 })).toBeNull();
  });
});

describe('metaOf', () => {
  it('picks only the carried-along fields', () => {
    expect(metaOf({ keyword: 'flowchart-elk', extras: [], classDefs: {}, frontmatter: '' })).toEqual({
      keyword: 'flowchart-elk',
      frontmatter: '',
    });
  });
});
