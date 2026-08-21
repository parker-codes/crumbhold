import {
  BackSide, BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, Quaternion, SphereGeometry,
  Vector3,
} from 'three';
import { easeOutBack } from '../engine/ease';
import { FX, type BuildableKind } from '../game/balance';
import { FIXED } from './palette';
import type { Palette } from './palette';
import type { Structure } from '../game/types';

const GLOWCAP_CAP = 80;

interface Piece {
  /** Offsets and half-extents in world units. */
  dx: number;
  dz: number;
  y: number;
  w: number;
  h: number;
  d: number;
  tone: 'pebble' | 'pebbleDark' | 'resin' | 'sugar' | 'colony' | 'ink';
  /** Rotation about the vertical axis. */
  yaw?: number;
}

/**
 * Structures are a footprint, a front face, and a top: enough dimension to read
 * as built masonry without becoming a diorama. Each tier adds mass and one
 * glowcap, which is both the tier readout and the night light source.
 */
function pieces(kind: BuildableKind, tier: number): Piece[] {
  const t = tier;
  switch (kind) {
    case 'broodChamber':
      return [
        { dx: 0, dz: 0, y: 0, w: 150, h: 26, d: 150, tone: 'pebbleDark' },
        { dx: 0, dz: 0, y: 26, w: 118, h: 30 + t * 9, d: 118, tone: 'pebble' },
        { dx: 0, dz: -22, y: 56 + t * 9, w: 74, h: 22, d: 60, tone: 'pebbleDark' },
        { dx: -34, dz: 26, y: 30, w: 30, h: 24, d: 30, tone: 'sugar' },
        { dx: 0, dz: 26, y: 30, w: 30, h: 26, d: 30, tone: 'sugar' },
        { dx: 34, dz: 26, y: 30, w: 30, h: 24, d: 30, tone: 'sugar' },
      ];
    case 'barricade': {
      const thick = 34 + t * 16;
      return [
        { dx: 0, dz: 0, y: 0, w: 190, h: 24 + t * 20, d: thick, tone: 'pebble' },
        { dx: -58, dz: 0, y: 24 + t * 20, w: 54, h: 18, d: thick * 0.8, tone: 'pebbleDark' },
        { dx: 12, dz: 0, y: 24 + t * 20, w: 66, h: 24, d: thick * 0.8, tone: 'pebbleDark' },
        { dx: 0, dz: thick * 0.5, y: 12, w: 190, h: 16, d: 12, tone: 'resin' },
      ];
    }
    case 'spitter':
      return [
        { dx: 0, dz: 0, y: 0, w: 74, h: 18, d: 74, tone: 'pebbleDark' },
        { dx: 0, dz: 0, y: 18, w: 46, h: 46 + t * 18, d: 46, tone: 'pebble' },
        { dx: 0, dz: 0, y: 64 + t * 18, w: 60, h: 16, d: 60, tone: 'pebbleDark' },
        { dx: 0, dz: -18, y: 74 + t * 18, w: 20, h: 14, d: 40, tone: 'resin' },
      ];
    case 'battery':
      return [
        { dx: 0, dz: 0, y: 0, w: 100, h: 20, d: 88, tone: 'pebbleDark' },
        { dx: 0, dz: 0, y: 20, w: 68, h: 34 + t * 12, d: 62, tone: 'pebble' },
        { dx: 0, dz: -34, y: 34 + t * 12, w: 20, h: 20, d: 76, tone: 'ink' },
        { dx: -22, dz: 12, y: 54 + t * 12, w: 22, h: 22, d: 22, tone: 'sugar' },
        { dx: 22, dz: 12, y: 54 + t * 12, w: 22, h: 22, d: 22, tone: 'sugar' },
      ];
    case 'gallery':
      return [
        { dx: 0, dz: 0, y: 0, w: 108, h: 18, d: 96, tone: 'pebbleDark' },
        { dx: 0, dz: 6, y: 18, w: 84, h: 30 + t * 8, d: 68, tone: 'pebble' },
        { dx: -26, dz: -34, y: 18, w: 26, h: 26, d: 26, tone: 'ink' },
        { dx: 8, dz: -34, y: 18, w: 26, h: 26, d: 26, tone: 'ink' },
        { dx: 34, dz: -30, y: 18, w: 22, h: 22, d: 22, tone: 'ink' },
      ];
    case 'paddock':
      return [
        { dx: 0, dz: 0, y: 0, w: 96, h: 14, d: 88, tone: 'pebbleDark' },
        { dx: -40, dz: 0, y: 14, w: 14, h: 40, d: 14, tone: 'resin' },
        { dx: 40, dz: 0, y: 14, w: 14, h: 40, d: 14, tone: 'resin' },
        { dx: 0, dz: -38, y: 40, w: 94, h: 12, d: 12, tone: 'resin' },
        { dx: 0, dz: 20, y: 14, w: 56, h: 18 + t * 8, d: 40, tone: 'pebbleDark' },
      ];
    case 'venomWell':
      return [
        { dx: 0, dz: 0, y: 0, w: 88, h: 16, d: 88, tone: 'pebbleDark' },
        { dx: 0, dz: 0, y: 16, w: 62, h: 26 + t * 8, d: 62, tone: 'pebble', yaw: Math.PI / 4 },
        { dx: 0, dz: 0, y: 42 + t * 8, w: 42, h: 12, d: 42, tone: 'colony' },
      ];
    case 'hoard':
      return [
        { dx: 0, dz: 0, y: 0, w: 104, h: 16, d: 96, tone: 'pebbleDark' },
        { dx: -28, dz: 0, y: 16, w: 40, h: 26 + t * 12, d: 40, tone: 'sugar' },
        { dx: 24, dz: 10, y: 16, w: 44, h: 20 + t * 14, d: 40, tone: 'sugar' },
        { dx: 4, dz: -30, y: 16, w: 34, h: 18 + t * 8, d: 30, tone: 'sugar' },
      ];
    case 'nectarVat':
      return [
        { dx: 0, dz: 0, y: 0, w: 92, h: 14, d: 92, tone: 'pebbleDark' },
        { dx: 0, dz: 0, y: 14, w: 64, h: 28 + t * 8, d: 64, tone: 'resin' },
        { dx: 0, dz: 0, y: 42 + t * 8, w: 70, h: 8, d: 70, tone: 'sugar' },
      ];
    case 'fungusGarden':
      return [
        { dx: 0, dz: 0, y: 0, w: 96, h: 12, d: 96, tone: 'pebbleDark' },
        { dx: -22, dz: -12, y: 12, w: 34, h: 20 + t * 6, d: 34, tone: 'resin' },
        { dx: 20, dz: 14, y: 12, w: 38, h: 24 + t * 6, d: 34, tone: 'resin' },
      ];
    case 'aphidPen':
      return [
        { dx: 0, dz: 0, y: 0, w: 80, h: 12, d: 80, tone: 'pebbleDark' },
        { dx: -18, dz: 0, y: 12, w: 26, h: 20, d: 26, tone: 'resin' },
        { dx: 16, dz: 12, y: 12, w: 24, h: 18 + t * 6, d: 24, tone: 'resin' },
        { dx: 14, dz: -16, y: 12, w: 22, h: 16, d: 22, tone: 'resin' },
      ];
    case 'mortarPile':
      return [
        { dx: 0, dz: 0, y: 0, w: 78, h: 10, d: 78, tone: 'pebbleDark' },
        { dx: 0, dz: 0, y: 10, w: 50, h: 24, d: 50, tone: 'resin' },
      ];
    default:
      return [];
  }
}

