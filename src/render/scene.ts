import {
  AmbientLight, Color, DirectionalLight, OrthographicCamera, Scene,
  Vector2, Vector3, WebGLRenderer,
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

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: OrthographicCamera;
  readonly palette = new Palette();

  private readonly ambient = new AmbientLight(0xffffff, 1);
  private readonly sun = new DirectionalLight(0xffffff, 1.1);
  private readonly lookTarget = new Vector3();
  private readonly sunColor = new Color();
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
    this.renderer.setClearColor(0x14131a, 1);
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0.5, 12000);
    // World -Z is screen up, so the north tunnel is at the top of the screen.
    // A vertical `up` would be almost parallel to the view axis at this tilt.
    this.camera.up.set(0, 0, -1);
    this.scene.add(this.ambient);
    this.sun.position.set(-0.4, 1, 0.45).multiplyScalar(1000);
    this.scene.add(this.sun);
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
  }

  /** Applies the current palette to global lighting and the fog. */
  applyPalette(nightMix: number, brightness: number): void {
    const p = this.palette;
    p.update(nightMix, brightness);
    // Ambient carries almost all of the light; the directional pass only shapes
    // the structure faces so the fake dimension reads.
    this.ambient.intensity = p.ambient * (1.02 - nightMix * 0.06);
    this.sun.intensity = 0.42 * (1 - nightMix * 0.55);
    this.sunColor.copy(dayLight).lerp(nightLight, nightMix);
    this.sun.color.copy(this.sunColor);
    bgScratch.copy(p.floor).multiplyScalar(0.42);
    this.renderer.setClearColor(bgScratch, 1);
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

const projectScratch = new Vector3();
const sizeScratch = new Vector2();
const bgScratch = new Color();
const dayLight = new Color(0xfff3c4);
const nightLight = new Color(0xa9c0ff);
