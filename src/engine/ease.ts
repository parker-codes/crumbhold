export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Frame-rate independent exponential approach. `rate` is per second. */
export const approach = (a: number, b: number, rate: number, dt: number): number =>
  a + (b - a) * (1 - Math.exp(-rate * dt));

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export function easeOutBack(t: number, overshoot = 1.15): number {
  const c = overshoot * 1.7;
  const p = t - 1;
  return 1 + (c + 1) * p * p * p + c * p * p;
}

export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2;

export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Shortest signed angular delta from a to b, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const approachAngle = (a: number, b: number, rate: number, dt: number): number =>
  a + angleDelta(a, b) * (1 - Math.exp(-rate * dt));

/**
 * Offset-lerp used by antennae and the carry stack: the follower trails the
 * leader, which is what makes both sway on a turn. Section 12, "Motion".
 */
export function offsetLerp(
  out: { x: number; y: number },
  targetX: number,
  targetY: number,
  rate: number,
  dt: number,
): void {
  const k = 1 - Math.exp(-rate * dt);
  out.x += (targetX - out.x) * k;
  out.y += (targetY - out.y) * k;
}
