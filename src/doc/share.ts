/** Share a chart as a link: the Mermaid text, deflated when the browser can, in base64url. */

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export async function encodeShare(text: string, compress = typeof CompressionStream !== 'undefined'): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  if (!compress) return 'p' + toB64(bytes);
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return 'z' + toB64(new Uint8Array(await new Response(out).arrayBuffer()));
}

export async function decodeShare(s: string): Promise<string | null> {
  try {
    const bytes = fromB64(s.slice(1));
    if (s[0] === 'p') return new TextDecoder().decode(bytes);
    if (s[0] === 'z') {
      const out = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new TextDecoder().decode(await new Response(out).arrayBuffer());
    }
  } catch {
    /* fall through */
  }
  return null;
}
