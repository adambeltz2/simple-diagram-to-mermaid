/** Natural size of a Mermaid SVG: its viewBox, else its width/height attributes. */
export function svgSize(svg: string): { w: number; h: number } | null {
  const vb = /viewBox\s*=\s*"\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i.exec(svg);
  if (vb && Number(vb[1]) > 0 && Number(vb[2]) > 0) return { w: Number(vb[1]), h: Number(vb[2]) };
  const w = /\swidth\s*=\s*"([\d.]+)(?:px)?"/i.exec(svg);
  const h = /\sheight\s*=\s*"([\d.]+)(?:px)?"/i.exec(svg);
  return w && h && Number(w[1]) > 0 && Number(h[1]) > 0 ? { w: Number(w[1]), h: Number(h[1]) } : null;
}

/** Pixel size to draw at: `scale`× for sharpness, but never beyond what browsers can allocate. */
export function pngSize(w: number, h: number, scale = 2, maxSide = 8000): { w: number; h: number; scale: number } {
  const s = Math.min(scale, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scale: s };
}

/**
 * Mermaid's SVG comes out of an HTML serializer (e.g. a bare <br>), which is not valid standalone XML, so an
 * <img> would refuse it. Parse it as HTML, give it an explicit size, and serialize it again as XML.
 */
function standaloneSvg(svg: string, w: number, h: number): string {
  const host = document.createElement('div');
  host.innerHTML = svg;
  const el = host.querySelector('svg');
  if (!el) throw new Error('no svg');
  el.setAttribute('width', String(w));
  el.setAttribute('height', String(h));
  el.removeAttribute('style'); // Mermaid's max-width would shrink the drawing
  el.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(el);
}

/** Render a Mermaid SVG string to a PNG. `background` fills behind it (PNGs have no page behind them). */
export async function svgToPng(svg: string, opts: { scale?: number; background?: string } = {}): Promise<Blob> {
  const size = svgSize(svg);
  if (!size) throw new Error('Could not read the size of the chart.');
  const px = pngSize(size.w, size.h, opts.scale ?? 2);
  const xml = standaloneSvg(svg, size.w, size.h);
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((ok, bad) => {
      img.onload = () => ok();
      img.onerror = () => bad(new Error('The browser could not draw this chart.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = px.w;
    canvas.height = px.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas available.');
    if (opts.background) {
      ctx.fillStyle = opts.background;
      ctx.fillRect(0, 0, px.w, px.h);
    }
    ctx.drawImage(img, 0, 0, px.w, px.h);
    return await new Promise<Blob>((ok, bad) => canvas.toBlob((b) => (b ? ok(b) : bad(new Error('Could not encode the PNG.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

let n = 0;

/**
 * Render a chart to an SVG string with the given theme. With `htmlLabels: false` the text is plain SVG, which
 * (a) lets a canvas export it (a canvas that drew an SVG with embedded HTML, <foreignObject>, refuses to export)
 * and (b) opens correctly in more apps than SVG with HTML labels. The live preview keeps HTML labels; their
 * setting is put back afterwards.
 */
export async function renderChartSvg(code: string, theme: 'dark' | 'light', htmlLabels: boolean): Promise<string> {
  const mermaid = (await import('mermaid')).default;
  const base = { startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default', securityLevel: 'strict' } as const;
  try {
    mermaid.initialize({ ...base, htmlLabels, flowchart: { htmlLabels } });
    const id = `export-${Date.now()}-${++n}`;
    try {
      return (await mermaid.render(id, code)).svg;
    } finally {
      document.getElementById(`d${id}`)?.remove();
    }
  } finally {
    mermaid.initialize({ ...base, htmlLabels: true, flowchart: { htmlLabels: true } });
  }
}
