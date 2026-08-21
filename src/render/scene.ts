import {
  AmbientLight, Color, DirectionalLight, HemisphereLight, NeutralToneMapping,
  OrthographicCamera, PCFShadowMap, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { WORLD } from '../game/balance';
import type { ViewportSize } from '../engine/viewport';
import { Palette } from './palette';

/**
 * Top-down orthographic view with a small tilt. The tilt is what earns the third
 * dimension: structures show a real front face and top instead of faking one.
 */
/**
 * Angle off straight-down. Kept shallow on purpose: the view must read top-down
 * (section 7), and every degree of tilt is ground behind a structure that the
 * structure hides. A besieged barricade must never conceal its own lane.
 */
const TILT = 0.22;
const CAMERA_DISTANCE = 3200;
/** How far the key light sits from the look target. Sets the shadow depth range. */
const KEY_DISTANCE = 2400;
/**
 * The shadow frustum covers more ground than the view, because an oblique light
 * throws shadows in from off-screen structures.
 */
const SHADOW_MARGIN = 1.45;

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  readonly palette = new Palette();
  /** False on hardware that cannot afford a shadow pass. */
  readonly shadows: boolean;

  private readonly hemi = new HemisphereLight(0xffffff, 0x000000, 0.4);
  private readonly ambient = new AmbientLight(0xffffff, 0.2);
  private readonly key = new DirectionalLight(0xffffff, 1.1);
  private readonly fill = new DirectionalLight(0xffffff, 0.3);
  private readonly rim = new DirectionalLight(0xffffff, 0.2);
  private readonly lookTarget = new Vector3();
  private readonly scratch = new Color();
  /** Half-extents of the current frustum in world units. */
  halfW = 1;
  halfH = 1;
  private aspect = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    // Neutral, not filmic: this palette is authored, not photographed. ACES
    // drains exactly the accents the player reads under pressure — sugar yellow
    // and foe red — while Neutral only rolls off the highlights, so a key light
    // strong enough to shape a wall still cannot clip a crystal to flat white.
    this.renderer.toneMapping = NeutralToneMapping;
    this.renderer.setClearColor(0x14131a, 1);

    this.shadows = affordsShadows();
    if (this.shadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = PCFShadowMap;
    }

    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.5, 12000);
    // World -Z is screen up, so the north tunnel is at the top of the screen.
    // A vertical `up` would be almost parallel to the view axis at this tilt.
    this.camera.up.set(0, 0, -1);

    this.key.castShadow = this.shadows;
    if (this.shadows) {
      const shadow = this.key.shadow;
      const size = mapSize();
      shadow.mapSize.set(size, size);
      shadow.camera.near = 200;
      shadow.camera.far = KEY_DISTANCE * 2;
      // Tuned for a world measured in thousands of units: `normalBias` is world
      // space, so the value that works at metre scale leaves peter-panning here.
      shadow.bias = -0.0006;
      shadow.normalBias = 3;
    }

    this.scene.add(
      this.hemi, this.ambient,
      this.key, this.key.target,
      this.fill, this.rim,
    );
  }

  resize(size: ViewportSize): void {
    this.renderer.setPixelRatio(size.dpr);
    this.renderer.setSize(size.cssWidth, size.cssHeight, false);
    this.aspect = size.cssWidth / size.cssHeight;
    this.applyFrustum(1);
  }

  /** The vertical axis always shows `viewUnits`; width follows the aspect. */
  applyFrustum(zoom: number): void {
    const cam = this.camera;
    const units = WORLD.viewUnits / Math.max(0.2, zoom);
    const halfH = units * 0.5;
    const halfW = halfH * this.aspect;
    this.halfW = halfW;
    this.halfH = halfH;
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.updateProjectionMatrix();
    if (!this.shadows) return;
    const span = Math.max(halfW, halfH) * SHADOW_MARGIN;
    const shadow = this.key.shadow.camera;
    shadow.left = -span;
    shadow.right = span;
    shadow.top = span;
    shadow.bottom = -span;
    shadow.updateProjectionMatrix();
  }

  /** Points the camera at a world position, with shake applied in view space. */
  place(worldX: number, worldY: number, zoom: number, shakeX: number, shakeY: number): void {
    this.applyFrustum(zoom);
    const tx = worldX + shakeX;
    const ty = worldY + shakeY;
    this.lookTarget.set(tx, 0, ty);
    this.camera.position.set(
      tx,
      Math.cos(TILT) * CAMERA_DISTANCE,
      ty + Math.sin(TILT) * CAMERA_DISTANCE,
    );
    this.camera.lookAt(this.lookTarget);
    // Only the key travels with the camera, because only the key casts: its
    // shadow frustum is tight around the view rather than covering the whole
    // gallery. Fill and rim are pure directions and stay put.
    const rig = this.palette.rig;
    this.key.target.position.set(tx, 0, ty);
    setFromAzEl(this.key.position, tx, ty, rig.keyAz, rig.keyEl, KEY_DISTANCE);
  }

  /** Applies the current palette to the light rig and the background. */
  applyPalette(nightMix: number, brightness: number): void {
    const p = this.palette;
    p.update(nightMix, brightness);
    const rig = p.rig;

    this.hemi.color.setHex(rig.hemiSky);
    this.hemi.groundColor.setHex(rig.hemiGround);
    this.hemi.intensity = rig.hemiInt;
    this.ambient.color.setHex(rig.ambColor);
    this.ambient.intensity = rig.ambInt;
    this.key.color.setHex(rig.keyColor);
    this.key.intensity = rig.keyInt;
    this.fill.color.setHex(rig.fillColor);
    this.fill.intensity = rig.fillInt;
    this.rim.color.setHex(rig.rimColor);
    this.rim.intensity = rig.rimInt;
    this.renderer.toneMappingExposure = rig.exposure;

    // A directional light is a direction, and its default target is the origin,
    // so these positions ARE the directions. Setting them relative to the camera
    // would swing the fill around the gallery as the Warden walks.
    // Fill comes from the opposite side and lower down: the warm key and the cool
    // fill are what make a grey wall read as two planes instead of one.
    setFromAzEl(this.fill.position, 0, 0, rig.keyAz + Math.PI, rig.keyEl * 0.55, KEY_DISTANCE);
    // Rim sits behind the subject relative to the camera, which looks from +Z.
    setFromAzEl(this.rim.position, 0, 0, -Math.PI / 2, 0.22, KEY_DISTANCE);

    // Off-world is the haze tone, so the gallery reads as sitting inside earth
    // rather than floating on a backdrop.
    this.scratch.copy(p.haze).multiplyScalar(0.7);
    this.renderer.setClearColor(this.scratch, 1);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Projects a world position to CSS pixels for the DOM label layer. */
  project(worldX: number, worldY: number, worldZ: number, out: { x: number; y: number }): boolean {
    const v = projectScratch.set(worldX, worldZ, worldY).project(this.camera);
    const size = this.renderer.getSize(sizeScratch);
    out.x = (v.x * 0.5 + 0.5) * size.x;
    out.y = (-v.y * 0.5 + 0.5) * size.y;
    return v.x >= -1.25 && v.x <= 1.25 && v.y >= -1.25 && v.y <= 1.25;
  }
}

/** Places a light at an azimuth and elevation around a floor position. */
function setFromAzEl(
  out: Vector3, tx: number, ty: number, az: number, el: number, distance: number,
): void {
  const horizontal = Math.cos(el) * distance;
  out.set(tx + Math.cos(az) * horizontal, Math.sin(el) * distance, ty + Math.sin(az) * horizontal);
}

/**
 * Shadows are decided once, not by the degrade ladder: toggling `castShadow`
 * recompiles every material, and a mid-raid recompile hitches worse than the
 * shadow pass ever costs.
 */
function affordsShadows(): boolean {
  const cores = navigator.hardwareConcurrency ?? 4;
  const small = Math.min(window.screen.width, window.screen.height) < 480;
  return cores >= 4 && !small;
}

function mapSize(): number {
  return Math.min(window.screen.width, window.screen.height) < 900 ? 1024 : 2048;
}

const projectScratch = new Vector3();
const sizeScratch = new Vector2();
