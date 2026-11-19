import { useEffect, useMemo, useRef, useState } from 'react';
import {
  allTasks, fromDay, linkTask, moveTask, resizeTask, schedule, todayDay,
  type Gantt, type GTask,
} from './model';

const ROW = 34;
const DAY_MS = 864e5;

type Mode = 'move' | 'resize' | 'link';
interface Drag {
  id: string;
  mode: Mode;
  x0: number;
  base: Gantt;
  s0: number;
  d0: number;
  began: boolean;
  from?: { name: string };
}

export interface ChartProps {
  gantt: Gantt;
  selected: string | null;
  selectedSection: number | null;
  /** pixels per day */
  zoom: number;
  readOnly?: boolean;
  onSelect: (id: string | null) => void;
  onSelectSection: (index: number) => void;
  /** called once, just before the first change of a drag (so undo can snapshot) */
  onBegin: () => void;
  onChange: (g: Gantt) => void;
  onNotice: (message: string, undoable?: boolean) => void;
}

type Row = { kind: 'sec'; index: number; name: string } | { kind: 'task'; task: GTask };

export function GanttChart(props: ChartProps) {
  const { gantt, selected, zoom } = props;
  const ref = useRef(props);
  ref.current = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [link, setLink] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const sc = useMemo(() => schedule(gantt), [gantt]);
  const tasks = useMemo(() => allTasks(gantt), [gantt]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    gantt.sections.forEach((s, index) => {
      if (s.name || gantt.sections.length > 1) out.push({ kind: 'sec', index, name: s.name || 'Tasks' });
      for (const it of s.items) if (it.type === 'task') out.push({ kind: 'task', task: it.task });
    });
    return out;
  }, [gantt]);

  // visible day range: a little before the first task, well after the last
  const [min, max] = useMemo(() => {
    const vals = [...sc.values()];
    const lo = vals.length ? Math.min(...vals.map((v) => v.start)) : todayDay();
    const hi = vals.length ? Math.max(...vals.map((v) => v.end)) : todayDay() + 28;
    const a = Math.floor(lo) - 4;
    return [a, Math.max(Math.ceil(hi) + 14, a + 42)];
  }, [sc]);
  const width = (max - min) * zoom;
  const x = (day: number) => (day - min) * zoom;
  const rowIndex = (id: string) => rows.findIndex((r) => r.kind === 'task' && r.task.id === id);
  const todayOn = gantt.todayMarker !== 'off';
  const showToday = todayOn && todayDay() >= min && todayDay() <= max;

  /* ----- pointer handling (window-level so re-renders can't drop the drag) ----- */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const p = ref.current;
      if (d.mode === 'link') {
        const body = bodyRef.current;
        if (!body) return;
        const r = body.getBoundingClientRect();
        const s = sc.get(d.id);
        const i = rowIndex(d.id);
        if (s && i >= 0) setLink({ x1: x(s.end), y1: i * ROW + ROW / 2, x2: e.clientX - r.left, y2: e.clientY - r.top });
        d.began = true;
        return;
      }
      const dx = Math.round((e.clientX - d.x0) / p.zoom);
      if (dx === 0 && !d.began) return;
      if (!d.began) {
        p.onBegin();
        d.began = true;
      }
      p.onChange(d.mode === 'resize' ? resizeTask(d.base, d.id, d.d0 + dx) : moveTask(d.base, d.id, d.s0 + dx));
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      const p = ref.current;
      if (d.mode === 'link') {
        setLink(null);
        const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-task]');
        const targetId = hit?.dataset.task;
        if (!targetId || targetId === d.id) return;
        const next = linkTask(d.base, targetId, d.id);
        const name = (id: string) => allTasks(d.base).find((t) => t.id === id)?.name ?? id;
        if (!next) p.onNotice(`That would make “${name(d.id)}” and “${name(targetId)}” wait on each other, so it was not linked.`);
        else {
          p.onBegin();
          p.onChange(next);
          p.onSelect(targetId);
          p.onNotice(`“${name(targetId)}” now starts after “${name(d.id)}”.`, true);
        }
        return;
      }
      if (d.began && d.mode === 'move' && d.from) {
        p.onNotice(`“${d.from.name}” no longer follows another task and now has a fixed start date.`, true);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc, rows, min, zoom]);

  const down = (e: React.PointerEvent, t: GTask) => {
    props.onSelect(t.id);
    if (props.readOnly) return;
    e.preventDefault();
    const s = sc.get(t.id)!;
    const el = e.target as HTMLElement;
    const mode: Mode = el.classList.contains('rz') ? 'resize' : el.classList.contains('dot') ? 'link' : 'move';
    drag.current = {
      id: t.id, mode, x0: e.clientX, base: gantt, s0: s.start, d0: Math.max(1, Math.round(s.end - s.start)), began: false,
      ...(t.start.kind === 'after' && mode === 'move' ? { from: { name: t.name } } : {}),
    };
  };

  /* ----- render ----- */
  let bars: React.ReactNode[] = [];
  const deps: React.ReactNode[] = [];
  const stripes: React.ReactNode[] = [];
  rows.forEach((r, i) => {
    if (r.kind === 'sec') {
      stripes.push(<div key={`s${i}`} className="g-stripe" style={{ top: i * ROW, height: ROW }} />);
      return;
    }
    const t = r.task;
    const s = sc.get(t.id);
    if (!s) return;
    const sel = selected === t.id;
    const tags = t.tags.filter((k) => k !== 'milestone');
    if (t.tags.includes('milestone')) {
      const cx = x((s.start + s.end) / 2);
      bars.push(
        <div key={t.id} data-task={t.id} className={`ms ${sel ? 'sel' : ''}`} style={{ left: cx - 9, top: i * ROW + 8 }} onPointerDown={(e) => down(e, t)} />,
        <span key={t.id + 'l'} className="ms-lbl" style={{ left: cx + 16, top: i * ROW + 9 }}>{t.name}</span>,
      );
    } else {
      const w = Math.max((s.end - s.start) * zoom, 8);
      const outside = w < 84;
      bars.push(
        <div key={t.id} data-task={t.id} className={['bar', ...tags, sel ? 'sel' : ''].join(' ')} style={{ left: x(s.start), top: i * ROW + 6, width: w }} onPointerDown={(e) => down(e, t)}>
          <span className="lbl">{outside ? '' : t.name}</span>
          {!props.readOnly && <i className="rz" />}
          {!props.readOnly && <i className="dot" title="Drag onto another bar to start it after this one" />}
        </div>,
      );
      if (outside) bars.push(<span key={t.id + 'l'} className="ms-lbl" style={{ left: x(s.start) + w + 22, top: i * ROW + 9 }}>{t.name}</span>);
    }
    if (t.start.kind === 'after') {
      for (const pid of t.start.ids) {
        const ps = sc.get(pid);
        const pi = rowIndex(pid);
        if (!ps || pi < 0) continue;
        const pt = tasks.find((q) => q.id === pid);
        const x1 = x(pt?.tags.includes('milestone') ? (ps.start + ps.end) / 2 + 0.7 : ps.end);
        const y1 = pi * ROW + ROW / 2;
        const x2 = x(s.start);
        const y2 = i * ROW + ROW / 2;
        const mx = Math.max(x1 + 8, Math.min(x2 - 8, x1 + 12));
        deps.push(
          <g key={`${pid}>${t.id}`}>
            <path d={`M${x1},${y1} H${mx} V${y2} H${x2 - 1}`} fill="none" stroke="var(--muted)" strokeWidth="1.5" />
            <path d={`M${x2},${y2} l-6,-4 v8 z`} fill="var(--muted)" />
          </g>,
        );
      }
    }
  });

  const ticks: React.ReactNode[] = [];
  const vlines: React.ReactNode[] = [];
  const first = min + ((((4 - min) % 7) + 7) % 7); // weekly marks on Mondays (1970-01-05 is day 4)
  for (let d = first; d <= max; d += 7) {
    const dt = new Date(d * DAY_MS);
    const month = dt.getUTCDate() <= 7;
    ticks.push(
      <div key={d} className={`g-tick ${month ? 'month' : ''}`} style={{ left: x(d) }}>
        {month ? dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + ' ' : ''}
        {dt.getUTCDate()}
      </div>,
    );
    vlines.push(<div key={d} className="g-vline" style={{ left: x(d) }} />);
  }

  const H = rows.length * ROW;
  if (!rows.length) return <div className="g-empty">No tasks yet. Use “Task” on the left, or type in the Mermaid box.</div>;

  return (
    <div className="gantt">
      <div className="g-table">
        <div className="g-th">Task</div>
        {rows.map((r, i) =>
          r.kind === 'sec' ? (
            <div key={i} className={`g-row sec ${props.selectedSection === r.index ? 'sel' : ''}`} onClick={() => props.onSelectSection(r.index)}>{r.name}</div>
          ) : (
            <div key={i} className={`g-row ${selected === r.task.id ? 'sel' : ''}`} onClick={() => props.onSelect(r.task.id)}>
              <span className="nm">{r.task.name}</span>
              {r.task.tags.filter((k) => k !== 'milestone').map((k) => (
                <span key={k} className={`chip ${k}`}>{k === 'crit' ? 'critical' : k}</span>
              ))}
              <span className="dur">{r.task.tags.includes('milestone') ? '◆' : `${Math.max(1, Math.round((sc.get(r.task.id)?.end ?? 0) - (sc.get(r.task.id)?.start ?? 0)))}d`}</span>
            </div>
          ),
        )}
      </div>
      <div className="g-scroll">
        <div className="g-canvas" style={{ width }}>
          <div className="g-head">{ticks}</div>
          <div className="g-body" ref={bodyRef} style={{ height: H }}>
            {stripes}
            {vlines}
            {showToday && (
              <div className="g-today" style={{ left: x(todayDay()) }}>
                <span>today</span>
              </div>
            )}
            <svg className="g-deps" width={width} height={H}>{deps}</svg>
            {bars}
            <svg className="linkline" width={width} height={H}>
              {link && <path d={`M${link.x1},${link.y1} L${link.x2},${link.y2}`} stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" fill="none" />}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

export const dayLabel = (d: number) => fromDay(d);
