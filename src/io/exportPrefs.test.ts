// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, loadPrefs, resolveImageTheme, savePrefs } from './exportPrefs';

beforeEach(() => localStorage.clear());

describe('export preferences', () => {
  it('default to matching the screen with a solid background', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
  it('round-trip, and ignore junk', () => {
    savePrefs({ imageTheme: 'light', background: 'transparent' });
    expect(loadPrefs()).toEqual({ imageTheme: 'light', background: 'transparent' });
    localStorage.setItem('sdtm:export:v1', '{"imageTheme":"neon","background":5}');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
    localStorage.setItem('sdtm:export:v1', 'not json');
    expect(loadPrefs()).toEqual(DEFAULT_PREFS);
  });
  it('resolves "match" to the screen theme', () => {
    expect(resolveImageTheme({ imageTheme: 'match', background: 'solid' }, 'dark')).toBe('dark');
    expect(resolveImageTheme({ imageTheme: 'light', background: 'solid' }, 'dark')).toBe('light');
  });
});
