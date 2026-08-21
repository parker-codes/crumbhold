import {
  BackSide, BoxGeometry, Color, ConeGeometry, Euler, Group, InstancedMesh,
  Matrix4, MeshLambertMaterial, Quaternion, SphereGeometry, Vector3,
} from 'three';
import { FIXED } from './palette';
import type { Blueprint } from './creatureShapes';

const BODY_CAP = 720;
const LIMB_CAP = 1500;
const SPIKE_CAP = 600;
const OUTLINE_SCALE = 1.14;

/**
 * Every creature in the gallery draws from five instanced meshes: body segments,
 * their outline shell, limbs, spikes, and the spike outline shell. That is five
 * draw calls for the whole population, and it keeps the live tripod gait, which
 * is the difference between "ant" and "brown blob".
 */
export class CreatureLayer {
  readonly group = new Group();

  private readonly bodies: InstancedMesh;
  private readonly bodyOutlines: InstancedMesh;
  private readonly limbs: InstancedMesh;
  private readonly spikes: InstancedMesh;
  private readonly spikeOutlines: InstancedMesh;

  private bodyCount = 0;
  private limbCount = 0;
  private spikeCount = 0;

  private readonly matrix = new Matrix4();
  private readonly outlineMatrix = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly euler = new Euler();
  private readonly scale = new Vector3();
  private readonly color = new Color();
  private readonly limbColor = new Color();
  private readonly white = new Color(0xffffff);

  constructor() {
    const bodyGeo = new SphereGeometry(1, 12, 9);
    const bodyMat = new MeshLambertMaterial();
    this.bodies = makeInstanced(bodyGeo, bodyMat, BODY_CAP);

    const outlineMat = new MeshLambertMaterial({ side: BackSide, emissive: FIXED.ink });
    this.bodyOutlines = makeInstanced(bodyGeo, outlineMat, BODY_CAP);

    // Limb box has its origin at one end so scaling extends it outward.
    const limbGeo = new BoxGeometry(1, 1, 1);
    limbGeo.translate(0.5, 0, 0);
    this.limbs = makeInstanced(limbGeo, new MeshLambertMaterial(), LIMB_CAP);

    const spikeGeo = new ConeGeometry(1, 1, 7);
    // Point the cone along +x with its base at the origin.
    spikeGeo.rotateZ(-Math.PI / 2);
    spikeGeo.translate(0.5, 0, 0);
    this.spikes = makeInstanced(spikeGeo, new MeshLambertMaterial(), SPIKE_CAP);
    this.spikeOutlines = makeInstanced(spikeGeo, outlineMat.clone(), SPIKE_CAP);

    // Outlines first so the bodies paint over their interiors.
    this.group.add(this.bodyOutlines, this.spikeOutlines, this.bodies, this.limbs, this.spikes);
  }

  begin(): void {
    this.bodyCount = 0;
    this.limbCount = 0;
    this.spikeCount = 0;
  }

  /**
   * Emits one creature. `flash` whitens the body for the 60 ms hit response,
   * `curl` compresses it (the pillbug's frontal reaction), and `gait` drives the
   * two-phase tripod.
   */
  add(
    blueprint: Blueprint,
    x: number, y: number, facing: number, gait: number,
    scale: number, flash: number, curl: number, tintOverride: number | null,
  ): void {
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const squash = 1 - curl * 0.3;
    const rise = 1 + curl * 0.25;

    for (const seg of blueprint.segments) {
      const localZ = seg.z ?? 0;
      const wx = x + (seg.f * cos - localZ * sin) * scale * squash;
      const wz = y + (seg.f * sin + localZ * cos) * scale * squash;
      this.pos.set(wx, seg.y * scale * rise, wz);
      this.euler.set(0, -facing, 0);
      this.quat.setFromEuler(this.euler);
      this.scale.set(seg.l * scale, seg.h * scale * rise, seg.w * scale);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.color.set(tintOverride ?? seg.color);
      if (flash > 0) this.color.lerp(this.white, Math.min(1, flash * 14));
      this.pushBody(this.matrix, this.color);
    }

    for (const spike of blueprint.spikes) {
      const yaw = facing + spike.yaw;
      const wx = x + (spike.f * cos - spike.z * sin) * scale;
      const wz = y + (spike.f * sin + spike.z * cos) * scale;
      this.pos.set(wx, spike.y * scale * rise, wz);
      this.euler.set(0, -yaw, 0);
      this.quat.setFromEuler(this.euler);
      this.scale.set(spike.len * scale, spike.radius * scale, spike.radius * scale);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.color.set(tintOverride ?? spike.color);
      if (flash > 0) this.color.lerp(this.white, Math.min(1, flash * 14));
      this.pushSpike(this.matrix, this.color);
    }

    const legs = blueprint.legs;
    this.limbColor.set(tintOverride ?? blueprint.limbColor);
    if (flash > 0) this.limbColor.lerp(this.white, Math.min(1, flash * 14));
    for (let pair = 0; pair < legs.attach.length; pair++) {
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        // Alternating tripod: adjacent pairs and opposite sides swing together.
        const phaseFlip = (pair + side) % 2 === 0 ? 0 : Math.PI;
        const swing = Math.sin(gait + phaseFlip);
        const lift = Math.max(0, swing) * legs.lift;
        // Legs splay sideways, then swing fore and aft with the gait.
        const swung = facing + sign * (Math.PI / 2) + swing * legs.swing * sign;
        const attachF = legs.attach[pair];
        const attachZ = sign * legs.spread;
        const wx = x + (attachF * cos - attachZ * sin) * scale;
        const wz = y + (attachF * sin + attachZ * cos) * scale;
        this.pos.set(wx, (blueprint.segments[0].y * 0.7 + lift) * scale, wz);
        this.euler.set(0, -swung, -0.45);
        this.quat.setFromEuler(this.euler);
        this.scale.set(legs.length * scale, legs.thickness * scale, legs.thickness * scale);
        this.matrix.compose(this.pos, this.quat, this.scale);
        this.pushLimb(this.matrix, this.limbColor);
      }
    }

