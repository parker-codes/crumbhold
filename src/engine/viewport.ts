/**
 * Canvas sizing. Uses visualViewport where available so the iOS URL bar
 * collapsing does not leave the canvas the wrong height.
 */
export interface ViewportSize {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
}

const RELAYOUT_DEBOUNCE_MS = 150;

export class Viewport {
  readonly size: ViewportSize = { cssWidth: 1, cssHeight: 1, dpr: 1 };
  private timer = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onResize: (size: ViewportSize) => void,
  ) {}

  attach(): void {
    const debounced = (): void => {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => this.measure(), RELAYOUT_DEBOUNCE_MS);
    };
    window.addEventListener('resize', debounced);
    window.addEventListener('orientationchange', debounced);
    window.visualViewport?.addEventListener('resize', debounced);
    window.visualViewport?.addEventListener('scroll', debounced);
    this.measure();
  }

  measure(): void {
    const vv = window.visualViewport;
    const w = Math.max(1, Math.round(vv ? vv.width : window.innerWidth));
    const h = Math.max(1, Math.round(vv ? vv.height : window.innerHeight));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size.cssWidth = w;
    this.size.cssHeight = h;
    this.size.dpr = dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.onResize(this.size);
  }
}

/** Screen Wake Lock, best effort. Never let a rejection reach the console. */
export async function requestWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock;
    if (!wl) return null;
    return await wl.request('screen');
  } catch {
    return null;
  }
}
