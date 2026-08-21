import {
  AdditiveBlending, CanvasTexture, CircleGeometry, Color, Group, InstancedMesh,
  Matrix4, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, Vector3,
} from 'three';
import { CAPS, WORLD } from '../game/balance';
import { GLOWWORMS, TUNNEL_MOUTHS } from '../game/gallery';
import { FIXED } from './palette';
import type { Palette } from './palette';
import type { Structure } from '../game/types';

/**
 * Tight enough that each structure keeps its own pool. At the old radius every
 * pool in a built-out chamber overlapped into one grey wash, which said nothing
 * about which buildings were carrying the light.
 */
const GLOWCAP_RADIUS = 150;
const GLOWWORM_RADIUS = 220;
const SHAFT_WIDTH = 260;

/**
 * Light as a system (section 12). By day one soft parallelogram of daylight
 * sweeps the floor and is the clock. At night the shaft closes and the colony is
 * lit by its own glowcaps, so a well-built colony is literally brighter.
 */
export class Lighting {
  readonly group = new Group();

  private readonly shaftFloor: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly shaftColumn: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly capPools: InstancedMesh;
  private readonly wormPools: InstancedMesh;
  private poolCount = 0;
  private readonly matrix = new Matrix4();
  private readonly quat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
  private readonly scale = new Vector3(1, 1, 1);
  private readonly pos = new Vector3();
  private readonly capColor = new Color(FIXED.glowcap);
  private readonly wormColor = new Color(FIXED.glowworm);
  private flicker = 0;

  constructor() {
    const glow = new CanvasTexture(buildRadialCanvas());

    // The shaft gets its own map. A radial glow stretched down a 2400 unit plane
    // fades along the length, which reads as a blot; a bar gradient keeps the
    // falloff across the width where the light actually falls off.
    const shaftMat = new MeshBasicMaterial({
      map: new CanvasTexture(buildShaftCanvas()),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.14,
    });
    this.shaftFloor = new Mesh(new PlaneGeometry(SHAFT_WIDTH, WORLD.height * 1.1), shaftMat);
    this.shaftFloor.rotation.x = -Math.PI / 2;
    this.shaftFloor.position.y = 3;
    this.group.add(this.shaftFloor);

    // A faint standing slab so the shaft reads as a column of light, not a decal.
    this.shaftColumn = new Mesh(
      new PlaneGeometry(SHAFT_WIDTH * 0.8, 620),
      shaftMat.clone(),
    );
    this.shaftColumn.material.opacity = 0.2;
    this.shaftColumn.position.set(TUNNEL_MOUTHS[0].x, 300, TUNNEL_MOUTHS[0].y + 300);
    this.group.add(this.shaftColumn);

    const poolMat = new MeshBasicMaterial({
      map: glow,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 0.34,
    });
    this.capPools = new InstancedMesh(new CircleGeometry(1, 28), poolMat, CAPS.lightPools);
    this.capPools.frustumCulled = false;
    this.capPools.count = 0;
    this.group.add(this.capPools);

    const wormMat = poolMat.clone();
    wormMat.opacity = 0.22;
    this.wormPools = new InstancedMesh(new CircleGeometry(1, 28), wormMat, GLOWWORMS.length);
    this.wormPools.frustumCulled = false;
    this.group.add(this.wormPools);
    for (let i = 0; i < GLOWWORMS.length; i++) {
      this.setPool(this.wormPools, i, GLOWWORMS[i].x, GLOWWORMS[i].y, GLOWWORM_RADIUS, this.wormColor);
    }
  }

  /**
   * Rebuilt only when a structure completes or falls. Overlapping pools merge by
   * dropping the smaller of two near-coincident sources, keeping the cap at 24.
   */
  rebuild(structures: readonly Structure[]): void {
    const points: { x: number; y: number; r: number }[] = [];
    for (const s of structures) {
      if (s.glowcaps <= 0) continue;
      points.push({
        x: s.pos.x,
        y: s.pos.y,
        // Each tier adds a cap, and more caps mean a wider pool.
        r: GLOWCAP_RADIUS * (0.62 + 0.16 * s.glowcaps),
      });
    }
    points.sort((a, b) => b.r - a.r);
    const merged: typeof points = [];
    for (const p of points) {
      if (merged.length >= CAPS.lightPools) break;
      let absorbed = false;
      for (const m of merged) {
        if (Math.hypot(m.x - p.x, m.y - p.y) < m.r * 0.5) {
          absorbed = true;
          break;
        }
      }
      if (!absorbed) merged.push(p);
    }
    for (let i = 0; i < merged.length; i++) {
      this.setPool(this.capPools, i, merged[i].x, merged[i].y, merged[i].r, this.capColor);
    }
    this.poolCount = merged.length;
    this.capPools.count = merged.length;
    this.capPools.instanceMatrix.needsUpdate = true;
  }

  private setPool(mesh: InstancedMesh, index: number, x: number, y: number, r: number, color: Color): void {
    this.pos.set(x, 4 + index * 0.05, y);
    this.scale.set(r, r, r);
    this.matrix.compose(this.pos, this.quat, this.scale);
    mesh.setMatrixAt(index, this.matrix);
    mesh.setColorAt(index, color);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  update(palette: Palette, nightMix: number, shaftT: number, dt: number, quality: number): void {
    // Day: the shaft sweeps left to right across the floor over the whole day.
    const dayness = 1 - nightMix;
    const x = WORLD.width * (0.16 + shaftT * 0.68);
    this.shaftFloor.position.x = x;
    this.shaftFloor.position.z = WORLD.height * 0.5;
    this.shaftFloor.material.color.copy(palette.shaft);
    // The one real light source by day, and the clock: worth being the brightest
    // thing in the frame rather than a wash the player never notices.
    this.shaftFloor.material.opacity = 0.42 * dayness;
    this.shaftFloor.visible = dayness > 0.02;

    this.shaftColumn.position.x = x;
    this.shaftColumn.material.color.copy(palette.shaft);
    this.shaftColumn.material.opacity = 0.22 * dayness;
    this.shaftColumn.visible = this.shaftFloor.visible;

    // Night: glowcaps and the two glowworm lanterns take over, worms flickering
    // gently on a four second cycle.
    this.flicker += dt;
    const worm = 0.86 + Math.sin(this.flicker * (Math.PI * 2) / 4) * 0.14;
    const capOpacity = 0.34 * nightMix * quality;
    (this.capPools.material as MeshBasicMaterial).opacity = capOpacity;
    (this.wormPools.material as MeshBasicMaterial).opacity = 0.22 * nightMix * worm;
    this.capPools.visible = nightMix > 0.02 && this.poolCount > 0;
    this.wormPools.visible = nightMix > 0.02;
  }

  get activePools(): number {
    return this.poolCount + GLOWWORMS.length;
  }
}

/**
 * A bar of light: bright core, soft shoulders, and a short fade at each end so
 * the shaft does not stop with a hard line at the plane edge.
 */
function buildShaftCanvas(): HTMLCanvasElement {
  const w = 128;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const across = ctx.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.26, 'rgba(255,255,255,0.32)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(0.74, 'rgba(255,255,255,0.32)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const along = ctx.createLinearGradient(0, 0, 0, h);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.14, 'rgba(255,255,255,1)');
  along.addColorStop(0.86, 'rgba(255,255,255,1)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}

function buildRadialCanvas(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}
