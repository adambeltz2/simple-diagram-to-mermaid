import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page } from '../router';
import {
  addDoc, duplicateDoc, loadStore, makeDoc, removeDoc, renameDoc, restoreDoc, saveStore, updateDoc,
  type Doc, type DocStore,
} from './docs';
import type { Wrap } from './markdown';

export interface DocumentsConfig<T> {
  /** the data an older single-document autosave held, if any */
  legacy: () => T | null;
  sample: () => T;
  blank: () => T;
  firstName: string;
}

/**
 * The list of documents in one tab. Every operation returns the document to show next, so the page can
 * load it and reset its own undo history; nothing here ever overwrites another document.
 */
export function useDocuments<T>(page: Page, cfg: DocumentsConfig<T>) {
  const [store, setStoreState] = useState<DocStore<T>>(() => loadStore(page, cfg.legacy, cfg.sample, cfg.firstName));
  const ref = useRef(store);
  const set = useCallback((next: DocStore<T>) => {
    ref.current = next;
    setStoreState(next);
  }, []);
  useEffect(() => saveStore(page, store), [page, store]);

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const active = store.docs.find((d) => d.id === store.activeId) ?? store.docs[0];

  return {
    docs: store.docs,
    activeId: active.id,
    active,
    /** a new document, opened */
    create(name: string, data: T, wrap?: Wrap): Doc<T> {
      const d = makeDoc(ref.current.docs, name, data, wrap);
      set(addDoc(ref.current, d));
      return d;
    },
    /** save the working copy of one document (called on every edit) */
    update(id: string, data: T) {
      set(updateDoc(ref.current, id, data));
    },
    switchTo(id: string): Doc<T> | undefined {
      const d = ref.current.docs.find((x) => x.id === id);
      if (d) set({ ...ref.current, activeId: id });
      return d;
    },
    rename(id: string, name: string) {
      set(renameDoc(ref.current, id, name));
    },
    duplicate(id: string): Doc<T> | null {
      const r = duplicateDoc(ref.current, id);
      if (!r) return null;
      set(r.store);
      return r.doc;
    },
    /** delete; `undo()` puts it back, in place, and returns it */
    remove(id: string) {
      const r = removeDoc(ref.current, id, cfgRef.current.blank);
      if (!r) return null;
      set(r.store);
      return {
        removed: r.removed,
        next: r.next,
        undo: (): Doc<T> => {
          set(restoreDoc(ref.current, r.removed, r.index));
          return r.removed;
        },
      };
    },
  };
}