    if (blueprint.antennae) {
      const a = blueprint.antennae;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        // Antennae lag the body: a slow counter-sway off the gait phase.
        const sway = Math.sin(gait * 0.5 + sign) * 0.16;
        const yaw = facing + sign * a.spread + sway;
        const wx = x + a.f * cos * scale;
        const wz = y + a.f * sin * scale;
        this.pos.set(wx, (blueprint.segments[0].y + 4) * scale, wz);
        this.euler.set(0, -yaw, 0.3 + sway);
        this.quat.setFromEuler(this.euler);
        this.scale.set(a.length * scale, 1.6 * scale, 1.6 * scale);
        this.matrix.compose(this.pos, this.quat, this.scale);
        this.pushLimb(this.matrix, this.limbColor);
      }
    }
  }

  private pushBody(matrix: Matrix4, color: Color): void {
    if (this.bodyCount >= BODY_CAP) return;
    const i = this.bodyCount++;
    this.bodies.setMatrixAt(i, matrix);
    this.bodies.setColorAt(i, color);
    this.outlineMatrix.copy(matrix).scale(scaleUp);
    this.bodyOutlines.setMatrixAt(i, this.outlineMatrix);
  }

  private pushSpike(matrix: Matrix4, color: Color): void {
    if (this.spikeCount >= SPIKE_CAP) return;
    const i = this.spikeCount++;
    this.spikes.setMatrixAt(i, matrix);
    this.spikes.setColorAt(i, color);
    this.outlineMatrix.copy(matrix).scale(scaleUp);
    this.spikeOutlines.setMatrixAt(i, this.outlineMatrix);
  }

  private pushLimb(matrix: Matrix4, color: Color): void {
    if (this.limbCount >= LIMB_CAP) return;
    const i = this.limbCount++;
    this.limbs.setMatrixAt(i, matrix);
    this.limbs.setColorAt(i, color);
  }

  /** Publishes the frame's instance counts and flags the buffers dirty. */
  commit(highContrast: boolean): void {
    this.bodies.count = this.bodyCount;
    this.bodyOutlines.count = this.bodyCount;
    this.limbs.count = this.limbCount;
    this.spikes.count = this.spikeCount;
    this.spikeOutlines.count = this.spikeCount;
    flag(this.bodies);
    flag(this.bodyOutlines);
    flag(this.limbs);
    flag(this.spikes);
    flag(this.spikeOutlines);
    const outline = this.bodyOutlines.material as MeshLambertMaterial;
    outline.emissive.set(highContrast ? 0xffffff : FIXED.ink);
    outline.color.set(highContrast ? 0xffffff : FIXED.ink);
  }
}

const scaleUp = new Vector3(OUTLINE_SCALE, OUTLINE_SCALE, OUTLINE_SCALE);

function makeInstanced(
  geometry: BoxGeometry | SphereGeometry | ConeGeometry,
  material: MeshLambertMaterial,
  cap: number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, cap);
  mesh.frustumCulled = false;
  mesh.count = 0;
  // Seed instanceColor so the attribute exists before the first setColorAt.
  const seed = new Color(0xffffff);
  for (let i = 0; i < cap; i++) mesh.setColorAt(i, seed);
  return mesh;
}

function flag(mesh: InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
