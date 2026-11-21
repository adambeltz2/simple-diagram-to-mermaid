import { useMemo, useSyncExternalStore } from 'react';

export type Page = 'diagrams' | 'gantt' | 'text';
export interface Route {
  page: Page;
}
const LAST = 'sdtm:page';

/** `#/gantt` -> gantt. An empty or unknown hash opens the last workspace used, else Diagrams. */
export function parseHash(hash: string, last?: string | null): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const known = (p: string | null | undefined): p is Page => p === 'diagrams' || p === 'gantt' || p === 'text';
  return { page: known(path) ? path : !path && known(last) ? last : 'diagrams' };
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
