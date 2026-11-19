import { describe, expect, it } from 'vitest';
import { decodeShare, encodeShare } from './share';

const PLAN = 'gantt\n    title Wéb launch — “plan” ✓\n    dateFormat YYYY-MM-DD\n    A :a, 2026-12-01, 5d\n'.repeat(40);

describe('share links', () => {
  it('round-trips unicode text, compressed and uncompressed', async () => {
    for (const compress of [true, false]) {
      const enc = await encodeShare(PLAN, compress);
      expect(enc[0]).toBe(compress ? 'z' : 'p');
      expect(enc).toMatch(/^[a-z][A-Za-z0-9_-]+$/); // URL-safe
      expect(await decodeShare(enc)).toBe(PLAN);
    }
  });
  it('compression makes the link much shorter', async () => {
    expect((await encodeShare(PLAN, true)).length).toBeLessThan((await encodeShare(PLAN, false)).length / 3);
  });
  it('rejects garbage instead of throwing', async () => {
    expect(await decodeShare('')).toBeNull();
    expect(await decodeShare('x123')).toBeNull();
    expect(await decodeShare('z!!!not-base64')).toBeNull();
  });
});
