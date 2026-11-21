import { expect, test } from '@playwright/test';
import { activeDoc, code, docNames, expectNoDialogs, fresh, menu, paste, pickDoc, toast } from './helpers';

const diagramType = (page: import('@playwright/test').Page) => page.locator('.toolbar label', { hasText: /^Diagram/ }).locator('select');

test('documents stay separate: edits, undo and switching never leak between them', async ({ page }) => {
  await fresh(page, 'diagrams');
  await paste(page, 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : go\n  Busy --> [*]');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled(); // a fresh document has no history

  await pickDoc(page, 'My diagram');
  await expect(page.locator('.react-flow__node')).toHaveCount(4);
  await page.locator('.palette-item', { hasText: 'Rectangle' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(5);

  await pickDoc(page, 'Pasted diagram');
  await expect(page.locator('.react-flow__node')).toHaveCount(4); // the edit stayed with the other document
  await page.locator('.palette-item', { hasText: 'State' }).first().click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await code(page)).toContain('stateDiagram'); // undo never reaches into another document

  await pickDoc(page, 'My diagram');
  await expect(page.locator('.react-flow__node')).toHaveCount(5);
});

test('converting a drawn diagram makes a copy and never asks', async ({ page }) => {
  const dialogs = await expectNoDialogs(page);
  await fresh(page, 'diagrams');
  await diagramType(page).selectOption('er');
  await expect.poll(() => docNames(page)).toEqual(['My diagram', 'My diagram (ER diagram)']);
  expect(await activeDoc(page)).toBe('My diagram (ER diagram)');
  await pickDoc(page, 'My diagram');
  expect(await code(page)).toMatch(/^flowchart/);
  expect(dialogs).toEqual([]);
});

test('changing the type of an empty diagram changes it in place', async ({ page }) => {
  await fresh(page, 'diagrams');
  await menu(page, 'New', /^Flowchart/);
  const before = (await docNames(page)).length;
  await diagramType(page).selectOption('state');
  await page.waitForTimeout(500);
  expect((await docNames(page)).length).toBe(before);
});

test('delete can be undone in place; rename, duplicate and everything survive a reload', async ({ page }) => {
  await fresh(page, 'diagrams');
  await menu(page, 'New', /ER diagram/);
  await menu(page, 'New', /State diagram/);
  const names = await docNames(page);
  expect(names).toHaveLength(3);

  await menu(page, 'Manage', /Delete/);
  expect(await docNames(page)).toHaveLength(2);
  await toast(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => docNames(page)).toEqual(names);

  await menu(page, 'Manage', /Rename/);
  await page.locator('.sheet input').fill('Renamed');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await menu(page, 'Manage', /Duplicate/);
  const final = await docNames(page);
  expect(final).toContain('Renamed');
  expect(final).toContain('Renamed copy');

  await page.reload();
  await page.waitForSelector('.menu');
  expect(await docNames(page)).toEqual(final);
});

test('the old single-document autosave carries over as the first document', async ({ page }) => {
  await fresh(page, 'diagrams');
  await page.evaluate(() => {
    localStorage.removeItem('sdtm:docs:diagrams:v1');
    localStorage.setItem('sdtm:graph:v1', JSON.stringify({ direction: 'LR', nodes: [{ id: 'Old1', label: 'Old1', shape: 'rect', x: 0, y: 0 }, { id: 'Old2', label: 'Old2', shape: 'rect', x: 0, y: 100 }], edges: [{ id: 'e', source: 'Old1', target: 'Old2', label: '', style: 'arrow' }] }));
  });
  await page.reload();
  await page.waitForSelector('.react-flow__node');
  expect(await docNames(page)).toEqual(['My diagram']);
  expect(await code(page)).toContain('Old1');
});
