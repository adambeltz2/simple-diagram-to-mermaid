import { useEffect, useRef, useState } from 'react';

let counter = 0;

export function Preview({ code, onSvg }: { code: string; onSvg: (svg: string) => void }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');
  const onSvgRef = useRef(onSvg);
  onSvgRef.current = onSvg;

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      const id = `mmd-${++counter}`;
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
        const out = await mermaid.render(id, code);
        if (cancelled) return;
        setSvg(out.svg);
        setError('');
        onSvgRef.current(out.svg);
      } catch (e) {
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [code]);

  return (
    <div className="preview">
      {error && <div className="error">{error}</div>}
      <div className="preview-svg" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
