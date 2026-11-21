import { describe, expect, it } from 'vitest';
import { classifyImport, describeChart, guessWorkspace, isCanvasText, isGanttText, isTextOnly, NO_WRAP, splitMarkdown, toMarkdown } from './markdown';

const DOC = `# Plan

Some intro text.

\`\`\`mermaid
flowchart TD
  A --> B
\`\`\`

## Schedule

\`\`\`mermaid
gantt
    title T
    dateFormat YYYY-MM-DD
    A :a, 2026-01-01, 2d
\`\`\`

Footer text.
`;

describe('workspace detection', () => {
  it('tells chart types apart, even behind frontmatter and comments', () => {
    expect(isGanttText('---\ntitle: x\n---\n%% hi\ngantt\n')).toBe(true);
    expect(isCanvasText('%%{init: {}}%%\nstateDiagram-v2\nA --> B')).toBe(true);
    expect(isCanvasText('erDiagram\nA ||--o{ B : x')).toBe(true);
    expect(isCanvasText('gantt\n')).toBe(false);
    expect(isGanttText('flowchart TD')).toBe(false);
    expect(isCanvasText('pie\n"a": 1')).toBe(false);
  });
  it('guesses the workspace for a file', () => {
    expect(guessWorkspace(DOC)).toBe('diagrams'); // the first recognisable block in document order wins
    expect(guessWorkspace('# x\n```mermaid\ngantt\n```')).toBe('gantt');
    expect(guessWorkspace('hello')).toBeNull();
  });
});

describe('splitMarkdown / toMarkdown', () => {
  it('picks the gantt block and keeps everything around it', () => {
    const got = splitMarkdown(DOC, isGanttText)!;
    expect(got.text.startsWith('gantt')).toBe(true);
    expect(got.wrap.before).toContain('flowchart TD'); // the other diagram stays in the surrounding text
    expect(got.wrap.after).toBe('\n\nFooter text.\n');
    expect(toMarkdown(got.text, got.wrap)).toBe(DOC);
  });
  it('picks the canvas diagram block from the same file', () => {
    const got = splitMarkdown(DOC, isCanvasText)!;
    expect(got.text.startsWith('flowchart')).toBe(true);
    expect(got.wrap.after).toContain('gantt');
    expect(toMarkdown(got.text, got.wrap)).toBe(DOC);
  });
  it('accepts a bare .mmd with no fences, but not an unrelated one', () => {
    expect(splitMarkdown('gantt\n    A :a, 2026-01-01, 1d\n', isGanttText)).toEqual({ text: 'gantt\n    A :a, 2026-01-01, 1d\n', wrap: NO_WRAP });
    expect(splitMarkdown('flowchart TD\nA --> B', isGanttText)).toBeNull();
    expect(splitMarkdown('# just prose\n```js\nx\n```', isGanttText)).toBeNull();
  });
  it('wraps a bare chart in a fence when downloading as Markdown', () => {
    expect(toMarkdown('gantt\n  A :a, 2026-01-01, 1d', NO_WRAP)).toBe('```mermaid\ngantt\n  A :a, 2026-01-01, 1d\n```\n');
  });
});

describe('classifyImport', () => {
  it('sends gantt and canvas diagrams to their visual tabs, everything else to Text', () => {
    expect(classifyImport('gantt\n  dateFormat YYYY-MM-DD\n')?.page).toBe('gantt');
    expect(classifyImport('flowchart TD\nA-->B')?.page).toBe('diagrams');
    expect(classifyImport('sequenceDiagram\nA->>B: hi')?.page).toBe('text');
    expect(classifyImport('pie title X\n"a": 1')?.page).toBe('text');
    expect(classifyImport('xychart-beta\n  x-axis [a,b]')?.page).toBe('text');
  });
  it('prefers a visual chart in a Markdown file, and keeps the surrounding text', () => {
    const doc = '# T\n\n```mermaid\nsequenceDiagram\nA->>B: x\n```\n\nmid\n\n```mermaid\nflowchart LR\nA-->B\n```\n\nend\n';
    const got = classifyImport(doc)!;
    expect(got.page).toBe('diagrams');
    expect(got.text.startsWith('flowchart')).toBe(true);
    expect(got.wrap.before).toContain('sequenceDiagram');
    expect(got.wrap.after).toBe('\n\nend\n');
    expect(classifyImport('```mermaid\nclassDiagram\nA <|-- B\n```')?.page).toBe('text');
  });
  it('accepts any fenced mermaid block, but unfenced text must start with a known chart type', () => {
    expect(classifyImport('```mermaid\nsomeFutureChart\n```')?.page).toBe('text');
    expect(classifyImport('just some prose about charts')).toBeNull();
    expect(classifyImport('')).toBeNull();
    expect(classifyImport('```js\nconsole.log(1)\n```')).toBeNull();
  });
});

describe('Text tab helpers', () => {
  it('isTextOnly excludes only the charts with a visual editor', () => {
    expect(isTextOnly('sequenceDiagram\n')).toBe(true);
    expect(isTextOnly('gantt\n')).toBe(false);
    expect(isTextOnly('erDiagram\n')).toBe(false);
  });
  it('names chart types', () => {
    expect(describeChart('%%{init: {}}%%\nsequenceDiagram\nA->>B: x')).toBe('Sequence diagram');
    expect(describeChart('pie\n')).toBe('Pie chart');
    expect(describeChart('somethingNew\n')).toBe('Mermaid');
    expect(describeChart('  \n')).toBe('Empty');
  });
});
