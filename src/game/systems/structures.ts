import { tierRow } from '../state';
import type { Sim } from '../sim';
import type { Invader, Structure } from '../types';

/** Spitter Post and Acid Battery targeting and firing. */
export function structures(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const s of st.structures) {
    if (s.riseT < 999) s.riseT += dt;
    if (s.flash > 0) s.flash -= dt;
    if (s.kind !== 'spitter' && s.kind !== 'battery') continue;
    if (s.attackCooldown > 0) s.attackCooldown -= dt;
    if (s.hp <= 0 || st.phase !== 'night' || s.attackCooldown > 0) continue;

    const row = tierRow(s.kind, s.tier);
    const target = pickTarget(sim, s, row.range);
    if (!target) continue;
    s.targetId = target.id;
    s.attackCooldown = row.interval;
    const flight = Math.hypot(target.pos.x - s.pos.x, target.pos.y - s.pos.y) / 620;
    const aimX = target.pos.x + target.vel.x * flight - s.pos.x;
    const aimY = target.pos.y + target.vel.y * flight - s.pos.y;
    if (s.kind === 'battery') {
      // Line-pierce acid jet: one shot, several bodies.
      sim.spawnProjectile(s.pos.x, s.pos.y, aimX, aimY, 900, row.damage, true, row.pierce);
      sim.sound('acidSpray', -8, 1.4);
      sim.addShake(1);
    } else {
      sim.spawnProjectile(s.pos.x, s.pos.y, aimX, aimY, 620, row.damage, true);
      sim.sound('acidSpray', 3, 0.7);
    }
  }
}

/** Nearest invader in range, with the same hysteresis rule the Warden uses. */
function pickTarget(sim: Sim, s: Structure, range: number): Invader | null {
  const st = sim.state;
  if (s.targetId >= 0) {
    const current = st.invaders.find((i) => i.id === s.targetId && i.alive);
    if (current) {
      const dx = current.pos.x - s.pos.x;
      const dy = current.pos.y - s.pos.y;
      if (dx * dx + dy * dy <= range * range) return current;
    }
  }
  let best: Invader | null = null;
  let bestDist = range * range;
  for (const inv of st.invaders) {
    if (!inv.alive) continue;
    const dx = inv.pos.x - s.pos.x;
    const dy = inv.pos.y - s.pos.y;
    const d2 = dx * dx + dy * dy;
    // Prefer whatever is closest to the chamber among equals: heavier threats
    // walking past a post should not be ignored for a straggler behind it.
    if (d2 < bestDist) {
      bestDist = d2;
      best = inv;
    }
  }
  return best;
}
