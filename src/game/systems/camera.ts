import { approach, clamp } from '../../engine/ease';
import { WORLD } from '../balance';
import type { Sim } from '../sim';

/**
 * Follows the Warden through a dead zone, then lerps. Clamped to arena bounds so
 * the camera never shows the void outside the gallery.
 */
export function camera(sim: Sim, dt: number): void {
  const st = sim.state;
  const cam = sim.camera;
  const w = st.warden;
  const dz = WORLD.cameraDeadZone;

  const dx = w.pos.x - cam.x;
  const dy = w.pos.y - cam.y;
  let targetX = cam.x;
  let targetY = cam.y;
  if (dx > dz.x) targetX = w.pos.x - dz.x;
  else if (dx < -dz.x) targetX = w.pos.x + dz.x;
  if (dy > dz.y) targetY = w.pos.y - dz.y;
  else if (dy < -dz.y) targetY = w.pos.y + dz.y;

  cam.x = approach(cam.x, targetX, WORLD.cameraLerp, dt);
  cam.y = approach(cam.y, targetY, WORLD.cameraLerp, dt);
  cam.zoom = approach(cam.zoom, cam.zoomTarget, 1 / WORLD.nightZoomEase, dt);

  // Clamp per axis against what the frustum actually shows. When the viewport
  // is wider than the arena, the arena stays centred instead of sliding.
  cam.x = clampAxis(cam.x, cam.halfW, WORLD.width);
  cam.y = clampAxis(cam.y, cam.halfH, WORLD.height);
}

function clampAxis(value: number, half: number, extent: number): number {
  if (half * 2 >= extent) return extent * 0.5;
  return clamp(value, half, extent - half);
}
