import {
  AdditiveBlending, BackSide, BoxGeometry, CircleGeometry, Color,
  ConeGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry, Quaternion,
  RingGeometry, SphereGeometry, Vector3,
} from 'three';
import { GLOWWORMS, ROOT_POSITIONS, SITES, SITE_BY_ID } from '../game/gallery';
import { FIXED } from './palette';
import type { Palette } from './palette';
import type { RunState } from '../game/types';

const SHADOW_CAP = 420;
const ITEM_CAP = 320;
const PARTICLE_CAP = 260;
const PROJECTILE_CAP = 130;

const UP = new Vector3(1, 0, 0);

/** Flat ellipse shadows: no blur, offset down, alpha set by the theme rig. */
export class ShadowLayer {
  readonly mesh: InstancedMesh;
  private readonly material: MeshBasicMaterial;
  private count = 0;
  private readonly matrix = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion().setFromAxisAngle(UP, -Math.PI / 2);
  private readonly scale = new Vector3();

  constructor() {
    this.material = new MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false,
    });
    this.mesh = new InstancedMesh(new CircleGeometry(1, 18), this.material, SHADOW_CAP);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(alpha: number): void {
    this.count = 0;
    this.material.opacity = alpha;
  }

  add(x: number, y: number, radius: number): void {
    if (this.count >= SHADOW_CAP) return;
    this.pos.set(x, 2.4, y + 6);
    this.scale.set(radius, radius * 0.72, radius);
    this.matrix.compose(this.pos, this.quat, this.scale);
    this.mesh.setMatrixAt(this.count++, this.matrix);
  }

  commit(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * Resource items: faceted amber crystals, translucent honeydew droplets, and
 * flat green leaf wedges. The same three meshes serve the floor and the carry
 * stack, so the shapes always match between them.
 */
export class ItemLayer {
  readonly group = new Group();
  private readonly sugar: InstancedMesh;
  private readonly sugarOutline: InstancedMesh;
  private readonly honeydew: InstancedMesh;
  private readonly leaf: InstancedMesh;
  private counts = { sugar: 0, honeydew: 0, leaf: 0 };

  private readonly matrix = new Matrix4();
  private readonly outline = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly scale = new Vector3();

  constructor() {
    // A tall prism rather than a regular octahedron: a sugar grain is monoclinic
    // and reads as a shard, where an even eight-sided die reads as a gem.
    const crystal = new OctahedronGeometry(1, 0);
    crystal.scale(0.74, 1.42, 0.74);
    this.sugar = instanced(crystal, new MeshLambertMaterial({
      color: FIXED.sugarCrystal, emissive: FIXED.sugarCrystal, emissiveIntensity: 0.16,
    }), ITEM_CAP);
    // The gold stays on the outline, so a crystal still belongs to the economy
    // without being the same colour as a droplet of honeydew.
    this.sugarOutline = instanced(crystal, new MeshLambertMaterial({
      color: FIXED.sugarFacet, side: BackSide,
    }), ITEM_CAP);
    this.honeydew = instanced(new SphereGeometry(1, 8, 6), new MeshLambertMaterial({
      color: FIXED.honeydew, transparent: true, opacity: 0.85,
      emissive: FIXED.honeydew, emissiveIntensity: 0.25,
    }), ITEM_CAP);
    this.leaf = instanced(new BoxGeometry(1, 1, 1), new MeshLambertMaterial({
      color: FIXED.leaf,
    }), ITEM_CAP);
    this.group.add(this.sugarOutline, this.sugar, this.honeydew, this.leaf);
  }

  begin(): void {
    this.counts.sugar = 0;
    this.counts.honeydew = 0;
    this.counts.leaf = 0;
  }

  add(kind: 'sugar' | 'honeydew' | 'leaf', x: number, y: number, z: number, size: number, spin: number, tilt: number): void {
    this.pos.set(x, z, y);
    this.scale.set(size, size, size);
    switch (kind) {
      case 'sugar': {
        if (this.counts.sugar >= ITEM_CAP) return;
        this.quat.setFromAxisAngle(YAXIS, spin);
        this.matrix.compose(this.pos, this.quat, this.scale);
        const i = this.counts.sugar++;
        this.sugar.setMatrixAt(i, this.matrix);
        this.outline.copy(this.matrix).scale(OUTLINE_UP);
        this.sugarOutline.setMatrixAt(i, this.outline);
        break;
      }
      case 'honeydew': {
        if (this.counts.honeydew >= ITEM_CAP) return;
        // A gentle wobble, so a droplet never reads as a hard sphere.
        this.scale.set(size * (1 + Math.sin(spin * 3) * 0.12), size * (1 - Math.sin(spin * 3) * 0.1), size);
        this.quat.setFromAxisAngle(YAXIS, spin * 0.4);
        this.matrix.compose(this.pos, this.quat, this.scale);
        this.honeydew.setMatrixAt(this.counts.honeydew++, this.matrix);
        break;
      }
      default: {
        if (this.counts.leaf >= ITEM_CAP) return;
        // Flat wedges stacked at alternating angles.
        this.scale.set(size * 1.6, size * 0.34, size * 1.15);
        this.quat.setFromAxisAngle(YAXIS, spin);
        const tiltQuat = tiltScratch.setFromAxisAngle(ZAXIS, tilt);
        this.quat.multiply(tiltQuat);
        this.matrix.compose(this.pos, this.quat, this.scale);
        this.leaf.setMatrixAt(this.counts.leaf++, this.matrix);
        break;
      }
    }
  }

  commit(): void {
    this.sugar.count = this.counts.sugar;
    this.sugarOutline.count = this.counts.sugar;
    this.honeydew.count = this.counts.honeydew;
    this.leaf.count = this.counts.leaf;
    this.sugar.instanceMatrix.needsUpdate = true;
    this.sugarOutline.instanceMatrix.needsUpdate = true;
    this.honeydew.instanceMatrix.needsUpdate = true;
    this.leaf.instanceMatrix.needsUpdate = true;
  }
}

/** Pooled particles and acid globules. */
export class EffectLayer {
  readonly group = new Group();
  private readonly particles: InstancedMesh;
  private readonly globules: InstancedMesh;
  private pCount = 0;
  private gCount = 0;
  private readonly matrix = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly scale = new Vector3();
  private readonly color = new Color();

  constructor() {
    this.particles = instanced(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), PARTICLE_CAP);
    this.globules = instanced(new SphereGeometry(1, 6, 5), new MeshBasicMaterial({
      blending: AdditiveBlending, transparent: true, depthWrite: false,
    }), PROJECTILE_CAP);
    this.group.add(this.particles, this.globules);
  }

  begin(): void {
    this.pCount = 0;
    this.gCount = 0;
  }

  addParticle(x: number, y: number, z: number, size: number, color: number, fade: number): void {
    if (this.pCount >= PARTICLE_CAP) return;
    this.pos.set(x, z, y);
    this.scale.set(size, size, size);
    this.quat.identity();
    this.matrix.compose(this.pos, this.quat, this.scale);
    const i = this.pCount++;
    this.particles.setMatrixAt(i, this.matrix);
    this.color.set(color).multiplyScalar(0.4 + fade * 0.6);
    this.particles.setColorAt(i, this.color);
  }

  addGlobule(x: number, y: number, friendly: boolean, size: number): void {
    if (this.gCount >= PROJECTILE_CAP) return;
    this.pos.set(x, 26, y);
    this.scale.set(size, size, size);
    this.quat.identity();
    this.matrix.compose(this.pos, this.quat, this.scale);
    const i = this.gCount++;
    this.globules.setMatrixAt(i, this.matrix);
    this.color.set(friendly ? FIXED.glowcap : FIXED.foe);
    this.globules.setColorAt(i, this.color);
  }

  commit(): void {
    this.particles.count = this.pCount;
    this.globules.count = this.gCount;
    this.particles.instanceMatrix.needsUpdate = true;
    this.globules.instanceMatrix.needsUpdate = true;
    if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
    if (this.globules.instanceColor) this.globules.instanceColor.needsUpdate = true;
  }
}

