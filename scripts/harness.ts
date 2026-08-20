import { SIM_DT } from '../src/engine/loop';
import { TIME } from '../src/game/balance';
import { applyPurchase, glowcapCount, maxTier, structureAt } from '../src/game/state';
import { Sim } from '../src/game/sim';
import { step } from '../src/game/step';
import { threatBudget } from '../src/game/waves';
import { Bot, type Strategy } from './bot';

/**
 * Headless balance harness. This is the tool that makes section 10 real rather
 * than aspirational: run it across many seeds for distributions, not anecdotes.
 *
 *   bun run sim -- --seed 1 --nights 12 --strategy balanced
 *   bun run sim -- --seeds 50 --strategy balanced --quiet
 */

interface NightRow {
  night: number;
  threat: number;
  dropped: number;
  hoard: number;
  earned: number;
  spent: number;
  tally: number;
  structures: number;
  glowcaps: number;
  broodHp: number;
  broodMax: number;
}

export interface RunResult {
  seed: number;
  strategy: Strategy;
  nightsHeld: number;
  passed: boolean;
  totalEarned: number;
  totalSpent: number;
  converted: number;
  /**
   * Bot-independent economy ceiling, built the way section 10.6 models it: 90
   * percent of everything that fell, through that night's spoilage reduction,
   * plus conversion income. This is the number section 10.8's invariant is about.
   */
  ceiling: number;
  rows: NightRow[];
}

/**
 * Long enough that a slow night resolves normally. Only reachable when
 * `--invuln` keeps the Brood Chamber alive against defences that cannot kill.
 */
const MAX_STEPS_PER_PHASE = 60 * 600;
const NIGHT_GRACE_SECONDS = 45;

export function runHeadless(
  seed: number,
  nights: number,
  strategy: Strategy,
  invulnerable = false,
  prebuild = 0,
): RunResult {
  const sim = new Sim(seed);
  sim.invulnerable = invulnerable;
  if (prebuild > 0) prebuildColony(sim, prebuild);
  const bot = new Bot(sim, strategy);
  const rows: NightRow[] = [];
  let lastSpent = 0;

  for (let night = 1; night <= nights; night++) {
    // Day.
    let guard = 0;
    while (sim.state.phase === 'day' && guard++ < MAX_STEPS_PER_PHASE) {
      bot.think();
      step(sim, SIM_DT);
    }
    // Night. With `--invuln` the Brood Chamber cannot fall, so a colony too weak
    // to finish a wave would siege it forever. Sweep the survivors once the wave
    // has had its window plus a grace period: that is the ceiling a player who
    // could kill them would have collected.
    guard = 0;
    const nightCap = sim.state.spawnWindow + NIGHT_GRACE_SECONDS;
    while (sim.state.phase === 'night' && guard++ < MAX_STEPS_PER_PHASE) {
      bot.think();
      step(sim, SIM_DT);
      if (invulnerable && sim.state.time - sim.state.phaseStartedAt > nightCap) {
        for (const inv of [...sim.state.invaders]) sim.killInvader(inv);
      }
    }
    if (sim.state.phase === 'lose') break;

    const brood = structureAt(sim.state, 'brood');
    rows.push({
      night,
      threat: threatBudget(night),
      dropped: Math.round(sim.state.tally?.dropped ?? 0),
      hoard: sim.state.tally?.hoardMultiplier ?? 1,
      earned: Math.round(sim.state.tally?.collected ?? 0),
      spent: Math.round(sim.state.stats.sugarSpent - lastSpent),
      tally: Math.round(sim.state.tally?.total ?? 0),
      structures: sim.state.structures.length,
      glowcaps: glowcapCount(sim.state),
      broodHp: Math.round(brood?.hp ?? 0),
      broodMax: brood?.maxHp ?? 0,
    });
    lastSpent = sim.state.stats.sugarSpent;

    // Resolve.
    guard = 0;
    while (sim.state.phase === 'resolve' && guard++ < MAX_STEPS_PER_PHASE) {
      step(sim, SIM_DT);
    }
    if (sim.state.phase === 'win') break;
    if (guard >= MAX_STEPS_PER_PHASE) {
      console.warn(`night ${night} did not resolve within the step guard`);
      break;
    }
  }

  let ceiling = sim.state.stats.sugarConverted;
  for (const row of rows) ceiling += row.dropped * 0.9 * row.hoard;

  return {
    seed,
    strategy,
    ceiling: Math.round(ceiling),
    nightsHeld: sim.state.stats.nightsHeld,
    passed: sim.state.stats.nightsHeld >= nights,
    converted: Math.round(sim.state.stats.sugarConverted),
    totalEarned: Math.round(sim.state.stats.sugarEarned),
    totalSpent: Math.round(sim.state.stats.sugarSpent),
    rows,
  };
}

