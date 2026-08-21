import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/engine/loop';
import { ECONOMY, STACK } from '../src/game/balance';
import { broodTier, structureAt, tierOf } from '../src/game/state';
import { Sim } from '../src/game/sim';
import { step } from '../src/game/step';
import { pads } from '../src/game/systems/pads';
import { addToStack } from '../src/game/systems/stack';
import type { SiteId } from '../src/game/gallery';

function standOn(sim: Sim, site: SiteId): void {
  const pad = sim.state.pads.find((p) => p.id === site)!;
  sim.state.warden.pos.x = pad.pos.x;
  sim.state.warden.pos.y = pad.pos.y;
}

/** Steps only the pads system, which is all these cases are about. */
function tick(sim: Sim, seconds: number): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    sim.state.time += SIM_DT;
    pads(sim, SIM_DT);
  }
}

describe('spend pads', () => {
  it('drains at the balance rate while she stands there', () => {
    const sim = new Sim(3);
    standOn(sim, 'barricadeN');
    tick(sim, 1);
    // 25 sugar in the stack, 25 cost, 14 per second: one second buys 14.
    const pad = sim.state.pads.find((p) => p.id === 'barricadeN')!;
    expect(pad.paid).toBeCloseTo(STACK.drainRate, 1);
    expect(sim.state.warden.stack.sugar).toBeCloseTo(25 - STACK.drainRate, 1);
  });

  it('keeps partial payment when she walks away, with no decay', () => {
    const sim = new Sim(3);
    standOn(sim, 'barricadeN');
    tick(sim, 1);
    const pad = sim.state.pads.find((p) => p.id === 'barricadeN')!;
    const paid = pad.paid;
    sim.state.warden.pos.x = 0;
    sim.state.warden.pos.y = 0;
    tick(sim, 5);
    expect(pad.paid).toBe(paid);
    expect(pad.state).toBe('charging');
  });

  it('completes once, and only once', () => {
    const sim = new Sim(3);
    standOn(sim, 'barricadeN');
    tick(sim, 4);
    expect(tierOf(sim.state, 'barricadeN')).toBe(1);
    const pad = sim.state.pads.find((p) => p.id === 'barricadeN')!;
    expect(pad.paid).toBe(0);
    expect(pad.targetTier).toBe(2);
    // With no sugar left she cannot start the next tier.
    expect(sim.state.warden.stack.sugar).toBeLessThan(1);
    tick(sim, 4);
    expect(tierOf(sim.state, 'barricadeN')).toBe(1);
  });

  it('holds the ring and shows a shortfall with an empty stack', () => {
    const sim = new Sim(3);
    sim.state.warden.stack.sugar = 0;
    standOn(sim, 'barricadeN');
    tick(sim, 1);
    const pad = sim.state.pads.find((p) => p.id === 'barricadeN')!;
    expect(pad.paid).toBe(0);
    expect(pad.shortfallFlash).toBeGreaterThan(0);
  });

  it('rejects drain on a locked pad', () => {
    const sim = new Sim(3);
    addToStack(sim, 'sugar', 25);
    const pad = sim.state.pads.find((p) => p.id === 'spitter3')!;
    expect(pad.state).toBe('locked');
    standOn(sim, 'spitter3');
    tick(sim, 2);
    expect(pad.paid).toBe(0);
    expect(sim.state.warden.stack.sugar).toBe(STACK.capacity.sugar);
  });

  it('unlocks gated sites when the Brood Chamber rises', () => {
    const sim = new Sim(3);
    expect(broodTier(sim.state)).toBe(1);
    expect(sim.state.pads.find((p) => p.id === 'spitter3')!.state).toBe('locked');
    sim.state.warden.stack.sugar = 200;
    standOn(sim, 'brood');
    tick(sim, 8);
    expect(broodTier(sim.state)).toBe(2);
    expect(sim.state.pads.find((p) => p.id === 'spitter3')!.state).toBe('available');
    expect(sim.state.pads.find((p) => p.id === 'battery')!.state).toBe('locked');
  });
});

