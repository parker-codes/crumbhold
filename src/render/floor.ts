import {
  BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, DoubleSide,
  Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry,
  RepeatWrapping, RingGeometry,
} from 'three';
import { WORLD } from '../game/balance';
import { BROOD_POS, LANES, TUNNEL_MOUTHS } from '../game/gallery';
import { mulberry32 } from '../engine/rng';
import type { Palette } from './palette';

const TEX_W = 512;
const TEX_H = 768;

/**
 * The floor plane runs well past the playable bounds. At a wide aspect the
 * frustum is nearly 2000 units across against a 1440 unit world, so a plane cut
 * to `WORLD` showed its own edge against the clear colour — the gallery looked
 * like a rug rather than a room dug out of earth.
 */
const FLOOR_OVERSCAN = 2.2;

/**
 * Static world layer: packed-earth floor with excavation detail, the three lane
 * tunnels, and the chamber converge ring. Built once. Every colour is read from
 * the live palette each frame, so the cross-fade costs nothing.
 */
export class FloorLayer {
  readonly group = new Group();
  private readonly floorMat: MeshLambertMaterial;
  private readonly laneMat: MeshBasicMaterial;
  private readonly ringMat: MeshBasicMaterial;
  private readonly wallMat: MeshBasicMaterial;
  private readonly collarMat = new MeshLambertMaterial();
  private readonly chamberMat: MeshBasicMaterial;

  constructor() {
    const detail = new CanvasTexture(buildDetailCanvas());
    detail.wrapS = RepeatWrapping;
    detail.wrapT = RepeatWrapping;
    detail.anisotropy = 4;
    // Tiled so the grain reads at play zoom instead of as soft blotches. The
    // repeat scales with the overscan so the grain size never changes.
    detail.repeat.set(4 * FLOOR_OVERSCAN, 6 * FLOOR_OVERSCAN);

    this.floorMat = new MeshLambertMaterial({ map: detail });
    const floor = new Mesh(
      new PlaneGeometry(WORLD.width * FLOOR_OVERSCAN, WORLD.height * FLOOR_OVERSCAN),
      this.floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WORLD.width / 2, 0, WORLD.height / 2);
    floor.receiveShadow = true;
    this.group.add(floor);

    // The chamber floor: earth swept flat around the brood, with a soft edge so
    // it reads as worn rather than painted on. It gives the frame a centre to
    // fall away from, which the raw floor tone alone never did.
    const falloff = new CanvasTexture(buildFalloffCanvas());
    this.chamberMat = new MeshBasicMaterial({
      map: falloff, transparent: true, opacity: 0.34, depthWrite: false,
    });
    const chamber = new Mesh(new CircleGeometry(WORLD.laneConvergeRadius * 1.34, 56), this.chamberMat);
    chamber.rotation.x = -Math.PI / 2;
    chamber.position.set(BROOD_POS.x, 0.6, BROOD_POS.y);
    this.group.add(chamber);

    // Lanes: literal tunnels worn into the floor.
    this.laneMat = new MeshBasicMaterial({ transparent: true, opacity: 0.55 });
    for (const lane of LANES) {
      const mesh = new Mesh(ribbon(lane, 96), this.laneMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 1.2;
      this.group.add(mesh);
    }

    this.ringMat = new MeshBasicMaterial({ transparent: true, opacity: 0.3, side: DoubleSide });
    const ring = new Mesh(
      new RingGeometry(WORLD.laneConvergeRadius - 8, WORLD.laneConvergeRadius + 8, 72),
      this.ringMat,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(BROOD_POS.x, 1.6, BROOD_POS.y);
    this.group.add(ring);

    // Tunnel mouths: dark openings the raids come out of, ringed in masonry.
    // The hole is a radial fade rather than a flat disc, so it reads as depth.
    this.wallMat = new MeshBasicMaterial({
      map: new CanvasTexture(buildMouthCanvas()), transparent: true, depthWrite: false,
    });
    for (const mouth of TUNNEL_MOUTHS) {
      const collar = new Mesh(new CircleGeometry(118, 30), this.collarMat);
      collar.rotation.x = -Math.PI / 2;
      collar.position.set(mouth.x, 1.9, mouth.y);
      this.group.add(collar);
      const hole = new Mesh(new CircleGeometry(96, 30), this.wallMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(mouth.x, 2.2, mouth.y);
      this.group.add(hole);
    }
  }

  update(palette: Palette): void {
    this.floorMat.color.copy(palette.floor);
    this.chamberMat.color.copy(palette.floorAlt);
    this.laneMat.color.copy(palette.trail);
    this.ringMat.color.copy(palette.trail);
    this.wallMat.color.copy(palette.haze);
    this.collarMat.color.copy(palette.pebbleDark).multiplyScalar(0.9);
  }
}

/** Grayscale multiply map: scuffs, excavation marks, and grain. */
function buildDetailCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const rng = mulberry32(0x0c0ffee);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, TEX_W, TEX_H);

  // Broad excavation sweeps: long shallow arcs left by digging.
  ctx.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const x = rng.next() * TEX_W;
    const y = rng.next() * TEX_H;
    const r = 30 + rng.next() * 130;
    const a0 = rng.next() * Math.PI * 2;
    ctx.strokeStyle = rng.next() > 0.5 ? 'rgba(255,255,255,0.34)' : 'rgba(150,150,150,0.2)';
    ctx.lineWidth = 2 + rng.next() * 7;
    ctx.beginPath();
    ctx.arc(x, y, r, a0, a0 + 0.5 + rng.next() * 1.1);
    ctx.stroke();
  }
  // Pebbles pressed into the floor.
  for (let i = 0; i < 900; i++) {
    const x = rng.next() * TEX_W;
    const y = rng.next() * TEX_H;
    const r = 1 + rng.next() * 3.4;
    ctx.fillStyle = rng.next() > 0.45 ? 'rgba(255,255,255,0.4)' : 'rgba(110,110,130,0.24)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fine grain so the floor never reads as flat fill.
  const grain = ctx.getImageData(0, 0, TEX_W, TEX_H);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (rng.next() - 0.5) * 18;
    grain.data[i] = clampByte(grain.data[i] + n);
    grain.data[i + 1] = clampByte(grain.data[i + 1] + n);
    grain.data[i + 2] = clampByte(grain.data[i + 2] + n);
  }
  ctx.putImageData(grain, 0, 0);
  return canvas;
}

