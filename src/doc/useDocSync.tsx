import { useCallback, useEffect, useRef, useState } from 'react';
import { replaceHash, type Page, type Route } from '../router';
import { download } from './files';
import { guessWorkspace, NO_WRAP, splitMarkdown, toMarkdown, type Wrap } from './markdown';
import { decodeShare, encodeShare } from './share';

/**
 * The save / sync rules every workspace shares, in one place:
 *  - autosave in the browser (each workspace keeps its own working copy)
 *  - Edit / View mode
 *  - Share link: the Mermaid text in the URL; a recipient sees it in View mode and nothing is saved until
 *    they choose to edit a copy, at which point their own earlier plan is set aside, never overwritten
 *  - Open / download .mmd and .md (the Markdown around the chart is kept), and SVG
 * A future "Save to GitHub" belongs here too, so it works in every workspace at once.
 */
export type Mode = 'edit' | 'view';
export type LoadSource = 'file' | 'link' | 'restore';

const wrapKey = (p: Page) => `sdtm:wrap:${p}`;
const backupKey = (p: Page) => `sdtm:backup:${p}`;
const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export interface DocSyncOptions {
  page: Page;
  route: Route;
  /** the current Mermaid source */
  text: string;
  /** the rendered SVG, for export */
  svg: string;
  fileBase: string;
  isMine: (block: string) => boolean;
  /** replace the whole document with this Mermaid text */
  onLoad: (text: string, source: LoadSource) => void;
  flash: (msg: string, undo?: boolean) => void;
}

export function useDocSync(o: DocSyncOptions) {
  const { page, route } = o;
  const [mode, setMode] = useState<Mode>('edit');
  const [wrap, setWrap] = useState<Wrap>(() => {
    try {
      return { ...NO_WRAP, ...JSON.parse(get(wrapKey(page)) ?? '{}') };
    } catch {
      return NO_WRAP;
    }
  });
  const [shared, setShared] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [hasBackup, setHasBackup] = useState(() => get(backupKey(page)) !== null);
  const fileInput = useRef<HTMLInputElement>(null);
  const own = useRef<string | null>(null);
  const ref = useRef(o);
  ref.current = o;

  useEffect(() => {
    if (!shared) set(wrapKey(page), JSON.stringify(wrap));
  }, [wrap, shared, page]);

  // Open a share link: show it read-only, remember what the browser had so it can be set aside later.
  const d = route.params.get('d');
  useEffect(() => {
    if (!d) return;
    let live = true;
    decodeShare(d).then((t) => {
      if (!live) return;
      const cur = ref.current;
      if (t === null) return cur.flash('That share link looks damaged, so it was not opened.');
      if (!cur.isMine(t)) return cur.flash('That link holds a different kind of chart. Open it from the matching tab.');
      own.current = cur.text;
      setWrap(NO_WRAP);
      setShared(true);
      setMode('view');
      cur.onLoad(t, 'link');
    });
    return () => {
      live = false;
    };
  }, [d]);

  /** Turn a shared copy into the person's own: save their earlier plan aside first. */
  const detach = useCallback(() => {
    if (!shared) return;
    setShared(false);
    replaceHash(`#/${page}`);
    const mine = own.current;
    own.current = null;
    if (mine && mine.trim() && mine !== ref.current.text) {
      set(backupKey(page), mine);
      setHasBackup(true);
      ref.current.flash('This is now your own copy. Your earlier plan was set aside; “Restore my earlier plan” is in the footer.');
    }
  }, [shared, page]);

  const restore = () => {
    const t = get(backupKey(page));
    if (t === null) return;
    detach();
    set(backupKey(page), null);
    setHasBackup(false);
    ref.current.onLoad(t, 'restore');
    ref.current.flash('Restored your earlier plan.', true);
  };

  const share = async () => {
    const url = `${location.origin}${location.pathname}#/${page}?d=${await encodeShare(o.text)}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      o.flash('Link copied. Whoever opens it sees this chart; their edits stay in their own browser.');
    } catch {
      /* the link box is selectable */
    }
  };

  const openFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      const src = String(r.result);
      const found = splitMarkdown(src, o.isMine);
      if (!found) {
        const other = guessWorkspace(src);
        return o.flash(
          other && other !== page
            ? `That file holds ${other === 'gantt' ? 'a Gantt chart' : 'a diagram'}. Open it from the ${other === 'gantt' ? 'Gantt' : 'Diagrams'} tab.`
            : 'No chart this workspace can edit was found in that file.',
        );
      }
      detach();
      setWrap(found.wrap);
      o.onLoad(found.text, 'file');
      o.flash(found.wrap.before || found.wrap.after ? 'Opened. The rest of the Markdown file is kept for “Download .md”.' : 'Opened.');
    };
    r.readAsText(f);
  };

  const modeToggle = (
    <div className="seg" role="group" aria-label="Mode">
      <button
        className={mode === 'edit' ? 'on' : ''}
        onClick={() => {
          setMode('edit');
          detach();
        }}
      >
        Edit
      </button>
      <button className={mode === 'view' ? 'on' : ''} onClick={() => setMode('view')}>
        View
      </button>
    </div>
  );

  const bar = (
    <>
      <button onClick={share}>Share link</button>
      <button onClick={() => fileInput.current?.click()}>Open .md / .mmd</button>
      <button onClick={() => download(`${o.fileBase}.mmd`, o.text, 'text/plain')}>Download .mmd</button>
      <button onClick={() => download(`${o.fileBase}.md`, toMarkdown(o.text, wrap), 'text/markdown')}>Download .md</button>
      <button disabled={!o.svg} onClick={() => download(`${o.fileBase}.svg`, o.svg, 'image/svg+xml')}>
        Export SVG
      </button>
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

  const banners = (
    <div className="banners">
      {shared && (
        <div className="banner">
          <span>You're viewing a shared copy. Nothing is saved until you edit a copy.</span>
          <span className="spacer" />
          <button className="primary" onClick={() => { setMode('edit'); detach(); }}>
            Edit a copy
          </button>
        </div>
      )}
      {shareUrl && (
        <div className="banner share">
          <input readOnly value={shareUrl} aria-label="Share link" onFocus={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard?.writeText(shareUrl).then(() => o.flash('Link copied.'), () => undefined)}>Copy</button>
          <button onClick={() => setShareUrl('')}>Close</button>
        </div>
      )}
    </div>
  );

  const footerNote = (
    <span className="foot-doc">
      {wrap.before || wrap.after ? 'Markdown file: surrounding text is kept on “Download .md”' : 'Saved in this browser'}
      {hasBackup && (
        <button className="linklike" onClick={restore}>
          Restore my earlier plan
        </button>
      )}
    </span>
  );

  return { mode, setMode, shared, detach, wrap, modeToggle, bar, banners, footerNote };
}
