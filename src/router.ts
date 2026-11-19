import { useMemo, useSyncExternalStore } from 'react';

export type Page = 'diagrams' | 'gantt';
export interface Route {
  page: Page;
}
const LAST = 'sdtm:page';

/** `#/gantt` -> gantt. An empty or unknown hash opens the last workspace used, else Diagrams. */
export function parseHash(hash: string, last?: string | null): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  return { page: path === 'gantt' ? 'gantt' : path === 'diagrams' ? 'diagrams' : last === 'gantt' && !path ? 'gantt' : 'diagrams' };
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
