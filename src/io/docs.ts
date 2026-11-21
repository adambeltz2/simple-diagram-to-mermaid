import type { Page } from '../router';
import type { Wrap } from './markdown';

/**
 * Everything you open, import, convert or start is its own document, kept side by side.
 * Nothing replaces anything; deleting is the only way a document goes away (and it can be undone).
 */
export interface Doc<T> {
  id: string;
  name: string;
  updated: number;
  data: T;
  /** the Markdown around the chart, if it came from a .md file */
  wrap?: Wrap;
}
export interface DocStore<T> {
  activeId: string;
  docs: Doc<T>[];
}

const key = (p: Page) => `sdtm:docs:${p}:v1`;
export const uid = () => Math.random().toString(36).slice(2, 9);

/** "Notes", then "Notes 2", "Notes 3" ... */
export function uniqueName(docs: { name: string }[], base: string): string {
  const clean = base.trim() || 'Untitled';
  const used = new Set(docs.map((d) => d.name));
  if (!used.has(clean)) return clean;
  for (let n = 2; ; n++) if (!used.has(`${clean} ${n}`)) return `${clean} ${n}`;
}

export function makeDoc<T>(docs: { name: string }[], name: string, data: T, wrap?: Wrap): Doc<T> {
  return { id: uid(), name: uniqueName(docs, name), updated: Date.now(), data, ...(wrap && (wrap.before || wrap.after) ? { wrap } : {}) };
}

export function loadStore<T>(page: Page, legacy: () => T | null, sample: () => T, firstName: string): DocStore<T> {
  try {
    const raw = localStorage.getItem(key(page));
    if (raw) {
      const s = JSON.parse(raw) as DocStore<T>;
      if (Array.isArray(s.docs) && s.docs.length && s.docs.some((d) => d.id === s.activeId)) return s;
    }
  } catch {
    /* fall through to a fresh store */
  }
  // First run with documents: carry over whatever the old single-document autosave held.
  const first = makeDoc([], firstName, legacy() ?? sample());
  return { activeId: first.id, docs: [first] };
}

export function saveStore<T>(page: Page, s: DocStore<T>) {
  try {
    localStorage.setItem(key(page), JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const addDoc = <T,>(s: DocStore<T>, d: Doc<T>): DocStore<T> => ({ activeId: d.id, docs: [...s.docs, d] });

export const updateDoc = <T,>(s: DocStore<T>, id: string, data: T): DocStore<T> => ({
  ...s,
  docs: s.docs.map((d) => (d.id === id ? { ...d, data, updated: Date.now() } : d)),
});

export function renameDoc<T>(s: DocStore<T>, id: string, name: string): DocStore<T> {
  const others = s.docs.filter((d) => d.id !== id);
  return { ...s, docs: s.docs.map((d) => (d.id === id ? { ...d, name: uniqueName(others, name) } : d)) };
}

export function duplicateDoc<T>(s: DocStore<T>, id: string): { store: DocStore<T>; doc: Doc<T> } | null {
  const src = s.docs.find((d) => d.id === id);
  if (!src) return null;
  const doc = makeDoc(s.docs, `${src.name} copy`, structuredClone(src.data), src.wrap);
  return { store: addDoc(s, doc), doc };
}

/** Remove a document. Removing the last one leaves a fresh blank document, so there is always one to work in. */
export function removeDoc<T>(
  s: DocStore<T>,
  id: string,
  blank: () => T,
): { store: DocStore<T>; removed: Doc<T>; index: number; next: Doc<T> } | null {
  const index = s.docs.findIndex((d) => d.id === id);
  if (index < 0) return null;
  const removed = s.docs[index];
  let docs = s.docs.filter((d) => d.id !== id);
  if (!docs.length) docs = [makeDoc([], 'Untitled', blank())];
  const next = s.activeId !== id ? docs.find((d) => d.id === s.activeId)! : (docs[index] ?? docs[docs.length - 1]);
  return { store: { activeId: next.id, docs }, removed, index, next };
}

export function restoreDoc<T>(s: DocStore<T>, removed: Doc<T>, index: number): DocStore<T> {
  const docs = [...s.docs];
  docs.splice(Math.min(index, docs.length), 0, { ...removed, name: uniqueName(s.docs, removed.name) });
  return { activeId: removed.id, docs };
}
