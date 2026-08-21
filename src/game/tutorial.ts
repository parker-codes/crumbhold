import { isTouchInput } from '../engine/inputKind';
import { TIME } from './balance';
import { BROOD_POS, ROOT_FRINGE, SITE_BY_ID, type SiteId } from './gallery';
import { structureAt, tierOf } from './state';
import { startNight } from './systems/phase';
import type { Sim } from './sim';
import type { SpawnOrder } from './types';

/**
 * A guided run. Every step drives the real systems: the same pads, the same
 * carry cap, the same spawn queue. Nothing here is a mock-up, so the tutorial
 * cannot teach something the game does not do.
 *
 * Three things are held rather than faked. The day clock is parked so a lesson
 * is never cut off mid-sentence; the Brood Chamber is invulnerable so a first
 * night cannot end the tutorial; and the one scripted night writes its own
 * spawn queue instead of the night-1 roster, so the wave is small and always the
 * same. Everything else is the game.
 */

/** A world point the trail can aim at, whether or not a pad sits there. */
export interface TrailTarget {
  x: number;
  y: number;
}

export interface TutorialStep {
  /** Chapter label above the instruction, e.g. `GATHER`. */
  chapter: string;
  /** What to do, in the imperative. One sentence. */
  instruction: string;
  /**
   * Why it matters, or the number behind it. One sentence. A function where the
   * line depends on the device, so a phone is never told about a key it has not
   * got.
   */
  detail: string | (() => string);
  /** Where the pheromone trail points. */
  target?: SiteId | TrailTarget;
  /**
   * A moving target, resolved every frame. Used where the thing to walk to is
   * not a fixed site — the loot on the floor moves as it is collected, and a
   * trail aimed at the middle of the room would point at nothing.
   */
  aim?(sim: Sim): TrailTarget | null;
  /** Runs once when the step opens. */
  enter?(sim: Sim, run: Tutorial): void;
  /**
   * True once the player has done it. A step without `done` is a read-and-
   * continue step and shows a Next button instead.
   */
  done?(sim: Sim, run: Tutorial): boolean;
  /**
   * Top up sugar at her feet while this step needs it. Build costs are real and
   * the carry cap is 25, so a 70 sugar Hoard is genuinely two trips — the point
   * is to teach that, not to make the player farm for it.
   */
  fund?: SiteId;
  /** This step drives the day clock itself, so the hold must let go. */
  ownsClock?: boolean;
}

