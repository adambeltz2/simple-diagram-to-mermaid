import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light';
const KEY = 'sdtm:theme';

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

let current: Theme = initial();
const subs = new Set<() => void>();

function apply() {
  document.documentElement.dataset.theme = current;
  try {
    localStorage.setItem(KEY, current);
  } catch {
    /* ignore */
  }
}
apply();

export function setTheme(t: Theme) {
  current = t;
  apply();
  subs.forEach((f) => f());
}
export const toggleTheme = () => setTheme(current === 'dark' ? 'light' : 'dark');

/** One theme for the whole app, shared by every workspace. */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );
}
