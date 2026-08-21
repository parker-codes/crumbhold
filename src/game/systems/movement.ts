import { approach, approachAngle, clamp, lerp, offsetLerp } from '../../engine/ease';
import { BEETLE, COMBAT, INVADERS, WARDEN, WORLD } from '../balance';
import { BROOD_POS, LANES } from '../gallery';
import { beetleStats } from '../state';
import type { Sim } from '../sim';
import type { Invader, Vec2 } from '../types';

function clampToArena(pos: Vec2, radius: number): void {
  pos.x = clamp(pos.x, radius, WORLD.width - radius);
  pos.y = clamp(pos.y, radius, WORLD.height - radius);
}

export function movement(sim: Sim, dt: number): void {
  moveWarden(sim, dt);
  moveBeetle(sim, dt);
  moveInvaders(sim, dt);
  moveMajors(sim, dt);
  separate(sim);
}

function moveWarden(sim: Sim, dt: number): void {
  const st = sim.state;
  const w = st.warden;
  w.prev.x = w.pos.x;
  w.prev.y = w.pos.y;

  if (w.knockedUntil > st.time) {
    // Scripted worker drag: the last stretch of the knockdown carries her home.
    const remaining = w.knockedUntil - st.time;
    if (remaining <= WARDEN.dragDuration) {
      const t = 1 - remaining / WARDEN.dragDuration;
      w.pos.x = lerp(w.dragFrom.x, BROOD_POS.x, t);
      w.pos.y = lerp(w.dragFrom.y, BROOD_POS.y + 46, t);
    }
    w.vel.x = 0;
    w.vel.y = 0;
    updateAntennae(w.pos, w.facing, w.antenna, dt);
    return;
  }

  const playable = st.phase === 'day' || st.phase === 'night';
  const inX = playable ? sim.input.moveX : 0;
  const inY = playable ? sim.input.moveY : 0;
  const maxSpeed = w.mounted ? beetleStats(st).speed : WARDEN.speed;
  const wanted = Math.hypot(inX, inY);

  if (wanted > 0) {
    const targetVx = inX * maxSpeed;
    const targetVy = inY * maxSpeed;
    const dvx = targetVx - w.vel.x;
    const dvy = targetVy - w.vel.y;
    const dvLen = Math.hypot(dvx, dvy);
    const step = WARDEN.accel * dt;
    if (dvLen <= step) {
      w.vel.x = targetVx;
      w.vel.y = targetVy;
    } else {
      w.vel.x += (dvx / dvLen) * step;
      w.vel.y += (dvy / dvLen) * step;
    }
  } else {
    const speed = Math.hypot(w.vel.x, w.vel.y);
    const step = WARDEN.decel * dt;
    if (speed <= step) {
      w.vel.x = 0;
      w.vel.y = 0;
    } else {
      w.vel.x -= (w.vel.x / speed) * step;
      w.vel.y -= (w.vel.y / speed) * step;
    }
  }

  w.pos.x += w.vel.x * dt;
  w.pos.y += w.vel.y * dt;
  clampToArena(w.pos, WARDEN.radius);

  // Facing follows aim when a target is live, so she can back away spraying.
  const speed = Math.hypot(w.vel.x, w.vel.y);
  const heading = w.targetId >= 0 ? w.aim : speed > 6 ? Math.atan2(w.vel.y, w.vel.x) : w.facing;
  w.facing = approachAngle(w.facing, heading, WARDEN.turnRate, dt);
  w.gaitPhase += (speed / 46) * dt * Math.PI * 2;
  updateAntennae(w.pos, w.facing, w.antenna, dt);

  if (w.mounted) {
    st.beetle.pos.x = w.pos.x;
    st.beetle.pos.y = w.pos.y;
    st.beetle.facing = w.facing;
    hornToss(sim);
  }
}

function updateAntennae(pos: Vec2, facing: number, antenna: [Vec2, Vec2], dt: number): void {
  // Antennae lag-follow two points ahead of the head; the same helper the
  // carry stack uses, which is what makes both sway on a turn.
  const spread = 0.42;
  for (let i = 0; i < 2; i++) {
    const a = facing + (i === 0 ? -spread : spread);
    offsetLerp(antenna[i], pos.x + Math.cos(a) * 34, pos.y + Math.sin(a) * 34, WARDEN.antennaRate, dt);
  }
}

/** The beetle's horn tosses anything it runs through, once per target per cooldown. */
const hornCooldowns = new Map<number, number>();

