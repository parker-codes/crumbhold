import {
  BoxGeometry, CircleGeometry, Color, DoubleSide, Group, InstancedMesh, Matrix4,
  Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, ShaderMaterial, Vector3,
} from 'three';
import { maxTier } from '../game/state';
import { FIXED } from './palette';
import type { Palette } from './palette';
import type { Pad, RunState } from '../game/types';

const PIP_CAP = 90;

/**
 * A pad is tamped floor, a fill ring, and a tier pip row. Locked pads stay
 * visible as faint outlines with their unlock condition, so the whole build tree
 * can be read by looking at the room. That replaces a tech-tree UI entirely.
 */
const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform vec3 uFillColor;
  uniform vec3 uTrackColor;
  uniform float uFill;
  uniform float uAlpha;
  uniform float uFlash;
  uniform float uDashed;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0 || r < 0.68) discard;

    // Angle measured clockwise from the top, so the ring fills like a clock.
    float a = atan(p.x, p.y);
    float turn = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;

    float band = smoothstep(0.68, 0.72, r) * (1.0 - smoothstep(0.94, 1.0, r));
    float dash = uDashed > 0.5 ? step(0.5, fract(turn * 18.0)) : 1.0;
    vec3 col = uTrackColor;
    float alpha = uAlpha * 0.62 * band * dash;
    if (turn <= uFill) {
      col = uFillColor;
      alpha = uAlpha * band;
    }
    col = mix(col, vec3(1.0), uFlash);
    alpha = max(alpha, uFlash * band * 0.9);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

interface PadView {
  pad: Pad;
  footprint: Mesh<CircleGeometry, MeshBasicMaterial>;
  ring: Mesh<PlaneGeometry, ShaderMaterial>;
}

export class PadLayer {
  readonly group = new Group();
  private readonly views: PadView[] = [];
  private readonly pips: InstancedMesh;
  private pipCount = 0;
  private readonly matrix = new Matrix4();
  private readonly pos = new Vector3();
  private readonly quat = new Quaternion();
  private readonly scale = new Vector3();
  private readonly pipColor = new Color();

  constructor(state: RunState) {
    for (const pad of state.pads) {
      const footprint = new Mesh(
        new CircleGeometry(pad.radius, 30),
        new MeshBasicMaterial({ transparent: true, opacity: 0.2, depthWrite: false, side: DoubleSide }),
      );
      footprint.rotation.x = -Math.PI / 2;
      footprint.position.set(pad.pos.x, 1.8, pad.pos.y);
      this.group.add(footprint);

      const ring = new Mesh(
        new PlaneGeometry(pad.radius * 2.3, pad.radius * 2.3),
        new ShaderMaterial({
          vertexShader: RING_VERT,
          fragmentShader: RING_FRAG,
          transparent: true,
          depthWrite: false,
          side: DoubleSide,
          uniforms: {
            uFillColor: { value: new Color(FIXED.sugar) },
            uTrackColor: { value: new Color(0xffffff) },
            uFill: { value: 0 },
            uAlpha: { value: 0.9 },
            uFlash: { value: 0 },
            uDashed: { value: 0 },
          },
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(pad.pos.x, 2.6, pad.pos.y);
      this.group.add(ring);

      this.views.push({ pad, footprint, ring });
    }

    this.pips = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ transparent: true, opacity: 0.95 }),
      PIP_CAP,
    );
    this.pips.frustumCulled = false;
    for (let i = 0; i < PIP_CAP; i++) this.pips.setColorAt(i, this.pipColor.set(0xffffff));
    this.group.add(this.pips);
  }

  update(state: RunState, palette: Palette): void {
    this.pipCount = 0;
    for (const view of this.views) {
      const pad = view.pad;
      const locked = pad.state === 'locked';
      const complete = pad.state === 'complete';
      const fill = pad.cost > 0 ? Math.min(1, pad.paid / pad.cost) : 0;
      const uniforms = view.ring.material.uniforms;

      // Tamped floor, not a crater: lifted toward the floor tone so a footprint
      // never reads darker than the ground it sits on.
      view.footprint.material.color.copy(palette.trail).lerp(WHITE, 0.18);
      view.footprint.material.opacity = locked ? 0.08 : 0.2;

      uniforms.uFill.value = complete ? 1 : fill;
      uniforms.uFlash.value = Math.max(0, pad.ringFlash * 2.4);
      uniforms.uDashed.value = locked ? 1 : 0;
      uniforms.uAlpha.value = locked ? 0.42 : complete ? 0.3 : 0.9;
      (uniforms.uTrackColor.value as Color).copy(palette.trail).lerp(WHITE, 0.35);
      (uniforms.uFillColor.value as Color).set(
        pad.shortfallFlash > 0 ? FIXED.foe : complete ? FIXED.glowcap : FIXED.sugar,
      );

      this.emitPips(state, pad);
    }
    this.pips.count = this.pipCount;
    this.pips.instanceMatrix.needsUpdate = true;
    if (this.pips.instanceColor) this.pips.instanceColor.needsUpdate = true;
  }

  /** One pip per tier, filled up to the tier the site currently holds. */
  private emitPips(state: RunState, pad: Pad): void {
    if (pad.kind === 'repair') return;
    const total = maxTier(pad.buildable);
    if (total <= 1) return;
    let owned = 0;
    for (const s of state.structures) if (s.site === pad.id) owned = s.tier;
    const spacing = 15;
    const startX = pad.pos.x - ((total - 1) * spacing) / 2;
    for (let i = 0; i < total; i++) {
      if (this.pipCount >= PIP_CAP) return;
      this.pos.set(startX + i * spacing, 5, pad.pos.y + pad.radius + 16);
      this.quat.identity();
      const filled = i < owned;
      this.scale.set(filled ? 10 : 7, 5, filled ? 10 : 7);
      this.matrix.compose(this.pos, this.quat, this.scale);
      this.pips.setMatrixAt(this.pipCount, this.matrix);
      this.pipColor.set(filled ? FIXED.sugar : 0x8b8b95);
      this.pips.setColorAt(this.pipCount, this.pipColor);
      this.pipCount++;
    }
  }
}

const WHITE = new Color(0xffffff);
