import { AudioBus } from '../engine/audio';
import type { InputState } from '../engine/input';
import { mulberry32, type Rng } from '../engine/rng';
import { Pool } from '../engine/pool';
import { SpatialHash } from '../engine/spatial';
import { clamp } from '../engine/ease';
import {
  CAPS, COMBAT, ECONOMY, FX, INVADERS, WORLD,
  type InvaderKind, type SoundName,
} from './balance';
import { createRun, syncGlowcaps } from './state';
import type { Tutorial } from './tutorial';
import type {
  Invader, Major, Particle, Phase, Pickup, Projectile, ResourceKind,
  RunState, Settings, Structure,
} from './types';

export interface SimHooks {
  onPhaseChange(prev: Phase, next: Phase): void;
  onToast(text: string, seconds: number): void;
  onStamp(text: string): void;
  onLightingDirty(): void;
}

export interface DamageNumber {
  x: number;
  y: number;
  z: number;
  value: number;
  life: number;
  friendly: boolean;
}

const noopHooks: SimHooks = {
  onPhaseChange: () => {},
  onToast: () => {},
  onStamp: () => {},
  onLightingDirty: () => {},
};

/**
 * Owns run state and every mutable side channel the systems share. Systems are
 * plain functions over this object, run in the fixed order from section 16.
 */
export class Sim {
  state: RunState;
  rng: Rng;
  readonly hash: SpatialHash;
  readonly particles: Pool<Particle>;
  readonly damageNumbers: Pool<DamageNumber>;

  audio: AudioBus;
  hooks: SimHooks = noopHooks;
  /**
   * Replaced with the live `Input.state` at bootstrap. The default is a zero
   * vector so headless callers (tests, the balance harness) can drive it
   * directly without constructing an Input.
   */
  input: InputState = {
    moveX: 0,
    moveY: 0,
    actionPressed: false,
    stick: { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 },
  };
  settings: Settings = {
    audio: true,
    music: false,
    hudScale: 1,
    highContrast: false,
    nightBrightness: 0,
    damageNumbers: false,
  };

  /**
   * Set while a guided tutorial is running. The systems below are untouched by
   * it: the tutorial drives the same pads, spawn queue and carry cap the real
   * game does, so it can never demonstrate something the game will not do.
   */
  tutorial: Tutorial | null = null;

  reducedMotion = false;
  /** Debug cheat and harness switch: nothing friendly can be lost. */
  invulnerable = false;
  /** Set the first time the Mortar Pile is used, which retires its trail hint. */
  mortarUsed = false;
  /** Rate limit for the "sugar is full" conversion hint. */
  nextFullHintAt = 0;
  /** 1 = full detail, 0.5 = degraded after sustained slow frames. */
  quality = 1;

  /**
   * Camera target in world space, plus zoom, both smoothed. `halfW`/`halfH` are
   * written by the renderer each frame so the clamp knows the real frustum.
   */
  readonly camera = { x: 720, y: 1180, zoom: 1, zoomTarget: 1, halfW: 560, halfH: 560 };
  shake = 0;
  hitStop = 0;
  /** Cross-fade progress: 0 = day palette, 1 = night palette. */
  nightMix = 0;
  /** Day light-shaft sweep, 0 to 1 across the day. */
  shaftT = 0;
  /** Set by structures completing; the renderer rebuilds its light cache. */
  lightingDirty = true;

  constructor(seed: number, audio?: AudioBus) {
    this.state = createRun(seed);
    this.rng = mulberry32(seed >>> 0);
    this.hash = new SpatialHash(WORLD.width, WORLD.height, WORLD.spatialCell);
    this.audio = audio ?? new AudioBus();
    this.particles = new Pool<Particle>(
      () => ({
        pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, z: 0, vz: 0,
        life: 0, maxLife: 1, size: 4, color: 0xffffff, alive: false,
      }),
      (p) => {
        p.alive = true;
      },
      CAPS.particles,
    );
    this.damageNumbers = new Pool<DamageNumber>(
      () => ({ x: 0, y: 0, z: 0, value: 0, life: 0, friendly: false }),
      () => {},
      48,
    );
  }

  reset(seed: number): void {
    this.state = createRun(seed);
    this.rng = mulberry32(seed >>> 0);
    this.particles.clear();
    this.damageNumbers.clear();
    this.camera.x = this.state.warden.pos.x;
    this.camera.y = this.state.warden.pos.y;
    this.camera.zoom = 1;
    this.camera.zoomTarget = 1;
    this.shake = 0;
    this.hitStop = 0;
    this.nightMix = 0;
    this.shaftT = 0;
    this.markLightingDirty();
  }

  adopt(state: RunState): void {
    this.state = state;
    this.rng = mulberry32(state.seed >>> 0);
    this.particles.clear();
    this.damageNumbers.clear();
    this.camera.x = state.warden.pos.x;
    this.camera.y = state.warden.pos.y;
    this.nightMix = state.phase === 'night' ? 1 : 0;
    this.markLightingDirty();
  }

