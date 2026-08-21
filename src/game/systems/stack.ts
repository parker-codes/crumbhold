import { offsetLerp } from '../../engine/ease';
import { STACK } from '../balance';
import { capacityFor } from '../state';
import type { Sim } from '../sim';
import type { ResourceKind, RunState, StackItem } from '../types';

/**
 * The signature mechanic. Two parallel columns balanced above and behind her
 * head: sugar on the left, the most recent other resource on the right. The
 * whole column lag-follows, so the stack sways when she turns.
 */
export function stack(sim: Sim, dt: number): void {
  const st = sim.state;
  const s = st.warden.stack;

  // Anchor trails the Warden. This sway is the game feel; do not tighten it.
  offsetLerp(s.anchor, st.warden.pos.x, st.warden.pos.y, STACK.followRate, dt);

  if (s.fullFlash > 0) s.fullFlash -= dt;

  for (const column of s.columns) {
    for (const item of column) {
      if (sim.reducedMotion) {
        item.springY = 0;
        item.springV = 0;
        continue;
      }
      const force = -STACK.springStiffness * item.springY - STACK.springDamping * item.springV;
      item.springV += force * dt;
      item.springY += item.springV * dt;
      if (item.kind === 'honeydew') item.wobble += dt * 6;
    }
  }
  reconcile(st);
}

/** Keep the visual columns in step with the numeric counts. */
function reconcile(st: RunState): void {
  const s = st.warden.stack;
  syncColumn(s.columns[0], 'sugar', Math.min(s.sugar, STACK.maxColumnItems));
  const other = s.lastNonSugar;
  const otherCount = other ? Math.min(s[other], STACK.maxColumnItems) : 0;
  syncColumn(s.columns[1], other ?? 'honeydew', otherCount);
}

function syncColumn(column: StackItem[], kind: ResourceKind, target: number): void {
  while (column.length > target) column.pop();
  while (column.length < target) {
    column.push({ kind, springY: -14, springV: 0, wobble: 0 });
  }
  if (column.length > 0 && column[0].kind !== kind) {
    for (const item of column) item.kind = kind;
  }
}

/**
 * Adds to the stack. Returns the amount actually taken: at capacity the pickup
 * is refused so the caller can bounce it back rather than silently discard it.
 */
export function addToStack(sim: Sim, kind: ResourceKind, amount: number): number {
  const st = sim.state;
  const s = st.warden.stack;
  const cap = capacityFor(st, kind);
  const room = cap - s[kind];
  if (room <= 0) {
    s.fullFlash = 0.34;
    return 0;
  }
  const taken = Math.min(room, amount);
  s[kind] = s[kind] + taken;
  if (kind !== 'sugar') s.lastNonSugar = kind;
  // A new item lands with an overshoot, one per whole unit gained.
  const column = kind === 'sugar' ? s.columns[0] : s.columns[1];
  const before = column.length;
  reconcile(st);
  for (let i = before; i < column.length; i++) {
    column[i].springY = -16;
    column[i].springV = 0;
  }
  return taken;
}

/** Removes from the stack. Returns the amount actually taken. */
export function takeFromStack(sim: Sim, kind: ResourceKind, amount: number): number {
  const s = sim.state.warden.stack;
  const taken = Math.min(s[kind], amount);
  if (taken <= 0) return 0;
  s[kind] = s[kind] - taken;
  reconcile(sim.state);
  return taken;
}

/** Visual height of a column, capped so the stack never occludes threats. */
export function columnHeight(count: number): number {
  return Math.min(STACK.columnHeightCap, count * 11);
}
