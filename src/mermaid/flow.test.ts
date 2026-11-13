import { describe, expect, it } from 'vitest';
import { graphToFlow } from './flow';
import type { Graph } from './types';

const g = (direction: Graph['direction'], b: { x: number; y: number }): Graph => ({
  direction,
  nodes: [
    { id: 'A', label: 'A', shape: 'rect', x: 100, y: 100 },
    { id: 'B', label: 'B', shape: 'rect', ...b },
  ],
  edges: [{ id: 'e', source: 'A', target: 'B', label: '', style: 'arrow' }],
});

describe('graphToFlow handles', () => {
  it('forward edges use the flow-direction handles', () => {
    const e = graphToFlow(g('TD', { x: 100, y: 300 })).edges[0];
    expect([e.sourceHandle, e.targetHandle]).toEqual(['b', 't']);
    const l = graphToFlow(g('LR', { x: 300, y: 100 })).edges[0];
    expect([l.sourceHandle, l.targetHandle]).toEqual(['r', 'l']);
  });

  it('back edges loop around the side', () => {
    const e = graphToFlow(g('TD', { x: 300, y: 0 })).edges[0];
    expect([e.sourceHandle, e.targetHandle]).toEqual(['l', 'l']);
    const l = graphToFlow(g('LR', { x: 0, y: 300 })).edges[0];
    expect([l.sourceHandle, l.targetHandle]).toEqual(['t', 't']);
  });
});