  sound(name: SoundName, semitones = 0, gain = 1): void {
    this.audio.play(name, semitones, gain);
  }

  markLightingDirty(): void {
    this.lightingDirty = true;
    this.hooks.onLightingDirty();
  }

  addShake(amount: number): void {
    if (this.reducedMotion) return;
    this.shake = Math.min(CAPS.shakeMax, this.shake + amount);
  }

  addHitStop(seconds: number): void {
    this.hitStop = Math.max(this.hitStop, seconds);
  }

  // ---------------------------------------------------------------- entities

  spawnInvader(kind: InvaderKind, lane: 0 | 1 | 2, x: number, y: number, hp: number, damage: number): Invader | null {
    const st = this.state;
    if (st.invaders.length >= CAPS.invaders) return null;
    const stats = INVADERS[kind];
    const inv: Invader = {
      id: st.nextEntityId++,
      kind,
      pos: { x, y },
      prev: { x, y },
      vel: { x: 0, y: 0 },
      hp,
      maxHp: hp,
      damage,
      lane,
      waypointIndex: 1,
      laneOffset: this.rng.range(-COMBAT.laneOffsetSpread, COMBAT.laneOffsetSpread),
      targetType: 'waypoint',
      targetId: -1,
      retargetAt: st.time + this.rng.range(0, COMBAT.retargetInterval),
      attackCooldown: 0,
      facing: 0,
      gaitPhase: this.rng.next() * Math.PI * 2,
      flash: 0,
      burstTimer: stats.burst ? this.rng.range(0, stats.burst.run) : 0,
      bursting: true,
      curledUntil: 0,
      hasSummoned: false,
      noDrop: false,
      alive: true,
    };
    st.invaders.push(inv);
    return inv;
  }

  spawnPickup(kind: ResourceKind, x: number, y: number, value: number, scatter = 0): Pickup | null {
    const st = this.state;
    if (st.pickups.length >= CAPS.pickups) return null;
    const angle = this.rng.next() * Math.PI * 2;
    const speed = scatter > 0 ? this.rng.range(scatter * 0.4, scatter) : 0;
    const pickup: Pickup = {
      id: st.nextEntityId++,
      kind,
      value,
      pos: { x, y },
      prev: { x, y },
      vel: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
      z: 6,
      bornAt: st.time,
      expiresAt: null,
      magnetT: -1,
      fromX: x,
      fromY: y,
      alive: true,
    };
    st.pickups.push(pickup);
    return pickup;
  }

  spawnProjectile(
    x: number, y: number, dirX: number, dirY: number, speed: number,
    damage: number, friendly: boolean, pierce = 0, aoeRadius = 0,
  ): Projectile | null {
    const st = this.state;
    if (st.projectiles.length >= CAPS.projectiles) return null;
    const len = Math.hypot(dirX, dirY) || 1;
    const p: Projectile = {
      id: st.nextEntityId++,
      pos: { x, y },
      prev: { x, y },
      vel: { x: (dirX / len) * speed, y: (dirY / len) * speed },
      damage,
      life: COMBAT.projectileLifetime,
      pierce,
      hitIds: [],
      friendly,
      aoeRadius,
      alive: true,
    };
    st.projectiles.push(p);
    return p;
  }

  burst(x: number, y: number, count: number, color: number, speed: number, size = 4): void {
    const n = Math.max(1, Math.round(count * this.quality * (this.reducedMotion ? 0 : 1)));
    if (this.reducedMotion) return;
    for (let i = 0; i < n; i++) {
      const p = this.particles.spawn();
      if (!p) return;
      const angle = this.rng.next() * Math.PI * 2;
      const v = this.rng.range(speed * 0.35, speed);
      p.pos.x = x;
      p.pos.y = y;
      p.vel.x = Math.cos(angle) * v;
      p.vel.y = Math.sin(angle) * v;
      p.z = this.rng.range(4, 16);
      p.vz = this.rng.range(30, 130);
      p.maxLife = FX.particleLifetime * this.rng.range(0.7, 1.3);
      p.life = p.maxLife;
      p.size = size * this.rng.range(0.7, 1.3);
      p.color = color;
    }
  }

  addDamageNumber(x: number, y: number, value: number, friendly: boolean): void {
    if (!this.settings.damageNumbers) return;
    const d = this.damageNumbers.spawn();
    if (!d) return;
    d.x = x;
    d.y = y;
    d.z = 30;
    d.value = Math.round(value);
    d.life = 0.8;
    d.friendly = friendly;
  }

  // ------------------------------------------------------------------ damage

