import { INVADERS, STACK } from '../game/balance';
import { lerp } from '../engine/ease';
import type { Sim } from '../game/sim';
import type { ViewportSize } from '../engine/viewport';
import { CreatureLayer } from './creatures';
import {
  BEETLE_SHAPE, INVADER_SHAPES, MAJOR_SHAPE, WARDEN_SHAPE,
} from './creatureShapes';
import { Atmosphere } from './atmosphere';
import { EffectLayer, ItemLayer, PropLayer, ShadowLayer } from './props';
import { FloorLayer } from './floor';
import { Lighting } from './lighting';
import { PadLayer } from './padsView';
import { Stage } from './scene';
import { StructureLayer } from './structuresView';

/**
 * Reads state and the interpolation alpha, and mutates nothing in the sim. Draw
 * order follows section 16: floor, lanes, pads, shaft, shadows, entities,
 * projectiles, particles, light pools.
 */
export class View {
  readonly stage: Stage;
  private readonly floor = new FloorLayer();
  private readonly lighting = new Lighting();
  private readonly pads: PadLayer;
  private readonly structures = new StructureLayer();
  private readonly creatures = new CreatureLayer();
  private readonly shadows = new ShadowLayer();
  private readonly items = new ItemLayer();
  private readonly effects = new EffectLayer();
  private readonly props = new PropLayer();
  private readonly atmosphere = new Atmosphere();
  /** Top of each carry column in world space, for the HUD count badges. */
  readonly columnTops = [
    { x: 0, y: 0, z: 0, count: 0 },
    { x: 0, y: 0, z: 0, count: 0 },
  ];
  private spin = 0;

  constructor(canvas: HTMLCanvasElement, sim: Sim) {
    this.stage = new Stage(canvas);
    this.pads = new PadLayer(sim.state);
    this.stage.scene.add(
      this.floor.group,
      this.pads.group,
      this.lighting.group,
      this.shadows.mesh,
      this.props.group,
      this.structures.group,
      this.creatures.group,
      this.items.group,
      this.effects.group,
      this.atmosphere.points,
    );
  }

  resize(size: ViewportSize): void {
    this.stage.resize(size);
  }

