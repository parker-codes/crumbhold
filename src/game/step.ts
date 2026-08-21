import { actions } from './systems/actions';
import { ai } from './systems/ai';
import { camera } from './systems/camera';
import { cleanup } from './systems/cleanup';
import { combat } from './systems/combat';
import { economy } from './systems/economy';
import { fx } from './systems/fx';
import { movement } from './systems/movement';
import { pads } from './systems/pads';
import { phase } from './systems/phase';
import { pickups } from './systems/pickups';
import { projectiles } from './systems/projectiles';
import { spawn } from './systems/spawn';
import { stack } from './systems/stack';
import { structures } from './systems/structures';
import type { Sim } from './sim';

/**
 * Fixed system order, single pass, no cross-system callbacks (section 16). A
 * system that needs to tell another something writes to state; a later system
 * reads it.
 */
export function step(sim: Sim, dt: number): void {
  const st = sim.state;
  if (st.phase === 'win' || st.phase === 'lose' || st.phase === 'title') {
    // Frozen sim: only the presentation clocks keep running.
    fx(sim, dt);
    camera(sim, dt);
    cleanup(sim, dt);
    return;
  }

  // Hit-stop holds the world for a few frames on a kill, but never the clock.
  if (sim.hitStop > 0) {
    sim.hitStop = Math.max(0, sim.hitStop - dt);
    st.time += dt;
    camera(sim, dt);
    cleanup(sim, dt);
    return;
  }

  actions(sim, dt);
  phase(sim, dt);
  spawn(sim, dt);
  ai(sim, dt);
  movement(sim, dt);
  projectiles(sim, dt);
  combat(sim, dt);
  pickups(sim, dt);
  stack(sim, dt);
  pads(sim, dt);
  structures(sim, dt);
  economy(sim, dt);
  cleanup(sim, dt);
  camera(sim, dt);
  fx(sim, dt);
}
