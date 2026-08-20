import { COMBAT, INVADERS, WORLD } from '../balance';
import { hurtWarden } from './combat';
import type { Sim } from '../sim';

/**
 * Pooled projectile integration and collision against the invader spatial hash.
 * Globules do not collide with each other or with structures they fly over.
 */
export function projectiles(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const p of st.projectiles) {
    if (!p.alive) continue;
    p.prev.x = p.pos.x;
    p.prev.y = p.pos.y;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.life -= dt;
    if (
      p.life <= 0 ||
      p.pos.x < -60 || p.pos.x > WORLD.width + 60 ||
      p.pos.y < -60 || p.pos.y > WORLD.height + 60
    ) {
      p.alive = false;
      continue;
    }

    if (p.friendly) {
      const near = sim.hash.query(p.pos.x, p.pos.y, 40);
      for (let k = 0; k < near.length; k++) {
        const inv = st.invaders[near[k]];
        if (!inv || !inv.alive) continue;
        if (p.hitIds.includes(inv.id)) continue;
        const reach = INVADERS[inv.kind].radius + 8;
        const dx = inv.pos.x - p.pos.x;
        const dy = inv.pos.y - p.pos.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        p.hitIds.push(inv.id);
        sim.hurtInvader(inv, p.damage, p.prev.x, p.prev.y, true);
        if (p.pierce > 0) {
          p.pierce--;
        } else {
          p.alive = false;
          break;
        }
      }
    } else {
      const w = st.warden;
      const dx = w.pos.x - p.pos.x;
      const dy = w.pos.y - p.pos.y;
      const reach = 26;
      if (dx * dx + dy * dy <= reach * reach) {
        p.alive = false;
        hurtWarden(sim, p.damage, p.prev.x, p.prev.y, 0);
        continue;
      }
      let hit = false;
      for (const m of st.majors) {
        if (!m.alive) continue;
        const mx = m.pos.x - p.pos.x;
        const my = m.pos.y - p.pos.y;
        if (mx * mx + my * my <= 22 * 22) {
          p.alive = false;
          sim.hurtMajor(m, p.damage);
          hit = true;
          break;
        }
      }
      if (hit) continue;
      // Enemy fire also lands on the colony. Without this a ranged besieger can
      // never break what it is shooting at, and the night never ends.
      for (const s of st.structures) {
        if (s.hp <= 0) continue;
        const sx = s.pos.x - p.pos.x;
        const sy = s.pos.y - p.pos.y;
        const reachS = COMBAT.structureHitRadius;
        if (sx * sx + sy * sy <= reachS * reachS) {
          p.alive = false;
          sim.hurtStructure(s, p.damage);
          break;
        }
      }
    }
  }
}
