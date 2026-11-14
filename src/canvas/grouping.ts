import { absPos, orderNodes, sizeOf, type FlowNode } from '../mermaid/flow';

/** All ids nested (at any depth) under `id`. */
function descendants(ns: FlowNode[], id: string): Set<string> {
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of ns) {
      if (n.parentId && (n.parentId === id || out.has(n.parentId)) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * Re-parent node `id` to the innermost group whose box contains its centre
 * (or to no group). Keeps its absolute position unchanged.
 */
export function reparent(ns: FlowNode[], id: string): FlowNode[] {
  const byId = new Map(ns.map((n) => [n.id, n]));
  const n = byId.get(id);
  if (!n) return ns;
  const abs = absPos(n, byId);
  const { w, h } = sizeOf(n);
  const cx = abs.x + w / 2;
  const cy = abs.y + h / 2;
  const skip = n.type === 'group' ? descendants(ns, id) : new Set<string>();

  let best: FlowNode | undefined;
  let bestArea = Infinity;
  for (const g of ns) {
    if (g.type !== 'group' || g.id === id || skip.has(g.id)) continue;
    const ga = absPos(g, byId);
    const gs = sizeOf(g);
    if (cx >= ga.x && cx <= ga.x + gs.w && cy >= ga.y && cy <= ga.y + gs.h && gs.w * gs.h < bestArea) {
      best = g;
      bestArea = gs.w * gs.h;
    }
  }
  if (best?.id === n.parentId || (!best && !n.parentId)) return ns;
  const pa = best ? absPos(best, byId) : { x: 0, y: 0 };
  return orderNodes(
    ns.map((m) =>
      m.id === id ? { ...m, parentId: best?.id, position: { x: abs.x - pa.x, y: abs.y - pa.y } } : m,
    ),
  );
}

/** Absolute bounding box of the given nodes. */
export function boundsOf(ns: FlowNode[], ids: string[]): { x: number; y: number; w: number; h: number } | null {
  const byId = new Map(ns.map((n) => [n.id, n]));
  const boxes = ids
    .map((id) => byId.get(id))
    .filter((n): n is FlowNode => !!n)
    .map((n) => ({ ...absPos(n, byId), ...sizeOf(n) }));
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - y,
  };
}

/**
 * Wrap `ids` in a new group `gid` sized to fit them. Every listed node moves into
 * the group; the group itself nests under their shared parent (else top level).
 */
export function wrapInGroup(ns: FlowNode[], ids: string[], gid: string): FlowNode[] {
  const b = boundsOf(ns, ids);
  if (!b) return ns;
  const byId = new Map(ns.map((n) => [n.id, n]));
  const parents = new Set(ids.map((id) => byId.get(id)?.parentId));
  const common = parents.size === 1 ? [...parents][0] : undefined;
  const parent = common ? byId.get(common) : undefined;
  const pa = parent ? absPos(parent, byId) : { x: 0, y: 0 };
  const gx = b.x - 24;
  const gy = b.y - 44;
  const group: FlowNode = {
    id: gid,
    type: 'group',
    position: { x: gx - pa.x, y: gy - pa.y },
    width: Math.max(140, b.w + 48),
    height: Math.max(90, b.h + 68),
    parentId: parent?.id,
    selected: true,
    data: { label: 'Group', shape: 'rect' },
  };
  const out = ns.map((n) => {
    if (!ids.includes(n.id)) return { ...n, selected: false };
    const a = absPos(n, byId);
    return { ...n, selected: false, parentId: gid, position: { x: a.x - gx, y: a.y - gy } };
  });
  return orderNodes([...out, group]);
}

/** Remove group `gid` but keep its children, moving them up one level. */
export function ungroup(ns: FlowNode[], gid: string): FlowNode[] {
  const byId = new Map(ns.map((n) => [n.id, n]));
  const g = byId.get(gid);
  if (!g) return ns;
  const up = g.parentId && byId.has(g.parentId) ? byId.get(g.parentId) : undefined;
  const upAbs = up ? absPos(up, byId) : { x: 0, y: 0 };
  return orderNodes(
    ns
      .filter((n) => n.id !== gid)
      .map((n) => {
        if (n.parentId !== gid) return n;
        const a = absPos(n, byId);
        return { ...n, parentId: up?.id, position: { x: a.x - upAbs.x, y: a.y - upAbs.y }, selected: false };
      }),
  );
}