/** Vertical scale on every piece. Silhouettes stay readable from above. */
const HEIGHT_SCALE = 0.72;

interface Built {
  group: Group;
  meshes: { mesh: Mesh<BoxGeometry, MeshLambertMaterial>; tone: Piece['tone'] }[];
  tier: number;
  kind: BuildableKind;
}

/** Structures carry a 6 unit ink outline. Outlines are the identity of the look. */
const OUTLINE_UNITS = 6;

export class StructureLayer {
  readonly group = new Group();
  private readonly built = new Map<number, Built>();
  private readonly boxGeo = new BoxGeometry(1, 1, 1);
  private readonly outlineMat = new MeshBasicMaterial({ color: FIXED.ink, side: BackSide });
  private readonly caps: InstancedMesh;
  private readonly stems: InstancedMesh;
  private capCount = 0;

  private readonly matrix = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly scale = new Vector3();

  constructor() {
    this.caps = new InstancedMesh(
      new SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new MeshLambertMaterial({ color: FIXED.glowcap, emissive: FIXED.glowcap, emissiveIntensity: 0.55 }),
      GLOWCAP_CAP,
    );
    this.stems = new InstancedMesh(
      new CylinderGeometry(1, 1, 1, 6),
      new MeshLambertMaterial({ color: 0xdfe7c8 }),
      GLOWCAP_CAP,
    );
    this.caps.frustumCulled = false;
    this.stems.frustumCulled = false;
    this.group.add(this.caps, this.stems);
  }

