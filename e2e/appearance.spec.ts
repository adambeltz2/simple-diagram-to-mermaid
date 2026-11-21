import { expect, test } from '@playwright/test';
import { code, download, fresh, menu } from './helpers';

const pickChartTheme = async (page: import('@playwright/test').Page, value: string) => {
  await menu(page, 'Export', /Appearance/);
  await page.locator('.sheet select').selectOption(value);
  await page.getByRole('button', { name: 'Done' }).click();
};

test('a chart theme is written into the frontmatter, themes the preview, undoes, and exports', async ({ page }) => {
  await fresh(page, 'diagrams');
  await pickChartTheme(page, 'forest');
  expect((await code(page)).split('\n').slice(0, 4)).toEqual(['---', 'config:', '  theme: forest', '---']);
  await expect.poll(async () => (await page.locator('.side-right .preview').innerHTML()).toLowerCase()).toContain('cde498'); // forest's node colour

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await code(page)).includes('theme')).toBe(false);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();

  expect((await download(page, /Download \.mmd/)).toString('utf8')).toMatch(/^---\nconfig:\n  theme: forest\n---\nflowchart/);
});

test('the same setting works in the Gantt and Text tabs, and removes cleanly', async ({ page }) => {
  await fresh(page, 'gantt');
  await pickChartTheme(page, 'neutral');
  expect((await code(page)).split('\n').slice(0, 4)).toEqual(['---', 'config:', '  theme: neutral', '---']);
  await expect(page.locator('.bar')).toHaveCount(7);

  await fresh(page, 'text');
  await pickChartTheme(page, 'dark');
  expect((await page.locator('textarea.text-code').inputValue()).split('\n').slice(0, 5)).toEqual(['---', 'config:', '  theme: dark', '---', 'sequenceDiagram']);
  await pickChartTheme(page, '');
  expect(await page.locator('textarea.text-code').inputValue()).toMatch(/^sequenceDiagram/);
});

test('image preferences persist across a reload', async ({ page }) => {
  await fresh(page, 'diagrams');
  await menu(page, 'Export', /Appearance/);
  await page.getByLabel('Dark', { exact: true }).check();
  await page.getByLabel('Transparent').check();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  await page.waitForSelector('.menu');
  await menu(page, 'Export', /Appearance/);
  await expect(page.getByLabel('Dark', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Transparent')).toBeChecked();
});
