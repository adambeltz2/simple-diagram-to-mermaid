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
import { ShapeNode } from './canvas/ShapeNode';
import { Preview } from './Preview';
import {
  flowToGraph,
  graphToFlow,
  newId,
  nextNodeId,
  styleEdge,
  type FlowEdge,
  type FlowNode,
} from './mermaid/flow';
import { autoLayout } from './mermaid/layout';
import { parseMermaid } from './mermaid/parse';
import { toMermaid } from './mermaid/serialize';
import { EDGE_STYLES, SHAPES, type Direction, type EdgeStyle, type Graph, type Shape } from './mermaid/types';

const nodeTypes = { shape: ShapeNode };
const STORAGE_KEY = 'sdtm:graph:v1';

const STARTER: Graph = autoLayout({
  direction: 'TD',
  nodes: [
    { id: 'A', label: 'Start', shape: 'stadium', x: 0, y: 0 },
    { id: 'B', label: 'Is it working?', shape: 'diamond', x: 0, y: 0 },
    { id: 'C', label: 'Ship it', shape: 'rect', x: 0, y: 0 },
    { id: 'D', label: 'Debug', shape: 'rect', x: 0, y: 0 },
  ],
  edges: [
    { id: 'e1', source: 'A', target: 'B', label: '', style: 'arrow' },
    { id: 'e2', source: 'B', target: 'C', label: 'yes', style: 'arrow' },
    { id: 'e3', source: 'B', target: 'D', label: 'no', style: 'arrow' },
    { id: 'e4', source: 'D', target: 'B', label: '', style: 'dotted' },
  ],
});