  /** Rebuilds only the structures whose tier changed. */
  sync(structures: readonly Structure[]): void {
    const seen = new Set<number>();
    for (const s of structures) {
      seen.add(s.id);
      const existing = this.built.get(s.id);
      if (existing && existing.tier === s.tier && existing.kind === s.kind) continue;
      if (existing) this.group.remove(existing.group);
      this.built.set(s.id, this.make(s));
    }
    for (const [id, built] of this.built) {
      if (seen.has(id)) continue;
      this.group.remove(built.group);
      this.built.delete(id);
    }
  }

  private make(s: Structure): Built {
    const group = new Group();
    group.position.set(s.pos.x, 0, s.pos.y);
    const meshes: Built['meshes'] = [];
    for (const piece of pieces(s.kind, s.tier)) {
      const h = piece.h * HEIGHT_SCALE;
      const y = piece.y * HEIGHT_SCALE + h / 2;

      const outline = new Mesh(this.boxGeo, this.outlineMat);
      outline.scale.set(piece.w + OUTLINE_UNITS * 2, h + OUTLINE_UNITS, piece.d + OUTLINE_UNITS * 2);
      outline.position.set(piece.dx, y, piece.dz);
      if (piece.yaw) outline.rotation.y = piece.yaw;
      group.add(outline);

      const mat = new MeshLambertMaterial();
      const mesh = new Mesh(this.boxGeo, mat);
      mesh.scale.set(piece.w, h, piece.d);
      mesh.position.set(piece.dx, y, piece.dz);
      if (piece.yaw) mesh.rotation.y = piece.yaw;
      group.add(mesh);
      meshes.push({ mesh, tone: piece.tone });
    }
    this.group.add(group);
    return { group, meshes, tier: s.tier, kind: s.kind };
  }

  update(
    structures: readonly Structure[],
    palette: Palette,
    reducedMotion: boolean,
  ): void {
    this.capCount = 0;
    for (const s of structures) {
      const built = this.built.get(s.id);
      if (!built) continue;
      // Structures pack themselves up out of the floor with an overshoot.
      const raw = Math.min(1, Math.max(0, s.riseT) / FX.structureRiseDuration);
      const rise = s.riseT >= FX.structureRiseDuration
        ? 1
        : reducedMotion
          ? raw
          : easeOutBack(raw, FX.structureRiseOvershoot);
      // A breached structure slumps into the floor: the ruin is readable from
      // across the gallery, and it is still there to patch.
      const breached = s.hp <= 0;
      built.group.scale.set(1, Math.max(0.02, rise) * (breached ? 0.34 : 1), 1);
      const damaged = breached ? 1 : 1 - s.hp / s.maxHp;
      for (const entry of built.meshes) {
        const mat = entry.mesh.material;
        applyTone(mat.color, entry.tone, palette);
        // Damage reads as the masonry losing colour, before any HP bar is shown.
        if (damaged > 0.02) mat.color.lerp(damageTint, damaged * (breached ? 0.85 : 0.55));
        if (s.flash > 0) mat.color.lerp(white, Math.min(1, s.flash * 12));
      }
      this.emitGlowcaps(s);
    }
    this.caps.count = this.capCount;
    this.stems.count = this.capCount;
    this.caps.instanceMatrix.needsUpdate = true;
    this.stems.instanceMatrix.needsUpdate = true;
  }

  /** One luminous cap per tier, arranged around the structure's edge. */
  private emitGlowcaps(s: Structure): void {
    const radius = 52;
    for (let i = 0; i < s.glowcaps; i++) {
      if (this.capCount >= GLOWCAP_CAP) return;
      const angle = (i / Math.max(1, s.glowcaps)) * Math.PI * 2 + s.id * 0.7;
      const x = s.pos.x + Math.cos(angle) * radius;
      const z = s.pos.y + Math.sin(angle) * radius;
      const stemH = 20;
      this.pos.set(x, stemH / 2, z);
      this.quat.identity();
      this.scale.set(3.2, stemH, 3.2);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.stems.setMatrixAt(this.capCount, this.matrix);
      this.pos.set(x, stemH, z);
      this.scale.set(12, 9, 12);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.caps.setMatrixAt(this.capCount, this.matrix);
      this.capCount++;
    }
  }
}

const damageTint = new Color(0x3a3540);
const white = new Color(0xffffff);

function applyTone(out: Color, tone: Piece['tone'], palette: Palette): void {
  switch (tone) {
    case 'pebble': out.copy(palette.pebble); break;
    case 'pebbleDark': out.copy(palette.pebbleDark); break;
    case 'resin': out.copy(palette.resin); break;
    case 'sugar': out.set(FIXED.sugar); break;
    case 'colony': out.set(FIXED.colony); break;
    case 'ink': out.set(FIXED.ink); break;
    default: out.copy(palette.pebble); break;
  }
}
