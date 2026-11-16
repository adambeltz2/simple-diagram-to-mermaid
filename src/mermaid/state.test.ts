// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { detectDiagram, parseDiagram, toDiagram } from './diagram';
import { parseState, toState } from './state';
import { assertValid } from './validity.test';

const SAMPLE = `stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving : push
    Moving --> Still
    Moving --> Crash
    Crash --> [*]`;

describe('detectDiagram', () => {
  it('finds the type after frontmatter, directives and comments', () => {
    expect(detectDiagram('stateDiagram-v2\nA --> B')).toBe('state');
    expect(detectDiagram('stateDiagram\nA --> B')).toBe('state');
    expect(detectDiagram('---\ntitle: x\n---\n%%{init: {}}%%\n%% hi\n\nstateDiagram-v2\nA --> B')).toBe('state');
    expect(detectDiagram('flowchart TD\nA --> B')).toBe('flowchart');
    expect(detectDiagram('')).toBe('flowchart');
    expect(parseDiagram(SAMPLE).graph.diagram).toBe('state');
  });
});

describe('parseState', () => {
  it('parses start/end, transitions and labels', () => {
    const { graph, warnings } = parseState(SAMPLE);
    expect(warnings).toEqual([]);
    expect(graph.diagram).toBe('state');
    const shapes = Object.fromEntries(graph.nodes.map((n) => [n.id, n.shape]));
    expect(shapes).toEqual({ _start: 'start', Still: 'round', _end: 'end', Moving: 'round', Crash: 'round' });
    expect(graph.edges.map((e) => `${e.source}>${e.target}${e.label ? ':' + e.label : ''}`)).toEqual([
      '_start>Still', 'Still>_end', 'Still>Moving:push', 'Moving>Still', 'Moving>Crash', 'Crash>_end',
    ]);
  });

  it('handles composite states with their own start/end, and edges to the composite', () => {
    const { graph, warnings } = parseState(`stateDiagram-v2
      [*] --> Active
      Active --> Done
      state Active {
        [*] --> Idle
        Idle --> Busy : go
        Busy --> [*]
        direction LR
      }`);
    expect(warnings).toEqual([]);
    expect(graph.groups.map((g) => [g.id, g.direction])).toEqual([['Active', 'LR']]);
    const n = Object.fromEntries(graph.nodes.map((x) => [x.id, x.parent]));
    expect(n).toEqual({ _start: undefined, Done: undefined, Active_start: 'Active', Idle: 'Active', Busy: 'Active', Active_end: 'Active' });
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toContain('_start>Active');
    expect(graph.edges.map((e) => `${e.source}>${e.target}`)).toContain('Active>Done');
  });

  it('parses descriptions, choice, fork/join, classes', () => {
    const { graph, warnings } = parseState(`stateDiagram-v2
      state "Long name here" as s1
      s2 : A description
      state c <<choice>>
      state f <<fork>>
      state j <<join>>
      s1 --> c
      c --> s2 : yes
      c --> f
      f --> j
      s2:::hot --> j
      classDef hot fill:#f00
      class s1 hot`);
    expect(warnings).toEqual([]);
    const n = Object.fromEntries(graph.nodes.map((x) => [x.id, [x.shape, x.label, x.classes]]));
    expect(n.s1).toEqual(['round', 'Long name here', ['hot']]);
    expect(n.s2).toEqual(['round', 'A description', ['hot']]);
    expect(n.c[0]).toBe('choice');
    expect(n.f[0]).toBe('fork');
    expect(n.j[0]).toBe('fork');
    expect(graph.classDefs).toEqual({ hot: { fill: '#f00' } });
  });

  it('keeps notes, directives and unknown lines instead of dropping them', () => {
    const { graph, warnings } = parseState(`---
title: T
---
%%{init: {"theme":"dark"}}%%
stateDiagram-v2
    direction LR
    A --> B
    note right of A : single line
    note left of B
      multi
      line
    end note
    hide empty description`);
    expect(graph.frontmatter).toBe('title: T');
    expect(graph.preamble).toHaveLength(1);
    expect(graph.direction).toBe('LR');
    expect(graph.extras).toEqual([
      'note right of A : single line',
      'note left of B\nmulti\nline\nend note',
      'hide empty description',
    ]);
    expect(warnings).toHaveLength(3);
  });

  it('warns about concurrency separators', () => {
    const { warnings } = parseState('stateDiagram-v2\nstate P {\n A --> B\n --\n C --> D\n}');
    expect(warnings.some((w) => w.includes('concurrent'))).toBe(true);
  });
});

describe('toState', () => {
  it('emits valid, reparseable Mermaid for the classic example', async () => {
    const { graph } = parseState(SAMPLE);
    const text = toState(graph);
    expect(text).toContain('[*] --> Still');
    expect(text).toContain('Still --> Moving : push');
    await assertValid(text);
    const again = parseState(text).graph;
    expect(again.edges.map((e) => [e.source, e.target, e.label])).toEqual(graph.edges.map((e) => [e.source, e.target, e.label]));
  });

  it('round-trips composites, descriptions, choices and extras, and Mermaid accepts it', async () => {
    const src = `---
title: Demo
---
stateDiagram-v2
    direction LR
    [*] --> Active
    Active --> Done : finish
    state "Long name" as Done
    state ch <<choice>>
    Done --> ch
    ch --> Active : retry
    ch --> [*]
    state "The Active Box" as Active {
        direction TB
        [*] --> Idle
        Idle --> Busy : go
        Busy --> Idle
        state "Busy doing things" as Busy
    }
    classDef hot fill:#f00
    class Busy hot
    note right of Done : keep me`;
    const first = parseState(src);
    const text = toState(first.graph);
    await assertValid(text);
    const second = parseState(text);
    expect(second.warnings.length).toBe(first.warnings.length);
    const sorted = <T,>(a: T[]) => [...a].sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    const sig = (g: typeof first.graph) => ({
      groups: sorted(g.groups.map((x) => [x.id, x.label, x.parent, x.direction])),
      nodes: sorted(g.nodes.map((x) => [x.id, x.shape, x.label, x.parent, x.classes])),
      edges: sorted(g.edges.map((x) => [x.source, x.target, x.label])),
      extras: g.extras,
      fm: g.frontmatter,
    });
    expect(sig(second.graph)).toEqual(sig(first.graph));
  });

  it('keeps ids safe and dispatches via toDiagram', async () => {
    const g = parseState('stateDiagram-v2\n[*] --> A\nA --> [*]').graph;
    g.nodes.find((n) => n.id === 'A')!.id = 'end';
    g.edges.forEach((e) => {
      if (e.target === 'A') e.target = 'end';
      if (e.source === 'A') e.source = 'end';
    });
    const text = toDiagram(g);
    expect(text).toContain('end_');
    await assertValid(text);
  });
});
