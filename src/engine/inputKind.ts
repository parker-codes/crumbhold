/**
 * Which control surface the player is actually using. Media queries alone get
 * this wrong on a touchscreen laptop, which reports a fine pointer and would
 * keep the keyboard hints on a device being played with a thumb. So the first
 * guess comes from the media query and every real event after it corrects.
 */
export type InputKind = 'touch' | 'keys';

let kind: InputKind = coarsePointer() ? 'touch' : 'keys';
let attached = false;

/** True while the player is on a touchscreen, so key hints are noise. */
export function isTouchInput(): boolean {
  return kind === 'touch';
}

/**
 * Starts watching for the first event of each sort. Listeners are passive and
 * on the capture phase, so they see presses the game never handles: a tap on a
 * title-screen button counts as touch just as much as a drag on the floor.
 */
export function attachInputKind(): void {
  if (attached) return;
  attached = true;
  publish();
  document.addEventListener(
    'pointerdown',
    (e) => set(e.pointerType === 'touch' || e.pointerType === 'pen' ? 'touch' : 'keys'),
    { capture: true, passive: true },
  );
  document.addEventListener('keydown', () => set('keys'), { capture: true, passive: true });
}

function set(next: InputKind): void {
  if (next === kind) return;
  kind = next;
  publish();
}

/** Styles read this: `:root[data-input="keys"]` shows what a keyboard needs. */
function publish(): void {
  document.documentElement.dataset.input = kind;
}

function coarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}
