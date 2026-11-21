import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
} from '@xyflow/react';
import { AttrEditor } from './canvas/AttrEditor';
import { ColorField } from './canvas/ColorField';
import { GroupNode } from './canvas/GroupNode';
import { StyleContext } from './canvas/StyleContext';
import { reparent, ungroup, wrapInGroup } from './canvas/grouping';
import { ShapeNode } from './canvas/ShapeNode';
import { useTheme } from './theme';
import { download } from './io/files';
import { isCanvasText } from './io/markdown';
import { Toast, useToast } from './io/useToast';
import { DocPicker } from './io/DocPicker';
import { type Doc } from './io/docs';
import { useDocuments } from './io/useDocuments';
import { useImportExport } from './io/useImportExport';
import { Preview } from './Preview';
import {
  ER_MARKER,
  MARKER,
  flowToGraph,
  graphToFlow,
  newId,
  nextGroupId,
  nextNodeId,
  orderNodes,
  styleEdge,
  type EdgeData,
  type FlowEdge,
  type FlowNode,
} from './mermaid/flow';
import { autoLayout, fitGroups, shouldKeepPositions } from './mermaid/layout';
import { convertDiagram, parseDiagram, toDiagram } from './mermaid/diagram';
import { metaOf, normalizeGraph } from './mermaid/normalize';
import {
  END_PRESETS,
  LINES,
  SHAPES,
  STATE_SHAPES,
  ER_SHAPES,
  CARDS,
  type Card,
  type DiagramKind,
  LABELLESS,
  effectiveCss,
  type Css,
  type Direction,
  type Graph,
  type GraphMeta,
  type Line,
  type Shape,
} from './mermaid/types';

const nodeTypes = { shape: ShapeNode, group: GroupNode };
const STORAGE_KEY = 'sdtm:graph:v1';
const STARTER: Graph = autoLayout({
  direction: 'TD',
  groups: [],
  nodes: [
    { id: 'A', label: 'Start', shape: 'stadium', x: 0, y: 0 },
    { id: 'B', label: 'Is it working?', shape: 'diamond', x: 0, y: 0 },
    { id: 'C', label: 'Ship it', shape: 'rect', x: 0, y: 0 },
    { id: 'D', label: 'Debug', shape: 'rect', x: 0, y: 0 },
  ],
  edges: [
    { id: 'e1', source: 'A', target: 'B', label: '', line: 'solid', head: 'arrow', tail: 'none' },
    { id: 'e2', source: 'B', target: 'C', label: 'yes', line: 'solid', head: 'arrow', tail: 'none' },
    { id: 'e3', source: 'B', target: 'D', label: 'no', line: 'solid', head: 'arrow', tail: 'none' },
    { id: 'e4', source: 'D', target: 'B', label: '', line: 'dotted', head: 'arrow', tail: 'none' },
  ],
});

