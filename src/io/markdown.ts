import { firstDiagramLine } from '../mermaid/diagram';
import type { Page } from '../router';

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

/** Chart types Mermaid knows. Unfenced text is only accepted as a chart if it starts with one of these. */
const KNOWN = /^(flowchart|graph|stateDiagram|erDiagram|gantt|sequenceDiagram|classDiagram|pie|gitGraph|mindmap|timeline|journey|quadrantChart|requirementDiagram|C4\w+|sankey|xychart|block|packet|kanban|architecture|radar|treemap|zenuml)/i;

/** Anything the Text tab takes: every chart except the ones the visual tabs edit. */
export const isTextOnly = (t: string) => !isGanttText(t) && !isCanvasText(t);

/**
 * Which tab should open this file or paste? Gantt and the canvas diagrams get their visual editors;
 * every other Mermaid chart goes to the Text tab. Null if there is no Mermaid in it at all.
 */
export function classifyImport(src: string): { page: Page; text: string; wrap: Wrap } | null {
  const blocks = [...src.matchAll(FENCE)];
  const at = (m: RegExpMatchArray): Wrap => ({ before: src.slice(0, m.index ?? 0), after: src.slice((m.index ?? 0) + m[0].length) });
  for (const m of blocks) if (isGanttText(m[1])) return { page: 'gantt', text: m[1], wrap: at(m) };
  for (const m of blocks) if (isCanvasText(m[1])) return { page: 'diagrams', text: m[1], wrap: at(m) };
  if (blocks.length) return { page: 'text', text: blocks[0][1], wrap: at(blocks[0]) };
  if (!src.includes('```') && KNOWN.test(firstDiagramLine(src))) {
    return { page: isGanttText(src) ? 'gantt' : isCanvasText(src) ? 'diagrams' : 'text', text: src, wrap: NO_WRAP };
  }
  return null;
}

const NAMES: [RegExp, string][] = [
  [/^sequenceDiagram/i, 'Sequence diagram'], [/^classDiagram/i, 'Class diagram'], [/^pie/i, 'Pie chart'],
  [/^gitGraph/i, 'Git graph'], [/^mindmap/i, 'Mind map'], [/^timeline/i, 'Timeline'], [/^journey/i, 'User journey'],
  [/^quadrantChart/i, 'Quadrant chart'], [/^requirementDiagram/i, 'Requirement diagram'], [/^C4/i, 'C4 diagram'],
  [/^sankey/i, 'Sankey diagram'], [/^xychart/i, 'XY chart'], [/^block/i, 'Block diagram'], [/^packet/i, 'Packet diagram'],
  [/^kanban/i, 'Kanban board'], [/^architecture/i, 'Architecture diagram'], [/^radar/i, 'Radar chart'], [/^treemap/i, 'Treemap'],
  [/^zenuml/i, 'ZenUML diagram'], [/^flowchart|^graph/i, 'Flowchart'], [/^stateDiagram/i, 'State diagram'], [/^erDiagram/i, 'ER diagram'], [/^gantt/i, 'Gantt chart'],
];
/** A friendly name for the chart type at the top of some Mermaid text. */
export function describeChart(text: string): string {
  const line = firstDiagramLine(text);
  return NAMES.find(([re]) => re.test(line))?.[1] ?? (line ? 'Mermaid' : 'Empty');
}
