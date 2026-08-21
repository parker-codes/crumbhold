/**
 * Every tunable number in the game. A literal appearing in a system file is a
 * bug (spec section 0). Frozen so accidental writes throw in strict mode.
 */

export type InvaderKind =
  | 'raiderAnt'
  | 'bombardier'
  | 'pillbug'
  | 'termite'
  | 'moleCricket'
  | 'tigerBeetle'
  | 'stagBeetle'
  | 'wolfSpider';

export type BuildableKind =
  | 'broodChamber'
  | 'barricade'
  | 'spitter'
  | 'battery'
  | 'gallery'
  | 'paddock'
  | 'venomWell'
  | 'hoard'
  | 'nectarVat'
  | 'fungusGarden'
  | 'aphidPen'
  | 'mortarPile';

export interface InvaderStats {
  hp: number;
  speed: number;
  damage: number;
  interval: number;
  /** 0 means melee; melee reach is `radius + MELEE_REACH`. */
  range: number;
  threat: number;
  drop: number;
  introNight: number;
  aggro: number;
  radius: number;
  /** Mole crickets never target the Warden or majors. */
  structuresOnly?: boolean;
  suicide?: boolean;
  aoeRadius?: number;
  knockback?: number;
  /** Tiger beetle stop-start locomotion. */
  burst?: { run: number; pause: number };
  /** Pillbug frontal damage reduction. */
  frontalArmor?: { arc: number; reduction: number };
  boss?: boolean;
  summonAtHpFraction?: number;
  summonCount?: number;
}

export interface SoundLayer {
  noise?: boolean;
  wave?: OscillatorType;
  freq: number;
  freqTo?: number;
  detune?: number;
  dur: number;
  attack?: number;
  gain: number;
  delay?: number;
  rate?: number;
  filter?: { type: BiquadFilterType; freq: number; freqTo?: number; q?: number };
}

export interface SoundDef {
  layers: SoundLayer[];
  /** Consecutive-play pitch ladder, in semitones. */
  ladder?: { resetAfter: number; cap: number };
}

export const WORLD = {
  width: 1440,
  height: 2160,
  /**
   * Vertical world units the viewport shows. Section 7 says "shorter axis", but
   * on a portrait phone that framing puts the Warden at 12 px and the carry
   * stack at 32 px, which breaks both the 24 px silhouette rule and the "read
   * your wealth from across the gallery" pillar. Fixing the vertical extent
   * satisfies both, and it is also what section 5 asks of landscape: widen the
   * viewport horizontally and letterbox.
   */
  viewUnits: 1120,
  cameraDeadZone: { x: 90, y: 140 },
  cameraLerp: 8,
  nightZoomOut: 0.12,
  nightZoomEase: 1.2,
  spatialCell: 128,
  laneConvergeRadius: 320,
} as const;

export const TIME = {
  dayDuration: 45,
  resolveDuration: 2.5,
  nightsPerRun: 12,
  earlyReadyBonus: 0.15,
  spawnWindowBase: 25,
  spawnWindowPerNight: 4,
  spawnWindowMax: 75,
  paletteCrossFade: 1.2,
} as const;

export const WARDEN = {
  radius: 18,
  speed: 210,
  speedMounted: 380,
  accel: 1400,
  decel: 1800,
  hp: 100,
  regenPerSecond: 2,
  regenDelay: 3,
  damage: 12,
  interval: 0.55,
  range: 260,
  projectileSpeed: 700,
  /** Retarget hysteresis: keep the target until it leaves range + this. */
  targetHysteresis: 40,
  mountedIntervalScale: 1.15,
  knockdownDuration: 4,
  knockdownDropFraction: 0.5,
  reviveHpFraction: 0.6,
  reviveInvuln: 1.5,
  dragDuration: 1.5,
  turnRate: 14,
  /** Antennae lag-follow rate. Section 12: reuse one offset-lerp for both. */
  antennaRate: 9,
} as const;

export const BEETLE = {
  drumSpeed: 500,
  mountRadius: 34,
  hornCooldownPerTarget: 0.8,
  hornRadius: 40,
  tossImpulse: 260,
} as const;