function loadInitial(): Graph {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const g = JSON.parse(raw) as Graph;
      if (Array.isArray(g.nodes) && Array.isArray(g.edges)) return g;
    }
  } catch {
    /* ignore */
  }
  return STARTER;
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Editor() {
  const initial = useMemo(() => {
    const g = loadInitial();
    return { g, ...graphToFlow(g, true) };
  }, []);
  const [direction, setDirection] = useState<Direction>(initial.g.direction);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>(initial.edges);
  const [draft, setDraft] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [svg, setSvg] = useState('');
  const { screenToFlowPosition, fitView } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);

  // ---- undo / redo --------------------------------------------------------
  type Snap = { direction: Direction; nodes: FlowNode[]; edges: FlowEdge[] };
  const makeSnap = (): Snap => ({
    direction,
    nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
    edges: edges.map(({ selected: _s, ...e }) => e),
  });
  const past = useRef<Snap[]>([]);
  const future = useRef<Snap[]>([]);
  const lastSnap = useRef<Snap>({
    direction: initial.g.direction,
    nodes: initial.nodes,
    edges: initial.edges,
  });
  const lastKey = useRef(JSON.stringify(lastSnap.current));
  const [, setTick] = useState(0);

  // Record a history step once changes settle (drags emit many events).
  const commit = () => {
    const s = makeSnap();
    const k = JSON.stringify(s);
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
  }, [nodes, edges, direction]);

  const restore = (s: Snap) => {
    lastSnap.current = s;
    lastKey.current = JSON.stringify(s);
    setDirection(s.direction);
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

  const graph = useMemo(() => flowToGraph(direction, nodes, edges), [direction, nodes, edges]);
  const generated = useMemo(() => toMermaid(graph), [graph]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
    } catch {
      /* ignore */
    }
  }, [graph]);

  const load = useCallback(
    (g: Graph, resetHandles = true) => {
      const f = graphToFlow(g, resetHandles);
      setDirection(g.direction);
      setNodes(f.nodes);
      setEdges(f.edges);
      setTimeout(() => fitView({ padding: 0.2 }), 50);
    },
    [setNodes, setEdges, fitView],
  );

  // ---- Mermaid text -> canvas -------------------------------------------
  const applyText = (text: string) => {
    const { graph: parsed, warnings: w } = parseMermaid(text);
    const known = new Map(graph.nodes.map((n) => [n.id, n]));
    const anyKnown = parsed.nodes.some((n) => known.has(n.id));
    // Keep positions of nodes the user already placed; only lay out brand-new ones.
    const laid = autoLayout(parsed);
    const merged: Graph = {
      ...parsed,
      nodes: laid.nodes.map((n) => {
        const k = known.get(n.id);
        return anyKnown && k ? { ...n, x: k.x, y: k.y } : n;
      }),
    };
    load(merged, true);
    setWarnings(w);
    setDraft(null);
  };

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
          { id, type: 'shape' as const, position: pos, selected: true, data: { label: `Node ${id}`, shape } },
        ];
      });
    },
    [setNodes, screenToFlowPosition],
  );

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) =>
        addEdge({ ...c, id: newId('e'), data: { style: 'arrow' as EdgeStyle }, ...styleEdge('arrow') }, es),
      ),
    [setEdges],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const shape = e.dataTransfer.getData('application/x-shape') as Shape;
    if (!shape) return;
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(shape, { x: p.x - 55, y: p.y - 25 });
  };

  // ---- selection / inspector ---------------------------------------------
  const selNode = nodes.filter((n) => n.selected);
  const selEdge = edges.filter((e) => e.selected);
  const oneNode = selNode.length === 1 && selEdge.length === 0 ? selNode[0] : null;
  const oneEdge = selEdge.length === 1 && selNode.length === 0 ? selEdge[0] : null;

  const patchNode = (id: string, data: Partial<FlowNode['data']>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...data } } : n)));

  const patchEdge = (id: string, label?: string, style?: EdgeStyle) =>
    setEdges((es) =>
      es.map((e) =>
        e.id !== id
          ? e
          : {
              ...e,
              ...(label !== undefined ? { label: label || undefined } : {}),
              ...(style ? { data: { style }, ...styleEdge(style) } : {}),
            },
      ),
    );

  const renameNode = (oldId: string, raw: string) => {
    const id = raw.trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!id || id === oldId || nodes.some((n) => n.id === id)) return;
    setNodes((ns) => ns.map((n) => (n.id === oldId ? { ...n, id } : n)));
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

  const importMermaidFile = (file: File) =>
    readFile(file, (text) => {
      // Accept a ```mermaid fenced block inside a markdown file too.
      const fenced = /```mermaid\s*\n([\s\S]*?)```/.exec(text);
      applyText(fenced ? fenced[1] : text);
    });

  const importProject = (file: File) =>
    readFile(file, (text) => {
      try {
        const g = JSON.parse(text) as Graph;
        if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error();
        load(g, true);
        setWarnings([]);
        setDraft(null);
      } catch {
        setWarnings(['That file is not a valid project .json.']);
      }
    });

  const code = draft ?? generated;

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">Diagram → Mermaid</strong>
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
        <button onClick={() => fileInput.current?.click()}>Import .mmd</button>
        <button onClick={() => projectInput.current?.click()}>Open project</button>
        <button onClick={() => download('diagram.mmd', generated, 'text/plain')}>Export .mmd</button>
        <button disabled={!svg} onClick={() => download('diagram.svg', svg, 'image/svg+xml')}>
          Export SVG
        </button>
        <button onClick={() => download('diagram.project.json', JSON.stringify(graph, null, 2), 'application/json')}>
          Save project
        </button>
        <button
          className="danger"
          onClick={() => {
            if (confirm('Clear the canvas?')) {
              setNodes([]);
              setEdges([]);
              setDraft(null);
              setWarnings([]);
            }
          }}
        >
          Clear
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".mmd,.mermaid,.md,.txt"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importMermaidFile(f);
            e.target.value = '';
          }}
        />
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
          {SHAPES.map((s) => (
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
        </div>

        <h3>Inspector</h3>
        {oneNode && (
          <div className="inspector">
            <label>
              Label
              <textarea
                rows={3}
                value={oneNode.data.label}
                onChange={(e) => patchNode(oneNode.id, { label: e.target.value })}
              />
            </label>
            <label>
              Shape
              <select value={oneNode.data.shape} onChange={(e) => patchNode(oneNode.id, { shape: e.target.value as Shape })}>
                {SHAPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
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
        {oneEdge && (
          <div className="inspector">
            <label>
              Label
              <input
                value={typeof oneEdge.label === 'string' ? oneEdge.label : ''}
                onChange={(e) => patchEdge(oneEdge.id, e.target.value)}
              />
            </label>
            <label>
              Style
              <select
                value={oneEdge.data?.style ?? 'arrow'}
                onChange={(e) => patchEdge(oneEdge.id, undefined, e.target.value as EdgeStyle)}
              >
                {EDGE_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {!oneNode && !oneEdge && (
          <p className="hint">
            Select a node or edge to edit it. Double-click a node to rename it. Drag from a node's edge dot to
            another node to connect. Press Delete to remove.
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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          connectionMode={ConnectionMode.Loose}
          fitView
          colorMode="dark"
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Background />
          <Controls />
          <MiniMap pannable zoomable />
        </ReactFlow>
      </main>

      <section className="right">
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
        <Preview code={code} onSvg={setSvg} />
      </section>
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
