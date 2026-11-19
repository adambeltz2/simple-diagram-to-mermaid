import { useEffect, useRef, useState } from 'react';
import type { Page } from '../router';
import { download } from './files';
import { guessWorkspace, NO_WRAP, splitMarkdown, toMarkdown, type Wrap } from './markdown';
import { Menu } from './Menu';

/**
 * Getting Mermaid in and out, the same in every workspace.
 *  Import: paste text, or open a .mmd / .md file (a Markdown file's other text is remembered).
 *  Export: copy the code, download .mmd, .md (with the rest of the file around your chart), or SVG.
 */
const wrapKey = (p: Page) => `sdtm:wrap:${p}`;

export interface ImportExportOptions {
  page: Page;
  /** the current Mermaid source */
  text: string;
  svg: string;
  fileBase: string;
  isMine: (block: string) => boolean;
  /** replace the whole diagram with this Mermaid text */
  onImport: (text: string) => void;
  flash: (msg: string) => void;
}

export function useImportExport(o: ImportExportOptions) {
  const { page } = o;
  const [wrap, setWrap] = useState<Wrap>(() => {
    try {
      return { ...NO_WRAP, ...JSON.parse(localStorage.getItem(wrapKey(page)) ?? '{}') };
    } catch {
      return NO_WRAP;
    }
  });
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(wrapKey(page), JSON.stringify(wrap));
    } catch {
      /* ignore */
    }
  }, [wrap, page]);

  /** Take Mermaid from a file or pasted text (plain, or inside a ```mermaid fence). */
  const importSource = (src: string): boolean => {
    const found = splitMarkdown(src, o.isMine);
    if (!found) {
      const other = guessWorkspace(src);
      o.flash(
        other && other !== page
          ? `That holds ${other === 'gantt' ? 'a Gantt chart' : 'a diagram'}. Import it from the ${other === 'gantt' ? 'Gantt' : 'Diagrams'} tab.`
          : 'No chart this tab can edit was found in that text.',
      );
      return false;
    }
    setWrap(found.wrap);
    o.onImport(found.text);
    o.flash(found.wrap.before || found.wrap.after ? 'Imported. The rest of the Markdown is kept for “Download .md”.' : 'Imported.');
    return true;
  };

  const openFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => importSource(String(r.result));
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
        <p className="hint">Plain Mermaid, or Markdown containing a mermaid block. This replaces the current chart (Undo brings it back).</p>
        <textarea
          autoFocus
          spellCheck={false}
          value={pasted}
          placeholder={'flowchart TD\n  A --> B'}
          onChange={(e) => setPasted(e.target.value)}
        />
        <div className="actions">
          <button onClick={() => setPasting(false)}>Cancel</button>
          <button className="primary" disabled={!pasted.trim()} onClick={() => importSource(pasted) && setPasting(false)}>
            Import
          </button>
        </div>
      </div>
    </div>
  );

  return { wrap, importMenu, exportMenu, pasteDialog };
}
