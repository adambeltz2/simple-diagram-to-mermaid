// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { assertValid } from '../mermaid/validity.test';
import {
  addTask, allTasks, deleteTask, fromDay, linkTask, moveTask, parseGantt, renameTaskId, resizeTask, schedule,
  serializeGantt, toDay, updateTask,
} from './model';

const PLAN = `gantt
    title Website launch
    dateFormat YYYY-MM-DD
    axisFormat %b %d
    section Design
    Wireframes :done, wf, 2026-12-01, 5d
    Visual design :active, vd, after wf, 8d
    Design review :rev, after vd, 2d
    section Build
    API :api, 2026-12-07, 20d
    Frontend :fe, after rev, 15d
    Integration :crit, int, after fe api, 7d
    section Launch
    QA :qa, after int, 6d
    Go live :milestone, live, after qa, 0d`;

const day = (s: string) => toDay(s);

describe('parseGantt', () => {
  it('parses settings, sections, tags, dependencies', () => {
    const { gantt, warnings } = parseGantt(PLAN);
    expect(warnings).toEqual([]);
    expect([gantt.title, gantt.dateFormat, gantt.axisFormat]).toEqual(['Website launch', 'YYYY-MM-DD', '%b %d']);
    expect(gantt.sections.map((s) => s.name)).toEqual(['Design', 'Build', 'Launch']);
    const t = Object.fromEntries(allTasks(gantt).map((x) => [x.id, x]));
    expect(t.wf.tags).toEqual(['done']);
    expect(t.wf.start).toEqual({ kind: 'date', date: '2026-12-01' });
    expect(t.int.start).toEqual({ kind: 'after', ids: ['fe', 'api'] });
    expect(t.int.tags).toEqual(['crit']);
    expect(t.live.tags).toEqual(['milestone']);
    expect(t.live.end).toEqual({ kind: 'dur', n: 0, unit: 'd' });
  });

  it('understands the short forms: duration only, start+end, end dates, until, weeks', () => {
    const { gantt, warnings } = parseGantt(`gantt
    dateFormat YYYY-MM-DD
    section S
    First :2026-01-01, 3d
    Second :2d
    Third :2026-01-10, 2026-01-14
    Fourth :f4, 2026-01-02, until f5
    Fifth :f5, 2026-01-20, 2w`);
    expect(warnings).toEqual([]);
    const [a, b, c, d, e] = allTasks(gantt);
    expect(a.autoId && b.autoId && c.autoId).toBe(true);
    expect(b.start).toEqual({ kind: 'after', ids: [a.id] }); // "after the previous task" made explicit
    expect(c.end).toEqual({ kind: 'date', date: '2026-01-14' });
    expect(d.end).toEqual({ kind: 'until', id: 'f5' });
    expect(e.end).toEqual({ kind: 'dur', n: 2, unit: 'w' });
  });

  it('keeps config, comments, directives, frontmatter and click lines', () => {
    const src = `---
title: T
---
%%{init: {"theme":"dark"}}%%
gantt
    dateFormat YYYY-MM-DD
    excludes weekends
    tickInterval 1week
    %% a note about the plan
    section A
    %% inside the section
    One :o1, 2026-01-05, 3d
    click o1 href "https://example.com"`;
    const { gantt } = parseGantt(src);
    expect(gantt.header).toEqual(['excludes weekends', 'tickInterval 1week', '%% a note about the plan']);
    expect(gantt.extras).toEqual(['click o1 href "https://example.com"']);
    expect(gantt.frontmatter).toBe('title: T');
    expect(gantt.preamble).toHaveLength(1);
    expect(gantt.sections[0].items[0]).toEqual({ type: 'raw', text: '%% inside the section' });
    const out = serializeGantt(gantt);
    for (const s of ['excludes weekends', 'tickInterval 1week', '%% inside the section', 'click o1 href', '%%{init:', 'title: T']) {
      expect(out).toContain(s);
    }
  });

  it('keeps lines it cannot parse, with a warning, and does not understand tasks under another dateFormat', () => {
    const a = parseGantt('gantt\n    dateFormat YYYY-MM-DD\n    section S\n    Bad :zzz, nonsense\n    Good :g, 2026-01-01, 1d');
    expect(a.warnings).toHaveLength(1);
    expect(allTasks(a.gantt).map((t) => t.id)).toEqual(['g']);
    expect(serializeGantt(a.gantt)).toContain('Bad :zzz, nonsense');
    const b = parseGantt('gantt\n    dateFormat DD-MM-YYYY\n    section S\n    One :o, 01-02-2026, 3d');
    expect(allTasks(b.gantt)).toHaveLength(0);
    expect(b.warnings[0]).toContain("isn't supported");
    expect(serializeGantt(b.gantt)).toContain('One :o, 01-02-2026, 3d');
  });
});

