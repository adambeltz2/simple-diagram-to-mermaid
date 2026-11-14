import { useState } from 'react';
import { NodeResizer, useReactFlow, type NodeProps } from '@xyflow/react';
import type { FlowNode } from '../mermaid/flow';

/** A Mermaid `subgraph`: a resizable box that nodes can be dropped into. */
export function GroupNode({ id, data, selected }: NodeProps<FlowNode>) {
  const { updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commit = () => {
    setEditing(false);
    if (draft.trim()) updateNodeData(id, { label: draft });
  };

  return (
    <div
      className={`group-node${selected ? ' selected' : ''}`}
      onDoubleClick={() => {
        setDraft(data.label);
        setEditing(true);
      }}
    >
      <NodeResizer isVisible={selected} minWidth={140} minHeight={90} />
      <div className="group-label">
        {editing ? (
          <input
            className="nodrag"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') setEditing(false);
              e.stopPropagation();
            }}
          />
        ) : (
          data.label
        )}
      </div>
    </div>
  );
}
