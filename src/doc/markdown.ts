import { firstDiagramLine } from '../mermaid/diagram';

/** The Markdown around a diagram block, kept so a downloaded .md still contains the rest of the file. */
export interface Wrap {
  before: string;
  after: string;
}
export const NO_WRAP: Wrap = { before: '', after: '' };

export const isGanttText = (t: string) => /^gantt\b/i.test(firstDiagramLine(t));
export const isCanvasText = (t: string) => /^(flowchart|graph|stateDiagram|erDiagram)\b/i.test(firstDiagramLine(t));

const FENCE = /```mermaid[^\n]*\n([\s\S]*?)```/g;

/** Find the mermaid block this workspace can edit. A file with no fences at all is treated as one raw block. */
export function splitMarkdown(src: string, isMine: (block: string) => boolean): { text: string; wrap: Wrap } | null {
  for (const m of src.matchAll(FENCE)) {
    if (isMine(m[1])) {
      const at = m.index ?? 0;
      return { text: m[1], wrap: { before: src.slice(0, at), after: src.slice(at + m[0].length) } };
    }
  }
  return !src.includes('```') && isMine(src) ? { text: src, wrap: NO_WRAP } : null;
}

export const toMarkdown = (text: string, w: Wrap) =>
  `${w.before}\`\`\`mermaid\n${text.replace(/\s*$/, '\n')}\`\`\`${w.after || '\n'}`;

/** Which workspace a file belongs to, to point someone to the right tab. */
export function guessWorkspace(src: string): 'gantt' | 'diagrams' | null {
  const blocks = [...src.matchAll(FENCE)].map((m) => m[1]);
  for (const b of blocks.length ? blocks : [src]) {
    if (isGanttText(b)) return 'gantt';
    if (isCanvasText(b)) return 'diagrams';
  }
  return null;
}
