import { describe, expect, it } from 'vitest';
import { ECONOMY, TIME } from '../src/game/balance';
import { applyPurchase, hoardMultiplier, structureAt } from '../src/game/state';
import { Sim } from '../src/game/sim';
import { startResolve } from '../src/game/systems/phase';
import type { SiteId } from '../src/game/gallery';

function buy(sim: Sim, site: SiteId, times = 1): void {
  for (let i = 0; i < times; i++) {
    const pad = sim.state.pads.find((p) => p.id === site)!;
    if (pad.targetTier === 0) return;
    pad.paid = pad.cost;
    applyPurchase(sim.state, pad);
  }
}

function resolveWith(sim: Sim, collected: number): void {
  sim.state.phase = 'night';
  sim.state.sugarEarnedThisNight = collected;
  startResolve(sim);
}

describe('nightly tally', () => {
  it('pays out exactly what was collected with no Hoard and no bonus', () => {
    const sim = new Sim(5);
    resolveWith(sim, 100);
    expect(sim.state.tally!.total).toBe(100);
    expect(sim.state.tally!.hoardMultiplier).toBe(1);
  });

  it('applies the Hoard as spoilage reduction on the night total', () => {
    const sim = new Sim(5);
    buy(sim, 'hoard');
    expect(hoardMultiplier(sim.state)).toBe(1.25);
    resolveWith(sim, 100);
    expect(sim.state.tally!.total).toBe(125);
  });

  it('stacks the early-ready bonus additively with the Hoard', () => {
    const sim = new Sim(5);
    buy(sim, 'hoard', 3);
    expect(hoardMultiplier(sim.state)).toBe(2);
    sim.state.earlyReady = true;
    resolveWith(sim, 100);
    // 2.0 plus 0.15, not 2.0 times 1.15.
    expect(sim.state.tally!.total).toBe(215);
    expect(sim.state.tally!.earlyBonus).toBe(TIME.earlyReadyBonus);
  });

  it('adds the Brood Chamber 5 nightly bonus flat, after the multipliers', () => {
    const sim = new Sim(5);
    buy(sim, 'brood', 4);
    expect(structureAt(sim.state, 'brood')!.tier).toBe(5);
    resolveWith(sim, 100);
    expect(sim.state.tally!.total).toBe(100 + ECONOMY.broodTier5NightlyBonus);
    expect(sim.state.tally!.broodBonus).toBe(ECONOMY.broodTier5NightlyBonus);
  });

  it('scatters the bonus as crystals, so the number shown is the number she gets', () => {
    const sim = new Sim(5);
    buy(sim, 'hoard', 3);
    resolveWith(sim, 100);
    const onFloor = sim.state.pickups
      .filter((p) => p.kind === 'sugar')
      .reduce((sum, p) => sum + p.value, 0);
    expect(Math.round(onFloor)).toBe(sim.state.tally!.total - 100);
    // Those crystals survive to the next day.
    expect(sim.state.pickups.every((p) => p.expiresAt === null)).toBe(true);
  });

  it('records the night as held and clears the majors', () => {
    const sim = new Sim(5);
    sim.state.night = 4;
    resolveWith(sim, 10);
    expect(sim.state.stats.nightsHeld).toBe(4);
    expect(sim.state.majors.length).toBe(0);
    expect(sim.state.phase).toBe('resolve');
  });
});

describe('drop ledger', () => {
  it('counts every crystal that falls, collected or not', () => {
    const sim = new Sim(5);
    sim.state.phase = 'night';
    const inv = sim.spawnInvader('raiderAnt', 0, 700, 300, 30, 6)!;
    sim.killInvader(inv);
    const expected = Math.round(3 * ECONOMY.dropMultiplier);
    expect(sim.state.stats.sugarDropped).toBe(expected);
    const onFloor = sim.state.pickups.reduce((sum, p) => sum + p.value, 0);
    expect(Math.round(onFloor)).toBe(expected);
  });

  it('gives spiderlings no drop', () => {
    const sim = new Sim(5);
    const spiderling = sim.spawnInvader('raiderAnt', 0, 700, 300, 30, 6)!;
    spiderling.noDrop = true;
    sim.killInvader(spiderling);
    expect(sim.state.pickups.length).toBe(0);
    expect(sim.state.stats.sugarDropped).toBe(0);
  });
});
