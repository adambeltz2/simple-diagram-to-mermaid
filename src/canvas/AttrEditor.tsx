import type { Attr } from '../mermaid/types';

const KEYS = ['', 'PK', 'FK', 'UK', 'PK, FK'];

/** Edit the attribute rows of an ER entity. */
export function AttrEditor({ attrs, onChange }: { attrs: Attr[]; onChange: (attrs: Attr[]) => void }) {
  const patch = (i: number, p: Partial<Attr>) => onChange(attrs.map((a, j) => (j === i ? { ...a, ...p } : a)));
  return (
    <div className="attr-editor">
      <span className="attr-title">Attributes</span>
      {attrs.map((a, i) => (
        <div className="attr-row" key={i}>
          {a.raw !== undefined ? (
            <code className="attr-raw" title="Kept as-is; the canvas can't edit this line">
              {a.raw}
            </code>
          ) : (
            <>
              <div className="attr-line">
                <input value={a.type} placeholder="type" onChange={(e) => patch(i, { type: e.target.value })} />
                <input value={a.name} placeholder="name" onChange={(e) => patch(i, { name: e.target.value })} />
              </div>
              <div className="attr-line">
                <select
                  value={a.keys ?? ''}
                  title="Key"
                  onChange={(e) => patch(i, { keys: e.target.value || undefined })}
                >
                  {a.keys && !KEYS.includes(a.keys) && <option value={a.keys}>{a.keys}</option>}
                  {KEYS.map((k) => (
                    <option key={k} value={k}>
                      {k || 'no key'}
                    </option>
                  ))}
                </select>
                <input
                  value={a.comment ?? ''}
                  placeholder="comment"
                  onChange={(e) => patch(i, { comment: e.target.value || undefined })}
                />
              </div>
            </>
          )}
          <button type="button" className="attr-del" title="Remove attribute" onClick={() => onChange(attrs.filter((_, j) => j !== i))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="wide" onClick={() => onChange([...attrs, { type: 'string', name: 'name' }])}>
        + Add attribute
      </button>
    </div>
  );
}
