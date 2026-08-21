import { TUNNEL_MOUTHS } from '../gallery';
import { planNight, scaledDamage, scaledHp } from '../waves';
import type { Sim } from '../sim';

/** Builds the night's spawn schedule from the threat budget. */
export function scheduleNight(sim: Sim): void {
  const st = sim.state;
  const plan = planNight(st.night, st.seed);
  st.spawnQueue = plan.orders;
  st.spawnCursor = 0;
  st.subWaveCount = plan.subWaveCount;
  st.spawnWindow = plan.spawnWindow;
}

/** Releases scheduled invaders as their timestamps arrive. */
export function spawn(sim: Sim, _dt: number): void {
  const st = sim.state;
  if (st.phase !== 'night') return;
  const elapsed = st.time - st.phaseStartedAt;
  while (st.spawnCursor < st.spawnQueue.length) {
    const order = st.spawnQueue[st.spawnCursor];
    if (order.at > elapsed) break;
    const mouth = TUNNEL_MOUTHS[order.lane];
    const jitterX = sim.rng.range(-26, 26);
    const jitterY = sim.rng.range(-20, 20);
    const created = sim.spawnInvader(
      order.kind,
      order.lane,
      mouth.spawn.x + jitterX,
      mouth.spawn.y + jitterY,
      scaledHp(order.kind, st.night),
      scaledDamage(order.kind, st.night),
    );
    // The hard cap queues excess spawns rather than dropping them.
    if (!created) break;
    if (order.kind === 'wolfSpider') {
      sim.addShake(6);
      sim.hooks.onToast('A wolf spider is coming down the tunnel.', 2);
    }
    st.spawnCursor++;
  }
}

/** Which sub-wave the night is on, for the HUD pip row. */
export function currentSubWave(sim: Sim): number {
  const st = sim.state;
  if (st.spawnQueue.length === 0) return 0;
  const index = Math.min(st.spawnCursor, st.spawnQueue.length - 1);
  return st.spawnQueue[index].subWave + 1;
}

export function allSpawnsReleased(sim: Sim): boolean {
  return sim.state.spawnCursor >= sim.state.spawnQueue.length;
}
