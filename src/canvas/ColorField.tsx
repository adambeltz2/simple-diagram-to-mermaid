/** `#abc` / `#aabbcc` -> `#aabbcc`; anything else (named colors, rgb()) -> undefined. */
export function toHex(c?: string): string | undefined {
  if (!c) return undefined;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : undefined;
}

export function ColorField(props: {
  label: string;
  /** colour currently in effect (own style, class, or default) */
  shown?: string;
  /** colour set directly on this item; enables the reset button */
  own?: string;
  fallback: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="color-field">
      <span>{props.label}</span>
      <input
        type="color"
        value={toHex(props.shown) ?? props.fallback}
        onChange={(e) => props.onChange(e.target.value)}
        title={props.shown && !toHex(props.shown) ? `Current value: ${props.shown}` : undefined}
      />
      <button type="button" disabled={!props.own} onClick={() => props.onChange(undefined)} title="Reset to default">
        ✕
      </button>
    </div>
  );
}