describe('serializeGantt', () => {
  it('round-trips the plan and Mermaid accepts it', async () => {
    const first = parseGantt(PLAN).gantt;
    const text = serializeGantt(first);
    await assertValid(text);
    expect(parseGantt(text).gantt).toEqual(first);
  });

  it('only writes ids that are needed, and keeps short forms valid', async () => {
    const { gantt } = parseGantt(`gantt
    dateFormat YYYY-MM-DD
    section S
    A :2026-01-01, 3d
    C :2026-01-10, 4d`);
    const text = serializeGantt(gantt);
    expect(text).toContain('A :2026-01-01, 3d');
    expect(text).toContain('C :2026-01-10, 4d');
    await assertValid(text);
    // once something references an auto id it must be written out
    const [a, c] = allTasks(gantt);
    const linked = linkTask(gantt, c.id, a.id)!;
    const t2 = serializeGantt(linked);
    expect(t2).toContain('A :task1, 2026-01-01, 3d');
    expect(t2).toContain('C :after task1, 4d');
    await assertValid(t2);
  });

  it('writes "after the previous task" explicitly, so the previous task keeps an id', async () => {
    const { gantt } = parseGantt('gantt\n    dateFormat YYYY-MM-DD\n    section S\n    A :2026-01-01, 3d\n    B :2d');
    const text = serializeGantt(gantt);
    expect(text).toContain('A :task1, 2026-01-01, 3d');
    expect(text).toContain('B :after task1, 2d');
    await assertValid(text);
  });
});

describe('schedule', () => {
  it('follows dependencies, takes the latest of several, and handles dates, weeks and until', () => {
    const { gantt } = parseGantt(PLAN);
    const s = schedule(gantt, day('2026-11-19'));
    expect(fromDay(s.get('wf')!.start)).toBe('2026-12-01');
    expect(fromDay(s.get('wf')!.end)).toBe('2026-12-06');
    expect(fromDay(s.get('vd')!.start)).toBe('2026-12-06');
    expect(fromDay(s.get('fe')!.start)).toBe('2026-12-16');
    // integration waits for the later of Frontend (Dec 31) and API (Dec 27)
    expect(fromDay(s.get('int')!.start)).toBe('2026-12-31');
    expect(fromDay(s.get('live')!.start)).toBe(fromDay(s.get('qa')!.end));
    const w = schedule(parseGantt('gantt\n dateFormat YYYY-MM-DD\n section S\n A :a, 2026-01-01, 2w\n B :b, 2026-01-02, until c\n C :c, 2026-01-09, 1d').gantt);
    expect(w.get('a')!.end - w.get('a')!.start).toBe(14);
    expect(w.get('b')!.end).toBe(w.get('c')!.start);
  });

  it('survives loops and missing references', () => {
    const { gantt } = parseGantt('gantt\n dateFormat YYYY-MM-DD\n section S\n A :a, after b, 1d\n B :b, after a, 1d\n C :c, after nope, 1d');
    expect(() => schedule(gantt, day('2026-01-01'))).not.toThrow();
  });
});

