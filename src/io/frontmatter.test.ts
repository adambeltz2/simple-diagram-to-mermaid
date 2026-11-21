// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseDiagram, toDiagram } from '../mermaid/diagram';
import { assertValid } from '../mermaid/validity.test';
import { getChartTheme, setChartTheme, textFrontmatter, themeIsInline, withFrontmatter } from './frontmatter';

describe('chart theme in frontmatter', () => {
  it('reads it', () => {
    expect(getChartTheme(undefined)).toBeUndefined();
    expect(getChartTheme('title: x')).toBeUndefined();
    expect(getChartTheme('config:\n  theme: forest')).toBe('forest');
    expect(getChartTheme('title: T\nconfig:\n  flowchart:\n    curve: basis\n  theme: "neutral"\n')).toBe('neutral');
    expect(getChartTheme('config: { theme: dark }')).toBe('dark');
  });

  it('adds it to nothing, to other keys, and to an existing config block', () => {
    expect(setChartTheme(undefined, 'forest')).toBe('config:\n  theme: forest');
    expect(setChartTheme('title: My chart', 'forest')).toBe('title: My chart\nconfig:\n  theme: forest');
    expect(setChartTheme('config:\n  flowchart:\n    curve: basis', 'dark')).toBe('config:\n  theme: dark\n  flowchart:\n    curve: basis');
  });

  it('replaces it in place and leaves everything else alone', () => {
    const fm = 'title: T\nconfig:\n  theme: forest\n  look: classic\nother: 1';
    expect(setChartTheme(fm, 'neutral')).toBe('title: T\nconfig:\n  theme: neutral\n  look: classic\nother: 1');
  });

  it('removes it, tidying an emptied config block and an emptied frontmatter', () => {
    expect(setChartTheme('config:\n  theme: forest', null)).toBeUndefined();
    expect(setChartTheme('title: T\nconfig:\n  theme: forest', null)).toBe('title: T');
    expect(setChartTheme('config:\n  theme: forest\n  look: classic', null)).toBe('config:\n  look: classic');
    expect(setChartTheme('title: T', null)).toBe('title: T');
    expect(setChartTheme(undefined, null)).toBeUndefined();
  });

  it('leaves the inline form alone rather than guessing', () => {
    const fm = 'config: { theme: dark, look: classic }';
    expect(themeIsInline(fm)).toBe(true);
    expect(setChartTheme(fm, 'forest')).toBe(fm);
  });

  it('works on plain text for the Text tab, and round-trips', () => {
    const src = 'pie title X\n  "a": 1\n';
    const withTheme = withFrontmatter(src, setChartTheme(textFrontmatter(src), 'forest'));
    expect(withTheme).toBe('---\nconfig:\n  theme: forest\n---\npie title X\n  "a": 1\n');
    expect(textFrontmatter(withTheme)).toBe('config:\n  theme: forest');
    expect(withFrontmatter(withTheme, undefined)).toBe(src);
  });

  it('survives import and export of every visual chart type, and Mermaid accepts the result', async () => {
    const fm = '---\nconfig:\n  theme: forest\n---\n';
    for (const body of ['flowchart TD\n A --> B\n', 'stateDiagram-v2\n [*] --> A\n', 'erDiagram\n A ||--o{ B : x\n']) {
      const text = toDiagram(parseDiagram(fm + body).graph);
      expect(getChartTheme(textFrontmatter(text))).toBe('forest');
      await assertValid(text);
    }
  });
});
