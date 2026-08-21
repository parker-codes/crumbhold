import { clamp } from './ease';

export interface InputState {
  /** Normalized movement vector, magnitude 0 to 1. */
  moveX: number;
  moveY: number;
  /** True on the sim step in which the action button went down. */
  actionPressed: boolean;
  /** Joystick visual state, in CSS pixels. */
  stick: { active: boolean; originX: number; originY: number; knobX: number; knobY: number };
}

const DEAD_ZONE = 8;
const FULL_DEFLECTION = 56;

/**
 * Desktop parity (section 6): WASD or arrows for movement, Space for the action
 * button, Escape for pause. Exists so development and balance testing are not
 * miserable, not as a shipping target.
 */
const KEY_AXES: Record<string, [number, number]> = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/**
 * Normalized movement vector for a set of held key codes. Diagonals are unit
 * length, so a keyboard player never outruns a thumb by 41 percent.
 */
export function axesFromKeys(codes: Iterable<string>, out: { x: number; y: number }): void {
  let x = 0;
  let y = 0;
  for (const code of codes) {
    const axis = KEY_AXES[code];
    if (!axis) continue;
    x += axis[0];
    y += axis[1];
  }
  const length = Math.hypot(x, y);
  if (length === 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  out.x = x / length;
  out.y = y / length;
}

/** True when the code is bound to movement, so callers know to swallow it. */
export function isMovementKey(code: string): boolean {
  return KEY_AXES[code] !== undefined;
}

export class Input {
  readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    actionPressed: false,
    stick: { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 },
  };

  onFirstPointer: (() => void) | null = null;
  onPauseKey: (() => void) | null = null;
  onDebugKey: ((code: string) => void) | null = null;

  private pointerId = -1;
  /**
   * Every finger currently down on the floor, newest last. Only one drives the
   * stick, but the rest are kept so lifting the driving thumb hands the stick to
   * a finger that is already down instead of stopping the Warden dead.
   */
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private readonly keys = new Set<string>();
  private actionQueued = false;
  private firstPointerSeen = false;
  private readonly axisScratch = { x: 0, y: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {}

  attach(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onPointerDown, { passive: false });
    window.addEventListener('pointermove', this.onPointerMove, { passive: false });
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('dragstart', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  /** Queue the action from a DOM button press. */
  queueAction(): void {
    this.actionQueued = true;
  }

  /** Latch the queued action edge into the sim step, then clear it. */
  beginStep(): void {
    this.state.actionPressed = this.actionQueued;
    this.actionQueued = false;
    if (this.pointerId === -1) this.applyKeyboardAxes();
  }

  releaseAll(): void {
    this.keys.clear();
    this.pointers.clear();
    this.pointerId = -1;
    this.state.stick.active = false;
    this.state.moveX = 0;
    this.state.moveY = 0;
  }

  private applyKeyboardAxes(): void {
    axesFromKeys(this.keys, this.axisScratch);
    this.state.moveX = this.axisScratch.x;
    this.state.moveY = this.axisScratch.y;
  }

  private markFirstPointer(): void {
    if (this.firstPointerSeen) return;
    this.firstPointerSeen = true;
    this.onFirstPointer?.();
  }

  /**
   * Any point on the floor starts a stick. There is no reserved corner: the HUD
   * controls are real elements above the canvas and swallow their own presses,
   * so a press that arrives here is one the player meant for the floor.
   *
   * The three `pointer*` methods below take plain numbers rather than events, so
   * the whole multi-touch path can be driven from a test without a DOM.
   */
  pointerDown(id: number, x: number, y: number): void {
    this.markFirstPointer();
    this.pointers.set(id, { x, y });
    // A second finger does not steal a live drag; it waits its turn.
    if (this.pointerId !== -1) return;
    this.claim(id, x, y);
  }

  pointerMove(id: number, x: number, y: number): void {
    const tracked = this.pointers.get(id);
    if (tracked) {
      tracked.x = x;
      tracked.y = y;
    }
    if (id !== this.pointerId) return;
    const s = this.state.stick;
    let dx = x - s.originX;
    let dy = y - s.originY;
    const dist = Math.hypot(dx, dy);
    if (dist > FULL_DEFLECTION) {
      // Drag the origin along so the stick never runs out of travel.
      const pull = dist - FULL_DEFLECTION;
      s.originX += (dx / dist) * pull;
      s.originY += (dy / dist) * pull;
      dx = (dx / dist) * FULL_DEFLECTION;
      dy = (dy / dist) * FULL_DEFLECTION;
    }
    s.knobX = s.originX + dx;
    s.knobY = s.originY + dy;
    const mag = clamp((Math.hypot(dx, dy) - DEAD_ZONE) / (FULL_DEFLECTION - DEAD_ZONE), 0, 1);
    if (mag <= 0) {
      this.state.moveX = 0;
      this.state.moveY = 0;
      return;
    }
    const len = Math.hypot(dx, dy) || 1;
    this.state.moveX = (dx / len) * mag;
    this.state.moveY = (dy / len) * mag;
  }

  pointerUp(id: number): void {
    this.pointers.delete(id);
    if (id !== this.pointerId) return;
    this.pointerId = -1;
    // Hand the stick to the newest finger still down, from where it rests, so
    // the Warden keeps walking and nothing snaps across the screen.
    const next = lastEntry(this.pointers);
    if (next) {
      this.claim(next[0], next[1].x, next[1].y);
      return;
    }
    this.state.stick.active = false;
    this.state.moveX = 0;
    this.state.moveY = 0;
  }

  private claim(id: number, x: number, y: number): void {
    this.pointerId = id;
    const s = this.state.stick;
    s.active = true;
    s.originX = x;
    s.originY = y;
    s.knobX = x;
    s.knobY = y;
    this.state.moveX = 0;
    this.state.moveY = 0;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.pointerDown(e.pointerId, e.clientX, e.clientY);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId === this.pointerId) e.preventDefault();
    this.pointerMove(e.pointerId, e.clientX, e.clientY);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.pointerUp(e.pointerId);
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    if (e.code === 'Escape') {
      this.onPauseKey?.();
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      this.markFirstPointer();
      this.actionQueued = true;
      return;
    }
    if (isMovementKey(e.code)) {
      e.preventDefault();
      this.keys.add(e.code);
      this.markFirstPointer();
      return;
    }
    this.onDebugKey?.(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
}

/** The most recently added entry of a Map, or null when it is empty. */
function lastEntry<K, V>(map: Map<K, V>): [K, V] | null {
  let last: [K, V] | null = null;
  for (const entry of map) last = entry;
  return last;
}
