import { useEffect, useRef, useState } from 'react';
import type { Page } from '../router';
import { download } from './files';
import { classifyImport, describeChart, NO_WRAP, splitMarkdown, toMarkdown, type Wrap } from './markdown';
import { Menu } from './Menu';
import { useTheme } from '../theme';
import { renderChartSvg, svgToPng } from './png';
import { BACKGROUND, loadPrefs, resolveImageTheme, savePrefs, type ExportPrefs } from './exportPrefs';
import { CHART_THEMES, getChartTheme, setChartTheme, themeIsInline } from './frontmatter';
import { routeImport, takeNotice } from './route';

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
  /** the chart's YAML frontmatter, so its Mermaid theme can be set from the Export menu */
  look: { get: () => string | undefined; set: (fm: string | undefined) => void };
}

const baseName = (file: string) => file.replace(/\.[^.]+$/, '') || file;

export function useImportExport(o: ImportExportOptions) {
  const { page } = o;
  const theme = useTheme();
  const [pasting, setPasting] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [prefs, setPrefs] = useState<ExportPrefs>(loadPrefs);
  const change = (p: Partial<ExportPrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(next);
  };
  const [pasted, setPasted] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const thing = page === 'gantt' ? 'plan' : page === 'text' ? 'chart' : 'diagram';

  // Arriving from another tab that handed us an import: say so.
  useEffect(() => {
    const m = takeNotice();
    if (m) o.flash(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Make a new document from a file or pasted text (plain, or inside a ```mermaid fence). */
  const importSource = (src: string, name: string): boolean => {
    const found = splitMarkdown(src, o.isMine);
    if (!found) {
      // Not something this tab edits: hand it to the tab that does (Text takes every other chart), as a new document there.
      const routed = classifyImport(src);
      if (!routed || routed.page === page) {
        o.flash('No Mermaid chart was found in that text.');
        return false;
      }
      const tab = { diagrams: 'Diagrams', gantt: 'Gantt', text: 'Text' }[routed.page];
      const what = { diagrams: 'diagram', gantt: 'plan', text: 'chart' }[routed.page];
      const label = name === o.pasteName ? `Pasted ${describeChart(routed.text).toLowerCase()}` : name;
      routeImport(routed.page, label, routed.text, routed.wrap, `Opened as a new ${what} in the ${tab} tab, since that's where this kind of chart is edited. Your other ${thing}s are untouched.`);
      return true;
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

  /** Exports are drawn fresh in the chosen theme, so they don't depend on what the screen is showing. */
  const imageTheme = resolveImageTheme(prefs, theme);
  const downloadPng = async () => {
    try {
      const svg = await renderChartSvg(o.text, imageTheme, false);
      const background = prefs.background === 'transparent' ? undefined : BACKGROUND[imageTheme];
      download(`${o.fileBase}.png`, await svgToPng(svg, { scale: 2, background }), 'image/png');
    } catch (e) {
      o.flash(e instanceof Error ? e.message : 'Could not make the PNG.');
    }
  };
  const downloadSvg = async () => {
    try {
      download(`${o.fileBase}.svg`, await renderChartSvg(o.text, imageTheme, false), 'image/svg+xml');
    } catch (e) {
      o.flash(e instanceof Error ? e.message : 'Could not make the SVG.');
    }
  };

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
        { label: 'Download SVG', hint: 'plain SVG text', disabled: !o.svg, onClick: downloadSvg },
        { label: 'Download PNG', hint: '2× size', disabled: !o.svg, onClick: downloadPng },
        { label: 'Appearance…', hint: 'image theme, chart theme', onClick: () => setAppearance(true) },
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

  const chartTheme = getChartTheme(o.look.get());
  const appearanceDialog = appearance && (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && setAppearance(false)}>
      <div className="sheet" role="dialog" aria-label="Export appearance" style={{ width: 'min(520px, 100%)' }}>
        <h2>Export appearance</h2>
        <fieldset className="opts">
          <legend>Image theme <small>for SVG and PNG</small></legend>
          {(['match', 'light', 'dark'] as const).map((v) => (
            <label key={v}>
              <input type="radio" name="imgtheme" checked={prefs.imageTheme === v} onChange={() => change({ imageTheme: v })} />
              {v === 'match' ? `Match the screen (${theme})` : v === 'light' ? 'Light' : 'Dark'}
            </label>
          ))}
        </fieldset>
        <fieldset className="opts">
          <legend>PNG background</legend>
          {(['solid', 'transparent'] as const).map((v) => (
            <label key={v}>
              <input type="radio" name="pngbg" checked={prefs.background === v} onChange={() => change({ background: v })} />
              {v === 'solid' ? 'Solid' : 'Transparent'}
            </label>
          ))}
        </fieldset>
        <label className="opts">
          <span>Chart theme <small>saved in the chart, so other apps show it too</small></span>
          <select
            value={chartTheme ?? ''}
            disabled={themeIsInline(o.look.get())}
            onChange={(e) => o.look.set(setChartTheme(o.look.get(), e.target.value || null))}
          >
            <option value="">Not set (the app's default)</option>
            {chartTheme && !(CHART_THEMES as readonly string[]).includes(chartTheme) && <option value={chartTheme}>{chartTheme}</option>}
            {CHART_THEMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {themeIsInline(o.look.get()) && <small>This chart sets its config inline in the text; change it there.</small>}
        </label>
        <div className="actions">
          <button className="primary" onClick={() => setAppearance(false)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return { importMenu, exportMenu, pasteDialog, appearanceDialog };
}
