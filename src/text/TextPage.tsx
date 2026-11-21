import { useEffect, useRef, useState } from 'react';
import { Preview } from '../Preview';
import { DocPicker } from '../io/DocPicker';
import { type Doc } from '../io/docs';
import { describeChart, isCanvasText, isGanttText, isTextOnly } from '../io/markdown';
import { routeImport } from '../io/route';
import { Toast, useToast } from '../io/useToast';
import { useDocuments } from '../io/useDocuments';
import { useImportExport } from '../io/useImportExport';
import { useTheme } from '../theme';

const SAMPLE = `sequenceDiagram
    participant U as User
    participant A as App
    U->>A: Paste or open Mermaid
    A-->>U: Live preview
    U->>A: Export as PNG, SVG or Markdown
`;
const BLANK = `pie title New chart
    "One" : 3
    "Two" : 2
`;

/** Edit any Mermaid as text with a live preview. The catch-all for chart types without a visual editor. */
export function TextPage() {
  const theme = useTheme();
  const docs = useDocuments<string>('text', { legacy: () => null, sample: () => SAMPLE, blank: () => BLANK, firstName: 'Sequence example' });
  const loadedFor = useRef(docs.activeId);
  const [text, setText] = useState(docs.active.data);
  const [svg, setSvg] = useState('');
  const toast = useToast();

  const openDoc = (d: Doc<string>) => {
    loadedFor.current = d.id;
    setText(d.data);
  };
  const newDoc = (name: string, data: string) => openDoc(docs.create(name, data));

  const io = useImportExport({
    page: 'text',
    text,
    wrap: docs.active.wrap,
    svg,
    fileBase: 'chart',
    pasteName: 'Pasted chart',
    isMine: isTextOnly,
    flash: toast.flash,
    onImport: (t, name, wrap) => {
      const d = docs.create(name, t, wrap);
      openDoc(d);
      return d.name;
    },
  });

  useEffect(() => {
    docs.update(loadedFor.current, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const kind = describeChart(text);
  const visual = isGanttText(text) ? 'gantt' : isCanvasText(text) ? 'diagrams' : null;

  return (
    <div className="app text-page">
      <header className="toolbar">
        <DocPicker
          docs={docs.docs}
          activeId={docs.activeId}
          onSwitch={(id) => {
            const d = docs.switchTo(id);
            if (d) openDoc(d);
          }}
          newItems={[
            { label: 'Blank chart', hint: 'a small pie chart', onClick: () => newDoc('New chart', BLANK) },
            { label: 'From the sample', hint: 'a sequence diagram', onClick: () => newDoc('Sequence example', SAMPLE) },
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
        <span className="spacer" />
        {io.importMenu}
        {io.exportMenu}
      </header>

      <main className="canvas text-main">
        <div className="view-head">
          <strong>{kind}</strong>
          <span>Any Mermaid, edited as text. Flowcharts, state, ER and Gantt have visual editors in their own tabs.</span>
          {visual && (
            <button
              onClick={() =>
                routeImport(visual, docs.active.name, text, docs.active.wrap ?? { before: '', after: '' }, `Opened as a new ${visual === 'gantt' ? 'plan' : 'diagram'} in the ${visual === 'gantt' ? 'Gantt' : 'Diagrams'} tab. The text version is still in the Text tab.`)
              }
            >
              Open in the visual editor
            </button>
          )}
        </div>
        <textarea
          className="code text-code"
          spellCheck={false}
          value={text}
          aria-label="Mermaid source"
          onChange={(e) => setText(e.target.value)}
        />
      </main>

      <section className="side-right">
        <h3>Preview</h3>
        <Preview code={text} theme={theme} onSvg={setSvg} />
      </section>

      <footer className="footer">
        <span>Text · v{__APP_VERSION__}</span>
        <span>Autosaved in this browser</span>
      </footer>

      {io.pasteDialog}
      <Toast notice={toast.notice} clear={toast.clear} />
    </div>
  );
}
