// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readStore } from './docs';
import { routeImport, takeNotice } from './route';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '';
});

describe('routeImport', () => {
  it('creates the first document in a tab that has never been opened, and goes there', () => {
    routeImport('text', 'seq', 'sequenceDiagram\nA->>B: hi', { before: '# T\n', after: '' }, 'Opened in Text.');
    const s = readStore<string>('text')!;
    expect(s.docs).toHaveLength(1);
    expect(s.docs[0]).toMatchObject({ name: 'seq', data: 'sequenceDiagram\nA->>B: hi', wrap: { before: '# T\n', after: '' } });
    expect(s.activeId).toBe(s.docs[0].id);
    expect(location.hash).toBe('#/text');
    expect(takeNotice()).toBe('Opened in Text.');
    expect(takeNotice()).toBeNull(); // read once
  });

  it('adds to an existing list without touching what is already there', () => {
    routeImport('gantt', 'one', 'gantt\n  A :a, 2026-01-01, 1d', { before: '', after: '' }, 'm');
    const first = readStore<string>('gantt')!.docs[0];
    routeImport('gantt', 'one', 'gantt\n  B :b, 2026-01-02, 1d', { before: '', after: '' }, 'm');
    const s = readStore<string>('gantt')!;
    expect(s.docs.map((d) => d.name)).toEqual(['one', 'one 2']);
    expect(s.docs[0]).toEqual(first);
    expect(s.activeId).toBe(s.docs[1].id);
  });

  it('turns text for the canvas into a laid-out graph', () => {
    routeImport('diagrams', 'flow', 'flowchart TD\nA --> B', { before: '', after: '' }, 'm');
    const g = readStore<{ nodes: { id: string; x: number; y: number }[]; edges: unknown[] }>('diagrams')!.docs[0].data;
    expect(g.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(g.edges).toHaveLength(1);
    expect(g.nodes[0].y).not.toBe(g.nodes[1].y); // positioned, not all at the origin
  });
});