describe('conversion pads', () => {
  it('turns honeydew into sugar at the vat rate', () => {
    const sim = new Sim(3);
    sim.state.warden.stack.sugar = 0;
    addToStack(sim, 'honeydew', 4);
    standOn(sim, 'nectarVat');
    tick(sim, 1);
    // Two items a second, eight sugar apiece at tier 1.
    expect(sim.state.warden.stack.honeydew).toBeCloseTo(2, 1);
    expect(sim.state.warden.stack.sugar).toBeCloseTo(16, 1);
  });

  it('stalls rather than destroying honeydew when sugar is full', () => {
    const sim = new Sim(3);
    addToStack(sim, 'honeydew', 4);
    sim.state.warden.stack.sugar = STACK.capacity.sugar;
    standOn(sim, 'nectarVat');
    tick(sim, 1);
    expect(sim.state.warden.stack.honeydew).toBe(4);
    const pad = sim.state.pads.find((p) => p.id === 'nectarVat')!;
    expect(pad.shortfallFlash).toBeGreaterThan(0);
  });

  it('doubles as its own upgrade pad when she carries no honeydew', () => {
    const sim = new Sim(3);
    sim.state.warden.stack.honeydew = 0;
    sim.state.warden.stack.sugar = 120;
    standOn(sim, 'nectarVat');
    tick(sim, 8);
    expect(tierOf(sim.state, 'nectarVat')).toBe(2);
  });
});

describe('mortar pile', () => {
  it('restores the most damaged structure at the balance rate', () => {
    const sim = new Sim(3);
    const brood = structureAt(sim.state, 'brood')!;
    brood.hp = brood.maxHp - 200;
    sim.state.warden.stack.sugar = 25;
    standOn(sim, 'mortar');
    tick(sim, 1);
    expect(brood.hp).toBeCloseTo(brood.maxHp - 200 + STACK.drainRate * ECONOMY.mortarHpPerSugar, 0);
  });

  it('brings a breached structure back rather than leaving a ruin', () => {
    const sim = new Sim(3);
    const pad = sim.state.pads.find((p) => p.id === 'barricadeN')!;
    standOn(sim, 'barricadeN');
    tick(sim, 4);
    const barricade = structureAt(sim.state, 'barricadeN')!;
    sim.hurtStructure(barricade, barricade.maxHp + 50);
    expect(barricade.hp).toBe(0);
    expect(barricade.glowcaps).toBe(0);
    expect(structureAt(sim.state, 'barricadeN')).toBeDefined();

    sim.state.warden.stack.sugar = 60;
    standOn(sim, 'mortar');
    tick(sim, 3);
    expect(barricade.hp).toBeGreaterThan(0);
    expect(barricade.glowcaps).toBe(barricade.tier);
    expect(pad.buildable).toBe('barricade');
  });
});

describe('spending grace after a purchase', () => {
  /** Parks her on a pad with sugar in hand and runs the ordered system pass. */
  function dwell(sim: Sim, id: SiteId, seconds: number, onStep?: () => void): void {
    const pad = sim.state.pads.find((p) => p.id === id)!;
    const steps = Math.round(seconds / SIM_DT);
    for (let i = 0; i < steps; i++) {
      sim.state.warden.stack.sugar = 25;
      sim.state.warden.pos.x = pad.pos.x;
      sim.state.warden.pos.y = pad.pos.y;
      step(sim, SIM_DT);
      onStep?.();
    }
  }

  it('stops taking sugar for a beat once a level is bought', () => {
    const sim = new Sim(7);
    const pad = sim.state.pads.find((p) => p.id === 'spitter1')!;
    let paidDuringLock = 0;
    let bought = false;
    dwell(sim, 'spitter1', 4, () => {
      const tier = sim.state.structures.find((s) => s.site === 'spitter1')?.tier ?? 0;
      if (!bought && tier >= 1) {
        bought = true;
        // The lock is set the instant the purchase lands.
        expect(pad.payLockUntil).toBeGreaterThan(sim.state.time);
      }
      if (bought && sim.state.time < pad.payLockUntil) paidDuringLock += pad.paid;
    });
    expect(bought).toBe(true);
    // A player standing still through the completion buys nothing more until the
    // grace expires, so stepping off is always possible.
    expect(paidDuringLock).toBe(0);
  });

  it('resumes spending once the grace expires', () => {
    const sim = new Sim(7);
    const pad = sim.state.pads.find((p) => p.id === 'spitter1')!;
    // Asserted against the grace itself rather than against reaching level 2,
    // which would move the moment a cost table changed.
    let paidAfterLock = 0;
    let bought = false;
    dwell(sim, 'spitter1', 4, () => {
      if ((sim.state.structures.find((s) => s.site === 'spitter1')?.tier ?? 0) >= 1) bought = true;
      if (bought && sim.state.time > pad.payLockUntil) paidAfterLock = pad.paid;
    });
    expect(bought).toBe(true);
    expect(paidAfterLock).toBeGreaterThan(0);
  });
});
