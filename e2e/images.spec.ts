import { expect, test } from '@playwright/test';
import { download, fresh, inspectPng, menu, paste, png } from './helpers';

const CASES: { name: string; tab: 'diagrams' | 'gantt' | 'text'; text?: string }[] = [
  { name: 'flowchart', tab: 'diagrams' },
  { name: 'state', tab: 'diagrams', text: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Busy : go\n  state Busy {\n    [*] --> Run\n    Run --> [*]\n  }\n  Busy --> [*]' },
  { name: 'ER', tab: 'diagrams', text: 'erDiagram\n  CUSTOMER ||--o{ ORDER : places\n  CUSTOMER {\n    string name\n    int id PK\n  }' },
  { name: 'gantt', tab: 'gantt' },
  { name: 'sequence (Text tab)', tab: 'text' },
];

for (const c of CASES) {
  test(`PNG export of a ${c.name} is a real, non-blank image`, async ({ page }) => {
    await fresh(page, c.tab);
    if (c.text) await paste(page, c.text);
    await expect(page.locator('.preview svg').first()).toBeVisible();
    const buf = await download(page, /Download PNG/);
    const info = png(buf);
    expect(info.ok).toBe(true);
    expect(info.w).toBeGreaterThan(100);
    expect(info.h).toBeGreaterThan(100);
    expect((await inspectPng(page, buf)).inkPct).toBeGreaterThan(2);
  });
}

test('image theme is independent of the screen, and the PNG background can be transparent', async ({ page }) => {
  await fresh(page, 'diagrams');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect((await inspectPng(page, await download(page, /Download PNG/))).corner).toEqual([15, 17, 21, 255]); // matches the dark screen

  await menu(page, 'Export', /Appearance/);
  await page.getByLabel('Light', { exact: true }).check();
  await page.getByRole('button', { name: 'Done' }).click();
  expect((await inspectPng(page, await download(page, /Download PNG/))).corner).toEqual([255, 255, 255, 255]); // light image from a dark screen
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark'); // the screen is unchanged

  await menu(page, 'Export', /Appearance/);
  await page.getByLabel('Transparent').check();
  await page.getByRole('button', { name: 'Done' }).click();
  expect((await inspectPng(page, await download(page, /Download PNG/))).corner[3]).toBe(0);
});

test('SVG export is plain SVG text, and exporting does not change the live preview', async ({ page }) => {
  await fresh(page, 'diagrams');
  await expect(page.locator('.side-right .preview svg foreignObject').first()).toBeAttached();
  const svg = (await download(page, /Download SVG/)).toString('utf8');
  expect(svg.trimStart().startsWith('<svg')).toBe(true);
  expect(svg).not.toContain('foreignObject');
  await page.locator('.palette-item', { hasText: 'Rectangle' }).click();
  await expect(page.locator('.side-right .preview svg foreignObject').first()).toBeAttached(); // preview kept its normal labels
});
