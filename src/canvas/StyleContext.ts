import { createContext, type CSSProperties } from 'react';
import type { Css } from '../mermaid/types';

/** The diagram's `classDef`s, so nodes can resolve their classes while rendering. */
export const StyleContext = createContext<Record<string, Css>>({});

/** Map Mermaid `style` properties onto the CSS variables the node styles read. */
export function nodeStyleVars(fx: Css): CSSProperties {
  const vars: Record<string, string> = {};
  if (fx.fill) vars['--n-fill'] = fx.fill;
  if (fx.stroke) vars['--n-stroke'] = fx.stroke;
  if (fx.color) vars['--n-color'] = fx.color;
  if (fx['stroke-width']) vars['--n-sw'] = fx['stroke-width'];
  if (fx['stroke-dasharray']) {
    vars['--n-dash'] = fx['stroke-dasharray'];
    vars['--n-bs'] = 'dashed';
  }
  return vars as CSSProperties;
}
