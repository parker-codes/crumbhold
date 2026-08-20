import type { Sim } from '../sim';

/** Compact the dead out of every entity list, once per step. */
export function cleanup(sim: Sim, dt: number): void {
  const st = sim.state;
  compact(st.invaders);
  compact(st.majors);
  compact(st.pickups);
  compact(st.projectiles);

  const particles = sim.particles;
  for (let i = particles.size - 1; i >= 0; i--) {
    const p = particles.items[i];
    p.life -= dt;
    if (p.life <= 0) {
      particles.freeAt(i);
      continue;
    }
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    p.vel.x *= 1 - 3 * dt;
    p.vel.y *= 1 - 3 * dt;
    p.vz -= 420 * dt;
    p.z += p.vz * dt;
    if (p.z < 0) {
      p.z = 0;
      p.vz *= -0.35;
    }
  }

  const numbers = sim.damageNumbers;
  for (let i = numbers.size - 1; i >= 0; i--) {
    const d = numbers.items[i];
    d.life -= dt;
    d.z += 42 * dt;
    if (d.life <= 0) numbers.freeAt(i);
  }
}

function compact<T extends { alive: boolean }>(list: T[]): void {
  let write = 0;
  for (let read = 0; read < list.length; read++) {
    const item = list[read];
    if (item.alive) {
      if (write !== read) list[write] = item;
      write++;
    }
  }
  list.length = write;
}
