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
 * Static world layer: packed-earth floor with excavation detail, the three lane
 * tunnels, and the chamber converge ring. Built once. Every colour is read from
 * the live palette each frame, so the cross-fade costs nothing.
 */
export class FloorLayer {
  readonly group = new Group();
  private readonly floorMat: MeshLambertMaterial;
  private readonly laneMat: MeshBasicMaterial;
  private readonly ringMat: MeshBasicMaterial;
  private readonly wallMat: MeshLambertMaterial;
  private readonly collarMat = new MeshLambertMaterial();

  constructor() {
    const detail = new CanvasTexture(buildDetailCanvas());
    detail.wrapS = RepeatWrapping;
    detail.wrapT = RepeatWrapping;
    detail.anisotropy = 4;
    // Tiled so the grain reads at play zoom instead of as soft blotches.
    detail.repeat.set(4, 6);

    this.floorMat = new MeshLambertMaterial({ map: detail });
    const floor = new Mesh(new PlaneGeometry(WORLD.width, WORLD.height), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WORLD.width / 2, 0, WORLD.height / 2);
    this.group.add(floor);

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
    this.wallMat = new MeshLambertMaterial();
    for (const mouth of TUNNEL_MOUTHS) {
      const collar = new Mesh(new CircleGeometry(118, 30), this.collarMat);
      collar.rotation.x = -Math.PI / 2;
      collar.position.set(mouth.x, 1.9, mouth.y);
      this.group.add(collar);
      const hole = new Mesh(new CircleGeometry(86, 26), this.wallMat);
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(mouth.x, 2.2, mouth.y);
      this.group.add(hole);
    }
  }

  update(palette: Palette): void {
    this.floorMat.color.copy(palette.floor);
    this.laneMat.color.copy(palette.trail);
    this.ringMat.color.copy(palette.trail);
    this.wallMat.color.copy(palette.pebbleDark).multiplyScalar(0.42);
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