  /** Applies damage to an invader, honoring the pillbug's frontal armor. */
  hurtInvader(inv: Invader, amount: number, fromX: number, fromY: number, projectile: boolean): void {
    if (!inv.alive) return;
    const stats = INVADERS[inv.kind];
    let dealt = amount;
    if (projectile && stats.frontalArmor) {
      const incoming = Math.atan2(fromY - inv.pos.y, fromX - inv.pos.x);
      let delta = Math.abs(incoming - inv.facing) % (Math.PI * 2);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (delta <= stats.frontalArmor.arc) {
        dealt *= 1 - stats.frontalArmor.reduction;
        inv.curledUntil = this.state.time + 0.3;
      }
    }
    inv.hp -= dealt;
    inv.flash = COMBAT.hitFlash;
    const len = Math.hypot(inv.pos.x - fromX, inv.pos.y - fromY) || 1;
    inv.pos.x += ((inv.pos.x - fromX) / len) * COMBAT.hitKnock;
    inv.pos.y += ((inv.pos.y - fromY) / len) * COMBAT.hitKnock;
    this.addDamageNumber(inv.pos.x, inv.pos.y, dealt, true);
    this.burst(inv.pos.x, inv.pos.y, this.rng.range(FX.hitParticlesMin, FX.hitParticlesMax), 0xc2405b, 140, 3);
    const semis = clamp(12 - stats.threat, -12, 8);
    this.sound('hit', semis);
    if (inv.hp <= 0) this.killInvader(inv);
  }

  killInvader(inv: Invader): void {
    if (!inv.alive) return;
    inv.alive = false;
    const stats = INVADERS[inv.kind];
    this.state.stats.invadersKilled++;
    this.addHitStop(stats.boss ? COMBAT.hitStopBoss : COMBAT.hitStopSmall);
    this.burst(inv.pos.x, inv.pos.y, stats.boss ? 30 : 10, 0x8a2039, 220, stats.boss ? 7 : 4);
    this.sound(stats.threat >= 20 ? 'killHeavy' : 'kill', clamp(10 - stats.threat, -10, 8));
    if (inv.noDrop) return;
    // Raiders arrive laden; the haul spills when they fall.
    const total = Math.round(stats.drop * ECONOMY.dropMultiplier);
    this.state.stats.sugarDropped += total;
    this.state.sugarDroppedThisNight += total;
    const crystals = Math.min(8, Math.max(1, Math.round(total / 3)));
    const per = total / crystals;
    for (let i = 0; i < crystals; i++) {
      this.spawnPickup('sugar', inv.pos.x, inv.pos.y, per, 120);
    }
  }

  hurtStructure(s: Structure, amount: number): void {
    s.hp -= amount;
    s.flash = COMBAT.hitFlash;
    this.addDamageNumber(s.pos.x, s.pos.y, amount, false);
    if (s.kind === 'broodChamber') {
      this.addShake(FX.chamberHitShake);
      this.sound('chamberHit');
      if (s.hp / s.maxHp < 0.3) this.sound('chamberCritical', 0, 0.6);
    } else {
      this.sound('hit', -6);
    }
    this.burst(s.pos.x, s.pos.y, 4, 0x8e97a8, 120, 3);
    if (s.hp <= 0) {
      s.hp = 0;
      if (s.kind === 'broodChamber') {
        if (this.invulnerable) {
          s.hp = s.maxHp;
          return;
        }
        this.loseRun();
      } else {
        this.disableStructure(s);
      }
    }
    syncGlowcaps(s);
  }

  /**
   * A structure at 0 HP is breached, not gone: it keeps its site and its tier,
   * stops working, loses its glowcaps, and can be brought back at the Mortar
   * Pile. Deleting it would make repair pointless and turn every lost barricade
   * into a full-price rebuild, which is not the tension section 9.6 asks for.
   */
  disableStructure(s: Structure): void {
    const st = this.state;
    s.hp = 0;
    syncGlowcaps(s);
    // Majors from a breached gallery die with it and re-hatch when it is patched.
    for (const major of st.majors) if (major.siteId === s.site) major.alive = false;
    this.burst(s.pos.x, s.pos.y, 22, 0x59616f, 200, 6);
    this.addShake(FX.chamberHitShake * 0.6);
    this.sound('killHeavy', -4);
    this.markLightingDirty();
  }

  hurtMajor(m: Major, amount: number): void {
    m.hp -= amount;
    m.flash = COMBAT.hitFlash;
    this.burst(m.pos.x, m.pos.y, 3, 0x2e6f8e, 120, 3);
    if (m.hp <= 0) {
      m.alive = false;
      this.burst(m.pos.x, m.pos.y, 10, 0x2e6f8e, 180, 4);
      this.sound('kill', -4);
    }
  }

  loseRun(): void {
    const st = this.state;
    if (st.phase === 'lose') return;
    st.loseNight = st.night;
    this.setPhase('lose', 0);
    this.audio.setMusic('off');
    this.sound('lose');
    this.addShake(CAPS.shakeMax);
  }

  setPhase(next: Phase, duration: number): void {
    const st = this.state;
    const prev = st.phase;
    st.phase = next;
    st.phaseStartedAt = st.time;
    st.phaseDuration = duration;
    this.hooks.onPhaseChange(prev, next);
  }

  get phaseElapsed(): number {
    return this.state.time - this.state.phaseStartedAt;
  }

  /** 0 to 1 through the current phase; always 0 for open-ended phases. */
  get phaseProgress(): number {
    const d = this.state.phaseDuration;
    return d > 0 ? clamp(this.phaseElapsed / d, 0, 1) : 0;
  }
}
