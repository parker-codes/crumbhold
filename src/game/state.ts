import {
  BUILD, ECONOMY, STACK, TIME, WARDEN,
  type BuildableKind,
} from './balance';
import {
  BROOD_POS, ROOT_POSITIONS, SITES, SITE_BY_ID, type SiteId,
} from './gallery';
import type {
  Beetle, Pad, ResourceKind, RunState, Stack, Structure, Warden as WardenState,
} from './types';

type TierRow = { cost: number; hp: number } & Record<string, number>;

/** Tier rows for a buildable. Index 0 is tier 1. */
export function tiers(kind: BuildableKind): readonly TierRow[] {
  return BUILD[kind].tiers as unknown as readonly TierRow[];
}

export function tierRow(kind: BuildableKind, tier: number): TierRow {
  const rows = tiers(kind);
  return rows[Math.max(0, Math.min(rows.length, tier) - 1)];
}

export function maxTier(kind: BuildableKind): number {
  return tiers(kind).length;
}

/** Buildables the colony already owns at tier 1 when the run starts. */
const OWNED_AT_START: readonly BuildableKind[] = [
  'broodChamber',
  'nectarVat',
  'fungusGarden',
  'aphidPen',
  'mortarPile',
];

function makeStack(): Stack {
  return {
    sugar: ECONOMY.startingSugar,
    honeydew: 0,
    leaf: 0,
    lastNonSugar: null,
    columns: [[], []],
    anchor: { x: BROOD_POS.x, y: BROOD_POS.y },
    fullFlash: 0,
  };
}

function makeWarden(): WardenState {
  const pos = { x: BROOD_POS.x - 110, y: BROOD_POS.y + 40 };
  return {
    pos: { ...pos },
    prev: { ...pos },
    vel: { x: 0, y: 0 },
    facing: -Math.PI / 2,
    aim: -Math.PI / 2,
    hp: WARDEN.hp,
    maxHp: WARDEN.hp,
    lastDamagedAt: -999,
    invulnUntil: 0,
    mounted: false,
    knockedUntil: 0,
    dragFrom: { ...pos },
    attackCooldown: 0,
    gaitPhase: 0,
    antenna: [
      { x: pos.x, y: pos.y },
      { x: pos.x, y: pos.y },
    ],
    targetId: -1,
    stack: makeStack(),
  };
}

function makeBeetle(): Beetle {
  const site = SITE_BY_ID.paddock;
  return {
    pos: { x: site.x - 40, y: site.y + 40 },
    prev: { x: site.x - 40, y: site.y + 40 },
    vel: { x: 0, y: 0 },
    facing: 0,
    owned: false,
    summoned: false,
    gaitPhase: 0,
  };
}

function makeStructure(id: number, siteId: SiteId, tier: number): Structure {
  const site = SITE_BY_ID[siteId];
  const row = tierRow(site.kind, tier);
  return {
    id,
    site: siteId,
    kind: site.kind,
    tier,
    hp: row.hp,
    maxHp: row.hp,
    pos: { x: site.x, y: site.y },
    glowcaps: tier,
    attackCooldown: 0,
    targetId: -1,
    riseT: 999,
    flash: 0,
  };
}

function padKindFor(kind: BuildableKind): Pad['kind'] {
  if (kind === 'mortarPile') return 'repair';
  if (kind === 'nectarVat' || kind === 'fungusGarden') return 'convert';
  return 'build';
}

function makePad(siteId: SiteId, currentTier: number): Pad {
  const site = SITE_BY_ID[siteId];
  const next = currentTier + 1;
  const capped = next > maxTier(site.kind);
  return {
    id: siteId,
    kind: padKindFor(site.kind),
    buildable: site.kind,
    pos: { x: site.x, y: site.y },
    radius: site.radius,
    label: site.label,
    targetTier: capped ? 0 : next,
    cost: capped ? 0 : tierRow(site.kind, next).cost,
    paid: 0,
    state: 'available',
    unlockBroodTier: site.unlockBroodTier ?? 0,
    tickAccum: 0,
    ringFlash: 0,
    shortfallFlash: 0,
  };
}

export function createRun(seed: number): RunState {
  let nextEntityId = 1;
  const structures: Structure[] = [];
  for (const site of SITES) {
    if (OWNED_AT_START.includes(site.kind)) {
      structures.push(makeStructure(nextEntityId++, site.id, 1));
    }
  }
  const pads: Pad[] = SITES.map((site) => {
    const owned = structures.find((s) => s.site === site.id);
    return makePad(site.id, owned ? owned.tier : 0);
  });

  const state: RunState = {
    seed,
    phase: 'day',
    night: 1,
    time: 0,
    phaseStartedAt: 0,
    phaseDuration: TIME.dayDuration,

    warden: makeWarden(),
    beetle: makeBeetle(),
    structures,
    pads,
    invaders: [],
    majors: [],
    pickups: [],
    projectiles: [],

    aphids: [
      { siteId: 'aphidA', timer: 0, onFloor: 0 },
      { siteId: 'aphidB', timer: 0, onFloor: 0 },
    ],
    roots: ROOT_POSITIONS.map((p) => ({
      pos: { ...p },
      grown: true,
      regrowAt: 0,
      cutProgress: 0,
    })),

    spawnQueue: [],
    spawnCursor: 0,
    subWaveCount: 0,
    spawnWindow: 0,

    sugarEarnedThisNight: 0,
    sugarDroppedThisNight: 0,
    earlyReady: false,
    endless: false,
    tally: null,
    trailUntil: 0,
    trailCooldownUntil: 0,

    nextEntityId,
    stats: {
      sugarEarned: 0,
      sugarSpent: 0,
      sugarDropped: 0,
      sugarConverted: 0,
      invadersKilled: 0,
      knockdowns: 0,
      nightsHeld: 0,
    },
    loseNight: 0,
  };
  refreshPadStates(state);
  return state;
}

