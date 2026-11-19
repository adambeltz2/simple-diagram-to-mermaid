import { useMemo, useSyncExternalStore } from 'react';

export type Page = 'diagrams' | 'gantt';
export interface Route {
  page: Page;
  params: URLSearchParams;
}
const LAST = 'sdtm:page';

/** `#/gantt?d=...` -> { page: 'gantt', params }. An empty hash opens the last workspace used. */
export function parseHash(hash: string, last?: string | null): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const page: Page = path === 'gantt' ? 'gantt' : path === 'diagrams' ? 'diagrams' : last === 'gantt' && !path ? 'gantt' : 'diagrams';
  return { page, params: new URLSearchParams(query) };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return useMemo(() => {
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST);
    } catch {
      /* ignore */
    }
    const r = parseHash(hash, last);
    try {
      localStorage.setItem(LAST, r.page);
    } catch {
      /* ignore */
    }
    return r;
  }, [hash]);
}

/** Change the hash without adding a history entry or reloading the workspace. */
export function replaceHash(hash: string) {
  history.replaceState(null, '', hash);
}
