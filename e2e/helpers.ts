import fs from 'node:fs';
import { expect, type Locator, type Page } from '@playwright/test';

export type Tab = 'diagrams' | 'gantt' | 'text';
const READY: Record<Tab, string> = { diagrams: '.react-flow__node', gantt: '.bar', text: 'textarea.text-code' };

/** Open a tab with empty storage. Waits for the app to settle first so its own first save can't land after the clear. */
export async function fresh(page: Page, tab: Tab = 'diagrams') {
  await page.goto(`/#/${tab}`);
  await page.waitForSelector(READY[tab]);
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
  await page.waitForSelector(READY[tab]);
}

export async function goTab(page: Page, tab: Tab) {
  await page.locator('.shell-nav a', { hasText: new RegExp(`^${tab}`, 'i') }).click();
  await page.waitForSelector(READY[tab]);
}

export const code = (page: Page) => page.locator('textarea.code').inputValue();

export async function menu(page: Page, label: string, item: RegExp | string) {
  await page.locator('.menu > button', { hasText: label }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

export const docNames = (page: Page) => page.locator('select[aria-label="Document"] option').allInnerTexts();
export const activeDoc = (page: Page) => page.locator('select[aria-label="Document"]').evaluate((s: HTMLSelectElement) => s.options[s.selectedIndex].text);
export const pickDoc = (page: Page, name: string) => page.locator('select[aria-label="Document"]').selectOption({ label: name });
export const toast = (page: Page) => page.locator('.toast');

/** Paste text through Import > Paste text and confirm. */
export async function paste(page: Page, text: string) {
  await menu(page, 'Import', /Paste text/);
  await page.locator('.sheet textarea').fill(text);
  await page.locator('.sheet .primary').click();
}

/** Click an Export menu item and return the downloaded file. */
export async function download(page: Page, item: RegExp | string): Promise<Buffer> {
  const [d] = await Promise.all([page.waitForEvent('download'), menu(page, 'Export', item)]);
  return fs.readFileSync(await d.path());
}

export function png(buf: Buffer) {
  return { ok: buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Decode a PNG in the page: its top-left pixel and the share of pixels that differ from it (a blank image is ~0). */
export async function inspectPng(page: Page, buf: Buffer) {
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise<void>((ok) => {
      img.onload = () => ok();
      img.src = 'data:image/png;base64,' + b64;
    });
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext('2d')!;
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let diff = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) + Math.abs(d[i + 3] - d[3]) > 40) diff++;
    }
    return { corner: [d[0], d[1], d[2], d[3]], inkPct: (100 * diff) / (d.length / 4) };
  }, buf.toString('base64'));
}

export async function expectNoDialogs(page: Page): Promise<string[]> {
  const seen: string[] = [];
  page.on('dialog', (d) => {
    seen.push(d.message());
    void d.dismiss();
  });
  return seen;
}

export const expectCount = async (loc: Locator, n: number) => expect.poll(() => loc.count()).toBe(n);
