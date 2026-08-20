import { ECONOMY } from '../balance';
import { SITE_BY_ID } from '../gallery';
import { structureAt, tierRow } from '../state';
import type { Sim } from '../sim';

/**
 * Aphid Pens produce honeydew droplets; the Root Fringe grows leaf scraps that
 * are cut by standing next to them. Both run all day and all night.
 */
export function economy(sim: Sim, dt: number): void {
  aphids(sim, dt);
  roots(sim, dt);
}

function aphids(sim: Sim, dt: number): void {
  const st = sim.state;
  for (const pen of st.aphids) {
    const structure = structureAt(st, pen.siteId);
    if (!structure) continue;
    const row = tierRow('aphidPen', structure.tier);
    pen.timer += dt;
    if (pen.timer < row.dropletInterval) continue;
    pen.timer = 0;
    if (pen.onFloor >= row.floorCap) continue;
    const site = SITE_BY_ID[pen.siteId];
    const angle = sim.rng.next() * Math.PI * 2;
    const r = sim.rng.range(14, 40);
    const droplet = sim.spawnPickup(
      'honeydew',
      site.x + Math.cos(angle) * r,
      site.y + Math.sin(angle) * r,
      1,
    );
    if (droplet) pen.onFloor++;
  }
  // Recount from live pickups so collected droplets free their slot.
  for (const pen of st.aphids) pen.onFloor = 0;
  for (const p of st.pickups) {
    if (!p.alive || p.kind !== 'honeydew') continue;
    let bestPen = st.aphids[0];
    let bestDist = Infinity;
    for (const pen of st.aphids) {
      const site = SITE_BY_ID[pen.siteId];
      const d = (site.x - p.pos.x) ** 2 + (site.y - p.pos.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestPen = pen;
      }
    }
    bestPen.onFloor++;
  }
}

/**
 * Roots are cut by standing adjacent: her auto-attack does the cutting, so the
 * player only has to stand there.
 */
function roots(sim: Sim, dt: number): void {
  const st = sim.state;
  const w = st.warden;
  const cutRadius = 74;
  for (let i = 0; i < st.roots.length; i++) {
    const root = st.roots[i];
    if (!root.grown) {
      if (st.time >= root.regrowAt) {
        root.grown = true;
        root.cutProgress = 0;
      }
      continue;
    }
    const dx = w.pos.x - root.pos.x;
    const dy = w.pos.y - root.pos.y;
    if (dx * dx + dy * dy > cutRadius * cutRadius) {
      root.cutProgress = Math.max(0, root.cutProgress - dt);
      continue;
    }
    root.cutProgress += dt;
    if (root.cutProgress < ECONOMY.rootCutInterval) continue;
    root.cutProgress = 0;
    root.grown = false;
    root.regrowAt = st.time + ECONOMY.rootRegrow;
    sim.spawnPickup('leaf', root.pos.x, root.pos.y + 20, 1, 60);
    sim.burst(root.pos.x, root.pos.y, 6, 0x9be86b, 120, 3);
  }
}
