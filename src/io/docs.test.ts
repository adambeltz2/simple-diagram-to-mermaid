import { beforeEach, describe, expect, it } from 'vitest';
import {
  addDoc, duplicateDoc, loadStore, makeDoc, removeDoc, renameDoc, restoreDoc, saveStore, uniqueName, updateDoc,
} from './docs';

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
beforeEach(() => {
  (globalThis as unknown as { localStorage: unknown }).localStorage = mem();
});

describe('names', () => {
  it('stay unique and never empty', () => {
    expect(uniqueName([], 'Notes')).toBe('Notes');
    expect(uniqueName([{ name: 'Notes' }], 'Notes')).toBe('Notes 2');
    expect(uniqueName([{ name: 'Notes' }, { name: 'Notes 2' }], 'Notes')).toBe('Notes 3');
    expect(uniqueName([], '   ')).toBe('Untitled');
  });
});

describe('store', () => {
  const fresh = () => loadStore<string>('gantt', () => null, () => 'sample', 'My plan');

  it('starts with one document: the old single-document autosave if there is one, else the sample', () => {
    expect(fresh().docs.map((d) => [d.name, d.data])).toEqual([['My plan', 'sample']]);
    expect(loadStore<string>('gantt', () => 'legacy', () => 'sample', 'My plan').docs[0].data).toBe('legacy');
  });

  it('adding a document keeps the others untouched and activates the new one', () => {
    const s0 = fresh();
    const d = makeDoc(s0.docs, 'Imported', 'new text');
    const s1 = addDoc(s0, d);
    expect(s1.activeId).toBe(d.id);
    expect(s1.docs.map((x) => x.data)).toEqual(['sample', 'new text']);
    const s2 = updateDoc(s1, d.id, 'edited');
    expect(s2.docs.map((x) => x.data)).toEqual(['sample', 'edited']); // only the targeted document changed
  });

  it('keeps the Markdown around an imported chart with that document only', () => {
    const s0 = fresh();
    const d = makeDoc(s0.docs, 'From file', 'x', { before: '# Hi\n', after: '\nBye\n' });
    expect(addDoc(s0, d).docs[1].wrap).toEqual({ before: '# Hi\n', after: '\nBye\n' });
    expect(addDoc(s0, makeDoc(s0.docs, 'Plain', 'y')).docs[1].wrap).toBeUndefined();
  });

  it('renames uniquely, and duplicates as an independent copy', () => {
    let s = fresh();
    s = addDoc(s, makeDoc(s.docs, 'Other', 'o'));
    const id = s.docs[0].id;
    s = renameDoc(s, id, 'Other');
    expect(s.docs.map((d) => d.name)).toEqual(['Other 2', 'Other']);
    const dup = duplicateDoc(s, id)!;
    expect(dup.doc.name).toBe('Other 2 copy');
    expect(dup.store.activeId).toBe(dup.doc.id);
    const edited = updateDoc(dup.store, dup.doc.id, 'changed');
    expect(edited.docs.find((d) => d.id === id)!.data).toBe('sample'); // the original is unaffected
  });

  it('deleting can be undone, in the same place; the last document is never left empty', () => {
    let s = fresh();
    s = addDoc(s, makeDoc(s.docs, 'B', 'b'));
    s = addDoc(s, makeDoc(s.docs, 'C', 'c'));
    const bId = s.docs[1].id;
    const del = removeDoc(s, bId, () => 'blank')!;
    expect(del.store.docs.map((d) => d.name)).toEqual(['My plan', 'C']);
    expect(del.store.activeId).toBe(s.activeId); // active document unchanged when another was deleted
    const back = restoreDoc(del.store, del.removed, del.index);
    expect(back.docs.map((d) => d.name)).toEqual(['My plan', 'B', 'C']);
    expect(back.activeId).toBe(bId);

    const only = fresh();
    const gone = removeDoc(only, only.docs[0].id, () => 'blank')!;
    expect(gone.store.docs).toHaveLength(1);
    expect(gone.store.docs[0].data).toBe('blank');
    expect(removeDoc(s, 'nope', () => 'x')).toBeNull();
  });

  it('deleting the active document moves to its neighbour', () => {
    let s = fresh();
    s = addDoc(s, makeDoc(s.docs, 'B', 'b'));
    const del = removeDoc(s, s.activeId, () => 'x')!;
    expect(del.next.name).toBe('My plan');
  });

  it('round-trips through storage', () => {
    let s = fresh();
    s = addDoc(s, makeDoc(s.docs, 'B', 'b'));
    saveStore('gantt', s);
    expect(loadStore<string>('gantt', () => null, () => 'zzz', 'x')).toEqual(s);
    saveStore('gantt', { activeId: 'missing', docs: s.docs }); // a corrupt store falls back safely
    expect(loadStore<string>('gantt', () => null, () => 'fallback', 'x').docs[0].data).toBe('fallback');
  });
});