export const STACK = {
  drainRate: 14,
  maxColumnItems: 10,
  columnHeightCap: 96,
  itemSpring: 0.12,
  followRate: 14,
  magnetRadius: 70,
  magnetRadiusMounted: 110,
  magnetFlightTime: 0.25,
  nightPickupLifetime: 25,
  pickupFlashLast: 5,
  conversionItemsPerSecond: 2,
  /** Spending pauses this long after a purchase completes, so a player can
   *  step off a pad without buying into the next tier by accident. */
  payGrace: 1,
  capacity: { sugar: 25, honeydew: 6, leaf: 5 },
  /** Settle spring for a landing item: stiff and well damped, 0.12 s overshoot. */
  springStiffness: 340,
  springDamping: 15,
  /** One audible tick per this much sugar drained, so the ladder stays musical. */
  tickPerSugar: 1 / 3,
  /** Pad tick pitch spans this many semitones across a full ring. */
  padSemitoneRange: 12,
} as const;

export const ECONOMY = {
  startingSugar: 25,
  /**
   * Section 10.8 invariant fix. The harness reproduces the spec's own 61 to 72
   * percent baseline at 1.0; 1.3 lands a 12 night run at 78 to 82 percent of the
   * full build cost, which is the band section 3 asks us to protect. Raised here
   * rather than cutting build costs, so nights feel more rewarding instead of
   * structures feeling cheap.
   */
  dropMultiplier: 1.4,
  mortarHpPerSugar: 8,
  aphidFloorCapT1: 6,
  aphidFloorCapT2: 8,
  rootRegrow: 25,
  rootCount: 5,
  rootCutInterval: 0.9,
  broodTier5NightlyBonus: 40,
} as const;

export const INVADERS: Readonly<Record<InvaderKind, InvaderStats>> = Object.freeze({
  raiderAnt: {
    hp: 30, speed: 70, damage: 6, interval: 1.0, range: 0,
    threat: 4, drop: 3, introNight: 1, aggro: 160, radius: 13,
  },
  bombardier: {
    hp: 24, speed: 62, damage: 5, interval: 1.4, range: 200,
    threat: 7, drop: 4, introNight: 2, aggro: 240, radius: 15,
  },
  pillbug: {
    hp: 70, speed: 52, damage: 9, interval: 1.2, range: 0,
    threat: 10, drop: 6, introNight: 3, aggro: 160, radius: 18,
    frontalArmor: { arc: Math.PI / 3, reduction: 0.6 },
  },
  termite: {
    hp: 40, speed: 95, damage: 35, interval: 1.0, range: 0,
    threat: 12, drop: 7, introNight: 4, aggro: 160, radius: 14,
    suicide: true, aoeRadius: 90,
  },
  moleCricket: {
    hp: 150, speed: 40, damage: 40, interval: 2.0, range: 0,
    threat: 30, drop: 15, introNight: 5, aggro: 0, radius: 21,
    structuresOnly: true,
  },
  tigerBeetle: {
    hp: 90, speed: 130, damage: 12, interval: 1.0, range: 0,
    threat: 16, drop: 9, introNight: 7, aggro: 160, radius: 15,
    burst: { run: 0.6, pause: 0.25 },
  },
  stagBeetle: {
    hp: 220, speed: 46, damage: 18, interval: 1.4, range: 0,
    threat: 22, drop: 12, introNight: 8, aggro: 160, radius: 22,
    knockback: 240,
  },
  wolfSpider: {
    hp: 1200, speed: 44, damage: 30, interval: 1.6, range: 0,
    threat: 120, drop: 60, introNight: 6, aggro: 160, radius: 34,
    boss: true, summonAtHpFraction: 0.6, summonCount: 3,
  },
});

export const COMBAT = {
  meleeReach: 16,
  separationRadius: 28,
  separationImpulse: 90,
  laneOffsetSpread: 40,
  retargetInterval: 0.25,
  structureBlockDistance: 90,
  majorEngageRadius: 140,
  majorLeashRadius: 190,
  majorSpeed: 150,
  /** Structures are a footprint quad; this is its effective collision radius. */
  structureHitRadius: 52,
  trailDuration: 6,
  trailCooldown: 12,
  hitFlash: 0.06,
  hitKnock: 4,
  /** Hit-stop per tier, keyed by threat cost bracket. */
  hitStopSmall: 0.04,
  hitStopBoss: 0.16,
  /** Invader stat growth: stat * (1 + rate * (n - 1)), capped. */
  scalePerNight: 0.05,
  scaleCap: 3.0,
  bossScalePerNight: 0.35,
  spiderlingDrop: 0,
  projectileLifetime: 1.2,
} as const;

