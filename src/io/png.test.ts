import { describe, expect, it } from 'vitest';
import { pngSize, svgSize } from './png';

describe('svgSize', () => {
  it('reads the viewBox first', () => {
    expect(svgSize('<svg width="100%" viewBox="0 0 640.5 220" style="max-width: 640px;">')).toEqual({ w: 640.5, h: 220 });
    expect(svgSize('<svg viewBox="-8 -8 300 120">')).toEqual({ w: 300, h: 120 });
    expect(svgSize('<svg viewBox="0,0,50,60">')).toEqual({ w: 50, h: 60 });
  });
  it('falls back to width/height and refuses nonsense', () => {
    expect(svgSize('<svg width="400" height="150px">')).toEqual({ w: 400, h: 150 });
    expect(svgSize('<svg width="100%">')).toBeNull();
    expect(svgSize('<svg viewBox="0 0 0 0">')).toBeNull();
    expect(svgSize('')).toBeNull();
  });
});

describe('pngSize', () => {
  it('doubles by default, and caps huge charts instead of failing', () => {
    expect(pngSize(300, 100)).toEqual({ w: 600, h: 200, scale: 2 });
    const big = pngSize(20000, 1000);
    expect(big.w).toBe(8000);
    expect(big.scale).toBeCloseTo(0.4);
    expect(pngSize(1, 1, 0.01).w).toBe(1);
  });
});
