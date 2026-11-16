export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'diamond'
  | 'circle'
  | 'cylinder'
  | 'hexagon'
  | 'subroutine'
  | 'parallelogram'
  | 'parallelogram-alt'
  | 'trapezoid'
  | 'trapezoid-alt'
  | 'asymmetric'
  | 'doublecircle';

/** CSS-like properties as written in Mermaid `style` / `classDef` / `linkStyle` lines. */
export type Css = Record<string, string>;
export type Line = 'solid' | 'dotted' | 'thick';
export type End = 'none' | 'arrow' | 'circle' | 'cross';
export type Direction = 'TD' | 'LR' | 'BT' | 'RL';

export interface GNode {
  id: string;
  label: string;
  shape: Shape;
  /** id of the containing subgraph, if any */
  parent?: string;
  /** own `style` properties */
  css?: Css;
  /** `classDef` class names applied to this node */
  classes?: string[];
  /** absolute canvas position */
  x: number;
  y: number;
}

/** A Mermaid `subgraph`. Box position/size are absolute canvas values. */
export interface GGroup {
  id: string;
  label: string;
  parent?: string;
  css?: Css;
  classes?: string[];
  /** `direction` line inside the subgraph */
  direction?: Direction;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  line: Line;
  head: End;
  tail: End;
  /** `linkStyle` properties */
  css?: Css;
}

/**
 * Things we keep so that importing and re-exporting doesn't destroy a diagram,
 * even when the canvas can't show them.
 */
export interface GraphMeta {
  /** `flowchart-elk` instead of `flowchart` */
  keyword?: string;
  /** YAML frontmatter body (between the `---` lines) */
  frontmatter?: string;
  /** `%%{init: ...}%%` directives */
  preamble?: string[];
  /** statements we don't understand (click, accTitle, ...), re-emitted verbatim */
  extras?: string[];
  classDefs?: Record<string, Css>;
}

/** The source of truth. Canvas and Mermaid text are both views of this. */
export interface Graph extends GraphMeta {
  direction: Direction;
  nodes: GNode[];
  edges: GEdge[];
  groups: GGroup[];
}

export const SHAPES: { value: Shape; name: string }[] = [
  { value: 'rect', name: 'Rectangle' },
  { value: 'round', name: 'Rounded' },
  { value: 'stadium', name: 'Stadium' },
  { value: 'diamond', name: 'Decision' },
  { value: 'circle', name: 'Circle' },
  { value: 'cylinder', name: 'Database' },
  { value: 'hexagon', name: 'Hexagon' },
  { value: 'subroutine', name: 'Subroutine' },
  { value: 'parallelogram', name: 'Parallelogram  /' },
  { value: 'parallelogram-alt', name: 'Parallelogram  \\' },
  { value: 'trapezoid', name: 'Trapezoid' },
  { value: 'trapezoid-alt', name: 'Trapezoid (flipped)' },
  { value: 'asymmetric', name: 'Flag' },
  { value: 'doublecircle', name: 'Double circle' },
];

export const LINES: { value: Line; name: string }[] = [
  { value: 'solid', name: 'Solid' },
  { value: 'dotted', name: 'Dotted' },
  { value: 'thick', name: 'Thick' },
];

/** Arrowhead presets offered in the inspector. */
export const END_PRESETS: { id: string; name: string; head: End; tail: End }[] = [
  { id: 'arrow', name: 'Arrow  →', head: 'arrow', tail: 'none' },
  { id: 'none', name: 'None  —', head: 'none', tail: 'none' },
  { id: 'both', name: 'Both arrows  ↔', head: 'arrow', tail: 'arrow' },
  { id: 'circle', name: 'Circle end  —○', head: 'circle', tail: 'none' },
  { id: 'cross', name: 'Cross end  —✕', head: 'cross', tail: 'none' },
  { id: 'circle2', name: 'Circle both  ○—○', head: 'circle', tail: 'circle' },
  { id: 'cross2', name: 'Cross both  ✕—✕', head: 'cross', tail: 'cross' },
];

export function cssToString(css: Css): string {
  return Object.entries(css)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
}

/** Styles that apply to a node: default class, its classes, then its own `style`. */
export function effectiveCss(classes: string[] | undefined, classDefs: Record<string, Css> | undefined, css?: Css): Css {
  const defs = classDefs ?? {};
  return Object.assign({}, defs.default, ...(classes ?? []).map((c) => defs[c]), css);
}
