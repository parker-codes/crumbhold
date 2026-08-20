import type { BuildableKind, InvaderKind } from './balance';
import type { SiteId } from './gallery';

export interface Vec2 {
  x: number;
  y: number;
}

export type ResourceKind = 'sugar' | 'honeydew' | 'leaf';
export type Phase = 'title' | 'day' | 'night' | 'resolve' | 'win' | 'lose';

/** One rendered item in a carry column, with its own settle spring. */
export interface StackItem {
  kind: ResourceKind;
  /** Vertical offset from the item's resting height, driven by the spring. */
  springY: number;
  springV: number;
  wobble: number;
}

export interface Stack {
  sugar: number;
  honeydew: number;
  leaf: number;
  lastNonSugar: 'honeydew' | 'leaf' | null;
  /** Column 0 is always sugar; column 1 is the most recent other resource. */
  columns: [StackItem[], StackItem[]];
  /** Lag-follow anchor in world space, so the stack sways when she turns. */
  anchor: Vec2;
  fullFlash: number;
}

export interface Warden {
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  facing: number;
  aim: number;
  hp: number;
  maxHp: number;
  lastDamagedAt: number;
  invulnUntil: number;
  mounted: boolean;
  knockedUntil: number;
  dragFrom: Vec2;
  attackCooldown: number;
  gaitPhase: number;
  antenna: [Vec2, Vec2];
  targetId: number;
  stack: Stack;
}

export interface Beetle {
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  facing: number;
  owned: boolean;
  /** Scuttling toward the Warden after a Drum. */
  summoned: boolean;
  gaitPhase: number;
}

export interface Invader {
  id: number;
  kind: InvaderKind;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  hp: number;
  maxHp: number;
  damage: number;
  lane: 0 | 1 | 2;
  waypointIndex: number;
  laneOffset: number;
  targetType: 'waypoint' | 'structure' | 'warden' | 'major';
  targetId: number;
  retargetAt: number;
  attackCooldown: number;
  facing: number;
  gaitPhase: number;
  flash: number;
  burstTimer: number;
  bursting: boolean;
  curledUntil: number;
  hasSummoned: boolean;
  /** Spiderlings drop nothing. */
  noDrop: boolean;
  alive: boolean;
}

export interface Major {
  id: number;
  siteId: SiteId;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  hp: number;
  maxHp: number;
  damage: number;
  interval: number;
  attackCooldown: number;
  facing: number;
  gaitPhase: number;
  flash: number;
  marker: Vec2;
  /** Set while a Trail is pulling this major to the Warden. */
  trailedUntil: number;
  targetId: number;
  alive: boolean;
}

export interface Structure {
  id: number;
  site: SiteId;
  kind: BuildableKind;
  tier: number;
  hp: number;
  maxHp: number;
  pos: Vec2;
  /** Equals tier; drives the light pool count. */
  glowcaps: number;
  attackCooldown: number;
  targetId: number;
  /** Rise-out-of-the-floor animation clock, counts up to FX.structureRiseDuration. */
  riseT: number;
  flash: number;
}

export type PadKind = 'build' | 'convert' | 'repair' | 'produce';
export type PadState = 'locked' | 'available' | 'charging' | 'complete';

export interface Pad {
  id: SiteId;
  kind: PadKind;
  buildable: BuildableKind;
  pos: Vec2;
  radius: number;
  label: string;
  /** Tier this pad would build next; 0 when maxed. */
  targetTier: number;
  cost: number;
  paid: number;
  state: PadState;
  unlockBroodTier: number;
  /** Rises with the fill so the pad tick can be pitched. */
  tickAccum: number;
  ringFlash: number;
  shortfallFlash: number;
}

export interface Pickup {
  id: number;
  kind: ResourceKind;
  value: number;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  z: number;
  bornAt: number;
  /** null during the day: floor sugar never expires before dark. */
  expiresAt: number | null;
  magnetT: number;
  fromX: number;
  fromY: number;
  alive: boolean;
}

export interface Projectile {
  id: number;
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  damage: number;
  life: number;
  /** Remaining pierce count; 0 means it stops on first hit. */
  pierce: number;
  hitIds: number[];
  friendly: boolean;
  aoeRadius: number;
  alive: boolean;
}

export interface Particle {
  pos: Vec2;
  vel: Vec2;
  z: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  alive: boolean;
}

export interface AphidPen {
  siteId: SiteId;
  timer: number;
  onFloor: number;
}

export interface Root {
  pos: Vec2;
  /** 0 means cut and regrowing. */
  grown: boolean;
  regrowAt: number;
  cutProgress: number;
}

export interface SpawnOrder {
  at: number;
  kind: InvaderKind;
  lane: 0 | 1 | 2;
  subWave: number;
}

export interface RunStats {
  sugarEarned: number;
  sugarSpent: number;
  /** Total sugar value that fell as drops, collected or not. Balance ledger. */
  sugarDropped: number;
  /** Total sugar produced by the two conversion pads. Balance ledger. */
  sugarConverted: number;
  invadersKilled: number;
  knockdowns: number;
  nightsHeld: number;
}

export interface NightTally {
  collected: number;
  /** Everything that fell this night, whether or not she reached it. */
  dropped: number;
  hoardMultiplier: number;
  earlyBonus: number;
  broodBonus: number;
  total: number;
}

export interface RunState {
  seed: number;
  phase: Phase;
  night: number;
  /** Sim clock in seconds since the run began. Every timestamp uses it. */
  time: number;
  phaseStartedAt: number;
  phaseDuration: number;

  warden: Warden;
  beetle: Beetle;
  structures: Structure[];
  pads: Pad[];
  invaders: Invader[];
  majors: Major[];
  pickups: Pickup[];
  projectiles: Projectile[];

  aphids: AphidPen[];
  roots: Root[];

  spawnQueue: SpawnOrder[];
  spawnCursor: number;
  subWaveCount: number;
  spawnWindow: number;

  sugarEarnedThisNight: number;
  sugarDroppedThisNight: number;
  earlyReady: boolean;
  /** Set on continuing past night 12, which disables the win check. */
  endless: boolean;
  tally: NightTally | null;
  trailUntil: number;
  trailCooldownUntil: number;

  nextEntityId: number;
  stats: RunStats;
  /** Set when the Brood Chamber falls, read by the lose overlay. */
  loseNight: number;
}

export interface Settings {
  audio: boolean;
  hudScale: number;
  highContrast: boolean;
  nightBrightness: number;
  damageNumbers: boolean;
}

export interface SaveFile {
  version: 1;
  royalJelly: number;
  traits: Record<string, number>;
  bestNight: number;
  runs: number;
  settings: Settings;
  activeRun: RunState | null;
}
