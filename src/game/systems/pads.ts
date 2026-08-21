import { DAMAGEABLE, ECONOMY, FX, STACK } from '../balance';
import { applyPurchase, syncGlowcaps, tierRow } from '../state';
import { addToStack, takeFromStack } from './stack';
import type { Sim } from '../sim';
import type { Pad, Structure } from '../types';

/**
 * Presence-based spending. While the Warden's center is inside the footprint and
 * she has the resource, the pad drains from the stack. Progress is persistent
 * and partial: leaving keeps what was paid, with no refund and no decay.
 */
export function pads(sim: Sim, dt: number): void {
  const st = sim.state;
  const w = st.warden;
  const idle = w.knockedUntil > st.time || (st.phase !== 'day' && st.phase !== 'night');

  for (const pad of st.pads) {
    if (pad.ringFlash > 0) pad.ringFlash -= dt;
    if (pad.shortfallFlash > 0) pad.shortfallFlash -= dt;
    if (idle) continue;
    const dx = w.pos.x - pad.pos.x;
    const dy = w.pos.y - pad.pos.y;
    if (dx * dx + dy * dy > pad.radius * pad.radius) continue;

    if (pad.state === 'locked') {
      pad.shortfallFlash = 0.3;
      continue;
    }
    if (pad.kind === 'repair') {
      repair(sim, pad, dt);
      continue;
    }
    if (pad.kind === 'convert' && convert(sim, pad, dt)) continue;
    if (pad.state === 'complete') continue;
    // A purchase that just landed holds spending for a beat, so standing still
    // one moment too long cannot start paying into the next tier.
    if (st.time < pad.payLockUntil) continue;
    charge(sim, pad, dt);
  }
}

/** Drain sugar into a build pad, one crystal at a time. */
function charge(sim: Sim, pad: Pad, dt: number): void {
  const remaining = pad.cost - pad.paid;
  if (remaining <= 0) return;
  const wanted = Math.min(remaining, STACK.drainRate * dt);
  const taken = takeFromStack(sim, 'sugar', wanted);
  if (taken <= 0) {
    // Holds the ring and shows the shortfall. No nagging sound.
    pad.shortfallFlash = 0.4;
    return;
  }
  pad.paid += taken;
  pad.state = 'charging';
  sim.state.stats.sugarSpent += taken;

  // Tick rises in pitch across the fill, twelve semitones over the full ring.
  pad.tickAccum += taken * STACK.tickPerSugar;
  if (pad.tickAccum >= 1) {
    pad.tickAccum -= Math.floor(pad.tickAccum);
    const fill = pad.paid / pad.cost;
    sim.sound('padTick', Math.round(fill * STACK.padSemitoneRange));
  }

  if (pad.paid >= pad.cost - 0.001) complete(sim, pad);
}

function complete(sim: Sim, pad: Pad): void {
  applyPurchase(sim.state, pad);
  pad.ringFlash = 0.4;
  pad.tickAccum = 0;
  pad.payLockUntil = sim.state.time + STACK.payGrace;
  sim.sound('padComplete');
  sim.addShake(FX.padCompleteShake);
  sim.burst(pad.pos.x, pad.pos.y, FX.dustRingParticles, 0xa78d6b, 200, 5);
  sim.markLightingDirty();
}

/**
 * Conversion pads work in reverse: they drain the intermediate and add sugar.
 * With none of the intermediate in hand they behave as ordinary upgrade pads,
 * which is how the Nectar Vat is both a converter and a buildable.
 */
function convert(sim: Sim, pad: Pad, dt: number): boolean {
  const st = sim.state;
  const kind = pad.buildable === 'nectarVat' ? 'honeydew' : 'leaf';
  if (st.warden.stack[kind] <= 0) return false;

  const tier = Math.max(1, structureTier(sim, pad));
  const per = tierRow(pad.buildable, tier).sugarPerUnit;
  const units = Math.min(st.warden.stack[kind], STACK.conversionItemsPerSecond * dt);
  const added = addToStack(sim, 'sugar', units * per);
  if (added <= 0) {
    // Sugar full: the conversion stalls rather than destroying the honeydew.
    // Without a word of explanation this reads as a broken pad, because the
    // player is standing on the right spot holding the right thing.
    pad.shortfallFlash = 0.4;
    if (st.time >= sim.nextFullHintAt) {
      sim.nextFullHintAt = st.time + FULL_HINT_COOLDOWN;
      sim.hooks.onToast('Your sugar is full. Spend some, then come back.', 2.4);
    }
    return true;
  }
  // Only consume the fraction of an item that actually fit.
  takeFromStack(sim, kind, added / per);
  // Conversions are real income, and the run totals must show them.
  st.stats.sugarEarned += added;
  st.stats.sugarConverted += added;
  pad.tickAccum += added * STACK.tickPerSugar;
  if (pad.tickAccum >= 1) {
    pad.tickAccum -= Math.floor(pad.tickAccum);
    sim.sound('padTick', 4);
  }
  return true;
}

function structureTier(sim: Sim, pad: Pad): number {
  for (const s of sim.state.structures) if (s.site === pad.id) return s.tier;
  return 0;
}

/**
 * Mortar Pile: sugar into HP, most damaged structure first. A deliberate sink
 * competing with expansion.
 */
function repair(sim: Sim, pad: Pad, dt: number): void {
  if (sim.state.time < pad.payLockUntil) return;
  const target = mostDamaged(sim);
  if (!target) return;
  const needed = target.maxHp - target.hp;
  const sugarNeeded = needed / ECONOMY.mortarHpPerSugar;
  const wanted = Math.min(sugarNeeded, STACK.drainRate * dt);
  const taken = takeFromStack(sim, 'sugar', wanted);
  if (taken <= 0) {
    pad.shortfallFlash = 0.4;
    return;
  }
  target.hp = Math.min(target.maxHp, target.hp + taken * ECONOMY.mortarHpPerSugar);
  syncGlowcaps(target);
  sim.mortarUsed = true;
  sim.state.stats.sugarSpent += taken;
  pad.paid = 0;
  pad.state = 'charging';
  pad.tickAccum += taken * STACK.tickPerSugar;
  if (pad.tickAccum >= 1) {
    pad.tickAccum -= Math.floor(pad.tickAccum);
    sim.sound('padTick', Math.round((target.hp / target.maxHp) * STACK.padSemitoneRange));
  }
  if (target.hp >= target.maxHp) {
    pad.ringFlash = 0.3;
    pad.payLockUntil = sim.state.time + STACK.payGrace;
    sim.sound('padComplete', 4, 0.6);
  }
  if (target.kind === 'gallery' && target.hp > 0) sim.markLightingDirty();
}

/** Long enough not to nag while she stands there, short enough to be useful. */
const FULL_HINT_COOLDOWN = 8;

export function mostDamaged(sim: Sim): Structure | null {
  let worst: Structure | null = null;
  let worstFraction = 1;
  for (const s of sim.state.structures) {
    if (!DAMAGEABLE.has(s.kind)) continue;
    const fraction = s.hp / s.maxHp;
    if (fraction < worstFraction - 0.0001) {
      worstFraction = fraction;
      worst = s;
    }
  }
  return worst;
}
