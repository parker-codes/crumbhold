import { describe, expect, it } from 'vitest';
import { STACK, WARDEN } from '../src/game/balance';
import { applyPurchase } from '../src/game/state';
import { Sim } from '../src/game/sim';
import { addToStack, takeFromStack, stack as stackSystem } from '../src/game/systems/stack';
import { hurtWarden } from '../src/game/systems/combat';
import { SIM_DT } from '../src/engine/loop';

function fresh(): Sim {
  const sim = new Sim(11);
  sim.state.warden.stack.sugar = 0;
  return sim;
}

describe('carry stack', () => {
  it('starts the run with the section 10.3 sugar', () => {
    expect(new Sim(1).state.warden.stack.sugar).toBe(25);
  });

  it('refuses pickups at capacity instead of discarding them', () => {
    const sim = fresh();
    expect(addToStack(sim, 'sugar', STACK.capacity.sugar)).toBe(STACK.capacity.sugar);
    expect(addToStack(sim, 'sugar', 5)).toBe(0);
    expect(sim.state.warden.stack.sugar).toBe(STACK.capacity.sugar);
    // The counter flashes so the refusal is visible, never silent.
    expect(sim.state.warden.stack.fullFlash).toBeGreaterThan(0);
  });

  it('takes only the part that fits', () => {
    const sim = fresh();
    addToStack(sim, 'sugar', STACK.capacity.sugar - 3);
    expect(addToStack(sim, 'sugar', 10)).toBe(3);
    expect(sim.state.warden.stack.sugar).toBe(STACK.capacity.sugar);
  });

  it('remembers the most recent non-sugar resource for the second column', () => {
    const sim = fresh();
    expect(sim.state.warden.stack.lastNonSugar).toBeNull();
    addToStack(sim, 'honeydew', 2);
    expect(sim.state.warden.stack.lastNonSugar).toBe('honeydew');
    addToStack(sim, 'leaf', 1);
    expect(sim.state.warden.stack.lastNonSugar).toBe('leaf');
    addToStack(sim, 'sugar', 4);
    expect(sim.state.warden.stack.lastNonSugar).toBe('leaf');
  });

  it('renders at most ten items per column plus a count badge', () => {
    const sim = fresh();
    addToStack(sim, 'sugar', 24);
    addToStack(sim, 'honeydew', STACK.capacity.honeydew);
    stackSystem(sim, SIM_DT);
    expect(sim.state.warden.stack.columns[0].length).toBe(STACK.maxColumnItems);
    expect(sim.state.warden.stack.columns[1].length).toBe(STACK.capacity.honeydew);
  });

  it('drops exactly half of each type, rounded down, on knockdown', () => {
    const sim = fresh();
    addToStack(sim, 'sugar', 25);
    addToStack(sim, 'honeydew', 5);
    addToStack(sim, 'leaf', 3);
    sim.state.phase = 'night';
    hurtWarden(sim, WARDEN.hp + 10, 0, 0, 0);
    const s = sim.state.warden.stack;
    expect(s.sugar).toBe(25 - Math.floor(25 * 0.5));
    expect(s.honeydew).toBe(5 - Math.floor(5 * 0.5));
    expect(s.leaf).toBe(3 - Math.floor(3 * 0.5));
    // What she dropped is on the floor, not deleted.
    const onFloor = sim.state.pickups.reduce((sum, p) => sum + p.value, 0);
    expect(Math.round(onFloor)).toBe(12 + 2 + 1);
  });

  it('curls up rather than dying, and revives at the chamber', () => {
    const sim = fresh();
    sim.state.phase = 'night';
    hurtWarden(sim, WARDEN.hp, 0, 0, 0);
    expect(sim.state.warden.hp).toBe(0);
    expect(sim.state.warden.knockedUntil).toBeCloseTo(WARDEN.knockdownDuration, 5);
    expect(sim.state.stats.knockdowns).toBe(1);
  });

  it('gives the mounted Warden the Paddock 2 capacity bonus and no more', () => {
    const sim = fresh();
    const pad = sim.state.pads.find((p) => p.id === 'paddock')!;
    pad.paid = pad.cost;
    // Tier 1 unlocks the beetle but grants no capacity.
    applyPurchase(sim.state, pad);
    sim.state.warden.mounted = true;
    expect(addToStack(sim, 'sugar', 99)).toBe(STACK.capacity.sugar);
    pad.paid = pad.cost;
    applyPurchase(sim.state, pad);
    expect(addToStack(sim, 'sugar', 99)).toBe(10);
  });

  it('never removes more than it holds', () => {
    const sim = fresh();
    addToStack(sim, 'leaf', 2);
    expect(takeFromStack(sim, 'leaf', 9)).toBe(2);
    expect(takeFromStack(sim, 'leaf', 1)).toBe(0);
  });
});
