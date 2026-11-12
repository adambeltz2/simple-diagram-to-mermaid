export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'diamond'
  | 'circle'
  | 'cylinder'
  | 'hexagon';

export type EdgeStyle = 'arrow' | 'open' | 'dotted' | 'thick';
export type Direction = 'TD' | 'LR' | 'BT' | 'RL';

export interface GNode {
  id: string;
  label: string;
  shape: Shape;
  x: number;
  y: number;
}

export interface GEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  style: EdgeStyle;
}

/** The source of truth. Canvas and Mermaid text are both views of this. */
export interface Graph {
  direction: Direction;
  nodes: GNode[];
  edges: GEdge[];
}

export const SHAPES: { value: Shape; name: string }[] = [
  { value: 'rect', name: 'Rectangle' },
  { value: 'round', name: 'Rounded' },
  { value: 'stadium', name: 'Stadium' },
  { value: 'diamond', name: 'Decision' },
  { value: 'circle', name: 'Circle' },
  { value: 'cylinder', name: 'Database' },
  { value: 'hexagon', name: 'Hexagon' },
];

export const EDGE_STYLES: { value: EdgeStyle; name: string }[] = [
  { value: 'arrow', name: 'Arrow  -->' },
  { value: 'open', name: 'Line  ---' },
  { value: 'dotted', name: 'Dotted  -.->' },
  { value: 'thick', name: 'Thick  ==>' },
];
