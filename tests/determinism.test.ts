import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/engine/loop';
import { mulberry32 } from '../src/engine/rng';
import { Sim } from '../src/game/sim';
import { step } from '../src/game/step';

/** Same seed, same inputs, same run: this is what makes balance work repeatable. */
function fingerprint(seed: number, steps: number): string {
  const sim = new Sim(seed);
  for (let i = 0; i < steps; i++) {
    // A fixed, non-trivial input pattern, so movement and pads both engage.
    sim.input.moveX = Math.sin(i / 90);
    sim.input.moveY = Math.cos(i / 130);
    step(sim, SIM_DT);
  }
  const st = sim.state;
  return [
    st.phase, st.night, st.invaders.length, st.pickups.length,
    st.warden.pos.x.toFixed(4), st.warden.pos.y.toFixed(4),
    st.warden.stack.sugar.toFixed(4), st.stats.invadersKilled,
    st.stats.sugarDropped, st.structures.map((s) => `${s.site}:${s.tier}:${s.hp.toFixed(2)}`).join(','),
  ].join('|');
}

describe('determinism', () => {
  it('replays identically from the same seed', () => {
    const a = fingerprint(2024, 60 * 130);
    const b = fingerprint(2024, 60 * 130);
    expect(a).toBe(b);
  });

  it('diverges on a different seed', () => {
    expect(fingerprint(1, 60 * 130)).not.toBe(fingerprint(2, 60 * 130));
  });
});

describe('mulberry32', () => {
  it('is stable and inside the unit interval', () => {
    const rng = mulberry32(7);
    const first = [rng.next(), rng.next(), rng.next()];
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const again = mulberry32(7);
    expect([again.next(), again.next(), again.next()]).toEqual(first);
  });

  it('forks reproducibly without disturbing the parent', () => {
    const parent = mulberry32(3);
    const beforeState = parent.state();
    const forkA = parent.fork(11).next();
    expect(parent.state()).toBe(beforeState);
    expect(mulberry32(3).fork(11).next()).toBe(forkA);
  });

  it('respects weights', () => {
    const rng = mulberry32(99);
    let heads = 0;
    for (let i = 0; i < 2000; i++) {
      if (rng.weighted(['a', 'b'], [9, 1]) === 'a') heads++;
    }
    expect(heads).toBeGreaterThan(1700);
    expect(heads).toBeLessThan(1950);
  });
});
