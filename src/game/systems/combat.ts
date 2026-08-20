import { clamp } from '../../engine/ease';
import { CAPS, COMBAT, INVADERS, WARDEN } from '../balance';
import { BROOD_POS, SITE_BY_ID } from '../gallery';
import { tierRow, wardenAttack } from '../state';
import { pickWardenTarget } from './ai';
import type { Sim } from '../sim';
import type { Invader, ResourceKind } from '../types';

/**
 * Melee resolution, Warden auto-attack, majors, deaths and drops. All damage is
 * instant on hit: no damage over time (section 9.8).
 */
export function combat(sim: Sim, dt: number): void {
  wardenFire(sim, dt);
  invaderAttacks(sim, dt);
  majorAttacks(sim, dt);
  wardenRegen(sim, dt);
}

function wardenFire(sim: Sim, dt: number): void {
  const st = sim.state;
  const w = st.warden;
  if (w.attackCooldown > 0) w.attackCooldown -= dt;
  if (w.knockedUntil > st.time || st.phase !== 'night') {
    w.targetId = -1;
    return;
  }
  const { damage, interval } = wardenAttack(st);
  w.targetId = pickWardenTarget(sim, WARDEN.range);
  if (w.targetId < 0) return;
  const target = st.invaders.find((i) => i.id === w.targetId);
  if (!target) {
    w.targetId = -1;
    return;
  }
  w.aim = Math.atan2(target.pos.y - w.pos.y, target.pos.x - w.pos.x);
  if (w.attackCooldown > 0) return;
  w.attackCooldown = interval;
  // Lead the target a little so a moving invader is still hit.
  const dist = Math.hypot(target.pos.x - w.pos.x, target.pos.y - w.pos.y);
  const flight = dist / WARDEN.projectileSpeed;
  const aimX = target.pos.x + target.vel.x * flight - w.pos.x;
  const aimY = target.pos.y + target.vel.y * flight - w.pos.y;
  sim.spawnProjectile(
    w.pos.x + Math.cos(w.aim) * 22,
    w.pos.y + Math.sin(w.aim) * 22,
    aimX, aimY, WARDEN.projectileSpeed, damage, true,
  );
  sim.sound('acidSpray');
}

function invaderAttacks(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const inv of st.invaders) {
    if (!inv.alive) continue;
    if (inv.attackCooldown > 0) inv.attackCooldown -= dt;
    const stats = INVADERS[inv.kind];

    if (stats.summonAtHpFraction && !inv.hasSummoned && inv.hp / inv.maxHp <= stats.summonAtHpFraction) {
      inv.hasSummoned = true;
      summonSpiderlings(sim, inv, stats.summonCount ?? 3);
    }

    if (inv.attackCooldown > 0) continue;

    if (inv.targetType === 'structure') {
      const s = st.structures.find((x) => x.id === inv.targetId);
      // A breached structure is no longer worth chewing: move on next retarget.
      if (!s || s.hp <= 0) {
        if (s) inv.retargetAt = 0;
        continue;
      }
      const reach = stats.range > 0 ? stats.range : stats.radius + 58;
      if (!withinReach(inv.pos.x, inv.pos.y, s.pos.x, s.pos.y, reach)) continue;
      if (stats.suicide) {
        detonate(sim, inv);
        continue;
      }
      if (stats.range > 0) {
        fireRanged(sim, inv, s.pos.x, s.pos.y);
      } else {
        sim.hurtStructure(s, inv.damage);
      }
      inv.attackCooldown = stats.interval;
      continue;
    }

    if (inv.targetType === 'warden') {
      const w = st.warden;
      if (w.knockedUntil > st.time) continue;
      const reach = stats.range > 0 ? stats.range : stats.radius + WARDEN.radius + COMBAT.meleeReach;
      if (!withinReach(inv.pos.x, inv.pos.y, w.pos.x, w.pos.y, reach)) continue;
      if (stats.suicide) {
        detonate(sim, inv);
        continue;
      }
      if (stats.range > 0) {
        fireRanged(sim, inv, w.pos.x, w.pos.y);
      } else {
        hurtWarden(sim, inv.damage, inv.pos.x, inv.pos.y, stats.knockback ?? 0);
      }
      inv.attackCooldown = stats.interval;
      continue;
    }

    if (inv.targetType === 'major') {
      const m = st.majors.find((x) => x.id === inv.targetId && x.alive);
      if (!m) continue;
      const reach = stats.range > 0 ? stats.range : stats.radius + 14 + COMBAT.meleeReach;
      if (!withinReach(inv.pos.x, inv.pos.y, m.pos.x, m.pos.y, reach)) continue;
      if (stats.suicide) {
        detonate(sim, inv);
        continue;
      }
      if (stats.range > 0) fireRanged(sim, inv, m.pos.x, m.pos.y);
      else sim.hurtMajor(m, inv.damage);
      inv.attackCooldown = stats.interval;
    }
  }
}