/**
 * Grants a colony up to `tier` everywhere, free. This answers guardrail three
 * from section 10.9 on its own: does a built-out colony reach night 12 bruised
 * rather than untouched?
 */
function prebuildColony(sim: Sim, tier: number): void {
  for (const pad of sim.state.pads) {
    if (pad.kind === 'repair') continue;
    let guard = 0;
    while (
      pad.targetTier > 0 &&
      pad.targetTier <= Math.min(tier, maxTier(pad.buildable)) &&
      guard++ < 6
    ) {
      pad.paid = pad.cost;
      applyPurchase(sim.state, pad);
    }
  }
  sim.state.stats.sugarSpent = 0;
}

function parseArgs(argv: string[]): {
  seed: number; seeds: number; nights: number; strategy: Strategy;
  quiet: boolean; invuln: boolean; prebuild: number;
} {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(`--${flag}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    invuln: argv.includes('--invuln'),
    prebuild: Number(get('prebuild') ?? 0),
    seed: Number(get('seed') ?? 1),
    seeds: Number(get('seeds') ?? 1),
    nights: Number(get('nights') ?? TIME.nightsPerRun),
    strategy: (get('strategy') ?? 'balanced') as Strategy,
    quiet: argv.includes('--quiet'),
  };
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const results: RunResult[] = [];
  for (let i = 0; i < args.seeds; i++) {
    results.push(
      runHeadless(args.seed + i, args.nights, args.strategy, args.invuln, args.prebuild),
    );
  }

  if (!args.quiet) {
    const first = results[0];
    console.log(`\nCrumbhold harness  strategy=${first.strategy}  seed=${first.seed}  nights=${args.nights}\n`);
    console.log('night threat   fell  swept  tally  spent  built caps      brood');
    for (const row of first.rows) {
      const hp = row.broodMax > 0 ? `${row.broodHp}/${row.broodMax}` : '-';
      console.log(
        [
          pad(row.night, 5), pad(row.threat, 6), pad(row.dropped, 6),
          pad(row.earned, 6), pad(row.tally, 6), pad(row.spent, 6),
          pad(row.structures, 6), pad(row.glowcaps, 4), pad(hp, 10),
        ].join(' '),
      );
    }
  }

  const held = results.map((r) => r.nightsHeld).sort((a, b) => a - b);
  const cleared = results.filter((r) => r.passed).length;
  const earned = results.map((r) => r.totalEarned);
  const mean = earned.reduce((a, b) => a + b, 0) / earned.length;
  console.log(
    `\n${results.length} run(s)  cleared ${cleared}/${results.length}` +
    `  nights held min ${held[0]} median ${held[held.length >> 1]} max ${held[held.length - 1]}` +
    `  mean sugar earned ${Math.round(mean)}`,
  );
  // Section 10.8: earnable sugar against the full build cost.
  const fullBuild = 6355;
  const ceilings = results.map((r) => r.ceiling);
  const ceilingMean = ceilings.reduce((a, b) => a + b, 0) / ceilings.length;
  const convMean = results.reduce((a, r) => a + r.converted, 0) / results.length;
  console.log(
    `economy ceiling (90 percent of drops, through spoilage, plus conversions): ` +
    `${Math.round(ceilingMean)} sugar  (${Math.round(convMean)} of it converted)`,
  );
  console.log(
    `invariant: ${((ceilingMean / fullBuild) * 100).toFixed(0)} percent of the ` +
    `${fullBuild} full build cost (target 75 to 85)\n`,
  );
}

main();
