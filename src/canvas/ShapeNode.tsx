import { useContext, useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../mermaid/flow';
import { LABELLESS, effectiveCss, type Shape } from '../mermaid/types';
import { StyleContext, nodeStyleVars } from './StyleContext';

const SVG_SHAPES: Partial<Record<Shape, React.ReactNode>> = {
  choice: <polygon points="50,1 99,50 50,99 1,50" />,
  diamond: <polygon points="50,1 99,50 50,99 1,50" />,
  hexagon: <polygon points="10,1 90,1 99,50 90,99 10,99 1,50" />,
  subroutine: (
    <>
      <rect x="1" y="1" width="98" height="98" />
      <path d="M9,1 V99 M91,1 V99" />
    </>
  ),
  parallelogram: <polygon points="12,1 99,1 88,99 1,99" />,
  'parallelogram-alt': <polygon points="1,1 88,1 99,99 12,99" />,
  trapezoid: <polygon points="14,1 86,1 99,99 1,99" />,
  'trapezoid-alt': <polygon points="1,1 99,1 86,99 14,99" />,
  asymmetric: <polygon points="1,1 99,1 99,99 1,99 10,50" />,
  cylinder: (
    <>
      <path d="M1,12 A49,11 0 0 1 99,12 L99,88 A49,11 0 0 1 1,88 Z" />
      <path d="M1,12 A49,11 0 0 0 99,12" />
    </>
  ),
};

export function ShapeNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { updateNodeData } = useReactFlow();
  const classDefs = useContext(StyleContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    if (draft.trim()) updateNodeData(id, { label: draft });
  };

  if (data.shape === 'entity') {
    const attrs = data.attrs ?? [];
    return (
      <div className={`entity-node${selected ? ' selected' : ''}`}>
        <div className="entity-head">{data.label}</div>
        {attrs.length === 0 && <div className="entity-empty">no attributes</div>}
        {attrs.map((a, i) =>
          a.raw !== undefined ? (
            <div className="entity-row entity-raw" key={i}>
              {a.raw}
            </div>
          ) : (
            <div className="entity-row" key={i}>
              <span className="t">{a.type}</span>
              <span className="n">{a.name}</span>
              <span className="k">{a.keys}</span>
            </div>
          ),
        )}
        <Handle id="t" type="source" position={Position.Top} />
        <Handle id="r" type="source" position={Position.Right} />
        <Handle id="b" type="source" position={Position.Bottom} />
        <Handle id="l" type="source" position={Position.Left} />
      </div>
    );
  }

  const svg = SVG_SHAPES[data.shape];
  const labelless = LABELLESS.has(data.shape);
  return (
    <div
      className={`shape-node shape-${data.shape}${selected ? ' selected' : ''}`}
      style={nodeStyleVars(effectiveCss(data.classes, classDefs, data.css))}
      onDoubleClick={() => {
        if (labelless) return;
        setDraft(data.label);
        setEditing(true);
      }}
    >
      {svg && (
        <svg className="shape-bg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {svg}
        </svg>
      )}
      {!labelless && (
      <div className="shape-label">
        {editing ? (
          <textarea
            className="nodrag nowheel"
            autoFocus
            value={draft}
            rows={Math.max(1, draft.split('\n').length)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') setEditing(false);
              e.stopPropagation();
            }}
          />
        ) : (
          data.label
        )}
      </div>
      )}
      <Handle id="t" type="source" position={Position.Top} />
      <Handle id="r" type="source" position={Position.Right} />
      <Handle id="b" type="source" position={Position.Bottom} />
      <Handle id="l" type="source" position={Position.Left} />
    </div>
  );
}
