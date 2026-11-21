import { expect, test } from '@playwright/test';
import { code, fresh } from './helpers';

const ZOOM = 12; // pixels per day at the default zoom

test('drag to resize and move, with dependents following and undo', async ({ page }) => {
  await fresh(page, 'gantt');
  const bar = (id: string) => page.locator(`.bar[data-task="${id}"]`);

  let b = (await bar('api').boundingBox())!;
  await page.mouse.move(b.x + b.width - 3, b.y + 11);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 3 + ZOOM * 3, b.y + 11, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => code(page)).toContain('API :api, 2026-12-07, 23d');

  b = (await bar('wf').boundingBox())!;
  await page.mouse.move(b.x + 10, b.y + 11);
  await page.mouse.down();
  await page.mouse.move(b.x + 10 + ZOOM * 2, b.y + 11, { steps: 5 });
  await page.mouse.up();
  const text = await code(page);
  expect(text).toContain('Wireframes :done, wf, 2026-12-03, 5d');
  expect(text).toContain('Visual design :active, vd, after wf, 8d'); // the follower is unchanged in text: it moved with its parent

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => code(page)).toContain('Wireframes :done, wf, 2026-12-01, 5d');
});

test('dragging a follower detaches it, with an undo', async ({ page }) => {
  await fresh(page, 'gantt');
  const b = (await page.locator('.bar[data-task="fe"]').boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + 11);
  await page.mouse.down();
  await page.mouse.move(b.x + 30 - ZOOM * 5, b.y + 11, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.toast')).toContainText('no longer follows');
  expect(await code(page)).toMatch(/Frontend :fe, 2026-\d\d-\d\d, 15d/);
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => code(page)).toContain('Frontend :fe, after rev, 15d');
});

test('linking a bar to another makes it start after it, and loops are refused', async ({ page }) => {
  await fresh(page, 'gantt');
  await page.locator('.bar[data-task="api"]').hover();
  const dot = (await page.locator('.bar[data-task="api"] .dot').boundingBox())!;
  const target = (await page.locator('.bar[data-task="rev"]').boundingBox())!;
  await page.mouse.move(dot.x + 6, dot.y + 6);
  await page.mouse.down();
  await page.mouse.move(target.x + 8, target.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => code(page)).toContain('Design review :rev, after api, 2d');

  // Visual design already (indirectly) follows Wireframes; making Wireframes follow it would loop.
  await page.locator('.bar[data-task="vd"]').hover();
  const d2 = (await page.locator('.bar[data-task="vd"] .dot').boundingBox())!;
  const wf = (await page.locator('.bar[data-task="wf"]').boundingBox())!;
  await page.mouse.move(d2.x + 6, d2.y + 6);
  await page.mouse.down();
  await page.mouse.move(wf.x + 8, wf.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('.toast')).toContainText('wait on each other');
});

test('the text and the chart stay in sync both ways', async ({ page }) => {
  await fresh(page, 'gantt');
  const t = await code(page);
  await page.locator('textarea.code').fill(t.replace(/API :api, 2026-12-07, \d+d/, 'API :api, 2026-12-07, 10d'));
  await expect.poll(() => page.locator('.bar[data-task="api"]').evaluate((e) => Math.round(e.getBoundingClientRect().width))).toBe(10 * ZOOM);

  await page.locator('.g-row', { hasText: 'Frontend' }).click();
  await page.locator('.fields input[type=number]').fill('9');
  await expect.poll(() => code(page)).toContain('Frontend :fe, after rev, 9d');
});

test('adding a task chains it after the last one in the section', async ({ page }) => {
  await fresh(page, 'gantt');
  await page.getByRole('button', { name: 'Task', exact: true }).click();
  await expect.poll(() => code(page)).toMatch(/New task :task, after \w+, 5d/);
});

test('a blank plan renders', async ({ page }) => {
  await fresh(page, 'gantt');
  await page.locator('.menu > button', { hasText: 'New' }).click();
  await page.getByRole('menuitem', { name: /Blank plan/ }).click();
  await expect(page.locator('.bar')).toHaveCount(1);
  await expect(page.locator('.preview .err, .preview .error')).toHaveCount(0);
});
