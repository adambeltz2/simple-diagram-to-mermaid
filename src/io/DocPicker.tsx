import { useState } from 'react';
import { Menu, type MenuItem } from './Menu';

/** Switch between documents, start a new one, rename, duplicate or delete. */
export function DocPicker(props: {
  docs: { id: string; name: string }[];
  activeId: string;
  onSwitch: (id: string) => void;
  newItems: MenuItem[];
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  const current = props.docs.find((d) => d.id === props.activeId);
  const commit = () => {
    if (name.trim()) props.onRename(name.trim());
    setRenaming(false);
  };
  return (
    <>
      <label className="docpick">
        Document
        <select value={props.activeId} onChange={(e) => props.onSwitch(e.target.value)} aria-label="Document">
          {props.docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <Menu label="New" items={props.newItems} />
      <Menu
        label="Manage"
        items={[
          { label: 'Rename…', onClick: () => { setName(current?.name ?? ''); setRenaming(true); } },
          { label: 'Duplicate', onClick: props.onDuplicate },
          { label: 'Delete', hint: 'can be undone', onClick: props.onDelete },
        ]}
      />
      {renaming && (
        <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && setRenaming(false)}>
          <div className="sheet" role="dialog" aria-label="Rename document" style={{ width: 'min(420px, 100%)' }}>
            <h2>Rename</h2>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setRenaming(false);
              }}
            />
            <div className="actions">
              <button onClick={() => setRenaming(false)}>Cancel</button>
              <button className="primary" disabled={!name.trim()} onClick={commit}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
