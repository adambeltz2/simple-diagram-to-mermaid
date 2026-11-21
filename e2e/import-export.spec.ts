import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { activeDoc, code, docNames, download, fresh, goTab, paste, toast } from './helpers';

const NOTES = '# Notes\n\nBefore.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nAfter.\n';

test('pasting opens a new document and leaves the current one alone', async ({ page }) => {
  await fresh(page, 'diagrams');
  expect(await docNames(page)).toEqual(['My diagram']);
  await paste(page, 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : go');
  await expect(toast(page)).toContainText('new diagram');
  expect(await docNames(page)).toEqual(['My diagram', 'Pasted diagram']);
  expect(await activeDoc(page)).toBe('Pasted diagram');
  expect(await code(page)).toContain('stateDiagram-v2');
  await page.locator('select[aria-label="Document"]').selectOption({ label: 'My diagram' });
  expect(await code(page)).toContain('flowchart');
});

test('a Markdown file keeps its surrounding text on export, only for that document', async ({ page }, info) => {
  await fresh(page, 'diagrams');
  const file = info.outputPath('notes.md');
  fs.writeFileSync(file, NOTES);
  await page.locator('input[type=file]').first().setInputFiles(file);
  await expect.poll(() => activeDoc(page)).toBe('notes');
  const md = (await download(page, /Download \.md/)).toString('utf8');
  expect(md).toContain('# Notes');
  expect(md).toContain('Before.');
  expect(md).toContain('After.');
  expect(md).toContain('flowchart');
  await page.locator('select[aria-label="Document"]').selectOption({ label: 'My diagram' });
  expect((await download(page, /Download \.md/)).toString('utf8')).not.toContain('Before.');
});

test('charts another tab edits are handed to it as a new document there', async ({ page }) => {
  await fresh(page, 'diagrams');
  await paste(page, 'classDiagram\n  Animal <|-- Dog\n');
  await expect(page).toHaveURL(/#\/text$/);
  await expect(toast(page)).toContainText('Text tab');
  await expect.poll(() => docNames(page)).toEqual(['Pasted class diagram']);
  await expect(page.locator('.view-head strong')).toHaveText('Class diagram');
  await goTab(page, 'diagrams');
  await expect.poll(() => docNames(page)).toEqual(['My diagram']); // untouched

  await paste(page, 'gantt\n  title From diagrams\n  dateFormat YYYY-MM-DD\n  section S\n  X :x, 2026-12-01, 3d\n');
  await expect(page).toHaveURL(/#\/gantt$/);
  await expect(page.locator('.bar')).toHaveCount(1); // wait for the Gantt tab itself, not just the address
  await expect.poll(() => docNames(page)).toContain('Pasted gantt chart');
});

test('a chart typed in the Text tab can be opened in its visual editor', async ({ page }) => {
  await fresh(page, 'text');
  await page.locator('textarea.text-code').fill('flowchart LR\n  A[Plan] --> B[Ship]\n');
  await page.getByRole('button', { name: 'Open in the visual editor' }).click();
  await expect(page).toHaveURL(/#\/diagrams$/);
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
});

test('text with no Mermaid in it is refused and nothing changes', async ({ page }) => {
  await fresh(page, 'diagrams');
  await paste(page, 'hello, this is not a chart');
  await expect(toast(page)).toContainText('No Mermaid chart');
  expect(await docNames(page)).toEqual(['My diagram']);
  await expect(page.locator('.sheet')).toBeVisible(); // the dialog stays open so nothing typed is lost
});

test('export menu offers every format and Copy code puts the source on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fresh(page, 'diagrams');
  await page.locator('.menu > button', { hasText: 'Export' }).click();
  await expect(page.getByRole('menuitem')).toHaveText([/Copy code/, /Download \.mmd/, /Download \.md/, /Download SVG/, /Download PNG/, /Appearance/]);
  await page.getByRole('menuitem', { name: /Copy code/ }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^flowchart/);
});
