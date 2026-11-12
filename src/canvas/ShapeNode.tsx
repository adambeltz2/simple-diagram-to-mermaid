import { useState } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../mermaid/flow';
import type { Shape } from '../mermaid/types';

const SVG_SHAPES: Partial<Record<Shape, React.ReactNode>> = {
  diamond: <polygon points="50,1 99,50 50,99 1,50" />,
  hexagon: <polygon points="10,1 90,1 99,50 90,99 10,99 1,50" />,
  cylinder: (
    <>
      <path d="M1,12 A49,11 0 0 1 99,12 L99,88 A49,11 0 0 1 1,88 Z" />
      <path d="M1,12 A49,11 0 0 0 99,12" />
    </>
  ),
};

export function ShapeNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    if (draft.trim()) updateNodeData(id, { label: draft });
  };

  const svg = SVG_SHAPES[data.shape];
  return (
    <div
      className={`shape-node shape-${data.shape}${selected ? ' selected' : ''}`}
      onDoubleClick={() => {
        setDraft(data.label);
        setEditing(true);
      }}
    >
      {svg && (
        <svg className="shape-bg" viewBox="0 0 100 100" preserveAspectRatio="none">
          {svg}
        </svg>
      )}
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
      <Handle id="t" type="source" position={Position.Top} />
      <Handle id="r" type="source" position={Position.Right} />
      <Handle id="b" type="source" position={Position.Bottom} />
      <Handle id="l" type="source" position={Position.Left} />
    </div>
  );
}
