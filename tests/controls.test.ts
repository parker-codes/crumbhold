import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/engine/loop';
import { axesFromKeys, isMovementKey } from '../src/engine/input';
import { WARDEN } from '../src/game/balance';
import { Sim } from '../src/game/sim';
import { step } from '../src/game/step';
import { canEndDay, currentAction } from '../src/game/systems/actions';
import { readyEarly } from '../src/game/systems/phase';

const axis = { x: 0, y: 0 };

function axes(...codes: string[]): [number, number] {
  axesFromKeys(codes, axis);
  return [round(axis.x), round(axis.y)];
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Runs the whole ordered system pass, the way the real loop does. */
function drive(sim: Sim, x: number, y: number, seconds: number): void {
  sim.input.moveX = x;
  sim.input.moveY = y;
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) step(sim, SIM_DT);
}

describe('desktop keyboard parity', () => {
  it('maps WASD to the four directions', () => {
    expect(axes('KeyW')).toEqual([0, -1]);
    expect(axes('KeyS')).toEqual([0, 1]);
    expect(axes('KeyA')).toEqual([-1, 0]);
    expect(axes('KeyD')).toEqual([1, 0]);
  });

  it('maps the arrow keys the same way', () => {
    expect(axes('ArrowUp')).toEqual(axes('KeyW'));
    expect(axes('ArrowDown')).toEqual(axes('KeyS'));
    expect(axes('ArrowLeft')).toEqual(axes('KeyA'));
    expect(axes('ArrowRight')).toEqual(axes('KeyD'));
  });

  it('normalizes diagonals, so a keyboard never outruns a thumb', () => {
    for (const pair of [
      ['KeyW', 'KeyD'],
      ['KeyW', 'KeyA'],
      ['KeyS', 'KeyD'],
      ['KeyS', 'KeyA'],
      ['ArrowUp', 'ArrowRight'],
    ]) {
      axesFromKeys(pair, axis);
      expect(Math.hypot(axis.x, axis.y)).toBeCloseTo(1, 6);
    }
  });

  it('cancels opposing keys instead of drifting', () => {
    expect(axes('KeyW', 'KeyS')).toEqual([0, 0]);
    expect(axes('KeyA', 'KeyD')).toEqual([0, 0]);
    expect(axes('KeyW', 'KeyS', 'KeyA', 'KeyD')).toEqual([0, 0]);
  });

  it('ignores keys that are not bound to movement', () => {
    expect(axes('Space', 'Escape', 'KeyQ')).toEqual([0, 0]);
    expect(axes('KeyW', 'Space')).toEqual([0, -1]);
    expect(isMovementKey('KeyW')).toBe(true);
    expect(isMovementKey('ArrowLeft')).toBe(true);
    expect(isMovementKey('Space')).toBe(false);
  });

  it('reports no movement for an empty key set', () => {
    expect(axes()).toEqual([0, 0]);
  });
});

describe('input reaches the Warden', () => {
  // The wiring from Input.state to Sim.input is a single assignment at
  // bootstrap. Losing it leaves every control dead while everything else looks
  // healthy, so the movement path is asserted end to end here.
  it('walks her in the commanded direction', () => {
    const sim = new Sim(1);
    const start = { ...sim.state.warden.pos };
    drive(sim, 0, -1, 0.5);
    expect(sim.state.warden.pos.y).toBeLessThan(start.y - 40);
    expect(sim.state.warden.pos.x).toBeCloseTo(start.x, 3);
  });

  it('covers the same ground on a diagonal as on an axis', () => {
    const straight = new Sim(1);
    const startStraight = { ...straight.state.warden.pos };
    drive(straight, 1, 0, 1);
    const axisDistance = Math.hypot(
      straight.state.warden.pos.x - startStraight.x,
      straight.state.warden.pos.y - startStraight.y,
    );

    const diagonal = new Sim(1);
    const startDiagonal = { ...diagonal.state.warden.pos };
    const unit = Math.SQRT1_2;
    drive(diagonal, unit, -unit, 1);
    const diagonalDistance = Math.hypot(
      diagonal.state.warden.pos.x - startDiagonal.x,
      diagonal.state.warden.pos.y - startDiagonal.y,
    );

    expect(diagonalDistance).toBeCloseTo(axisDistance, 0);
  });

  it('ramps up to the on-foot speed and no further', () => {
    const sim = new Sim(1);
    drive(sim, 1, 0, 2);
    const speed = Math.hypot(sim.state.warden.vel.x, sim.state.warden.vel.y);
    expect(speed).toBeCloseTo(WARDEN.speed, 3);
  });

  it('comes to a stop when the keys are released', () => {
    const sim = new Sim(1);
    drive(sim, 1, 0, 1);
    expect(Math.hypot(sim.state.warden.vel.x, sim.state.warden.vel.y)).toBeGreaterThan(0);
    drive(sim, 0, 0, 0.5);
    expect(sim.state.warden.vel.x).toBe(0);
    expect(sim.state.warden.vel.y).toBe(0);
  });

  it('holds still while she is knocked down', () => {
    const sim = new Sim(1);
    sim.state.warden.knockedUntil = sim.state.time + 4;
    const start = { ...sim.state.warden.pos };
    drive(sim, 1, 0, 0.5);
    // The worker drag owns her position during a knockdown, not the stick.
    expect(sim.state.warden.vel.x).toBe(0);
    expect(sim.state.warden.pos.x).toBeCloseTo(start.x, 3);
  });

  it('offers no action button on foot before anything is unlocked', () => {
    const sim = new Sim(1);
    // Ending the day used to live here, which meant the button was never idle
    // and the player could not tell an unlocked action from a live one.
    expect(currentAction(sim)).toBe('none');
    sim.input.actionPressed = true;
    step(sim, SIM_DT);
    expect(sim.state.phase).toBe('day');
  });

  it('ends the day early and banks the bonus on the coming night', () => {
    const sim = new Sim(1);
    readyEarly(sim);
    expect(sim.state.earlyReady).toBe(true);
    expect(sim.state.phase).toBe('night');
  });

  it('still offers End day once the beetle is owned', () => {
    const sim = new Sim(1);
    expect(canEndDay(sim)).toBe(true);
    // Regression: under the old priority the button showed Drum for the rest of
    // the run the moment a Paddock was bought, so buying one silently removed
    // the early-end bonus from every remaining day.
    sim.state.beetle.owned = true;
    expect(currentAction(sim)).toBe('drum');
    expect(canEndDay(sim)).toBe(true);
  });

  it('offers no End day at night', () => {
    const sim = new Sim(1);
    sim.setPhase('night', 0);
    expect(canEndDay(sim)).toBe(false);
  });
});
