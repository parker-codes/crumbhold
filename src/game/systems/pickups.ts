import { clamp, easeOutCubic } from '../../engine/ease';
import { STACK, WORLD } from '../balance';
import { addToStack } from './stack';
import type { Sim } from '../sim';

/**
 * Magnet pickup and expiry. Floor pickups inside the magnet radius launch on a
 * short arc with a slight overshoot and vanish into the column.
 */
export function pickups(sim: Sim, dt: number): void {
  const st = sim.state;
  const w = st.warden;
  const magnet = w.mounted ? STACK.magnetRadiusMounted : STACK.magnetRadius;
  const knocked = w.knockedUntil > st.time;

  for (const p of st.pickups) {
    if (!p.alive) continue;
    p.prev.x = p.pos.x;
    p.prev.y = p.pos.y;

    if (p.magnetT >= 0) {
      p.magnetT += dt / STACK.magnetFlightTime;
      // Slight overshoot past the head, then it drops into the column.
      const t = easeOutCubic(clamp(p.magnetT, 0, 1.12));
      p.pos.x = p.fromX + (w.pos.x - p.fromX) * t;
      p.pos.y = p.fromY + (w.pos.y - p.fromY) * t;
      p.z = 6 + Math.sin(Math.min(1, p.magnetT) * Math.PI) * 54;
      if (p.magnetT >= 1) collect(sim, p);
      continue;
    }

    // Scatter drift, then settle on the floor.
    if (p.vel.x !== 0 || p.vel.y !== 0) {
      p.pos.x = clamp(p.pos.x + p.vel.x * dt, 12, WORLD.width - 12);
      p.pos.y = clamp(p.pos.y + p.vel.y * dt, 12, WORLD.height - 12);
      p.vel.x *= 1 - 6 * dt;
      p.vel.y *= 1 - 6 * dt;
      if (Math.abs(p.vel.x) < 2 && Math.abs(p.vel.y) < 2) {
        p.vel.x = 0;
        p.vel.y = 0;
      }
    }

    if (p.expiresAt !== null && st.time >= p.expiresAt) {
      p.alive = false;
      continue;
    }

    if (knocked) continue;
    const dx = w.pos.x - p.pos.x;
    const dy = w.pos.y - p.pos.y;
    if (dx * dx + dy * dy <= magnet * magnet) {
      p.magnetT = 0;
      p.fromX = p.pos.x;
      p.fromY = p.pos.y;
    }
  }
}

function collect(sim: Sim, p: { alive: boolean; kind: 'sugar' | 'honeydew' | 'leaf'; value: number; pos: { x: number; y: number }; magnetT: number; fromX: number; fromY: number }): void {
  const taken = addToStack(sim, p.kind, p.value);
  if (taken <= 0) {
    // Refused at capacity: bounce it back to the floor, do not discard it.
    p.magnetT = -1;
    p.pos.x = p.fromX;
    p.pos.y = p.fromY;
    return;
  }
  p.alive = false;
  if (p.kind === 'sugar') {
    sim.state.sugarEarnedThisNight += taken;
    sim.state.stats.sugarEarned += taken;
    sim.sound('sugarPickup');
  } else if (p.kind === 'honeydew') {
    sim.sound('honeydewPickup');
  } else {
    sim.sound('leafPickup');
  }
}

/** At dusk, floor pickups gain a lifetime; by day they never expire. */
export function setPickupLifetimes(sim: Sim, nightPhase: boolean): void {
  const st = sim.state;
  for (const p of st.pickups) {
    if (!p.alive) continue;
    p.expiresAt = nightPhase ? st.time + STACK.nightPickupLifetime : null;
  }
}