  render(sim: Sim, alpha: number, frameDt: number): void {
    const st = sim.state;
    this.spin += frameDt;

    this.stage.applyPalette(sim.nightMix, sim.settings.nightBrightness);
    const palette = this.stage.palette;
    // One theme drives the world and the HUD: when the shaft closes, the panels
    // and the vignette cool with it.
    palette.publishCss(document.documentElement);

    const shakeAmount = sim.reducedMotion ? 0 : sim.shake;
    const shakeX = (Math.random() - 0.5) * shakeAmount * 2;
    const shakeY = (Math.random() - 0.5) * shakeAmount * 2;
    this.stage.place(sim.camera.x, sim.camera.y, sim.camera.zoom, shakeX, shakeY);
    // Hand the frustum back so the next sim step clamps against the real view.
    sim.camera.halfW = this.stage.halfW;
    sim.camera.halfH = this.stage.halfH;

    this.floor.update(palette);
    this.lighting.update(palette, sim.nightMix, sim.shaftT, frameDt, sim.quality);
    this.atmosphere.update(palette, sim.nightMix, frameDt, sim.quality);
    if (sim.lightingDirty) {
      this.lighting.rebuild(st.structures);
      sim.lightingDirty = false;
    }
    this.structures.sync(st.structures);
    this.structures.update(st.structures, palette, sim.nightMix, sim.reducedMotion);
    this.pads.update(st, palette);
    this.props.update(st, palette, sim.nightMix);

    this.shadows.begin(palette.rig.blobAlpha);
    this.creatures.begin();
    this.items.begin();
    this.effects.begin();

    // --- invaders
    for (const inv of st.invaders) {
      const x = lerp(inv.prev.x, inv.pos.x, alpha);
      const y = lerp(inv.prev.y, inv.pos.y, alpha);
      const shape = INVADER_SHAPES[inv.kind];
      const curl = inv.curledUntil > st.time ? 1 : 0;
      this.shadows.add(x, y, shape.shadow);
      this.creatures.add(shape, x, y, inv.facing, inv.gaitPhase, 1, inv.flash, curl, null);
    }

    // --- majors
    for (const m of st.majors) {
      const x = lerp(m.prev.x, m.pos.x, alpha);
      const y = lerp(m.prev.y, m.pos.y, alpha);
      this.shadows.add(x, y, MAJOR_SHAPE.shadow);
      this.creatures.add(MAJOR_SHAPE, x, y, m.facing, m.gaitPhase, 1, m.flash, 0, null);
    }

    // --- the beetle, idling where it was left or scuttling in
    if (st.beetle.owned && !st.warden.mounted) {
      const x = lerp(st.beetle.prev.x, st.beetle.pos.x, alpha);
      const y = lerp(st.beetle.prev.y, st.beetle.pos.y, alpha);
      this.shadows.add(x, y, BEETLE_SHAPE.shadow);
      this.creatures.add(BEETLE_SHAPE, x, y, st.beetle.facing, st.beetle.gaitPhase, 1, 0, 0, null);
    }

    // --- the Warden, and the beetle beneath her when mounted
    const w = st.warden;
    const wx = lerp(w.prev.x, w.pos.x, alpha);
    const wy = lerp(w.prev.y, w.pos.y, alpha);
    const knocked = w.knockedUntil > st.time;
    if (w.mounted) {
      this.shadows.add(wx, wy, BEETLE_SHAPE.shadow);
      this.creatures.add(BEETLE_SHAPE, wx, wy, w.facing, st.beetle.gaitPhase, 1, 0, 0, null);
    } else {
      this.shadows.add(wx, wy, WARDEN_SHAPE.shadow);
    }
    const blink = w.invulnUntil > st.time && Math.floor(st.time * 12) % 2 === 0;
    if (!blink) {
      this.creatures.add(
        WARDEN_SHAPE,
        wx,
        wy + (w.mounted ? -10 : 0),
        w.facing,
        w.gaitPhase,
        w.mounted ? 0.86 : 1,
        0,
        knocked ? 1 : 0,
        null,
      );
    }
    if (knocked) {
      // Two workers drag her home. Cheap, scripted, and worth the twenty minutes.
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const dragX = wx + Math.cos(w.facing) * 34 + Math.sin(w.facing) * side * 16;
        const dragY = wy + Math.sin(w.facing) * 34 - Math.cos(w.facing) * side * 16;
        this.shadows.add(dragX, dragY, MAJOR_SHAPE.shadow * 0.8);
        this.creatures.add(MAJOR_SHAPE, dragX, dragY, w.facing, st.time * 14 + i, 0.8, 0, 0, 0x6a6270);
      }
    }

    // --- floor pickups
    for (const p of st.pickups) {
      const x = lerp(p.prev.x, p.pos.x, alpha);
      const y = lerp(p.prev.y, p.pos.y, alpha);
      // The last five seconds of a night pickup's life flash.
      let scale = 1;
      if (p.expiresAt !== null) {
        const left = p.expiresAt - st.time;
        if (left < STACK.pickupFlashLast) {
          scale = 0.7 + Math.abs(Math.sin(st.time * 9)) * 0.5;
        }
      }
      const size = (p.kind === 'sugar' ? 8 : p.kind === 'honeydew' ? 7 : 8) * scale;
      if (p.kind === 'sugar') this.shadows.add(x, y, 9);
      this.items.add(p.kind, x, y, p.z + 6, size, this.spin * 1.4 + p.id, p.id * 0.7);
    }

    this.renderStack(sim, alpha);