const STEPS: readonly TutorialStep[] = [
  {
    chapter: 'Move',
    instruction: 'Follow the green trail to the Aphid Pen.',
    detail: () =>
      'You are the Warden. ' +
      (isTouchInput() ? 'Drag anywhere to walk.' : 'Drag the floor, or use WASD, to walk.') +
      ' The green trail always points at your next job.',
    target: 'aphidA',
    done: (sim) => atPad(sim, 'aphidA', 1.6),
  },
  {
    chapter: 'Gather',
    instruction: 'Wait here until you are carrying a honeydew droplet.',
    detail: 'Aphids give one droplet every 4 seconds. Anything on the floor near you jumps to you on its own, so there is no pickup button.',
    target: 'aphidA',
    done: (sim) => sim.state.warden.stack.honeydew >= 1,
  },
  {
    chapter: 'Spend',
    instruction: 'Stand on the Spitter Post pad until it finishes building.',
    detail: 'A Spitter Post sprays acid at one enemy at a time, on its own, forever. Standing on a pad pays for it; step off and whatever you paid stays there.',
    target: 'spitter1',
    fund: 'spitter1',
    done: (sim) => tierOf(sim.state, 'spitter1') >= 1,
  },
  {
    chapter: 'Convert',
    instruction: 'Carry your honeydew to the Nectar Vat.',
    detail: 'Honeydew buys nothing on its own. The vat trades each droplet for 8 sugar. Sugar is the only thing you spend.',
    target: 'nectarVat',
    enter: (sim, run) => run.mark('honeydewSugar', sim.state.stats.sugarConverted),
    done: (sim, run) => sim.state.stats.sugarConverted > run.marked('honeydewSugar'),
  },
  {
    chapter: 'Gather',
    instruction: 'Stand beside the hanging roots to cut a leaf scrap.',
    detail: 'You cut automatically, the way you attack. A cut root grows back, so you can come here again every day.',
    target: ROOT_FRINGE,
    done: (sim) => sim.state.warden.stack.leaf >= 1,
  },
  {
    chapter: 'Convert',
    instruction: 'Carry the leaf scraps to the Fungus Garden.',
    detail: 'The garden trades each leaf scrap for 10 sugar. If your sugar is already full, spend some first — a full stack cannot take any more.',
    target: 'fungusGarden',
    enter: (sim, run) => run.mark('leafSugar', sim.state.stats.sugarConverted),
    done: (sim, run) => sim.state.stats.sugarConverted > run.marked('leafSugar'),
  },
  {
    chapter: 'Defend',
    instruction: 'Build the Resin Barricade in the north tunnel.',
    detail: 'It blocks the tunnel. Mole crickets start arriving on night 5, and they ignore you completely and chew on your buildings instead. A barricade is what stops them.',
    target: 'barricadeN',
    fund: 'barricadeN',
    done: (sim) => tierOf(sim.state, 'barricadeN') >= 1,
  },
  {
    chapter: 'Defend',
    instruction: 'Build a Soldier Gallery.',
    detail: 'It hatches soldier ants that guard a spot near it. They respawn every night for the rest of the run at no extra cost, so buying one early pays off all game.',
    target: 'galleryA',
    fund: 'galleryA',
    done: (sim) => tierOf(sim.state, 'galleryA') >= 1,
  },
  {
    chapter: 'You',
    instruction: 'Build the Venom Well.',
    detail: 'This is the only upgrade for you, the Warden. It doubles your damage and makes you fire faster. Everything else you build defends the colony instead.',
    target: 'venomWell',
    fund: 'venomWell',
    done: (sim) => tierOf(sim.state, 'venomWell') >= 1,
  },
  {
    chapter: 'You',
    instruction: 'Build the Paddock, then press Mount to call the beetle.',
    detail: 'Ride the beetle to move faster, pick things up from further away, and carry more. You fire a little slower while riding, so it is for hauling.',
    target: 'paddock',
    fund: 'paddock',
    done: (sim) => sim.state.warden.mounted,
  },
  {
    chapter: 'Economy',
    instruction: 'Build the Hoard.',
    detail: 'It keeps more of what you gather each night: 1.25 times at level 1, then 1.5, then double. It multiplies every other income you have.',
    target: 'hoard',
    fund: 'hoard',
    done: (sim) => tierOf(sim.state, 'hoard') >= 1,
  },
  {
    chapter: 'Progress',
    instruction: 'Upgrade the Brood Chamber to level 2.',
    detail: 'Chamber levels expand the map. Level 2 adds a third Spitter site, level 3 the Acid Battery, level 4 a fourth Spitter. Locked pads show their requirement underneath.',
    target: 'brood',
    fund: 'brood',
    done: (sim) => tierOf(sim.state, 'brood') >= 2,
  },
  {
    chapter: 'The day',
    instruction: 'Press End day, at the top right, to start the night now.',
    detail: 'A real day lasts 45 seconds, and the band of daylight crossing the floor is your clock. Ending early gives you 15% more sugar for the night that follows.',
    ownsClock: true,
    enter: (sim) => {
      // Hand the clock back so the shaft sweeps and End day appears.
      sim.state.phaseDuration = TIME.dayDuration;
      sim.state.phaseStartedAt = sim.state.time;
    },
    done: (sim) => sim.state.phase !== 'day',
  },
  {
    chapter: 'The night',
    instruction: 'Hold the tunnel until the last invader falls.',
    detail: 'Every invader you kill drops sugar. The bar under the band is the chamber\u2019s health, the pips count the waves left, and arrows at the screen edge point at invaders you cannot see.',
    enter: (sim) => scriptFirstNight(sim),
    done: (sim) => sim.state.phase !== 'night',
  },
  {
    chapter: 'Collect',
    instruction: 'Pick up the sugar the invaders dropped.',
    detail: 'This is where most of your money comes from. Killing pays better than gathering, so clearing a night is also how you afford the next one.',
    aim: (sim) => nearestSugar(sim),
    enter: (sim, run) => {
      run.mark('collected', sim.state.stats.sugarEarned);
      ensureSpoils(sim);
    },
    done: (sim, run) => sim.state.stats.sugarEarned > run.marked('collected') + 1,
  },
  {
    chapter: 'Repair',
    instruction: 'Stand on the Mortar Pile to repair what got damaged.',
    detail: 'Damage stays until you pay to fix it, and the most damaged building is repaired first. A building knocked to zero stops working but is never lost \u2014 repair it and it comes back.',
    target: 'mortar',
    enter: (sim) => bruiseSomething(sim),
    fund: 'mortar',
    done: (sim) => sim.mortarUsed,
  },
  {
    chapter: 'Done',
    instruction: 'That is the whole game. Hold the Brood Chamber for twelve nights.',
    detail: 'You will only ever earn about 80% of what everything costs, so you cannot build it all. Choosing what to leave out is the game.',
  },
];

