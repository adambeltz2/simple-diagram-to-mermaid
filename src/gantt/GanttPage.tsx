import { useEffect, useMemo, useRef, useState } from 'react';
import { Preview } from '../Preview';
import { isGanttText } from '../io/markdown';
import { Toast, useToast } from '../io/useToast';
import { useImportExport } from '../io/useImportExport';
import { useTheme } from '../theme';
import { GanttChart } from './GanttChart';
import {
  addTask, allTasks, deleteTask, findTask, fromDay, parseGantt, renameTaskId, resizeTask, schedule,
  serializeGantt, updateTask, dependsOn, type Gantt,
} from './model';

const KEY = 'sdtm:gantt:v1';
const ZOOMS = [5, 7, 9, 12, 16, 22, 30];

const STARTER = `gantt
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
    Go live :milestone, live, after qa, 0d
`;

function load(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (typeof j.text === 'string') return j.text;
    }
  } catch {
    /* ignore */
  }
  return STARTER;
}

const AXIS = [
  ['', 'Default (2026-12-01)'], ['%b %d', 'Dec 01'], ['%d %b', '01 Dec'], ['%m/%d', '12/01'], ['%Y-%m-%d', '2026-12-01'],
] as const;

export function GanttPage() {
  const theme = useTheme();
  const init = useMemo(load, []);
  const [text, setText] = useState(init);
  const [sel, setSel] = useState<string | null>(null);
  const [selSec, setSelSec] = useState<number | null>(null);
  const [zoom, setZoom] = useState(12);
  const [svg, setSvg] = useState('');
  const toast = useToast();
  const flash = toast.flash;

  const parsed = useMemo(() => parseGantt(text), [text]);
  const gantt = parsed.gantt;
  const tasks = useMemo(() => allTasks(gantt), [gantt]);
  const sc = useMemo(() => schedule(gantt), [gantt]);
  const selTask = sel ? findTask(gantt, sel) ?? null : null;

  /* ----- history (text snapshots) ----- */
  const past = useRef<string[]>([]);
  const future = useRef<string[]>([]);
  const last = useRef({ key: '', at: 0 });
  const [, tick] = useState(0);
  const textRef = useRef(text);
  textRef.current = text;
  const pushHistory = (key?: string) => {
    const now = Date.now();
    if (key && key === last.current.key && now - last.current.at < 900) {
      last.current.at = now;
      return;
    }
    last.current = { key: key ?? '', at: now };
    past.current.push(textRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    tick((t) => t + 1);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (prev === undefined) return;
    future.current.push(textRef.current);
    setText(prev);
    tick((t) => t + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (next === undefined) return;
    past.current.push(textRef.current);
    setText(next);
    tick((t) => t + 1);
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) undoRef.current();
      else if ((k === 'z' && e.shiftKey) || k === 'y') redoRef.current();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ----- import / export: the same in every workspace ----- */
  const io = useImportExport({
    page: 'gantt',
    text,
    svg,
    fileBase: 'plan',
    isMine: isGanttText,
    flash,
    onImport: (t) => {
      pushHistory();
      setText(t);
      setSel(null);
      setSelSec(null);
    },
  });

  // Quiet autosave so a refresh never loses work.
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ text }));
    } catch {
      /* ignore */
    }
  }, [text]);

  const commit = (g: Gantt) => setText(serializeGantt(g));
  const edit = (fn: (g: Gantt) => Gantt | null, key?: string) => {
    const next = fn(gantt);
    if (!next) return;
    pushHistory(key);
    commit(next);
  };

  /* ----- toolbar actions ----- */
  const reset = () => {
    pushHistory();
    setText(STARTER);
    setSel(null);
  };

  const days = (id: string) => {
    const s = sc.get(id);
    return s ? Math.max(1, Math.round(s.end - s.start)) : 1;
  };
  const err = parsed.warnings;
  /* ----- inspector ----- */
  const inspector = () => {
    if (selTask) {
      const t = selTask;
      const others = tasks.filter((o) => o.id !== t.id && !dependsOn(gantt, o.id, t.id));
      const afterIds = t.start.kind === 'after' ? t.start.ids : [];
      const combo = afterIds.length > 1 ? afterIds.join(' ') : '';
      const nameOf = (id: string) => tasks.find((x) => x.id === id)?.name ?? id;
      const blurCommit = (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>, apply: (v: string) => void) => {
        if ('key' in e) {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          return;
        }
        apply(e.target.value);
      };
      return (
        <div className="fields" key={t.id}>
          <label>
            Name
            <input
              key={t.name}
              defaultValue={t.name}
              onBlur={(e) => blurCommit(e, (v) => v.trim() && v.trim() !== t.name && edit((g) => updateTask(g, t.id, (x) => void (x.name = v.trim()))))}
              onKeyDown={(e) => blurCommit(e, () => undefined)}
            />
          </label>
          <label>
            ID
            <input
              key={t.id}
              defaultValue={t.id}
              onBlur={(e) =>
                blurCommit(e, (v) => {
                  if (v === t.id) return;
                  const next = renameTaskId(gantt, t.id, v.trim());
                  if (!next) {
                    e.target.value = t.id;
                    return flash('IDs must be unique and contain no spaces, commas, colons or #.');
                  }
                  pushHistory();
                  commit(next);
                  setSel(v.trim());
                })
              }
              onKeyDown={(e) => blurCommit(e, () => undefined)}
            />
          </label>
          <label>
            Starts after
            <select
              value={afterIds.length > 1 ? combo : afterIds[0] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v === combo && combo) return;
                edit((g) =>
                  updateTask(g, t.id, (x) => {
                    x.start = v ? { kind: 'after', ids: [v] } : { kind: 'date', date: fromDay(sc.get(t.id)?.start ?? 0) };
                  }),
                );
              }}
            >
              <option value="">a date</option>
              {combo && <option value={combo}>{afterIds.map(nameOf).join(' + ')}</option>}
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <div className="row2">
            <label>
              Start
              <input
                type="date"
                value={fromDay(sc.get(t.id)?.start ?? 0)}
                disabled={t.start.kind === 'after'}
                onChange={(e) => /^\d{4}-\d{2}-\d{2}$/.test(e.target.value) && edit((g) => updateTask(g, t.id, (x) => void (x.start = { kind: 'date', date: e.target.value })), 'start' + t.id)}
              />
            </label>
            <label>
              Days
              <input
                type="number"
                min={1}
                value={days(t.id)}
                disabled={t.tags.includes('milestone')}
                onChange={(e) => e.target.value && edit((g) => resizeTask(g, t.id, Number(e.target.value)), 'dur' + t.id)}
              />
            </label>
          </div>
          <div className="checks">
            {(['done', 'active', 'crit', 'milestone'] as const).map((k) => (
              <label key={k}>
                <input
                  type="checkbox"
                  checked={t.tags.includes(k)}
                  onChange={(e) =>
                    edit((g) =>
                      updateTask(g, t.id, (x) => {
                        x.tags = e.target.checked ? [...new Set([...x.tags, k])] : x.tags.filter((y) => y !== k);
                        if (k === 'milestone') x.end = { kind: 'dur', n: e.target.checked ? 0 : 3, unit: 'd' };
                      }),
                    )
                  }
                />
                {k === 'crit' ? 'critical' : k}
              </label>
            ))}
          </div>
          <button
            className="wide danger"
            onClick={() => {
              edit((g) => deleteTask(g, t.id));
              setSel(null);
              flash(`Deleted “${t.name}”.`, true);
            }}
          >
            Delete task
          </button>
        </div>
      );
    }
    if (selSec !== null && gantt.sections[selSec]) {
      const s = gantt.sections[selSec];
      return (
        <div className="fields" key={`sec${selSec}`}>
          <label>
            Section name
            <input
              key={s.name}
              defaultValue={s.name}
              onBlur={(e) => e.target.value.trim() !== s.name && edit((g) => ({ ...g, sections: g.sections.map((x, i) => (i === selSec ? { ...x, name: e.target.value.trim() } : x)) }))}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>
          <button
            className="wide danger"
            onClick={() => {
              edit((g) => {
                let next = g;
                for (const it of g.sections[selSec].items) if (it.type === 'task') next = deleteTask(next, it.task.id);
                return { ...next, sections: next.sections.filter((_, i) => i !== selSec) };
              });
              setSelSec(null);
              flash(`Deleted the section “${s.name || 'Tasks'}” and its tasks.`, true);
            }}
          >
            Delete section and its tasks
          </button>
        </div>
      );
    }
    return <p className="hint">Select a bar or a row to edit it. New tasks join the selected task's section and start after its last task.</p>;
  };

  const sectionOfSel = () => {
    if (selTask) return Math.max(0, gantt.sections.findIndex((s) => s.items.some((i) => i.type === 'task' && i.task.id === selTask.id)));
    return selSec ?? gantt.sections.length - 1;
  };

  /* ----- render ----- */
  return (
    <div className="app">
      <header className="toolbar">
        <button onClick={undo} disabled={!past.current.length} title="Ctrl+Z">Undo</button>
        <button onClick={redo} disabled={!future.current.length} title="Ctrl+Shift+Z">Redo</button>
        <button onClick={() => setZoom((z) => ZOOMS[Math.max(0, ZOOMS.indexOf(z) - 1)] ?? z)} title="Zoom out">−</button>
        <button onClick={() => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(z) + 1)] ?? z)} title="Zoom in">+</button>
        <span className="spacer" />
        {io.importMenu}
        {io.exportMenu}
        <button className="danger" onClick={reset}>Reset sample</button>
      </header>

      <aside className="sidebar">
          <h3>Add</h3>
          <div className="palette">
            <button className="palette-item" onClick={() => { const r = addTask(gantt, sectionOfSel()); pushHistory(); commit(r.gantt); setSel(r.id); setSelSec(null); }}>
              <span className="swatch swatch-task" />Task
            </button>
            <button className="palette-item" onClick={() => { const r = addTask(gantt, sectionOfSel(), true); pushHistory(); commit(r.gantt); setSel(r.id); setSelSec(null); }}>
              <span className="swatch swatch-ms" />Milestone
            </button>
            <button className="palette-item" onClick={() => { edit((g) => ({ ...g, sections: [...g.sections, { name: 'New section', items: [] }] })); setSel(null); setSelSec(gantt.sections.length); }}>
              <span className="swatch swatch-group" />Section
            </button>
          </div>
          <h3>Chart</h3>
          <div className="fields">
            <label>
              Title
              <input value={gantt.title} onChange={(e) => edit((g) => ({ ...g, title: e.target.value }), 'title')} />
            </label>
            <label>
              Date labels
              <select value={gantt.axisFormat ?? ''} onChange={(e) => edit((g) => ({ ...g, axisFormat: e.target.value || undefined }))}>
                {gantt.axisFormat && !AXIS.some(([v]) => v === gantt.axisFormat) && <option value={gantt.axisFormat}>{gantt.axisFormat}</option>}
                {AXIS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <div className="checks">
              <label>
                <input type="checkbox" checked={gantt.todayMarker !== 'off'} onChange={(e) => edit((g) => ({ ...g, todayMarker: e.target.checked ? undefined : 'off' }))} />
                Show today marker
              </label>
            </div>
          </div>
          <h3>Inspector</h3>
          {inspector()}
        </aside>

      <main className="canvas gantt-main">
        <div className="view-head">
              <strong>{gantt.title || 'Untitled plan'}</strong>
              <span>{tasks.length} tasks · drag bars to move, drag the right edge to resize, drag the dot onto another bar to link</span>
        </div>
        <GanttChart
              gantt={gantt}
              selected={selTask?.id ?? null}
              selectedSection={selSec}
              zoom={zoom}
              onSelect={(id) => { setSel(id); setSelSec(null); }}
              onSelectSection={(i) => { setSel(null); setSelSec(i); }}
              onBegin={() => pushHistory()}
              onChange={commit}
              onNotice={flash}
        />
      </main>

        <section className="side-right">
          <div className="code-head">
            <h3>Mermaid</h3>
            <span className="spacer" />
            <button onClick={() => navigator.clipboard?.writeText(text).then(() => flash('Copied.'), () => undefined)}>Copy</button>
          </div>
          <textarea
            className="code"
            spellCheck={false}
            value={text}
            aria-label="Mermaid gantt source"
            onChange={(e) => {
              pushHistory('typing');
                      setText(e.target.value);
            }}
          />
          <p className="hint">Edit the text or the chart; they stay in sync and save in this browser automatically.</p>
          {err.length > 0 && (
            <ul className="warnings">
              {err.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          <h3>Preview</h3>
          <Preview code={text} theme={theme} onSvg={setSvg} />
        </section>

      <footer className="footer">
        <span>Gantt · v{__APP_VERSION__}</span>
      </footer>

      {io.pasteDialog}
      <Toast notice={toast.notice} onUndo={() => { undo(); toast.clear(); }} />
    </div>
  );
}
