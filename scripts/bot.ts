import { STACK, WARDEN } from '../src/game/balance';
import { BROOD_POS, ROOT_FRINGE } from '../src/game/gallery';
import type { SiteId } from '../src/game/gallery';
import { maxTier, structureAt, tierOf } from '../src/game/state';
import type { Sim } from '../src/game/sim';
import { currentAction } from '../src/game/systems/actions';
import type { Pad } from '../src/game/types';

export type Strategy = 'spitters' | 'economy' | 'balanced' | 'barricades';

/**
 * Scripted build orders. A repeated site means the next tier of it, so a list
 * doubles as a spending priority queue.
 */
const ORDERS: Record<Strategy, SiteId[]> = {
  spitters: [
    'spitter1', 'spitter2', 'spitter1', 'spitter2', 'brood', 'spitter3',
    'spitter1', 'spitter2', 'spitter3', 'brood', 'battery', 'spitter3',
  ],
  economy: [
    'hoard', 'aphidA', 'aphidB', 'nectarVat', 'hoard', 'fungusGarden',
    'nectarVat', 'hoard', 'brood', 'brood', 'paddock',
  ],
  barricades: [
    'barricadeN', 'barricadeSW', 'barricadeSE', 'barricadeN', 'barricadeSW',
    'barricadeSE', 'barricadeN', 'barricadeSW', 'barricadeSE', 'brood', 'brood',
  ],
  balanced: [
    'barricadeN', 'spitter1', 'galleryA', 'hoard', 'spitter2', 'brood',
    'nectarVat', 'barricadeSW', 'galleryB', 'spitter1', 'venomWell', 'brood',
    'spitter2', 'hoard', 'barricadeSE', 'spitter3', 'battery', 'venomWell',
    'brood', 'galleryA', 'aphidA', 'barricadeN', 'brood', 'spitter4',
  ],
};

/**
 * Drives the real input vector toward whatever the strategy wants next, so the
 * harness exercises movement, pickups, conversion, and pads rather than poking
 * state directly.
 */
export class Bot {
  private cursor = 0;
  private drumCooldown = 0;
  private readonly standing = { x: 0, y: 0 };

  constructor(
    private readonly sim: Sim,
    private readonly strategy: Strategy,
  ) {}

  private nextSite(): SiteId | null {
    const order = ORDERS[this.strategy];
    while (this.cursor < order.length) {
      const site = order[this.cursor];
      const pad = this.sim.state.pads.find((p) => p.id === site);
      if (!pad) {
        this.cursor++;
        continue;
      }
      if (pad.state === 'complete' || tierOf(this.sim.state, site) >= maxTier(pad.buildable)) {
        this.cursor++;
        continue;
      }
      if (pad.state === 'locked') {
        // Locked by Brood tier: fall through to the next affordable entry.
        const later = order.slice(this.cursor + 1).find((id) => {
          const p = this.sim.state.pads.find((x) => x.id === id);
          return p && p.state !== 'locked' && p.state !== 'complete';
        });
        return later ?? null;
      }
      return site;
    }
    return null;
  }

  /**
   * Called once per sim step, before `step`. Cycles sweep, convert, and spend,
   * which is what a competent player does; the harness is only meaningful if the
   * bot plays the loop rather than teleporting sugar into pads.
   */
  think(): void {
    const st = this.sim.state;
    const stack = st.warden.stack;
    const site = this.nextSite();
    const pad = site ? st.pads.find((p) => p.id === site) : null;
    const goal = this.chooseGoal(pad);

    const w = st.warden;
    const dx = goal.x - w.pos.x;
    const dy = goal.y - w.pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 3) {
      this.sim.input.moveX = 0;
      this.sim.input.moveY = 0;
    } else {
      this.sim.input.moveX = dx / len;
      this.sim.input.moveY = dy / len;
    }

