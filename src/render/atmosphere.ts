import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  DynamicDrawUsage, Points, PointsMaterial,
} from 'three';
import { WORLD } from '../game/balance';
import { mulberry32 } from '../engine/rng';
import { FIXED } from './palette';
import type { Palette } from './palette';

/** Enough that a few dozen are in frame at play zoom, and no more. */
const MOTE_COUNT = 260;
const CEILING = 420;

/**
 * Air. A gallery cut out of earth is not a vacuum, and nothing else in the scene
 * says so: the floor, the masonry and the creatures all sit on the same plane, so
 * the only thing between the camera and the floor is emptiness.
 *
 * By day these are dust in the light shaft, warm and slow. At night they are
 * spores off the fungus garden, cool and green. One draw call either way.
 */
export class Atmosphere {
  readonly points: Points<BufferGeometry, PointsMaterial>;

  private readonly positions: Float32Array;
  private readonly drift: Float32Array;
  private readonly attribute: BufferAttribute;
  private readonly material: PointsMaterial;
  private readonly tint = new Color();
  private readonly rng = mulberry32(0x0d0057);

  constructor() {
    const rng = this.rng;

    this.positions = new Float32Array(MOTE_COUNT * 3);
    this.drift = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i++) {
      const at = i * 3;
      this.positions[at] = rng.next() * WORLD.width;
      this.positions[at + 1] = rng.next() * CEILING;
      this.positions[at + 2] = rng.next() * WORLD.height;
      // Mostly upward, because a mote that only drifts sideways reads as snow.
      this.drift[at] = (rng.next() - 0.5) * 14;
      this.drift[at + 1] = 6 + rng.next() * 16;
      this.drift[at + 2] = (rng.next() - 0.5) * 14;
    }

    const geometry = new BufferGeometry();
    this.attribute = new BufferAttribute(this.positions, 3);
    this.attribute.setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.attribute);

    this.material = new PointsMaterial({
      map: new CanvasTexture(buildMoteCanvas()),
      size: 3.4,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
      opacity: 0.34,
      blending: AdditiveBlending,
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
  }

  /** `quality` below 1 hides the motes outright: they are pure decoration. */
  update(palette: Palette, nightMix: number, dt: number, quality: number): void {
    this.points.visible = quality >= 1;
    if (!this.points.visible) return;

    for (let i = 0; i < MOTE_COUNT; i++) {
      const at = i * 3;
      this.positions[at] += this.drift[at] * dt;
      this.positions[at + 1] += this.drift[at + 1] * dt;
      this.positions[at + 2] += this.drift[at + 2] * dt;
      // A mote that reaches the ceiling reappears on the floor, so the field
      // never thins out over a long run.
      if (this.positions[at + 1] > CEILING) {
        this.positions[at] = this.rng.next() * WORLD.width;
        this.positions[at + 1] = 0;
        this.positions[at + 2] = this.rng.next() * WORLD.height;
      }
    }
    this.attribute.needsUpdate = true;

    this.tint.copy(palette.shaft).lerp(sporeColor, nightMix);
    this.material.color.copy(this.tint);
    this.material.opacity = 0.3 + nightMix * 0.16;
  }
}

const sporeColor = new Color(FIXED.glowcap);

function buildMoteCanvas(): HTMLCanvasElement {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
