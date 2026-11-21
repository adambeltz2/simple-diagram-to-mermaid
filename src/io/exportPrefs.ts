export interface ExportPrefs {
  /** theme of exported SVG / PNG images: the screen's, or fixed */
  imageTheme: 'match' | 'light' | 'dark';
  background: 'solid' | 'transparent';
}
const KEY = 'sdtm:export:v1';
export const DEFAULT_PREFS: ExportPrefs = { imageTheme: 'match', background: 'solid' };

/** What a PNG with a solid background is filled with, per image theme. */
export const BACKGROUND = { light: '#ffffff', dark: '#0f1115' } as const;

export function loadPrefs(): ExportPrefs {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      imageTheme: j.imageTheme === 'light' || j.imageTheme === 'dark' ? j.imageTheme : 'match',
      background: j.background === 'transparent' ? 'transparent' : 'solid',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: ExportPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export const resolveImageTheme = (p: ExportPrefs, screen: 'light' | 'dark'): 'light' | 'dark' =>
  p.imageTheme === 'match' ? screen : p.imageTheme;
