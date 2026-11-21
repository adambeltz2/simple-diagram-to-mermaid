import { autoLayout, fitGroups } from '../mermaid/layout';
import { parseDiagram } from '../mermaid/diagram';
import type { Page } from '../router';
import { addDoc, makeDoc, readStore, saveStore } from './docs';
import type { Wrap } from './markdown';

const NOTICE = 'sdtm:notice';

/**
 * Hand an import to the tab that can edit it, as a NEW document there. The tab you were in is left alone;
 * the target tab shows `message` when it opens.
 */
export function routeImport(page: Page, name: string, text: string, wrap: Wrap, message: string) {
  const data: unknown = page === 'diagrams' ? fitGroups(autoLayout(parseDiagram(text).graph)) : text;
  const existing = readStore<unknown>(page);
  const doc = makeDoc(existing?.docs ?? [], name, data, wrap);
  saveStore(page, existing ? addDoc(existing, doc) : { activeId: doc.id, docs: [doc] });
  try {
    sessionStorage.setItem(NOTICE, message);
  } catch {
    /* the message is a courtesy */
  }
  location.hash = `#/${page}`;
}

/** The message left by `routeImport`, if any (read once). */
export function takeNotice(): string | null {
  try {
    const m = sessionStorage.getItem(NOTICE);
    if (m !== null) sessionStorage.removeItem(NOTICE);
    return m;
  } catch {
    return null;
  }
}