/** Glowcaps track live tiers: a breached structure goes dark until patched. */
export function syncGlowcaps(s: Structure): void {
  s.glowcaps = s.hp > 0 ? s.tier : 0;
}

export function structureAt(state: RunState, siteId: SiteId): Structure | undefined {
  for (const s of state.structures) if (s.site === siteId) return s;
  return undefined;
}

export function tierOf(state: RunState, siteId: SiteId): number {
  return structureAt(state, siteId)?.tier ?? 0;
}

export function broodTier(state: RunState): number {
  return tierOf(state, 'brood');
}

/** Re-derive lock and completion state after any tier change. */
export function refreshPadStates(state: RunState): void {
  const brood = broodTier(state);
  for (const pad of state.pads) {
    if (pad.kind === 'repair') {
      pad.state = 'available';
      continue;
    }
    const tier = tierOf(state, pad.id);
    const next = tier + 1;
    if (next > maxTier(pad.buildable)) {
      pad.targetTier = 0;
      pad.cost = 0;
      pad.paid = 0;
      // Conversion pads keep working at max tier; build pads read as complete.
      pad.state = pad.kind === 'convert' ? 'available' : 'complete';
      continue;
    }
    pad.targetTier = next;
    pad.cost = tierRow(pad.buildable, next).cost;
    if (pad.unlockBroodTier > brood) {
      pad.state = 'locked';
      continue;
    }
    pad.state = pad.paid > 0 ? 'charging' : 'available';
  }
}

/** Applies a completed purchase: raises the tier, or creates the structure. */
export function applyPurchase(state: RunState, pad: Pad): Structure {
  const existing = structureAt(state, pad.id);
  const tier = pad.targetTier;
  const row = tierRow(pad.buildable, tier);
  let structure: Structure;
  if (existing) {
    const missing = existing.maxHp - existing.hp;
    existing.tier = tier;
    existing.maxHp = row.hp;
    // Upgrades restore the tier's HP gain but keep accumulated damage.
    existing.hp = Math.max(1, row.hp - missing);
    existing.riseT = 0;
    syncGlowcaps(existing);
    structure = existing;
  } else {
    structure = makeStructure(state.nextEntityId++, pad.id, tier);
    structure.riseT = 0;
    state.structures.push(structure);
  }
  if (pad.buildable === 'paddock') state.beetle.owned = true;
  pad.paid = 0;
  refreshPadStates(state);
  return structure;
}

export function sugarCapacity(state: RunState): number {
  const paddock = tierOf(state, 'paddock');
  const bonus = state.warden.mounted && paddock >= 2 ? tierRow('paddock', 2).sugarCap : 0;
  return STACK.capacity.sugar + bonus;
}

export function capacityFor(state: RunState, kind: ResourceKind): number {
  if (kind === 'sugar') return sugarCapacity(state);
  return kind === 'honeydew' ? STACK.capacity.honeydew : STACK.capacity.leaf;
}

export function hoardMultiplier(state: RunState): number {
  const tier = tierOf(state, 'hoard');
  return tier === 0 ? 1 : tierRow('hoard', tier).multiplier;
}

export function wardenAttack(state: RunState): { damage: number; interval: number } {
  const tier = tierOf(state, 'venomWell');
  const base = tier === 0
    ? { damage: WARDEN.damage, interval: WARDEN.interval }
    : { damage: tierRow('venomWell', tier).damage, interval: tierRow('venomWell', tier).interval };
  return state.warden.mounted
    ? { damage: base.damage, interval: base.interval * WARDEN.mountedIntervalScale }
    : base;
}

export function beetleStats(state: RunState): { speed: number; horn: number } {
  const tier = Math.max(1, tierOf(state, 'paddock'));
  const row = tierRow('paddock', tier);
  return { speed: row.speed, horn: row.horn };
}

/** Total glowcaps across the colony: the passive progress readout. */
export function glowcapCount(state: RunState): number {
  let total = 0;
  for (const s of state.structures) total += s.glowcaps;
  return total;
}

export function nightSpawnWindow(night: number): number {
  return Math.min(
    TIME.spawnWindowMax,
    TIME.spawnWindowBase + TIME.spawnWindowPerNight * night,
  );
}