    // Use the action button the way a player would: Trail whenever it is off
    // cooldown at night, Drum to get mounted for the daily haul.
    const action = currentAction(this.sim);
    this.sim.input.actionPressed = false;
    if (action === 'trail' && st.trailCooldownUntil <= st.time) {
      this.sim.input.actionPressed = true;
    } else if (action === 'drum' && st.phase === 'day' && this.drumCooldown <= st.time) {
      this.drumCooldown = st.time + 3;
      this.sim.input.actionPressed = true;
    }
    void stack;
  }

  private chooseGoal(pad: Pad | null | undefined): { x: number; y: number } {
    const st = this.sim.state;
    const stack = st.warden.stack;

    // At night, holding the line comes before hauling. Stand off at spray range
    // rather than walking into mandibles: facing follows aim, not movement.
    if (st.phase === 'night') {
      const threat = this.nearestThreatToBrood();
      if (threat) {
        const dx = threat.x - BROOD_POS.x;
        const dy = threat.y - BROOD_POS.y;
        const len = Math.hypot(dx, dy) || 1;
        const standoff = WARDEN.range * 0.7;
        this.standing.x = threat.x - (dx / len) * standoff;
        this.standing.y = threat.y - (dy / len) * standoff;
        return this.standing;
      }
    }

    // Full intermediates convert first: they block nothing else and pay well.
    if (stack.honeydew >= STACK.capacity.honeydew) return this.padPos('nectarVat');
    if (stack.leaf >= STACK.capacity.leaf) return this.padPos('fungusGarden');

    // Patch the colony before expanding once something is badly hurt.
    const brood = structureAt(st, 'brood');
    const hurt = brood ? brood.hp / brood.maxHp : 1;
    if (hurt < 0.7 && stack.sugar >= 14) return this.padPos('mortar');

    const carrying = stack.sugar;
    const cap = STACK.capacity.sugar;
    const needed = pad ? pad.cost - pad.paid : 0;

    // Carrying enough to make progress: go spend it.
    if (pad && carrying >= Math.min(needed, cap * 0.8)) return pad.pos;

    // Otherwise sweep. Night drops rot in 25 s, so they come first.
    const pickup = this.nearestPickup();
    if (pickup) return pickup;

    // Nothing to sweep: park on the pad so partial payments keep accruing, or
    // wait by the roots and pens where the next income appears.
    if (pad && carrying > 0) return pad.pos;
    if (st.phase === 'day') {
      return stack.leaf < STACK.capacity.leaf ? ROOT_FRINGE : this.padPos('aphidA');
    }
    return BROOD_POS;
  }

  /** The invader closest to the brood, if any are close enough to matter. */
  private nearestThreatToBrood(): { x: number; y: number } | null {
    const st = this.sim.state;
    let best: { x: number; y: number } | null = null;
    let bestDist = 700 * 700;
    for (const inv of st.invaders) {
      if (!inv.alive) continue;
      const d = (inv.pos.x - BROOD_POS.x) ** 2 + (inv.pos.y - BROOD_POS.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = inv.pos;
      }
    }
    return best;
  }

  private padPos(site: SiteId): { x: number; y: number } {
    const pad = this.sim.state.pads.find((p) => p.id === site);
    return pad ? pad.pos : BROOD_POS;
  }

  private nearestPickup(): { x: number; y: number } | null {
    const st = this.sim.state;
    const w = st.warden;
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const p of st.pickups) {
      if (!p.alive) continue;
      if (p.kind === 'sugar' && stackFull(this.sim, 'sugar')) continue;
      if (p.kind !== 'sugar' && stackFull(this.sim, p.kind)) continue;
      const d = (p.pos.x - w.pos.x) ** 2 + (p.pos.y - w.pos.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p.pos;
      }
    }
    return best;
  }
}

function stackFull(sim: Sim, kind: 'sugar' | 'honeydew' | 'leaf'): boolean {
  const stack = sim.state.warden.stack;
  const cap = kind === 'sugar' ? STACK.capacity.sugar : STACK.capacity[kind];
  return stack[kind] >= cap;
}