export class Tutorial {
  index = 0;
  /** True once the last step is acknowledged. */
  finished = false;
  /** The step whose `enter` has already run, so it runs exactly once. */
  entered = -1;

  private readonly marks = new Map<string, number>();
  private fundTimer = 0;

  get step(): TutorialStep {
    return STEPS[Math.min(this.index, STEPS.length - 1)];
  }

  get total(): number {
    return STEPS.length;
  }

  /** Where the trail should point, in world space, or null for no trail. */
  trail(sim: Sim): TrailTarget | null {
    const step = this.step;
    if (step.aim) return step.aim(sim);
    const target = step.target;
    if (!target) return null;
    if (typeof target !== 'string') return target;
    const pad = sim.state.pads.find((p) => p.id === target);
    return pad ? { x: pad.pos.x, y: pad.pos.y } : SITE_BY_ID[target] ?? null;
  }

  /** Remembers a baseline so a step can require a counter to move. */
  mark(key: string, value: number): void {
    this.marks.set(key, value);
  }

  marked(key: string): number {
    return this.marks.get(key) ?? 0;
  }

  advance(): void {
    if (this.index >= STEPS.length - 1) {
      this.finished = true;
      return;
    }
    this.index++;
  }

  skip(): void {
    this.advance();
  }

  /** Funding drips rather than pours, so crystals never pile up at her feet. */
  fundingReady(dt: number): boolean {
    this.fundTimer -= dt;
    if (this.fundTimer > 0) return false;
    this.fundTimer = FUND_INTERVAL;
    return true;
  }
}

const FUND_INTERVAL = 1.2;

/**
 * Runs after `phase` so it sees the phase this frame settled on. Holds the day
 * open, keeps the chamber standing, opens each step once, and tops up sugar for
 * the step that needs it.
 */
export function tutorial(sim: Sim, dt: number): void {
  const run = sim.tutorial;
  if (!run) return;
  if (run.finished) {
    // Hand the cheat switch back here as well as on the way out, so no path can
    // leave a real run invulnerable.
    sim.invulnerable = false;
    return;
  }
  const st = sim.state;

  // Nothing in a tutorial should be able to end it.
  sim.invulnerable = true;

  const step = run.step;

  if (run.entered !== run.index) {
    run.entered = run.index;
    step.enter?.(sim, run);
  }

  // Park the day clock, except on the step that hands it back on purpose.
  if (!step.ownsClock && st.phase === 'day' && st.phaseDuration < HELD_DAY * 0.5) {
    holdDay(sim);
  }

  if (step.fund && run.fundingReady(dt)) fund(sim, step.fund);

  if (step.done?.(sim, run)) run.advance();
}

/** A day long enough that no lesson is ever cut off by nightfall. */
const HELD_DAY = 1e6;

function holdDay(sim: Sim): void {
  sim.state.phaseDuration = HELD_DAY;
  sim.state.phaseStartedAt = sim.state.time;
  sim.shaftT = 0.32;
}

