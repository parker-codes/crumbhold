import { COMBAT, INVADERS, WARDEN } from '../balance';
import { LANE_BARRICADE } from '../gallery';
import { structureAt } from '../state';
import type { Sim } from '../sim';
import type { Invader, Structure } from '../types';

/**
 * Retargeting, section 7. Evaluated every 0.25 s per invader and staggered by
 * spawn time so the cost spreads across frames.
 */
export function ai(sim: Sim, _dt: number): void {
  const st = sim.state;
  for (const inv of st.invaders) {
    if (!inv.alive) continue;
    if (st.time < inv.retargetAt) continue;
    inv.retargetAt = st.time + COMBAT.retargetInterval;
    retarget(sim, inv);
  }
}

function retarget(sim: Sim, inv: Invader): void {
  const st = sim.state;
  const stats = INVADERS[inv.kind];

  // 1. A structure with HP blocking the lane ahead.
  const blocker = laneBlocker(sim, inv);
  if (blocker) {
    inv.targetType = 'structure';
    inv.targetId = blocker.id;
    return;
  }

  // 2. The Warden, if she is inside aggro radius. Mole crickets skip this.
  if (!stats.structuresOnly && stats.aggro > 0 && st.warden.knockedUntil <= st.time) {
    const dx = st.warden.pos.x - inv.pos.x;
    const dy = st.warden.pos.y - inv.pos.y;
    if (dx * dx + dy * dy <= stats.aggro * stats.aggro) {
      inv.targetType = 'warden';
      inv.targetId = -1;
      return;
    }
  }

  // 3. A major within 120 units.
  if (!stats.structuresOnly) {
    let best = -1;
    let bestDist = 120 * 120;
    for (const m of st.majors) {
      if (!m.alive) continue;
      const dx = m.pos.x - inv.pos.x;
      const dy = m.pos.y - inv.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = m.id;
      }
    }
    if (best >= 0) {
      inv.targetType = 'major';
      inv.targetId = best;
      return;
    }
  }

  // 4. Continue along the lane. On the chamber ring, attack the Brood Chamber.
  const lane = laneEnd(inv);
  if (lane) {
    const brood = structureAt(st, 'brood');
    if (brood) {
      inv.targetType = 'structure';
      inv.targetId = brood.id;
      return;
    }
  }
  inv.targetType = 'waypoint';
  inv.targetId = -1;
}

/** True once the invader has walked its whole polyline and reached the ring. */
function laneEnd(inv: Invader): boolean {
  const dx = inv.pos.x - 720;
  const dy = inv.pos.y - 1180;
  return inv.waypointIndex >= 4 && dx * dx + dy * dy <= 360 * 360;
}

/**
 * A barricade counts as blocking while it stands and the invader is within
 * `structureBlockDistance` of it along the lane. Towers and galleries in the
 * way also qualify, which is what makes forward Spitters risky.
 */
function laneBlocker(sim: Sim, inv: Invader): Structure | null {
  const st = sim.state;
  const reach = COMBAT.structureBlockDistance + INVADERS[inv.kind].radius;
  const barricadeSite = LANE_BARRICADE[inv.lane];
  let best: Structure | null = null;
  let bestDist = Infinity;
  for (const s of st.structures) {
    if (s.hp <= 0) continue;
    if (s.kind === 'broodChamber') continue;
    const isBarricade = s.site === barricadeSite;
    if (!isBarricade && !blockableKind(s)) continue;
    const dx = s.pos.x - inv.pos.x;
    const dy = s.pos.y - inv.pos.y;
    const d2 = dx * dx + dy * dy;
    const range = isBarricade ? reach : reach * 0.7;
    if (d2 > range * range) continue;
    // Only structures roughly in front of the invader block its path.
    if (!isBarricade) {
      const facingDot = dx * Math.cos(inv.facing) + dy * Math.sin(inv.facing);
      if (facingDot < 0) continue;
    }
    if (d2 < bestDist) {
      bestDist = d2;
      best = s;
    }
  }
  return best;
}

function blockableKind(s: Structure): boolean {
  return s.kind === 'spitter' || s.kind === 'battery' || s.kind === 'gallery';
}

/** Warden auto-target selection with hysteresis (section 9.1). */
export function pickWardenTarget(sim: Sim, range: number): number {
  const st = sim.state;
  const w = st.warden;
  if (w.targetId >= 0) {
    const current = st.invaders.find((i) => i.id === w.targetId && i.alive);
    if (current) {
      const dx = current.pos.x - w.pos.x;
      const dy = current.pos.y - w.pos.y;
      const keep = range + WARDEN.targetHysteresis;
      if (dx * dx + dy * dy <= keep * keep) return w.targetId;
    }
  }
  let best = -1;
  let bestDist = range * range;
  for (const inv of st.invaders) {
    if (!inv.alive) continue;
    const dx = inv.pos.x - w.pos.x;
    const dy = inv.pos.y - w.pos.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      best = inv.id;
    }
  }
  return best;
}
