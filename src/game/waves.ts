import { COMBAT, INVADERS, THREAT, type InvaderKind } from './balance';
import { activeLanes } from './gallery';
import { nightSpawnWindow } from './state';
import { mulberry32, type Rng } from '../engine/rng';
import type { SpawnOrder } from './types';

export interface WavePlan {
  night: number;
  budget: number;
  spent: number;
  subWaveCount: number;
  spawnWindow: number;
  orders: SpawnOrder[];
}

export function threatBudget(night: number): number {
  return Math.round(THREAT.base * Math.pow(THREAT.growth, night - 1));
}

export function isBossNight(night: number): boolean {
  return THREAT.bossNights.includes(night);
}

/** Non-boss types whose intro night has arrived. */
export function unlockedKinds(night: number): InvaderKind[] {
  const out: InvaderKind[] = [];
  for (const key of Object.keys(INVADERS) as InvaderKind[]) {
    const stats = INVADERS[key];
    if (stats.boss) continue;
    if (stats.introNight <= night) out.push(key);
  }
  return out;
}

/** The type introduced most recently, whose appearance the night must telegraph. */
export function newestKind(night: number): InvaderKind {
  const pool = unlockedKinds(night);
  let best = pool[0];
  for (const kind of pool) {
    if (INVADERS[kind].introNight > INVADERS[best].introNight) best = kind;
  }
  return best;
}

/** Section 10.5 rule 2: cheap types stay common, older types drift up in weight. */
function weightFor(kind: InvaderKind, night: number): number {
  const stats = INVADERS[kind];
  const since = night - stats.introNight;
  return (1 / stats.threat) * (1 + THREAT.weightRecencyBonus * since);
}

/** Per-night stat growth, capped. Bosses scale on their own curve. */
export function invaderScale(kind: InvaderKind, night: number): number {
  const stats = INVADERS[kind];
  if (stats.boss) {
    return 1 + COMBAT.bossScalePerNight * Math.max(0, night - stats.introNight);
  }
  return Math.min(COMBAT.scaleCap, 1 + COMBAT.scalePerNight * (night - 1));
}

export function scaledHp(kind: InvaderKind, night: number): number {
  return Math.round(INVADERS[kind].hp * invaderScale(kind, night));
}

export function scaledDamage(kind: InvaderKind, night: number): number {
  const stats = INVADERS[kind];
  if (stats.boss) return stats.damage;
  return stats.damage * Math.min(COMBAT.scaleCap, 1 + COMBAT.scalePerNight * (night - 1));
}

/** Builds the roster of kinds for a night, spending the threat budget. */
function pickRoster(night: number, rng: Rng): { kinds: InvaderKind[]; spent: number } {
  const budget = threatBudget(night);
  const pool = unlockedKinds(night);
  const kinds: InvaderKind[] = [];
  let spent = 0;

  if (isBossNight(night)) {
    kinds.push('wolfSpider');
    spent += THREAT.bossBudget;
  }

  // Rule 3: at least one Mole Cricket from night 5.
  if (night >= THREAT.moleCricketFromNight && pool.includes('moleCricket')) {
    kinds.push('moleCricket');
    spent += INVADERS.moleCricket.threat;
  }

  // Rule 1: reserve a share of the budget for the newest unlocked type.
  const newest = newestKind(night);
  const reserve = budget * THREAT.newTypeReserve;
  let onNewest = kinds.reduce(
    (sum, k) => (k === newest ? sum + INVADERS[k].threat : sum),
    0,
  );
  while (onNewest < reserve && spent + INVADERS[newest].threat <= budget) {
    kinds.push(newest);
    onNewest += INVADERS[newest].threat;
    spent += INVADERS[newest].threat;
  }

  // Rule 2: spend the remainder on any unlocked type, weighted.
  const weights = pool.map((k) => weightFor(k, night));
  let cheapest = Infinity;
  for (const kind of pool) cheapest = Math.min(cheapest, INVADERS[kind].threat);

  let guard = 0;
  while (spent + cheapest <= budget && guard++ < 4000) {
    const affordable: InvaderKind[] = [];
    const affordableWeights: number[] = [];
    for (let i = 0; i < pool.length; i++) {
      if (spent + INVADERS[pool[i]].threat <= budget) {
        affordable.push(pool[i]);
        affordableWeights.push(weights[i]);
      }
    }
    if (affordable.length === 0) break;
    const pick = rng.weighted(affordable, affordableWeights);
    kinds.push(pick);
    spent += INVADERS[pick].threat;
  }

  // Round the leftover to the nearest whole cheap unit so the night lands on budget.
  const cheapKind = pool.reduce((a, b) => (INVADERS[a].threat <= INVADERS[b].threat ? a : b));
  if (budget - spent >= INVADERS[cheapKind].threat * 0.5) {
    kinds.push(cheapKind);
    spent += INVADERS[cheapKind].threat;
  }

  return { kinds, spent };
}

