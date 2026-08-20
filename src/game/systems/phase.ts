import { ECONOMY, TIME, WORLD } from '../balance';
import { BROOD_POS } from '../gallery';
import { broodTier, hoardMultiplier, refreshPadStates, structureAt, tierRow } from '../state';
import { hatchMajors, reviveWarden } from './combat';
import { setPickupLifetimes } from './pickups';
import { allSpawnsReleased, scheduleNight } from './spawn';
import type { Sim } from '../sim';

/** Phase timers and transitions, section 8. */
export function phase(sim: Sim, dt: number): void {
  const st = sim.state;
  st.time += dt;

  // Revive at the end of the knockdown, wherever the workers dragged her.
  const w = st.warden;
  if (w.hp <= 0 && w.knockedUntil > 0 && st.time >= w.knockedUntil) {
    w.knockedUntil = 0;
    reviveWarden(sim);
  }

  switch (st.phase) {
    case 'day':
      sim.shaftT = sim.phaseProgress;
      sim.nightMix = Math.max(0, sim.nightMix - dt / TIME.paletteCrossFade);
      if (sim.phaseElapsed >= st.phaseDuration) startNight(sim);
      break;
    case 'night':
      sim.nightMix = Math.min(1, sim.nightMix + dt / TIME.paletteCrossFade);
      if (allSpawnsReleased(sim) && st.invaders.length === 0) startResolve(sim);
      break;
    case 'resolve':
      if (sim.phaseElapsed >= st.phaseDuration) {
        if (!st.endless && st.night >= TIME.nightsPerRun) {
          sim.setPhase('win', 0);
          sim.audio.setMusic('off');
          sim.sound('win');
        } else {
          startDay(sim);
        }
      }
      break;
    default:
      break;
  }
}

export function startNight(sim: Sim): void {
  const st = sim.state;
  scheduleNight(sim);
  st.sugarEarnedThisNight = 0;
  st.sugarDroppedThisNight = 0;
  setPickupLifetimes(sim, true);
  hatchMajors(sim);
  sim.setPhase('night', 0);
  sim.camera.zoomTarget = 1 - WORLD.nightZoomOut;
  sim.sound('nightStart');
  sim.audio.setMusic('night');
  sim.hooks.onStamp(`Night ${st.night}`);
  sim.markLightingDirty();
}

/**
 * The tally: spoilage reduction and the early-ready bonus apply to the night's
 * total, and the difference is scattered as crystals so the number the player
 * sees is the number they actually get.
 */
export function startResolve(sim: Sim): void {
  const st = sim.state;
  const collected = st.sugarEarnedThisNight;
  const hoard = hoardMultiplier(st);
  const early = st.earlyReady ? TIME.earlyReadyBonus : 0;
  const brood = broodTier(st) >= 5 ? ECONOMY.broodTier5NightlyBonus : 0;
  // Additive stacking, per section 9.9.
  const multiplied = collected * (hoard + early);
  const total = Math.round(multiplied + brood);
  st.tally = {
    collected,
    dropped: st.sugarDroppedThisNight,
    hoardMultiplier: hoard,
    earlyBonus: early,
    broodBonus: brood,
    total,
  };
  const bonus = Math.max(0, total - collected);
  scatterBonus(sim, bonus);

  st.stats.nightsHeld = Math.max(st.stats.nightsHeld, st.night);
  st.majors.length = 0;
  sim.setPhase('resolve', TIME.resolveDuration);
  sim.camera.zoomTarget = 1;
  sim.sound('nightHeld');
  sim.hooks.onStamp(`Night ${st.night} held`);
}

function scatterBonus(sim: Sim, bonus: number): void {
  if (bonus <= 0) return;
  const crystals = Math.min(24, Math.max(1, Math.round(bonus / 4)));
  const per = bonus / crystals;
  for (let i = 0; i < crystals; i++) {
    const angle = (i / crystals) * Math.PI * 2 + sim.rng.next();
    const r = sim.rng.range(70, 160);
    const p = sim.spawnPickup(
      'sugar',
      BROOD_POS.x + Math.cos(angle) * r,
      BROOD_POS.y + Math.sin(angle) * r,
      per,
    );
    if (p) p.expiresAt = null;
  }
}

export function startDay(sim: Sim): void {
  const st = sim.state;
  st.night++;
  st.earlyReady = false;
  st.tally = null;
  st.trailUntil = 0;
  st.trailCooldownUntil = 0;
  setPickupLifetimes(sim, false);
  refreshPadStates(st);
  sim.setPhase('day', TIME.dayDuration);
  sim.shaftT = 0;
  sim.audio.setMusic('day');
  sim.sound('dawn');
  sim.markLightingDirty();
}

/** Ready: end the day early for a bonus on the coming night's drops. */
export function readyEarly(sim: Sim): void {
  const st = sim.state;
  if (st.phase !== 'day') return;
  st.earlyReady = true;
  startNight(sim);
}

/** Brood Chamber HP fraction, for the night HP bar. */
export function broodHealth(sim: Sim): { hp: number; maxHp: number } {
  const brood = structureAt(sim.state, 'brood');
  if (!brood) return { hp: 0, maxHp: 1 };
  return { hp: brood.hp, maxHp: brood.maxHp };
}

export function nextBroodTierCost(sim: Sim): number {
  const tier = broodTier(sim.state);
  if (tier >= 5) return 0;
  return tierRow('broodChamber', tier + 1).cost;
}