/** White at the centre fading to transparent: a soft-edged disc. */
function buildFalloffCanvas(): HTMLCanvasElement {
  return radialCanvas([[0, 1], [0.4, 0.86], [0.72, 0.36], [1, 0]]);
}

/** Opaque at the centre, so a tunnel mouth reads as a hole and not a decal. */
function buildMouthCanvas(): HTMLCanvasElement {
  return radialCanvas([[0, 1], [0.5, 0.97], [0.8, 0.66], [1, 0]]);
}

function radialCanvas(stops: readonly [number, number][]): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Builds a flat ribbon along a polyline, in the XY plane before rotation. */
export function ribbon(points: readonly { x: number; y: number }[], width: number): BufferGeometry {
  const half = width / 2;
  const verts = new Float32Array(points.length * 2 * 3);
  const uvs = new Float32Array(points.length * 2 * 2);
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty * half;
    const ny = tx * half;
    const p = points[i];
    const base = i * 6;
    verts[base] = p.x + nx;
    verts[base + 1] = -(p.y + ny);
    verts[base + 2] = 0;
    verts[base + 3] = p.x - nx;
    verts[base + 4] = -(p.y - ny);
    verts[base + 5] = 0;
    const uvBase = i * 4;
    const v = i / (points.length - 1);
    uvs[uvBase] = 0;
    uvs[uvBase + 1] = v;
    uvs[uvBase + 2] = 1;
    uvs[uvBase + 3] = v;
  }
  const indices: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(verts, 3));
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