function withinReach(ax: number, ay: number, bx: number, by: number, reach: number): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy <= reach * reach;
}

function fireRanged(sim: Sim, inv: Invader, tx: number, ty: number): void {
  sim.spawnProjectile(inv.pos.x, inv.pos.y, tx - inv.pos.x, ty - inv.pos.y, 420, inv.damage, false);
  sim.sound('acidSpray', -5);
}

/** Exploding termite: AoE on contact, then it is gone. */
function detonate(sim: Sim, inv: Invader): void {
  const st = sim.state;
  const stats = INVADERS[inv.kind];
  const r = stats.aoeRadius ?? 90;
  sim.sound('explode');
  sim.addShake(3);
  sim.burst(inv.pos.x, inv.pos.y, 26, 0xf5c147, 300, 6);
  if (withinReach(inv.pos.x, inv.pos.y, st.warden.pos.x, st.warden.pos.y, r)) {
    hurtWarden(sim, inv.damage, inv.pos.x, inv.pos.y, 160);
  }
  for (const m of st.majors) {
    if (m.alive && withinReach(inv.pos.x, inv.pos.y, m.pos.x, m.pos.y, r)) {
      sim.hurtMajor(m, inv.damage);
    }
  }
  for (const s of [...st.structures]) {
    if (withinReach(inv.pos.x, inv.pos.y, s.pos.x, s.pos.y, r + 30)) {
      sim.hurtStructure(s, inv.damage);
    }
  }
  sim.killInvader(inv);
}

function summonSpiderlings(sim: Sim, boss: Invader, count: number): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const spawned = sim.spawnInvader(
      'raiderAnt',
      boss.lane,
      boss.pos.x + Math.cos(angle) * 44,
      boss.pos.y + Math.sin(angle) * 44,
      INVADERS.raiderAnt.hp,
      INVADERS.raiderAnt.damage,
    );
    if (spawned) {
      spawned.noDrop = true;
      spawned.waypointIndex = boss.waypointIndex;
    }
  }
  sim.addShake(2);
}

export function hurtWarden(sim: Sim, amount: number, fromX: number, fromY: number, knockback: number): void {
  const st = sim.state;
  const w = st.warden;
  if (sim.invulnerable) return;
  if (w.invulnUntil > st.time || w.knockedUntil > st.time) return;
  w.hp -= amount;
  w.lastDamagedAt = st.time;
  sim.burst(w.pos.x, w.pos.y, 4, 0xc2405b, 140, 3);
  sim.sound('hit', -2);
  if (knockback > 0) {
    const len = Math.hypot(w.pos.x - fromX, w.pos.y - fromY) || 1;
    w.vel.x += ((w.pos.x - fromX) / len) * knockback;
    w.vel.y += ((w.pos.y - fromY) / len) * knockback;
  }
  if (w.hp <= 0) knockDown(sim);
}

/**
 * Knockdown, not death. She drops half of each carried type, gets dragged home,
 * and revives at the Brood Chamber. The failure state is the brood, not reflexes.
 */
function knockDown(sim: Sim): void {
  const st = sim.state;
  const w = st.warden;
  w.hp = 0;
  w.mounted = false;
  w.knockedUntil = st.time + WARDEN.knockdownDuration;
  w.dragFrom.x = w.pos.x;
  w.dragFrom.y = w.pos.y;
  w.targetId = -1;
  st.stats.knockdowns++;
  sim.sound('knockdown');
  sim.addShake(4);

  const kinds: ResourceKind[] = ['sugar', 'honeydew', 'leaf'];
  for (const kind of kinds) {
    const held = w.stack[kind];
    const dropped = Math.floor(held * WARDEN.knockdownDropFraction);
    if (dropped <= 0) continue;
    w.stack[kind] = held - dropped;
    const perCrystal = kind === 'sugar' ? Math.max(1, Math.round(dropped / 6)) : 1;
    let left = dropped;
    while (left > 0) {
      const value = Math.min(perCrystal, left);
      sim.spawnPickup(kind, w.pos.x, w.pos.y, value, 150);
      left -= value;
    }
  }
  syncStackColumns(sim);
  if (st.stats.knockdowns === 1) {
    sim.hooks.onToast('The brood is what matters. The workers always carry you home.', 2);
  }
}