/** Rule 4: split the roster across the night's active tunnels, roughly evenly. */
function assignLanes(kinds: InvaderKind[], night: number, rng: Rng): (0 | 1 | 2)[] {
  const lanes = activeLanes(night);
  const total = kinds.reduce((sum, k) => sum + INVADERS[k].threat, 0);
  const targets = lanes.map(() => total / lanes.length);
  for (let i = 0; i < targets.length; i++) {
    targets[i] *= 1 + rng.range(-THREAT.laneJitter, THREAT.laneJitter);
  }
  const filled = lanes.map(() => 0);
  const out: (0 | 1 | 2)[] = [];
  // Heaviest first, into whichever tunnel is furthest below its target.
  const order = kinds
    .map((kind, index) => ({ kind, index }))
    .sort((a, b) => INVADERS[b.kind].threat - INVADERS[a.kind].threat);
  const laneByIndex = new Array<0 | 1 | 2>(kinds.length);
  for (const entry of order) {
    let best = 0;
    let bestDeficit = -Infinity;
    for (let i = 0; i < lanes.length; i++) {
      const deficit = targets[i] - filled[i];
      if (deficit > bestDeficit) {
        bestDeficit = deficit;
        best = i;
      }
    }
    filled[best] += INVADERS[entry.kind].threat;
    laneByIndex[entry.index] = lanes[best] as 0 | 1 | 2;
  }
  for (let i = 0; i < kinds.length; i++) out.push(laneByIndex[i]);
  return out;
}

/**
 * Rule 5: break each tunnel's allocation into sub-waves across the spawn
 * window, with heavier types weighted later.
 */
export function planNight(night: number, seed: number): WavePlan {
  const rng = mulberryFor(seed, night);
  const { kinds, spent } = pickRoster(night, rng);
  const laneOf = assignLanes(kinds, night, rng);
  const subWaveCount = THREAT.subWavesMin + rng.int(THREAT.subWavesMax - THREAT.subWavesMin + 1);
  const spawnWindow = nightSpawnWindow(night);
  const lanes = activeLanes(night);
  const orders: SpawnOrder[] = [];

  for (const lane of lanes) {
    const members: InvaderKind[] = [];
    for (let i = 0; i < kinds.length; i++) if (laneOf[i] === lane) members.push(kinds[i]);
    if (members.length === 0) continue;
    // Light first, heavy last: the night ramps rather than front-loading.
    members.sort((a, b) => INVADERS[a].threat - INVADERS[b].threat);
    const perWave = Math.ceil(members.length / subWaveCount);
    for (let i = 0; i < members.length; i++) {
      const kind = members[i];
      if (INVADERS[kind].boss) {
        orders.push({ at: 0.6, kind, lane: lane as 0 | 1 | 2, subWave: 0 });
        continue;
      }
      const subWave = Math.min(subWaveCount - 1, Math.floor(i / perWave));
      const base = (subWave / subWaveCount) * spawnWindow;
      const withinWave = (i % perWave) * 0.32;
      orders.push({
        at: base + withinWave + rng.range(0, 0.5),
        kind,
        lane: lane as 0 | 1 | 2,
        subWave,
      });
    }
  }
  orders.sort((a, b) => a.at - b.at);
  return { night, budget: threatBudget(night), spent, subWaveCount, spawnWindow, orders };
}

/**
 * Wave composition draws from a per-night fork so replanning a night is
 * reproducible and does not depend on how much other randomness ran first.
 */
function mulberryFor(seed: number, night: number): Rng {
  return mulberry32((seed ^ Math.imul(night, 0x85ebca6b)) >>> 0);
}
