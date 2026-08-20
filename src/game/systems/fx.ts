import { CAPS } from '../balance';
import type { Sim } from '../sim';

/** Shake decay, hit-stop bookkeeping, and the palette cross-fade clock. */
export function fx(sim: Sim, dt: number): void {
  if (sim.shake > 0) sim.shake = Math.max(0, sim.shake - dt * 22);
  if (sim.hitStop > 0) sim.hitStop = Math.max(0, sim.hitStop - dt);
  if (sim.shake > CAPS.shakeMax) sim.shake = CAPS.shakeMax;
}
