/**
 * Device vibration for the handful of events a player should feel.
 *
 * Support is one-sided: Android Chrome and Firefox implement the Vibration API,
 * iOS Safari does not and has no replacement, so on an iPhone every call here is
 * a no-op. Nothing may depend on a buzz arriving — haptics only ever confirm
 * something the screen and the audio already said.
 */
export type Haptic = 'tap' | 'thud' | 'alert' | 'beat' | 'fanfare' | 'toll';

/** Milliseconds on, then alternating off/on for the array forms. */
const PATTERNS: Record<Haptic, number | number[]> = {
  tap: 10,
  thud: 20,
  alert: [0, 30, 50, 30],
  beat: 45,
  fanfare: [0, 40, 70, 40, 70, 90],
  toll: 130,
};

/**
 * A raid can fire several cues in the same frame. Without a floor the motor
 * runs continuously, which reads as one long blur and costs battery, so a pulse
 * inside the gap is dropped rather than queued.
 */
const MIN_GAP_MS = 70;

let lastAt = -Infinity;

/*
 * Desktop Chrome defines `navigator.vibrate` and then does nothing with it, so
 * the method alone is not evidence of a motor. Requiring a touch point keeps the
 * dead switch off the settings sheet on a laptop.
 */
export const HAPTICS_SUPPORTED =
  typeof navigator !== 'undefined' &&
  typeof navigator.vibrate === 'function' &&
  (navigator.maxTouchPoints ?? 0) > 0;

/** Mirrors the player's setting; off makes every call a no-op. */
let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
  // Cancel anything mid-pulse, so turning it off is felt immediately.
  if (!on && HAPTICS_SUPPORTED) navigator.vibrate(0);
}

export function haptic(kind: Haptic): void {
  if (!enabled || !HAPTICS_SUPPORTED) return;
  const now = performance.now();
  if (now - lastAt < MIN_GAP_MS) return;
  lastAt = now;
  // Throws on nothing, but a browser may refuse the call before a user gesture.
  try {
    navigator.vibrate(PATTERNS[kind]);
  } catch {
    // A refused buzz is not worth a broken frame.
  }
}
