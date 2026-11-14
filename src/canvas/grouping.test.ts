import { describe, expect, it } from 'vitest';
import { absPos, flowToGraph, graphToFlow, type FlowNode } from '../mermaid/flow';
import { boundsOf, reparent, ungroup, wrapInGroup } from './grouping';

const group = (id: string, x: number, y: number, w: number, h: number, parentId?: string): FlowNode => ({
  id, type: 'group', position: { x, y }, width: w, height: h, parentId, data: { label: id, shape: 'rect' },
});
const node = (id: string, x: number, y: number, parentId?: string): FlowNode => ({
  id, type: 'shape', position: { x, y }, width: 100, height: 40, parentId, data: { label: id, shape: 'rect' },
});

describe('reparent', () => {
  const base = [group('g', 100, 100, 400, 300), group('inner', 50, 50, 150, 100, 'g'), node('a', 10, 10)];

  it('moves a node into a group it was dropped in, keeping its absolute spot', () => {
    const ns = [group('g', 100, 100, 400, 300), node('a', 150, 150)];
    const out = reparent(ns, 'a');
    const a = out.find((n) => n.id === 'a')!;
    expect(a.parentId).toBe('g');
    expect(a.position).toEqual({ x: 50, y: 50 });
  });

  it('picks the innermost group', () => {
    const ns = [...base.slice(0, 2), node('a', 160, 160)]; // inner abs = 150..300 x 150..250
    expect(reparent(ns, 'a').find((n) => n.id === 'a')!.parentId).toBe('inner');
  });

  it('removes a node dragged out of its group and keeps absolute position', () => {
    const ns = [group('g', 100, 100, 200, 200), node('a', 400, 0, 'g')]; // abs (500,100)
    const a = reparent(ns, 'a').find((n) => n.id === 'a')!;
    expect(a.parentId).toBeUndefined();
    expect(a.position).toEqual({ x: 500, y: 100 });
  });

  it('never nests a group inside its own descendant', () => {
    const ns = [group('g', 0, 0, 400, 400), group('inner', 50, 50, 100, 100, 'g')];
    const out = reparent(ns, 'g');
    expect(out.find((n) => n.id === 'g')!.parentId).toBeUndefined();
  });

  it('keeps groups ahead of shapes', () => {
    const ns = [node('a', 150, 150), group('g', 100, 100, 400, 300)];
    expect(reparent(ns, 'a').map((n) => n.id)).toEqual(['g', 'a']);
  });
});

describe('graph <-> flow with groups', () => {
  it('round-trips absolute positions through relative storage', () => {
    const { nodes } = graphToFlow({
      direction: 'TD',
      groups: [
        { id: 'o', label: 'O', x: 100, y: 100, w: 400, h: 300 },
        { id: 'i', label: 'I', parent: 'o', x: 150, y: 160, w: 200, h: 100 },
      ],
      nodes: [{ id: 'A', label: 'A', shape: 'rect', parent: 'i', x: 170, y: 200 }],
      edges: [],
    });
    expect(nodes.map((n) => n.id)).toEqual(['o', 'i', 'A']);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('A')!.position).toEqual({ x: 20, y: 40 });
    expect(absPos(byId.get('A')!, byId)).toEqual({ x: 170, y: 200 });
    const g = flowToGraph('TD', nodes, []);
    expect(g.nodes[0]).toMatchObject({ parent: 'i', x: 170, y: 200 });
    expect(g.groups.find((x) => x.id === 'i')).toMatchObject({ parent: 'o', x: 150, y: 160, w: 200, h: 100 });
  });

  it('boundsOf covers all nodes in absolute space', () => {
    const ns = [group('g', 100, 100, 400, 300), node('a', 10, 10, 'g'), node('b', 200, 100, 'g')];
    expect(boundsOf(ns, ['a', 'b'])).toEqual({ x: 110, y: 110, w: 290, h: 130 });
  });
});

describe('wrapInGroup / ungroup', () => {
  it('moves every listed node into the new group even across different groups', () => {
    const ns = [
      group('a', 0, 0, 300, 300),
      group('b', 400, 0, 300, 300),
      node('x', 20, 60, 'a'),
      node('y', 20, 60, 'b'),
    ];
    const out = wrapInGroup(ns, ['x', 'y'], 'sub1');
    const byId = new Map(out.map((n) => [n.id, n]));
    expect(byId.get('x')!.parentId).toBe('sub1');
    expect(byId.get('y')!.parentId).toBe('sub1');
    expect(byId.get('sub1')!.parentId).toBeUndefined();
    // absolute positions unchanged
    expect(absPos(byId.get('x')!, byId)).toEqual({ x: 20, y: 60 });
    expect(absPos(byId.get('y')!, byId)).toEqual({ x: 420, y: 60 });
    expect(out.findIndex((n) => n.id === 'sub1')).toBeLessThan(out.findIndex((n) => n.id === 'x'));
  });

  it('nests the new group under a shared parent', () => {
    const ns = [group('g', 100, 100, 400, 300), node('x', 20, 60, 'g'), node('y', 150, 60, 'g')];
    const out = wrapInGroup(ns, ['x', 'y'], 'sub1');
    expect(out.find((n) => n.id === 'sub1')!.parentId).toBe('g');
  });

  it('ungroup keeps children at the same absolute spot and removes the box', () => {
    const ns = [group('g', 100, 100, 400, 300), node('x', 20, 60, 'g')];
    const out = ungroup(ns, 'g');
    expect(out.map((n) => n.id)).toEqual(['x']);
    expect(out[0].parentId).toBeUndefined();
    expect(out[0].position).toEqual({ x: 120, y: 160 });
  });

  it('ungroup lifts children into the outer group', () => {
    const ns = [group('o', 0, 0, 500, 500), group('i', 50, 50, 300, 300, 'o'), node('x', 10, 10, 'i')];
    const out = ungroup(ns, 'i');
    expect(out.find((n) => n.id === 'x')).toMatchObject({ parentId: 'o', position: { x: 60, y: 60 } });
  });
});