describe('operations', () => {
  const base = () => parseGantt(PLAN).gantt;
  const start = (g: ReturnType<typeof base>, id: string) => fromDay(schedule(g).get(id)!.start);

  it('moving a task with dependents shifts them; moving a follower detaches it', () => {
    const moved = moveTask(base(), 'wf', day('2026-12-03'));
    expect(start(moved, 'wf')).toBe('2026-12-03');
    expect(start(moved, 'vd')).toBe('2026-12-08'); // followed its parent
    const detached = moveTask(base(), 'fe', day('2026-12-10'));
    expect(allTasks(detached).find((t) => t.id === 'fe')!.start).toEqual({ kind: 'date', date: '2026-12-10' });
    expect(start(detached, 'int')).toBe('2026-12-27'); // Frontend now ends Dec 25, so Integration waits for API
  });

  it('resizing keeps weeks when it can, and works on end-date tasks', () => {
    const g = parseGantt('gantt\n dateFormat YYYY-MM-DD\n section S\n A :a, 2026-01-01, 1w\n B :b, 2026-01-01, 2026-01-05').gantt;
    expect(allTasks(resizeTask(g, 'a', 14))[0].end).toEqual({ kind: 'dur', n: 2, unit: 'w' });
    expect(allTasks(resizeTask(g, 'a', 10))[0].end).toEqual({ kind: 'dur', n: 10, unit: 'd' });
    expect(allTasks(resizeTask(g, 'b', 6))[1].end).toEqual({ kind: 'date', date: '2026-01-07' });
    expect(allTasks(resizeTask(g, 'a', 0))[0].end).toEqual({ kind: 'dur', n: 1, unit: 'd' });
  });

  it('linking replaces the dependency and refuses loops', () => {
    const linked = linkTask(base(), 'rev', 'api')!;
    expect(allTasks(linked).find((t) => t.id === 'rev')!.start).toEqual({ kind: 'after', ids: ['api'] });
    expect(linkTask(base(), 'wf', 'rev')).toBeNull(); // wf -> vd -> rev -> wf would loop
    expect(linkTask(base(), 'wf', 'wf')).toBeNull();
  });

  it('adding chains after the last task in the section; deleting keeps followers in place', async () => {
    const { gantt: g1, id } = addTask(base(), 0);
    expect(id).toBe('task');
    expect(allTasks(g1).find((t) => t.id === id)!.start).toEqual({ kind: 'after', ids: ['rev'] });
    const { gantt: g2 } = addTask(g1, 1, true);
    expect(allTasks(g2).find((t) => t.id === 'milestone')!.tags).toEqual(['milestone']);
    const before = start(base(), 'vd');
    const del = deleteTask(base(), 'wf');
    expect(allTasks(del).find((t) => t.id === 'wf')).toBeUndefined();
    expect(start(del, 'vd')).toBe(before);
    await assertValid(serializeGantt(g2));
    await assertValid(serializeGantt(del));
  });

  it('renames ids everywhere and refuses duplicates', () => {
    const r = renameTaskId(base(), 'wf', 'wire')!;
    expect(allTasks(r).find((t) => t.id === 'vd')!.start).toEqual({ kind: 'after', ids: ['wire'] });
    expect(renameTaskId(base(), 'wf', 'api')).toBeNull();
    expect(renameTaskId(base(), 'wf', 'has space')).toBeNull();
  });

  it('every edited chart is still valid Mermaid', async () => {
    let g = base();
    g = moveTask(g, 'api', day('2026-12-10'));
    g = resizeTask(g, 'qa', 9);
    g = updateTask(g, 'wf', (t) => (t.tags = ['crit', 'active']));
    g = linkTask(g, 'live', 'int')!;
    await assertValid(serializeGantt(g));
  });
});
