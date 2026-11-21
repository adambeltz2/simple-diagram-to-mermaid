import { useRef, useState } from 'react';
import type { Page } from '../router';
import { download } from './files';
import { guessWorkspace, NO_WRAP, splitMarkdown, toMarkdown, type Wrap } from './markdown';
import { Menu } from './Menu';

/**
 * Getting Mermaid in and out, the same in every tab.
 *  Import: paste text, or open a .mmd / .md file. Either one becomes a NEW document; nothing is replaced.
 *  Export: copy the code, download .mmd, .md (with the rest of the file around your chart), or SVG.
 */
export interface ImportExportOptions {
  page: Page;
  /** the open document's Mermaid source */
  text: string;
  /** the Markdown around the open document's chart, if it came from a .md file */
  wrap?: Wrap;
  svg: string;
  fileBase: string;
  /** what a pasted document is called */
  pasteName: string;
  isMine: (block: string) => boolean;
  /** create a new document from this Mermaid text and open it; returns the name it was given */
  onImport: (text: string, name: string, wrap: Wrap) => string;
  flash: (msg: string) => void;
}

const baseName = (file: string) => file.replace(/\.[^.]+$/, '') || file;

export function useImportExport(o: ImportExportOptions) {
  const { page } = o;
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const thing = page === 'gantt' ? 'plan' : 'diagram';

  /** Make a new document from a file or pasted text (plain, or inside a ```mermaid fence). */
  const importSource = (src: string, name: string): boolean => {
    const found = splitMarkdown(src, o.isMine);
    if (!found) {
      const other = guessWorkspace(src);
      o.flash(
        other && other !== page
          ? `That holds ${other === 'gantt' ? 'a Gantt chart' : 'a diagram'}. Import it from the ${other === 'gantt' ? 'Gantt' : 'Diagrams'} tab.`
          : `No ${thing} this tab can open was found in that text.`,
      );
      return false;
    }
    const made = o.onImport(found.text, name, found.wrap);
    o.flash(`Opened as a new ${thing}, “${made}”. Your other ${thing}s are untouched.`);
    return true;
  };

  const openFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => importSource(String(r.result), baseName(f.name));
    r.readAsText(f);
  };

  const copy = () =>
    navigator.clipboard?.writeText(o.text).then(
      () => o.flash('Copied the Mermaid code.'),
      () => o.flash('Could not copy. Select the code and copy it by hand.'),
    );

  const importMenu = (
    <>
      <Menu
        label="Import"
        items={[
          { label: 'Paste text…', hint: 'Mermaid or Markdown', onClick: () => { setPasted(''); setPasting(true); } },
          { label: 'Open file…', hint: '.mmd or .md', onClick: () => fileInput.current?.click() },
        ]}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".md,.markdown,.mmd,.mermaid,.txt"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) openFile(f);
          e.target.value = '';
        }}
      />
    </>
  );

  const wrap = o.wrap ?? NO_WRAP;
  const exportMenu = (
    <Menu
      label="Export"
      items={[
        { label: 'Copy code', onClick: copy },
        { label: 'Download .mmd', onClick: () => download(`${o.fileBase}.mmd`, o.text, 'text/plain') },
        { label: 'Download .md', hint: 'chart in a Markdown block', onClick: () => download(`${o.fileBase}.md`, toMarkdown(o.text, wrap), 'text/markdown') },
        { label: 'Download SVG', disabled: !o.svg, onClick: () => download(`${o.fileBase}.svg`, o.svg, 'image/svg+xml') },
      ]}
    />
  );

  const pasteDialog = pasting && (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && setPasting(false)}>
      <div className="sheet" role="dialog" aria-label="Paste Mermaid text">
        <h2>Paste Mermaid text</h2>
        <p className="hint">Plain Mermaid, or Markdown containing a mermaid block. It opens as a new {thing}; your current one stays as it is.</p>
        <textarea
          autoFocus
          spellCheck={false}
          value={pasted}
          placeholder={page === 'gantt' ? 'gantt\n  title My plan\n  dateFormat YYYY-MM-DD' : 'flowchart TD\n  A --> B'}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="actions">
          <button onClick={() => setPasting(false)}>Cancel</button>
          <button className="primary" disabled={!pasted.trim()} onClick={() => importSource(pasted, o.pasteName) && setPasting(false)}>
            Open as new {thing}
          </button>
        </div>
      </div>
    </div>
  );

  return { importMenu, exportMenu, pasteDialog };
}