/** Trim the visual columns down to whatever the numbers now say. */
function syncStackColumns(sim: Sim): void {
  const w = sim.state.warden;
  const cols = w.stack.columns;
  while (cols[0].length > Math.min(w.stack.sugar, 10)) cols[0].pop();
  const other = w.stack.lastNonSugar;
  const otherCount = other ? Math.min(w.stack[other], 10) : 0;
  while (cols[1].length > otherCount) cols[1].pop();
}

export function reviveWarden(sim: Sim): void {
  const st = sim.state;
  const w = st.warden;
  w.hp = Math.round(WARDEN.hp * WARDEN.reviveHpFraction);
  w.pos.x = BROOD_POS.x;
  w.pos.y = BROOD_POS.y + 46;
  w.vel.x = 0;
  w.vel.y = 0;
  w.invulnUntil = st.time + WARDEN.reviveInvuln;
  w.lastDamagedAt = st.time;
  sim.sound('revive');
}

function majorAttacks(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const m of st.majors) {
    if (!m.alive) continue;
    if (m.attackCooldown > 0) m.attackCooldown -= dt;
    // Majors hold their marker: they engage nearby, and do not chase the gallery.
    const anchorX = m.trailedUntil > st.time ? st.warden.pos.x : m.marker.x;
    const anchorY = m.trailedUntil > st.time ? st.warden.pos.y : m.marker.y;
    let best: Invader | null = null;
    let bestDist = COMBAT.majorEngageRadius * COMBAT.majorEngageRadius;
    for (const inv of st.invaders) {
      if (!inv.alive) continue;
      const dx = inv.pos.x - anchorX;
      const dy = inv.pos.y - anchorY;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = inv;
      }
    }
    m.targetId = best ? best.id : -1;
    if (!best || m.attackCooldown > 0) continue;
    const reach = INVADERS[best.kind].radius + 14 + COMBAT.meleeReach;
    if (!withinReach(m.pos.x, m.pos.y, best.pos.x, best.pos.y, reach)) continue;
    m.attackCooldown = m.interval;
    sim.hurtInvader(best, m.damage, m.pos.x, m.pos.y, false);
  }
}

function wardenRegen(sim: Sim, dt: number): void {
  const st = sim.state;
  const w = st.warden;
  if (w.knockedUntil > st.time) return;
  if (w.hp >= w.maxHp) return;
  if (st.time - w.lastDamagedAt < WARDEN.regenDelay) return;
  w.hp = clamp(w.hp + WARDEN.regenPerSecond * dt, 0, w.maxHp);
}

/** Hatch a gallery's majors at night start; they re-hatch free every night. */
export function hatchMajors(sim: Sim): void {
  const st = sim.state;
  st.majors.length = 0;
  for (const s of st.structures) {
    if (s.kind !== 'gallery' || s.hp <= 0) continue;
    const row = tierRow('gallery', s.tier);
    const marker = SITE_BY_ID[s.site].marker ?? { x: s.pos.x, y: s.pos.y - 160 };
    for (let i = 0; i < row.majors; i++) {
      if (st.majors.length >= CAPS.majors) break;
      const angle = (i / row.majors) * Math.PI * 2;
      st.majors.push({
        id: st.nextEntityId++,
        siteId: s.site,
        pos: { x: s.pos.x + Math.cos(angle) * 26, y: s.pos.y + Math.sin(angle) * 26 },
        prev: { x: s.pos.x, y: s.pos.y },
        vel: { x: 0, y: 0 },
        hp: row.majorHp,
        maxHp: row.majorHp,
        damage: row.majorDamage,
        interval: row.majorInterval,
        attackCooldown: 0,
        facing: -Math.PI / 2,
        gaitPhase: i,
        flash: 0,
        marker: { x: marker.x + Math.cos(angle) * 30, y: marker.y + Math.sin(angle) * 30 },
        trailedUntil: 0,
        targetId: -1,
        alive: true,
      });
    }
  }
}
