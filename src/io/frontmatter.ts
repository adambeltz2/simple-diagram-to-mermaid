import { extractFrontmatter } from '../mermaid/parse';

export const CHART_THEMES = ['default', 'neutral', 'forest', 'dark', 'base'] as const;
export type ChartTheme = (typeof CHART_THEMES)[number];

const CONFIG = /^config:\s*(.*)$/;
const THEME = /^\s+theme:\s*(.*?)\s*$/;

/** The `config.theme` set in a chart's YAML frontmatter, if any. */
export function getChartTheme(fm: string | undefined): string | undefined {
  if (!fm) return undefined;
  const lines = fm.split(/\r?\n/);
  const at = lines.findIndex((l) => CONFIG.test(l));
  if (at < 0) return undefined;
  const inline = /theme:\s*['"]?([A-Za-z]+)/.exec(CONFIG.exec(lines[at])![1]);
  if (inline) return inline[1];
  for (let i = at + 1; i < lines.length && /^\s/.test(lines[i]); i++) {
    const m = THEME.exec(lines[i]);
    if (m) return m[1].replace(/^['"]|['"]$/g, '');
  }
  return undefined;
}

/** True if the theme is written in a form we won't edit for you (inline `config: { ... }`). */
export function themeIsInline(fm: string | undefined): boolean {
  const l = fm?.split(/\r?\n/).map((x) => CONFIG.exec(x)).find(Boolean);
  return !!l && l[1].trim().startsWith('{');
}

/**
 * Set (or, with null, remove) `config.theme` in YAML frontmatter, leaving everything else alone.
 * Returns the new frontmatter, or undefined if nothing is left of it.
 */
export function setChartTheme(fm: string | undefined, theme: string | null): string | undefined {
  if (themeIsInline(fm)) return fm; // left as written
  const lines = (fm ?? '').split(/\r?\n/).filter((l, i, a) => !(l === '' && i === a.length - 1));
  const at = lines.findIndex((l) => CONFIG.test(l));
  if (at < 0) {
    if (theme === null) return fm;
    return [...lines, 'config:', `  theme: ${theme}`].join('\n').replace(/^\n/, '');
  }
  let end = at + 1;
  while (end < lines.length && /^\s/.test(lines[end])) end++;
  const block = lines.slice(at + 1, end);
  const ti = block.findIndex((l) => THEME.test(l));
  if (theme === null) {
    if (ti >= 0) block.splice(ti, 1);
  } else if (ti >= 0) block[ti] = `  theme: ${theme}`;
  else block.unshift(`  theme: ${theme}`);
  const out = [...lines.slice(0, at), ...(block.length ? [lines[at].replace(/\s+$/, ''), ...block] : []), ...lines.slice(end)];
  const text = out.join('\n').trim();
  return text ? text : undefined;
}

/** Text-level helpers for the Text tab, where the frontmatter is just the top of the source. */
export function textFrontmatter(text: string): string | undefined {
  return extractFrontmatter(text).frontmatter;
}
export function withFrontmatter(text: string, fm: string | undefined): string {
  const { text: body } = extractFrontmatter(text);
  const rest = body.replace(/^\s*\n/, '');
  return fm?.trim() ? `---\n${fm.replace(/\s+$/, '')}\n---\n${rest}` : rest;
}