function hornToss(sim: Sim): void {
  const st = sim.state;
  const horn = beetleStats(st).horn;
  const reach = BEETLE.hornRadius + WARDEN.radius;
  for (const inv of st.invaders) {
    if (!inv.alive) continue;
    const dx = inv.pos.x - st.warden.pos.x;
    const dy = inv.pos.y - st.warden.pos.y;
    if (dx * dx + dy * dy > reach * reach) continue;
    const last = hornCooldowns.get(inv.id) ?? -999;
    if (st.time - last < BEETLE.hornCooldownPerTarget) continue;
    hornCooldowns.set(inv.id, st.time);
    const len = Math.hypot(dx, dy) || 1;
    inv.vel.x += (dx / len) * BEETLE.tossImpulse;
    inv.vel.y += (dy / len) * BEETLE.tossImpulse;
    sim.hurtInvader(inv, horn, st.warden.pos.x, st.warden.pos.y, false);
  }
  if (hornCooldowns.size > 256) hornCooldowns.clear();
}

function moveBeetle(sim: Sim, dt: number): void {
  const st = sim.state;
  const b = st.beetle;
  b.prev.x = b.pos.x;
  b.prev.y = b.pos.y;
  if (!b.owned || st.warden.mounted) {
    b.summoned = false;
    return;
  }
  if (!b.summoned) {
    b.vel.x = approach(b.vel.x, 0, 6, dt);
    b.vel.y = approach(b.vel.y, 0, 6, dt);
    b.pos.x += b.vel.x * dt;
    b.pos.y += b.vel.y * dt;
    return;
  }
  const dx = st.warden.pos.x - b.pos.x;
  const dy = st.warden.pos.y - b.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < BEETLE.mountRadius) {
    b.summoned = false;
    st.warden.mounted = true;
    sim.sound('mount');
    return;
  }
  b.vel.x = (dx / dist) * BEETLE.drumSpeed;
  b.vel.y = (dy / dist) * BEETLE.drumSpeed;
  b.pos.x += b.vel.x * dt;
  b.pos.y += b.vel.y * dt;
  b.facing = Math.atan2(dy, dx);
  b.gaitPhase += dt * 16;
  clampToArena(b.pos, 22);
}

function moveInvaders(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const inv of st.invaders) {
    if (!inv.alive) continue;
    inv.prev.x = inv.pos.x;
    inv.prev.y = inv.pos.y;
    const stats = INVADERS[inv.kind];

    let speed = stats.speed;
    if (stats.burst) {
      // Tiger beetle: 0.6 s sprint, 0.25 s pause, at double the mean speed.
      inv.burstTimer -= dt;
      if (inv.burstTimer <= 0) {
        inv.bursting = !inv.bursting;
        inv.burstTimer = inv.bursting ? stats.burst.run : stats.burst.pause;
      }
      speed = inv.bursting ? stats.speed * 1.45 : 0;
    }

    const goal = invaderGoal(sim, inv);
    let moving = true;
    if (goal) {
      const dx = goal.x - inv.pos.x;
      const dy = goal.y - inv.pos.y;
      const dist = Math.hypot(dx, dy);
      const stopAt = goal.stopAt;
      if (dist <= stopAt) {
        moving = false;
        inv.facing = approachAngle(inv.facing, Math.atan2(dy, dx), 8, dt);
      } else {
        const vx = (dx / dist) * speed;
        const vy = (dy / dist) * speed;
        inv.vel.x = approach(inv.vel.x, vx, 10, dt);
        inv.vel.y = approach(inv.vel.y, vy, 10, dt);
        inv.facing = approachAngle(inv.facing, Math.atan2(inv.vel.y, inv.vel.x), 7, dt);
      }
    }
    if (!moving) {
      inv.vel.x = approach(inv.vel.x, 0, 12, dt);
      inv.vel.y = approach(inv.vel.y, 0, 12, dt);
    }
    inv.pos.x += inv.vel.x * dt;
    inv.pos.y += inv.vel.y * dt;
    inv.gaitPhase += (Math.hypot(inv.vel.x, inv.vel.y) / 22) * dt * Math.PI * 2;
    if (inv.flash > 0) inv.flash -= dt;
    // Invaders spawn outside the arena and walk in, so clamp only once inside.
    if (inv.pos.y > 40 && inv.pos.y < WORLD.height - 40) clampToArena(inv.pos, stats.radius);
  }
}

interface Goal {
  x: number;
  y: number;
  stopAt: number;
}

const goalScratch: Goal = { x: 0, y: 0, stopAt: 0 };