/**
 * Static colony fittings: hanging roots at the fringe, aphid bodies in their
 * pens, scent markers at the soldier galleries, and the glowworm lanterns.
 */
export class PropLayer {
  readonly group = new Group();
  private readonly rootMeshes: Group[] = [];
  private readonly markerMats: MeshLambertMaterial[] = [];
  private readonly wormMats: MeshLambertMaterial[] = [];
  private readonly stalkMat = new MeshLambertMaterial();

  constructor() {
    // Root Fringe: hanging roots, cut for leaf scraps, regrown on a timer.
    for (const p of ROOT_POSITIONS) {
      const root = new Group();
      root.position.set(p.x, 0, p.y);
      const trunk = new InstancedMesh(new CylinderGeometry(3, 6, 1, 6), this.stalkMat, 1);
      trunk.count = 1;
      const m = new Matrix4().compose(
        new Vector3(0, 34, 0), new Quaternion(), new Vector3(1, 68, 1),
      );
      trunk.setMatrixAt(0, m);
      trunk.frustumCulled = false;
      root.add(trunk);
      const leaves = new InstancedMesh(
        new ConeGeometry(1, 1, 5),
        new MeshLambertMaterial({ color: FIXED.leaf }),
        3,
      );
      leaves.frustumCulled = false;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        leaves.setMatrixAt(i, new Matrix4().compose(
          new Vector3(Math.cos(angle) * 16, 62, Math.sin(angle) * 16),
          new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI),
          new Vector3(13, 24, 13),
        ));
      }
      root.add(leaves);
      this.rootMeshes.push(root);
      this.group.add(root);
    }

    // Scent markers: a pheromone dab on a stalk that the majors hold.
    for (const site of SITES) {
      const marker = SITE_BY_ID[site.id].marker;
      if (!marker) continue;
      const mat = new MeshLambertMaterial({
        color: FIXED.colony, emissive: FIXED.colony, emissiveIntensity: 0.4,
      });
      this.markerMats.push(mat);
      const stalk = new InstancedMesh(new CylinderGeometry(2.5, 2.5, 1, 6), mat, 1);
      stalk.count = 1;
      stalk.frustumCulled = false;
      stalk.setMatrixAt(0, new Matrix4().compose(
        new Vector3(marker.x, 22, marker.y), new Quaternion(), new Vector3(1, 44, 1),
      ));
      this.group.add(stalk);
      const blob = new InstancedMesh(new SphereGeometry(1, 8, 6), mat, 1);
      blob.count = 1;
      blob.frustumCulled = false;
      blob.setMatrixAt(0, new Matrix4().compose(
        new Vector3(marker.x, 48, marker.y), new Quaternion(), new Vector3(11, 9, 11),
      ));
      this.group.add(blob);
      const ring = new InstancedMesh(
        new RingGeometry(38, 46, 24),
        new MeshBasicMaterial({ color: FIXED.colony, transparent: true, opacity: 0.34, depthWrite: false }),
        1,
      );
      ring.count = 1;
      ring.frustumCulled = false;
      ring.setMatrixAt(0, new Matrix4().compose(
        new Vector3(marker.x, 3, marker.y),
        new Quaternion().setFromAxisAngle(UP, -Math.PI / 2),
        new Vector3(1, 1, 1),
      ));
      this.group.add(ring);
    }

    // The two glowworm lanterns flanking the Brood Chamber.
    for (const worm of GLOWWORMS) {
      const mat = new MeshLambertMaterial({
        color: FIXED.glowworm, emissive: FIXED.glowworm, emissiveIntensity: 0.7,
      });
      this.wormMats.push(mat);
      const body = new InstancedMesh(new SphereGeometry(1, 8, 6), mat, 1);
      body.count = 1;
      body.frustumCulled = false;
      body.setMatrixAt(0, new Matrix4().compose(
        new Vector3(worm.x, 40, worm.y), new Quaternion(), new Vector3(10, 16, 10),
      ));
      this.group.add(body);
      const post = new InstancedMesh(new CylinderGeometry(3, 4, 1, 6), this.stalkMat, 1);
      post.count = 1;
      post.frustumCulled = false;
      post.setMatrixAt(0, new Matrix4().compose(
        new Vector3(worm.x, 16, worm.y), new Quaternion(), new Vector3(1, 32, 1),
      ));
      this.group.add(post);
    }
  }

  update(state: RunState, palette: Palette, nightMix: number): void {
    this.stalkMat.color.copy(palette.resin);
    for (let i = 0; i < this.rootMeshes.length; i++) {
      const root = state.roots[i];
      const mesh = this.rootMeshes[i];
      if (!root) continue;
      mesh.visible = root.grown;
      // A root being cut shudders, which is the only cue the player needs.
      const shudder = root.cutProgress > 0 ? Math.sin(root.cutProgress * 40) * 0.06 : 0;
      mesh.rotation.z = shudder;
    }
    for (const mat of this.wormMats) {
      mat.emissiveIntensity = 0.25 + nightMix * 0.85;
    }
    for (const mat of this.markerMats) {
      mat.emissiveIntensity = 0.2 + nightMix * 0.6;
    }
  }
}

const YAXIS = new Vector3(0, 1, 0);
const ZAXIS = new Vector3(0, 0, 1);
const tiltScratch = new Quaternion();
const OUTLINE_UP = new Vector3(1.18, 1.18, 1.18);

function instanced(
  geometry: BoxGeometry | SphereGeometry | OctahedronGeometry | ConeGeometry | CylinderGeometry,
  material: MeshBasicMaterial | MeshLambertMaterial,
  cap: number,
): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, cap);
  mesh.frustumCulled = false;
  mesh.count = 0;
  const seed = new Color(0xffffff);
  for (let i = 0; i < cap; i++) mesh.setColorAt(i, seed);
  return mesh;
}