export const THREAT = {
  base: 40,
  growth: 1.32,
  bossBudget: 120,
  /** Reserve for the newest unlocked type, making each night legible. */
  newTypeReserve: 0.2,
  weightRecencyBonus: 0.15,
  moleCricketFromNight: 5,
  subWavesMin: 3,
  subWavesMax: 5,
  laneJitter: 0.2,
  bossNights: [6, 12] as readonly number[],
} as const;

export const CAPS = {
  invaders: 120,
  majors: 15,
  projectiles: 120,
  pickups: 200,
  particles: 250,
  lightPools: 24,
  shakeMax: 8,
  degradeFrameMs: 20,
} as const;

/** Cost, and the stats that change per tier. `cost: 0` means owned at start. */
export const BUILD = {
  broodChamber: {
    tiers: [
      { cost: 0, hp: 600 },
      { cost: 80, hp: 1000 },
      { cost: 200, hp: 1600 },
      { cost: 450, hp: 2400 },
      { cost: 900, hp: 3600 },
    ],
  },
  barricade: {
    tiers: [
      { cost: 25, hp: 300 },
      { cost: 60, hp: 600 },
      { cost: 130, hp: 1100 },
    ],
  },
  spitter: {
    tiers: [
      { cost: 30, hp: 180, damage: 8, interval: 1.0, range: 300 },
      { cost: 70, hp: 300, damage: 12, interval: 0.85, range: 340 },
      { cost: 150, hp: 460, damage: 18, interval: 0.7, range: 380 },
    ],
  },
  battery: {
    tiers: [
      { cost: 180, hp: 260, damage: 45, interval: 2.4, range: 460, pierce: 3 },
      { cost: 380, hp: 400, damage: 70, interval: 2.0, range: 500, pierce: 4 },
    ],
  },
  gallery: {
    tiers: [
      { cost: 45, hp: 260, majors: 2, majorHp: 60, majorDamage: 7, majorInterval: 1.0 },
      { cost: 110, hp: 380, majors: 3, majorHp: 90, majorDamage: 10, majorInterval: 1.0 },
      { cost: 240, hp: 520, majors: 5, majorHp: 130, majorDamage: 14, majorInterval: 0.9 },
    ],
  },
  paddock: {
    tiers: [
      { cost: 60, hp: 200, speed: 380, horn: 15, sugarCap: 0 },
      { cost: 150, hp: 200, speed: 430, horn: 25, sugarCap: 10 },
    ],
  },
  venomWell: {
    tiers: [
      { cost: 80, hp: 200, damage: 15, interval: 0.5 },
      { cost: 180, hp: 200, damage: 19, interval: 0.45 },
      { cost: 380, hp: 200, damage: 24, interval: 0.4 },
    ],
  },
  hoard: {
    tiers: [
      { cost: 70, hp: 200, multiplier: 1.25 },
      { cost: 160, hp: 200, multiplier: 1.5 },
      { cost: 330, hp: 200, multiplier: 2.0 },
    ],
  },
  nectarVat: {
    tiers: [
      { cost: 0, hp: 200, sugarPerUnit: 8 },
      { cost: 90, hp: 200, sugarPerUnit: 12 },
      { cost: 200, hp: 200, sugarPerUnit: 18 },
    ],
  },
  fungusGarden: {
    tiers: [
      { cost: 0, hp: 200, sugarPerUnit: 10 },
      { cost: 150, hp: 200, sugarPerUnit: 16 },
    ],
  },
  aphidPen: {
    tiers: [
      { cost: 0, hp: 120, dropletInterval: 4.0, floorCap: 6 },
      { cost: 65, hp: 120, dropletInterval: 2.5, floorCap: 8 },
    ],
  },
  mortarPile: {
    tiers: [{ cost: 0, hp: 120 }],
  },
} as const;