function invaderGoal(sim: Sim, inv: Invader): Goal | null {
  const st = sim.state;
  const stats = INVADERS[inv.kind];
  if (inv.targetType === 'warden') {
    goalScratch.x = st.warden.pos.x;
    goalScratch.y = st.warden.pos.y;
    goalScratch.stopAt = stats.range > 0 ? stats.range * 0.85 : stats.radius + WARDEN.radius + COMBAT.meleeReach * 0.5;
    return goalScratch;
  }
  if (inv.targetType === 'structure') {
    const s = st.structures.find((x) => x.id === inv.targetId);
    if (s) {
      goalScratch.x = s.pos.x;
      goalScratch.y = s.pos.y;
      goalScratch.stopAt = stats.range > 0 ? stats.range * 0.85 : stats.radius + 52;
      return goalScratch;
    }
  }
  if (inv.targetType === 'major') {
    const m = st.majors.find((x) => x.id === inv.targetId && x.alive);
    if (m) {
      goalScratch.x = m.pos.x;
      goalScratch.y = m.pos.y;
      goalScratch.stopAt = stats.range > 0 ? stats.range * 0.85 : stats.radius + 30;
      return goalScratch;
    }
  }
  // Waypoint seek with a per-entity lateral offset so groups spread out.
  const lane = LANES[inv.lane];
  const index = Math.min(inv.waypointIndex, lane.length - 1);
  const wp = lane[index];
  const prev = lane[Math.max(0, index - 1)];
  const tx = wp.x - prev.x;
  const ty = wp.y - prev.y;
  const tlen = Math.hypot(tx, ty) || 1;
  const nx = -ty / tlen;
  const ny = tx / tlen;
  goalScratch.x = wp.x + nx * inv.laneOffset;
  goalScratch.y = wp.y + ny * inv.laneOffset;
  goalScratch.stopAt = 0;
  const dx = goalScratch.x - inv.pos.x;
  const dy = goalScratch.y - inv.pos.y;
  if (dx * dx + dy * dy < 44 * 44 && inv.waypointIndex < lane.length - 1) {
    inv.waypointIndex++;
  }
  return goalScratch;
}

function moveMajors(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const m of st.majors) {
    if (!m.alive) continue;
    m.prev.x = m.pos.x;
    m.prev.y = m.pos.y;
    let gx = m.marker.x;
    let gy = m.marker.y;
    let stopAt = 12;
    if (m.trailedUntil > st.time) {
      // A Trail pulls majors to the Warden, then they walk back.
      gx = st.warden.pos.x;
      gy = st.warden.pos.y;
      stopAt = 46;
    } else {
      const target = st.invaders.find((i) => i.id === m.targetId && i.alive);
      if (target) {
        gx = target.pos.x;
        gy = target.pos.y;
        stopAt = INVADERS[target.kind].radius + 26;
      }
    }
    const dx = gx - m.pos.x;
    const dy = gy - m.pos.y;
    const dist = Math.hypot(dx, dy);
    const speed = COMBAT.majorSpeed;
    if (dist > stopAt) {
      m.vel.x = approach(m.vel.x, (dx / dist) * speed, 11, dt);
      m.vel.y = approach(m.vel.y, (dy / dist) * speed, 11, dt);
      m.facing = approachAngle(m.facing, Math.atan2(dy, dx), 8, dt);
    } else {
      m.vel.x = approach(m.vel.x, 0, 14, dt);
      m.vel.y = approach(m.vel.y, 0, 14, dt);
      if (dist > 1) m.facing = approachAngle(m.facing, Math.atan2(dy, dx), 8, dt);
    }
    m.pos.x += m.vel.x * dt;
    m.pos.y += m.vel.y * dt;
    m.gaitPhase += (Math.hypot(m.vel.x, m.vel.y) / 30) * dt * Math.PI * 2;
    if (m.flash > 0) m.flash -= dt;
    clampToArena(m.pos, 14);
  }
}

/** Cheap separation impulse so bodies do not stack into a single sprite. */
function separate(sim: Sim): void {
  const st = sim.state;
  const hash = sim.hash;
  hash.clear();
  for (let i = 0; i < st.invaders.length; i++) {
    const inv = st.invaders[i];
    if (inv.alive) hash.insert(inv.pos.x, inv.pos.y, i);
  }
  const r = COMBAT.separationRadius;
  for (let i = 0; i < st.invaders.length; i++) {
    const a = st.invaders[i];
    if (!a.alive) continue;
    const near = hash.query(a.pos.x, a.pos.y, r);
    for (let k = 0; k < near.length; k++) {
      const j = near[k];
      if (j <= i) continue;
      const b = st.invaders[j];
      if (!b.alive) continue;
      const dx = b.pos.x - a.pos.x;
      const dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const push = ((r - d) / r) * COMBAT.separationImpulse * (1 / 60);
      const nx = dx / d;
      const ny = dy / d;
      a.pos.x -= nx * push;
      a.pos.y -= ny * push;
      b.pos.x += nx * push;
      b.pos.y += ny * push;
    }
  }
}