    // --- projectiles and particles
    for (const p of st.projectiles) {
      const x = lerp(p.prev.x, p.pos.x, alpha);
      const y = lerp(p.prev.y, p.pos.y, alpha);
      this.effects.addGlobule(x, y, p.friendly, p.aoeRadius > 0 ? 9 : p.pierce > 0 ? 8 : 5.5);
    }
    for (let i = 0; i < sim.particles.size; i++) {
      const particle = sim.particles.items[i];
      const fade = particle.life / particle.maxLife;
      this.effects.addParticle(
        particle.pos.x, particle.pos.y, particle.z + 4,
        particle.size * fade, particle.color, fade,
      );
    }

    this.shadows.commit();
    this.creatures.commit(sim.settings.highContrast);
    this.items.commit();
    this.effects.commit();
    this.stage.render();
  }

  /**
   * The carry stack: up to two columns above and slightly behind her head,
   * lag-following so the whole load sways when she turns.
   */
  private renderStack(sim: Sim, alpha: number): void {
    const st = sim.state;
    const w = st.warden;
    const s = w.stack;
    const wx = lerp(w.prev.x, w.pos.x, alpha);
    const wy = lerp(w.prev.y, w.pos.y, alpha);
    // The anchor trails her, and the columns sit behind the head.
    const back = w.facing + Math.PI;
    // Above and slightly behind the head, so the load never hides her.
    const baseX = lerp(wx, s.anchor.x, 0.55) + Math.cos(back) * 22;
    const baseY = lerp(wy, s.anchor.y, 0.55) + Math.sin(back) * 22;
    const side = w.facing + Math.PI / 2;
    const headY = w.mounted ? 46 : 34;

    for (let c = 0; c < 2; c++) {
      const column = s.columns[c];
      const top = this.columnTops[c];
      top.count = 0;
      if (column.length === 0) continue;
      const offset = c === 0 ? -12 : 12;
      const cx = baseX + Math.cos(side) * offset;
      const cy = baseY + Math.sin(side) * offset;
      const step = Math.min(11, STACK.columnHeightCap / Math.max(1, column.length));
      for (let i = 0; i < column.length; i++) {
        const item = column[i];
        const z = headY + i * step + item.springY;
        const size = item.kind === 'sugar' ? 7.5 : item.kind === 'honeydew' ? 6.5 : 7;
        this.items.add(item.kind, cx, cy, z, size, item.wobble + i * 0.6, i * 0.5);
        if (i === column.length - 1) {
          top.x = cx;
          top.y = cy;
          top.z = z + 16;
          // The stack renders ten items at most; anything over that is a badge.
          const held = c === 0 ? s.sugar : s.lastNonSugar ? s[s.lastNonSugar] : 0;
          top.count = Math.floor(held);
        }
      }
    }
  }

  /** Off-screen invader positions, clustered, for the HUD chevron layer. */
  collectOffscreenThreats(sim: Sim, out: { x: number; y: number; tier: number }[]): void {
    out.length = 0;
    const screen = { x: 0, y: 0 };
    const clusters: { x: number; y: number; tier: number; count: number }[] = [];
    for (const inv of sim.state.invaders) {
      const visible = this.stage.project(inv.pos.x, inv.pos.y, 20, screen);
      if (visible) continue;
      const tier = INVADERS[inv.kind].threat;
      let merged = false;
      for (const c of clusters) {
        if (Math.hypot(c.x - inv.pos.x, c.y - inv.pos.y) < 260) {
          c.count++;
          c.tier = Math.max(c.tier, tier);
          merged = true;
          break;
        }
      }
      if (!merged) clusters.push({ x: inv.pos.x, y: inv.pos.y, tier, count: 1 });
    }
    // One chevron per cluster of three.
    for (const c of clusters) {
      const chevrons = Math.max(1, Math.ceil(c.count / 3));
      for (let i = 0; i < chevrons && out.length < 12; i++) {
        out.push({ x: c.x, y: c.y, tier: c.tier });
      }
    }
  }

  get lightPoolCount(): number {
    return this.lighting.activePools;
  }
}