/** Structures that take damage and keep it between nights. */
export const DAMAGEABLE: ReadonlySet<BuildableKind> = new Set<BuildableKind>([
  'broodChamber',
  'barricade',
  'spitter',
  'battery',
  'gallery',
]);

export const META = {
  jellyPerNight: 1,
  jellyWinBonus: 3,
  traitsEnabled: false,
} as const;

export const FX = {
  padCompleteShake: 2,
  bossSpawnShake: 6,
  chamberHitShake: 4,
  structureRiseDuration: 0.5,
  structureRiseOvershoot: 1.15,
  particleLifetime: 0.6,
  dustRingParticles: 14,
  hitParticlesMin: 3,
  hitParticlesMax: 5,
} as const;

export const SOUNDS = Object.freeze({
  sugarPickup: {
    ladder: { resetAfter: 0.6, cap: 12 },
    layers: [
      { wave: 'triangle', freq: 880, freqTo: 1180, dur: 0.09, gain: 0.16, attack: 0.002 },
      { noise: true, freq: 0, dur: 0.03, gain: 0.07, filter: { type: 'highpass', freq: 2600 } },
    ],
  },
  honeydewPickup: {
    ladder: { resetAfter: 0.6, cap: 8 },
    layers: [
      {
        wave: 'sine', freq: 460, freqTo: 620, dur: 0.14, gain: 0.15, attack: 0.01,
        filter: { type: 'lowpass', freq: 1400, q: 3 },
      },
    ],
  },
  leafPickup: {
    ladder: { resetAfter: 0.6, cap: 8 },
    layers: [
      { noise: true, freq: 0, dur: 0.1, gain: 0.11, filter: { type: 'bandpass', freq: 1800, freqTo: 900, q: 2 } },
    ],
  },
  padTick: {
    layers: [{ wave: 'square', freq: 330, dur: 0.05, gain: 0.055, attack: 0.002 }],
  },
  padComplete: {
    layers: [
      { wave: 'sine', freq: 110, freqTo: 74, dur: 0.34, gain: 0.28, attack: 0.004 },
      { wave: 'triangle', freq: 392, dur: 0.3, gain: 0.13, delay: 0.03 },
      { wave: 'triangle', freq: 588, dur: 0.34, gain: 0.11, delay: 0.09 },
      { noise: true, freq: 0, dur: 0.16, gain: 0.12, filter: { type: 'lowpass', freq: 700, freqTo: 200 } },
    ],
  },
  padShort: {
    layers: [{ wave: 'sine', freq: 196, freqTo: 150, dur: 0.12, gain: 0.08 }],
  },
  acidSpray: {
    layers: [
      { noise: true, freq: 0, dur: 0.04, gain: 0.075, filter: { type: 'bandpass', freq: 3200, freqTo: 900, q: 1.4 } },
    ],
  },
  hit: {
    layers: [
      { noise: true, freq: 0, dur: 0.05, gain: 0.075, filter: { type: 'bandpass', freq: 1500, q: 1.2 } },
      { wave: 'sine', freq: 150, freqTo: 90, dur: 0.09, gain: 0.09 },
    ],
  },
  kill: {
    layers: [
      { wave: 'triangle', freq: 420, freqTo: 210, dur: 0.16, gain: 0.12 },
      { noise: true, freq: 0, dur: 0.07, gain: 0.07, filter: { type: 'bandpass', freq: 900, q: 3 } },
    ],
  },
  killHeavy: {
    layers: [
      { wave: 'triangle', freq: 300, freqTo: 120, dur: 0.24, gain: 0.16 },
      { noise: true, freq: 0, dur: 0.12, gain: 0.12, filter: { type: 'bandpass', freq: 520, q: 6 } },
    ],
  },
  explode: {
    layers: [
      { noise: true, freq: 0, dur: 0.4, gain: 0.3, filter: { type: 'lowpass', freq: 1800, freqTo: 160 } },
      { wave: 'sine', freq: 90, freqTo: 40, dur: 0.42, gain: 0.24 },
    ],
  },
  nightStart: {
    layers: [
      { wave: 'sine', freq: 55, dur: 1.2, gain: 0.3, attack: 0.35 },
      { wave: 'sine', freq: 55, detune: 14, dur: 1.2, gain: 0.26, attack: 0.4 },
      { noise: true, freq: 0, dur: 1.1, gain: 0.1, attack: 0.7, rate: 0.6, filter: { type: 'bandpass', freq: 300, freqTo: 1400, q: 2 } },
    ],
  },
  dawn: {
    layers: [
      { wave: 'triangle', freq: 330, dur: 0.5, gain: 0.12, attack: 0.12 },
      { wave: 'triangle', freq: 494, dur: 0.6, gain: 0.1, delay: 0.12, attack: 0.1 },
    ],
  },
  chamberHit: {
    layers: [
      { wave: 'sawtooth', freq: 78, freqTo: 62, dur: 0.28, gain: 0.16, filter: { type: 'lowpass', freq: 500 } },
    ],
  },
  chamberCritical: {
    layers: [
      { wave: 'sine', freq: 1244, dur: 1.1, gain: 0.14, attack: 0.005 },
      { wave: 'sine', freq: 1868, dur: 0.8, gain: 0.06, attack: 0.005 },
    ],
  },
  nightHeld: {
    layers: [
      { wave: 'triangle', freq: 392, dur: 0.18, gain: 0.14 },
      { wave: 'triangle', freq: 494, dur: 0.18, gain: 0.14, delay: 0.11 },
      { wave: 'triangle', freq: 587, dur: 0.18, gain: 0.14, delay: 0.22 },
      { wave: 'triangle', freq: 784, dur: 0.4, gain: 0.16, delay: 0.33 },
    ],
  },
  knockdown: {
    layers: [
      { noise: true, freq: 0, dur: 0.3, gain: 0.22, filter: { type: 'lowpass', freq: 400, freqTo: 140 } },
      { wave: 'sine', freq: 70, freqTo: 45, dur: 0.4, gain: 0.2 },
    ],
  },
  revive: {
    layers: [
      { wave: 'triangle', freq: 262, freqTo: 523, dur: 0.34, gain: 0.13, attack: 0.02 },
    ],
  },
  mount: {
    layers: [
      { wave: 'sawtooth', freq: 120, freqTo: 190, dur: 0.18, gain: 0.12, filter: { type: 'lowpass', freq: 900 } },
    ],
  },
  drum: {
    layers: [
      { wave: 'sine', freq: 96, freqTo: 70, dur: 0.16, gain: 0.2 },
      { wave: 'sine', freq: 96, freqTo: 70, dur: 0.16, gain: 0.16, delay: 0.13 },
    ],
  },
  trail: {
    layers: [
      { wave: 'triangle', freq: 523, freqTo: 784, dur: 0.26, gain: 0.13, attack: 0.02 },
    ],
  },
  lose: {
    layers: [
      { wave: 'sine', freq: 196, freqTo: 65, dur: 1.6, gain: 0.26, attack: 0.05 },
      { wave: 'sawtooth', freq: 98, freqTo: 49, dur: 1.8, gain: 0.1, filter: { type: 'lowpass', freq: 600, freqTo: 180 } },
    ],
  },
  win: {
    layers: [
      { wave: 'triangle', freq: 523, dur: 0.22, gain: 0.15 },
      { wave: 'triangle', freq: 659, dur: 0.22, gain: 0.15, delay: 0.14 },
      { wave: 'triangle', freq: 784, dur: 0.22, gain: 0.15, delay: 0.28 },
      { wave: 'triangle', freq: 1047, dur: 0.7, gain: 0.18, delay: 0.42 },
    ],
  },
  ambientClick: {
    layers: [
      { noise: true, freq: 0, dur: 0.02, gain: 0.022, filter: { type: 'bandpass', freq: 2400, q: 8 } },
    ],
  },
  uiTap: {
    layers: [{ wave: 'square', freq: 620, dur: 0.04, gain: 0.06 }],
  },
} satisfies Record<string, SoundDef>);

export type SoundName = keyof typeof SOUNDS;

export const BALANCE = Object.freeze({
  WORLD, TIME, WARDEN, BEETLE, STACK, ECONOMY, INVADERS, COMBAT,
  THREAT, CAPS, BUILD, META, FX, SOUNDS,
});