function atPad(sim: Sim, id: SiteId, slack: number): boolean {
  const pad = sim.state.pads.find((p) => p.id === id);
  if (!pad) return false;
  const w = sim.state.warden.pos;
  const reach = pad.radius * slack;
  return (w.x - pad.pos.x) ** 2 + (w.y - pad.pos.y) ** 2 <= reach * reach;
}

/**
 * Drops crystals at her feet while the named pad still wants sugar and she is
 * nearly empty. Real cost, real carry cap, real part-payment across visits — the
 * only thing removed is the farming.
 */
function fund(sim: Sim, id: SiteId): void {
  const st = sim.state;
  const pad = st.pads.find((p) => p.id === id);
  if (!pad) return;
  const owed = id === 'mortar' ? 20 : Math.max(0, pad.cost - pad.paid);
  if (owed <= 0) return;
  if (st.warden.stack.sugar >= Math.min(10, owed)) return;
  const w = st.warden.pos;
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const p = sim.spawnPickup('sugar', w.x + Math.cos(angle) * 46, w.y + Math.sin(angle) * 46, 5);
    if (p) p.expiresAt = null;
  }
}

/**
 * The one scripted wave. Small, always the same, and released through the normal
 * spawn queue so it behaves exactly like a real night. One mole cricket, because
 * the barricade the player just built is the reason it exists.
 */
function scriptFirstNight(sim: Sim): void {
  if (sim.state.phase !== 'night') startNight(sim);
  const st = sim.state;
  const orders: SpawnOrder[] = [
    { at: 0.5, kind: 'raiderAnt', lane: 0, subWave: 0 },
    { at: 1.6, kind: 'raiderAnt', lane: 0, subWave: 0 },
    { at: 3.0, kind: 'raiderAnt', lane: 0, subWave: 0 },
    { at: 6.0, kind: 'bombardier', lane: 0, subWave: 1 },
    { at: 7.4, kind: 'raiderAnt', lane: 0, subWave: 1 },
    { at: 10.0, kind: 'moleCricket', lane: 0, subWave: 2 },
    { at: 11.2, kind: 'raiderAnt', lane: 0, subWave: 2 },
  ];
  st.spawnQueue = orders;
  st.spawnCursor = 0;
  st.subWaveCount = 3;
  st.spawnWindow = 12;
}

/**
 * The collect lesson needs something to collect. Night drops expire and the
 * tally only scatters a bonus when the player banked something, so a player who
 * ignored the floor all night could arrive here to an empty room.
 */
function ensureSpoils(sim: Sim): void {
  const st = sim.state;
  let onFloor = 0;
  for (const p of st.pickups) if (p.alive && p.kind === 'sugar') onFloor++;
  if (onFloor >= 4) return;
  for (let i = onFloor; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    // Inside a short walk of the chamber, not ringed outside pickup range of it.
    const r = 60 + (i % 3) * 30;
    const p = sim.spawnPickup(
      'sugar',
      BROOD_POS.x + Math.cos(angle) * r,
      BROOD_POS.y + Math.sin(angle) * r,
      5,
    );
    if (p) p.expiresAt = null;
  }
}

/** The closest crystal still on the floor, so the trail follows the loot. */
function nearestSugar(sim: Sim): TrailTarget | null {
  const w = sim.state.warden.pos;
  let best: TrailTarget | null = null;
  let bestDist = Infinity;
  for (const p of sim.state.pickups) {
    if (!p.alive || p.kind !== 'sugar') continue;
    const d = (p.pos.x - w.x) ** 2 + (p.pos.y - w.y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = { x: p.pos.x, y: p.pos.y };
    }
  }
  return best;
}

/**
 * The repair lesson needs something to repair. The scripted cricket usually
 * leaves a mark on the barricade; if the player killed it early, put the mark
 * there anyway so the step is about the Mortar Pile and not about waiting.
 */
function bruiseSomething(sim: Sim): void {
  const st = sim.state;
  const damaged = st.structures.some((s) => s.hp < s.maxHp * 0.95);
  if (damaged) return;
  const target = structureAt(st, 'barricadeN') ?? structureAt(st, 'brood');
  if (!target) return;
  target.hp = Math.max(1, Math.round(target.maxHp * 0.45));
}