/** The graph the single-document autosave of earlier versions held, so nobody loses a diagram on upgrade. */
function legacyGraph(): Graph | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeGraph(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

const blankGraph = (diagram?: 'state' | 'er'): Graph => ({
  direction: 'TD',
  nodes: [],
  edges: [],
  groups: [],
  ...(diagram ? { diagram } : {}),
});

const EMPTY_DEFS: Record<string, Css> = {};

function Editor() {
  const docs = useDocuments<Graph>('diagrams', {
    legacy: legacyGraph,
    sample: () => STARTER,
    blank: () => blankGraph(),
    firstName: 'My diagram',
  });
  /** which document the canvas belongs to, so autosave can never write into another one */
  const loadedFor = useRef(docs.activeId);
  /** after showing another document, the next history snapshot is a baseline, not an undo step */
  const adopt = useRef(false);
  const initial = useMemo(() => {
    const g = normalizeGraph(docs.active.data) ?? STARTER;
    return { g, ...graphToFlow(g, true) };
  }, []);
  const [direction, setDirection] = useState<Direction>(initial.g.direction);
  const [meta, setMeta] = useState<GraphMeta>(() => metaOf(initial.g));
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initial.edges);
  const theme = useTheme();
  // Inline label editor shown on double-clicking an edge.
  const [edgeEdit, setEdgeEdit] = useState<{ id: string; x: number; y: number; value: string } | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [svg, setSvg] = useState('');
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);

  // ---- undo / redo --------------------------------------------------------
  type Snap = { direction: Direction; meta: GraphMeta; nodes: FlowNode[]; edges: FlowEdge[] };
  const makeSnap = (): Snap => ({
    direction,
    meta,
    nodes: nodes.map(({ id, type, position, data, parentId, width, height }) => ({
      id,
      type,
      position,
      data,
      parentId,
      width,
      height,
    })),
    edges: edges.map(({ selected: _s, ...e }) => e),
  });
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const lastSnap = useRef<Snap>({
    direction: initial.g.direction,
    meta: metaOf(initial.g),
    nodes: initial.nodes,
    edges: initial.edges,
  });
  const lastKey = useRef(JSON.stringify(lastSnap.current));
  const [, setTick] = useState(0);

  // Record a history step once changes settle (drags emit many events).
  const commit = () => {
    const s = makeSnap();
    const k = JSON.stringify(s);
    if (adopt.current) {
      adopt.current = false;
      lastSnap.current = s;
      lastKey.current = k;
      past.current = [];
      future.current = [];
      setTick((t) => t + 1);
      return;
    }
    if (k === lastKey.current) return;
    past.current.push(lastSnap.current);
    if (past.current.length > 100) past.current.shift();
    future.current = [];
    lastSnap.current = s;
    lastKey.current = k;
    setTick((t) => t + 1);
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const t = setTimeout(() => commitRef.current(), 300);
    return () => clearTimeout(t);
  }, [nodes, edges, direction, meta]);

  const restore = (s: Snap) => {
    lastSnap.current = s;
    lastKey.current = JSON.stringify(s);
    setDirection(s.direction);
    setMeta(s.meta);
    setNodes(s.nodes);
    setEdges(s.edges);
    setTick((t) => t + 1);
  };
  const undo = () => {
    commit();
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(lastSnap.current);
    restore(prev);
  };
  const redo = () => {
    commit();
    const next = future.current.pop();
    if (!next) return;
    past.current.push(lastSnap.current);
    restore(next);
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select')) return; // keep native text undo
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

  const graph = useMemo(() => flowToGraph(direction, nodes, edges, meta), [direction, nodes, edges, meta]);
  const generated = useMemo(() => toDiagram(graph), [graph]);
  const isState = meta.diagram === 'state';
  const isEr = meta.diagram === 'er';
  const paletteShapes = isState ? STATE_SHAPES : isEr ? ER_SHAPES : SHAPES;

  const load = useCallback(
    (g: Graph, resetHandles = true) => {
      const f = graphToFlow(g, resetHandles);
      setDirection(g.direction);
      setMeta(metaOf(g));
      setNodes(f.nodes);
      setEdges(f.edges);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    },
    [setNodes, setEdges, fitView],
  );

  // ---- Mermaid text -> canvas -------------------------------------------
  const applyText = (text: string) => {
    const { graph: parsed, warnings: w } = parseDiagram(text);
    const known = new Map(graph.nodes.map((n) => [n.id, n]));
    // Small edits keep the user's placement; a different diagram gets a fresh layout.
    const anyKnown = shouldKeepPositions(parsed.nodes, known);
    const laid = autoLayout(parsed);
    const merged: Graph = fitGroups({
      ...parsed,
      nodes: laid.nodes.map((n) => {
        const k = known.get(n.id);
        return anyKnown && k ? { ...n, x: k.x, y: k.y } : n;
      }),
    });
    load(merged, true);
    setWarnings(w);
    setDraft(null);
  };

  /** Show a document. Undo history belongs to one document, so it starts fresh. */
  const openDoc = (d: Doc<Graph>) => {
    const g = normalizeGraph(d.data) ?? blankGraph();
    loadedFor.current = d.id;
    adopt.current = true;
    past.current = [];
    future.current = [];
    load(g, true);
    setDraft(null);
    setWarnings([]);
    setTick((t) => t + 1);
  };
  const newDoc = (name: string, g: Graph) => {
    const d = docs.create(name, g);
    openDoc(d);
    return d;
  };

  // ---- import / export: the same in every tab (imports become NEW documents) ---
  const toast = useToast();
  const io = useImportExport({
    page: 'diagrams',
    text: generated,
    wrap: docs.active.wrap,
    svg,
    fileBase: 'diagram',
    pasteName: 'Pasted diagram',
    look: { get: () => meta.frontmatter, set: (fm) => setMeta((m) => ({ ...m, frontmatter: fm })) },
    isMine: isCanvasText,
    flash: toast.flash,
    onImport: (text, name, wrap) => {
      const { graph: parsed, warnings: w } = parseDiagram(text);
      const d = docs.create(name, fitGroups(autoLayout(parsed)), wrap);
      openDoc(d);
      setWarnings(w);
      return d.name;
    },
  });

  // Quiet autosave into the document that is open.
  useEffect(() => {
    docs.update(loadedFor.current, graph);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // ---- canvas actions -----------------------------------------------------
  const addNode = useCallback(
    (shape: Shape, position?: { x: number; y: number }) => {
      setNodes((ns) => {
        const id = nextNodeId(ns.map((n) => n.id));
        const rect = wrapper.current?.getBoundingClientRect();
        const pos =
          position ??
          screenToFlowPosition({
            x: (rect?.left ?? 0) + (rect?.width ?? 400) / 2 + ns.length * 6,
            y: (rect?.top ?? 0) + (rect?.height ?? 300) / 2 + ns.length * 6,
          });
        return [
          ...ns.map((n) => ({ ...n, selected: false })),
          { id, type: 'shape' as const, position: pos, selected: true, data:
              shape === 'entity'
                ? { label: id, shape, attrs: [{ type: 'string', name: 'id', keys: 'PK' }] }
                : { label: LABELLESS.has(shape) ? '' : isState ? `State ${id}` : `Node ${id}`, shape },
          },
        ];
      });
    },
    [setNodes, screenToFlowPosition],
  );

  const addGroup = useCallback(
    (position?: { x: number; y: number }) => {
      setNodes((ns) => {
        const id = nextGroupId(ns.map((n) => n.id));
        const rect = wrapper.current?.getBoundingClientRect();
        const pos =
          position ??
          screenToFlowPosition({
            x: (rect?.left ?? 0) + (rect?.width ?? 400) / 2 - 130,
            y: (rect?.top ?? 0) + (rect?.height ?? 300) / 2 - 80,
          });
        const g: FlowNode = {
          id,
          type: 'group',
          position: pos,
          width: 260,
          height: 160,
          selected: true,
          data: { label: isState ? 'Composite' : 'Group', shape: 'rect' },
        };
        return reparent(orderNodes([...ns.map((n) => ({ ...n, selected: false })), g]), id);
      });
    },
    [setNodes, screenToFlowPosition],
  );

  /** Wrap the selected shape nodes in a new group sized to fit them. */
  const groupSelection = () =>
    setNodes((ns) =>
      wrapInGroup(
        ns,
        ns.filter((n) => n.selected && n.type !== 'group').map((n) => n.id),
        nextGroupId(ns.map((n) => n.id)),
      ),
    );

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) =>
        addEdge(
          {
            ...c,
            id: newId('e'),
            data: (isEr
              ? { line: 'solid', head: 'none', tail: 'none', er: { from: 'one', to: 'zero-many' } }
              : { line: 'solid', head: 'arrow', tail: 'none' }) as EdgeData,
            ...styleEdge(
              isEr
                ? { line: 'solid', head: 'none', tail: 'none', er: { from: 'one', to: 'zero-many' } }
                : { line: 'solid', head: 'arrow', tail: 'none' },
            ),
          },
          es,
        ),
      ),
    [setEdges, isEr],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const shape = e.dataTransfer.getData('application/x-shape');
    if (!shape) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (shape === 'group') addGroup({ x: p.x - 130, y: p.y - 30 });
    else addNode(shape as Shape, { x: p.x - 55, y: p.y - 25 });
  };

  // ---- selection / inspector ---------------------------------------------
  const selNode = nodes.filter((n) => n.selected);
  const selEdge = edges.filter((e) => e.selected);
  const oneNode = selNode.length === 1 && selEdge.length === 0 ? selNode[0] : null;
  const oneEdge = selEdge.length === 1 && selNode.length === 0 ? selEdge[0] : null;

  const patchNode = (id: string, data: Partial<FlowNode['data']>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));

  /** Set (or clear, when `value` is undefined) one `style` property on a node or group. */
  const patchCss = (id: string, key: string, value: string | undefined) =>
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const css: Css = { ...n.data.css };
        if (value === undefined) delete css[key];
        else css[key] = value;
        return { ...n, data: { ...n.data, css: Object.keys(css).length ? css : undefined } };
      }),
    );

  const patchEdge = (id: string, patch: { label?: string; data?: Partial<EdgeData> }) =>
    setEdges((es) =>
      es.map((e) => {
        if (e.id !== id) return e;
        const data: EdgeData = { line: 'solid', head: 'arrow', tail: 'none', ...e.data, ...patch.data };
        if (patch.data && 'css' in patch.data && !patch.data.css) delete data.css;
        return {
          ...e,
          ...(patch.label !== undefined ? { label: patch.label || undefined } : {}),
          ...(patch.data ? { data, ...styleEdge(data) } : {}),
        };
      }),
    );

  const startEdgeEdit = (e: React.MouseEvent, edge: FlowEdge) => {
    const rect = wrapper.current?.getBoundingClientRect();
    setEdgeEdit({
      id: edge.id,
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
      value: typeof edge.label === 'string' ? edge.label : '',
    });
  };
  const commitEdgeEdit = () => {
    if (edgeEdit) patchEdge(edgeEdit.id, { label: edgeEdit.value.trim() });
    setEdgeEdit(null);
  };

  const renameNode = (oldId: string, raw: string) => {
    let id = raw.trim().replace(isEr ? /[^A-Za-z0-9_-]/g : /[^A-Za-z0-9_]/g, '_');
    if (isEr && /^[0-9-]/.test(id)) id = `_${id}`;
    if (!id || id === oldId || nodes.some((n) => n.id === id)) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === oldId ? { ...n, id, data: isEr && n.data.label === oldId ? { ...n.data, label: id } : n.data } : n,
      ),
    );
    setEdges((es) =>
      es.map((e) => ({
        ...e,
        source: e.source === oldId ? id : e.source,
        target: e.target === oldId ? id : e.target,
      })),
    );
  };

  // ---- import / export ----------------------------------------------------
  const readFile = (file: File, cb: (text: string) => void) => {
    const r = new FileReader();
    r.onload = () => cb(String(r.result));
    r.readAsText(file);
  };

  const importProject = (file: File) =>
    readFile(file, (text) => {
      try {
        const g = normalizeGraph(JSON.parse(text));
        if (!g) throw new Error();
        const d = newDoc(file.name.replace(/\.[^.]+$/, '').replace(/\.project$/, '') || 'Project', g);
        toast.flash(`Opened the project as a new diagram, “${d.name}”.`);
      } catch {
        setWarnings(['That file is not a valid project .json.']);
      }
    });

  const code = draft ?? generated;

  return (
    <div className="app">
      <header className="toolbar">
        <DocPicker
          docs={docs.docs}
          activeId={docs.activeId}
          onSwitch={(id) => {
            const d = docs.switchTo(id);
            if (d) openDoc(d);
          }}
          newItems={[
            { label: 'Flowchart', onClick: () => newDoc('New flowchart', blankGraph()) },
            { label: 'State diagram', onClick: () => newDoc('New state diagram', blankGraph('state')) },
            { label: 'ER diagram', onClick: () => newDoc('New ER diagram', blankGraph('er')) },
            { label: 'From the sample', onClick: () => newDoc('Sample diagram', STARTER) },
          ]}
          onRename={(name) => docs.rename(docs.activeId, name)}
          onDuplicate={() => {
            const d = docs.duplicate(docs.activeId);
            if (d) {
              openDoc(d);
              toast.flash(`Made a copy, “${d.name}”.`);
            }
          }}
          onDelete={() => {
            const r = docs.remove(docs.activeId);
            if (!r) return;
            openDoc(r.next);
            toast.flash(`Deleted “${r.removed.name}”.`, () => openDoc(r.undo()));
          }}
        />
        <label>
          Diagram{' '}
          <select
            value={isState ? 'state' : isEr ? 'er' : 'flowchart'}
            onChange={(e) => {
              const to = e.target.value as DiagramKind;
              const nice = to === 'state' ? 'state diagram' : to === 'er' ? 'ER diagram' : 'flowchart';
              const converted = autoLayout(convertDiagram(graph, to));
              if (!nodes.length) {
                // nothing drawn yet, so there is nothing to keep: just change the type
                load(converted, true);
                setDraft(null);
                setWarnings([]);
                return;
              }
              // otherwise the conversion is a new diagram, next to the original
              const d = newDoc(`${docs.active.name} (${nice})`, converted);
              toast.flash(`Made a ${nice} copy, “${d.name}”. The original is still in your list.`);
            }}
          >
            <option value="flowchart">Flowchart</option>
            <option value="state">State diagram</option>
            <option value="er">ER diagram</option>
          </select>
        </label>
        <label>
          Direction{' '}
          <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
            <option value="TD">Top → Down</option>
            <option value="LR">Left → Right</option>
            <option value="BT">Bottom → Up</option>
            <option value="RL">Right → Left</option>
          </select>
        </label>
        <button onClick={() => load(autoLayout(graph), true)}>Auto layout</button>
        <button onClick={undo} disabled={past.current.length === 0 && JSON.stringify(makeSnap()) === lastKey.current} title="Ctrl+Z">
          Undo
        </button>
        <button onClick={redo} disabled={future.current.length === 0} title="Ctrl+Shift+Z">
          Redo
        </button>
        <span className="spacer" />
        {io.importMenu}
        {io.exportMenu}
        <button onClick={() => projectInput.current?.click()} title="Open a project file that keeps node positions">Open project</button>
        <button onClick={() => download('diagram.project.json', JSON.stringify(graph, null, 2), 'application/json')} title="Save a project file that keeps node positions">
          Save project
        </button>
        <input
          ref={projectInput}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importProject(f);
            e.target.value = '';
          }}
        />
      </header>

      <aside className="sidebar">
        <h3>Shapes</h3>
        <p className="hint">Drag onto the canvas, or click to add.</p>
        <div className="palette">
          {paletteShapes.map((s) => (
            <button
              key={s.value}
              className="palette-item"
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/x-shape', s.value)}
              onClick={() => addNode(s.value)}
            >
              <span className={`swatch swatch-${s.value}`} />
              {s.name}
            </button>
          ))}
          {!isEr && (
          <button
            className="palette-item"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/x-shape', 'group')}
            onClick={() => addGroup()}
            title="A Mermaid subgraph. Drop nodes inside it."
          >
            <span className="swatch swatch-group" />
            {isState ? 'Composite state' : 'Group'}
          </button>
          )}
        </div>

        <h3>Inspector</h3>
        {oneNode && oneNode.data.shape === 'entity' && (
          <div className="inspector">
            <label>
              Name
              <input
                key={oneNode.id}
                defaultValue={oneNode.id}
                onBlur={(e) => {
                  renameNode(oneNode.id, e.target.value);
                  e.target.value = oneNode.id;
                }}
              />
            </label>
            <label>
              Alias (optional)
              <input
                value={oneNode.data.label === oneNode.id ? '' : oneNode.data.label}
                placeholder={oneNode.id}
                onChange={(e) => patchNode(oneNode.id, { label: e.target.value || oneNode.id })}
              />
            </label>
            <AttrEditor attrs={oneNode.data.attrs ?? []} onChange={(attrs) => patchNode(oneNode.id, { attrs })} />
          </div>
        )}
        {oneNode && oneNode.data.shape !== 'entity' && (
          <div className="inspector">
            {!LABELLESS.has(oneNode.data.shape) && (
              <label>
                {isState ? 'Name' : 'Label'}
                <textarea
                  rows={3}
                  value={oneNode.data.label}
                  onChange={(e) => patchNode(oneNode.id, { label: e.target.value })}
                />
              </label>
            )}
            {oneNode.type !== 'group' && (
              <label>
                Shape
                <select
                  value={oneNode.data.shape}
                  onChange={(e) => patchNode(oneNode.id, { shape: e.target.value as Shape })}
                >
                  {paletteShapes.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {oneNode.type === 'group' && (
              <label>
                Direction inside
                <select
                  value={oneNode.data.direction ?? ''}
                  onChange={(e) => patchNode(oneNode.id, { direction: (e.target.value || undefined) as Direction | undefined })}
                >
                  <option value="">Same as diagram</option>
                  <option value="TD">Top → Down</option>
                  <option value="LR">Left → Right</option>
                  <option value="BT">Bottom → Up</option>
                  <option value="RL">Right → Left</option>
                </select>
              </label>
            )}
            {!isState && (() => {
              const fx = effectiveCss(oneNode.data.classes, meta.classDefs, oneNode.data.css);
              const own = oneNode.data.css ?? {};
              return (
                <>
                  <ColorField label="Fill" shown={fx.fill} own={own.fill} fallback="#ffffff" onChange={(v) => patchCss(oneNode.id, 'fill', v)} />
                  <ColorField label="Border" shown={fx.stroke} own={own.stroke} fallback="#5b9dff" onChange={(v) => patchCss(oneNode.id, 'stroke', v)} />
                  <ColorField label="Text" shown={fx.color} own={own.color} fallback="#1c2128" onChange={(v) => patchCss(oneNode.id, 'color', v)} />
                </>
              );
            })()}
            {oneNode.data.classes?.length ? (
              <p className="hint">Mermaid classes: {oneNode.data.classes.join(', ')} (kept on export)</p>
            ) : null}
            <label>
              ID
              <input
                key={oneNode.id}
                defaultValue={oneNode.id}
                onBlur={(e) => {
                  renameNode(oneNode.id, e.target.value);
                  e.target.value = oneNode.id;
                }}
              />
            </label>
          </div>
        )}
        {oneEdge && isEr && (() => {
          const d: EdgeData = { line: 'solid', head: 'none', tail: 'none', ...oneEdge.data };
          const er = d.er ?? { from: 'one' as Card, to: 'zero-many' as Card };
          const card = (end: 'from' | 'to') => (
            <select value={er[end]} onChange={(e) => patchEdge(oneEdge.id, { data: { er: { ...er, [end]: e.target.value as Card } } })}>
              {CARDS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.name}
                </option>
              ))}
            </select>
          );
          return (
            <div className="inspector">
              <label>
                Relationship
                <input
                  value={typeof oneEdge.label === 'string' ? oneEdge.label : ''}
                  placeholder="e.g. places"
                  onChange={(e) => patchEdge(oneEdge.id, { label: e.target.value })}
                />
              </label>
              <label>
                {oneEdge.source} side
                {card('from')}
              </label>
              <label>
                {oneEdge.target} side
                {card('to')}
              </label>
              <label>
                Line
                <select value={d.line} onChange={(e) => patchEdge(oneEdge.id, { data: { line: e.target.value as Line } })}>
                  <option value="solid">Identifying (solid)</option>
                  <option value="dotted">Non-identifying (dotted)</option>
                </select>
              </label>
            </div>
          );
        })()}
        {oneEdge && !isEr && (() => {
          const d: EdgeData = { line: 'solid', head: 'arrow', tail: 'none', ...oneEdge.data };
          const preset = END_PRESETS.find((p) => p.head === d.head && p.tail === d.tail)?.id ?? 'custom';
          return (
            <div className="inspector">
              <label>
                Label
                <input
                  value={typeof oneEdge.label === 'string' ? oneEdge.label : ''}
                  onChange={(e) => patchEdge(oneEdge.id, { label: e.target.value })}
                />
              </label>
              {!isState && (<>
              <label>
                Line
                <select value={d.line} onChange={(e) => patchEdge(oneEdge.id, { data: { line: e.target.value as Line } })}>
                  {LINES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Ends
                <select
                  value={preset}
                  onChange={(e) => {
                    const p = END_PRESETS.find((x) => x.id === e.target.value);
                    if (p) patchEdge(oneEdge.id, { data: { head: p.head, tail: p.tail } });
                  }}
                >
                  {preset === 'custom' && (
                    <option value="custom" disabled>
                      Custom
                    </option>
                  )}
                  {END_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <ColorField
                label="Color"
                shown={d.css?.stroke}
                own={d.css?.stroke}
                fallback="#8b93a0"
                onChange={(v) => {
                  const css: Css = { ...d.css };
                  if (v === undefined) delete css.stroke;
                  else css.stroke = v;
                  patchEdge(oneEdge.id, { data: { css: Object.keys(css).length ? css : undefined } });
                }}
              />
              </>)}
            </div>
          );
        })()}
        {oneNode?.type === 'group' && (
          <button
            className="wide"
            onClick={() => setNodes((ns) => ungroup(ns, oneNode.id))}
            title="Remove the box but keep the nodes inside"
          >
            Ungroup (keep nodes)
          </button>
        )}
        {!isEr && selNode.some((n) => n.type !== 'group') && selEdge.length === 0 && (
          <button className="wide" onClick={groupSelection} title="Wrap the selected nodes in a subgraph">
            Group selection
          </button>
        )}
        {!oneNode && !oneEdge && selNode.length === 0 && (
          <p className="hint">
            Select a node or edge to edit it. Double-click a node or a line to edit its label. Drag from a node's edge dot to
            another node to connect. Press Delete to remove. Pick colors and arrowheads in the inspector (flowcharts). Drop nodes into a Group box to make a Mermaid subgraph (deleting a group deletes its contents; use Ungroup to keep them). Ctrl+Z / Ctrl+Shift+Z to undo / redo.
          </p>
        )}
      </aside>

      <main
        className="canvas"
        ref={wrapper}
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }}
      >
        <StyleContext.Provider value={meta.classDefs ?? EMPTY_DEFS}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={startEdgeEdit}
          onNodeDragStop={(_, node, dragged) =>
            setNodes((ns) => (dragged.length ? dragged : [node]).reduce((acc, d) => reparent(acc, d.id), ns))
          }
          zoomOnDoubleClick={false}
          connectionMode={ConnectionMode.Loose}
          fitView
          colorMode={theme}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
        </StyleContext.Provider>
        {/* End markers for circle / cross arrowheads (React Flow references them by id). */}
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            <marker id={MARKER.circle} viewBox="0 0 12 12" refX="6" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <circle cx="6" cy="6" r="4" fill="#8b93a0" />
            </marker>
            <marker id={MARKER.cross} viewBox="0 0 12 12" refX="6" refY="6" markerWidth="12" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M2,2 L10,10 M10,2 L2,10" stroke="#8b93a0" strokeWidth="2" strokeLinecap="round" />
            </marker>
            {(
              [
                ['one', <path key="a" d="M14,2 V14 M19,2 V14" />],
                ['zero-one', <g key="a"><circle cx="9" cy="8" r="4" style={{ fill: 'var(--bg)' }} /><path d="M19,2 V14" /></g>],
                ['one-many', <path key="a" d="M12,8 L24,2 M12,8 L24,14 M12,8 H24 M8,2 V14" />],
                ['zero-many', <g key="a"><circle cx="5" cy="8" r="4" style={{ fill: 'var(--bg)' }} /><path d="M11,8 L24,2 M11,8 L24,14 M11,8 H24" /></g>],
              ] as [Card, React.ReactNode][]
            ).map(([card, art]) => (
              <marker
                key={card}
                id={ER_MARKER[card]}
                viewBox="0 0 24 16"
                refX="24"
                refY="8"
                markerWidth="24"
                markerHeight="16"
                markerUnits="userSpaceOnUse"
                orient="auto-start-reverse"
              >
                <g stroke="#8b93a0" strokeWidth="1.6" fill="none" strokeLinecap="round">
                  {art}
                </g>
              </marker>
            ))}
          </defs>
        </svg>
        {edgeEdit && (
          <input
            className="edge-edit"
            style={{ left: edgeEdit.x, top: edgeEdit.y }}
            autoFocus
            placeholder="Label"
            value={edgeEdit.value}
            onChange={(e) => setEdgeEdit({ ...edgeEdit, value: e.target.value })}
            onFocus={(e) => e.target.select()}
            onBlur={commitEdgeEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEdgeEdit();
              else if (e.key === 'Escape') setEdgeEdit(null);
              e.stopPropagation();
            }}
          />
        )}
      </main>

      <footer className="footer">
        <span>Diagram → Mermaid v{__APP_VERSION__}</span>
        <span>Autosaved in this browser</span>
        <a href="https://github.com/adambeltz2/simple-diagram-to-mermaid" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </footer>

      <section className="side-right">
        <div className="code-head">
          <h3>Mermaid</h3>
          <span className="spacer" />
          {draft !== null && (
            <>
              <button className="primary" onClick={() => applyText(draft)}>
                Apply to canvas
              </button>
              <button onClick={() => setDraft(null)}>Discard</button>
            </>
          )}
          <button onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>
        </div>
        <textarea
          className="code"
          spellCheck={false}
          value={code}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && draft !== null) applyText(draft);
          }}
        />
        {draft !== null && <p className="hint">Edited — click Apply (or Ctrl+Enter) to update the canvas.</p>}
        {warnings.length > 0 && (
          <ul className="warnings">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <h3>Preview</h3>
        <Preview code={code} theme={theme} onSvg={setSvg} />
      </section>

      {io.pasteDialog}
      {io.appearanceDialog}
      <Toast notice={toast.notice} clear={toast.clear} />
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
