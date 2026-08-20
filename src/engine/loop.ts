/**
 * Fixed-timestep simulation with interpolated rendering. The sim always runs at
 * SIM_HZ regardless of display refresh; render receives the leftover alpha.
 */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
const MAX_STEPS = 5;

export interface LoopHooks {
  step(dt: number): void;
  render(alpha: number, frameDt: number): void;
}

export interface LoopStats {
  fps: number;
  frameMs: number;
  simMs: number;
  steps: number;
}

export class Loop {
  readonly stats: LoopStats = { fps: 60, frameMs: 0, simMs: 0, steps: 0 };
  timeScale = 1;
  paused = false;

  private accumulator = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private frameTimes = new Float32Array(30);
  private frameCursor = 0;

  constructor(private readonly hooks: LoopHooks) {}

  /** Rolling 30-frame mean frame time. */
  get avgFrameMs(): number {
    let total = 0;
    for (let i = 0; i < this.frameTimes.length; i++) total += this.frameTimes[i];
    return total / this.frameTimes.length;
  }

  /**
   * Share of the last 30 frames over `budgetMs`. The degradation ladder reads
   * this rather than the mean, so one long hitch cannot drop detail on its own.
   */
  slowFrameShare(budgetMs: number): number {
    let slow = 0;
    for (let i = 0; i < this.frameTimes.length; i++) {
      if (this.frameTimes[i] > budgetMs) slow++;
    }
    return slow / this.frameTimes.length;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Called on resume so a long background gap does not fast-forward the sim. */
  resetClock(): void {
    this.last = performance.now();
    this.accumulator = 0;
  }

  /** Advances exactly one sim step. Debug tool only. */
  stepOnce(): void {
    this.hooks.step(SIM_DT);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);

    const frameMs = now - this.last;
    this.last = now;
    this.frameTimes[this.frameCursor] = frameMs;
    this.frameCursor = (this.frameCursor + 1) % this.frameTimes.length;
    this.stats.frameMs = frameMs;
    this.stats.fps = frameMs > 0 ? 1000 / frameMs : 0;

    let steps = 0;
    if (!this.paused) {
      this.accumulator += (frameMs / 1000) * this.timeScale;
      const budget = SIM_DT * MAX_STEPS;
      if (this.accumulator > budget) this.accumulator = budget;
      const simStart = performance.now();
      while (this.accumulator >= SIM_DT) {
        this.accumulator -= SIM_DT;
        this.hooks.step(SIM_DT);
        steps++;
      }
      this.stats.simMs = performance.now() - simStart;
    } else {
      this.accumulator = 0;
      this.stats.simMs = 0;
    }
    this.stats.steps = steps;

    this.hooks.render(this.accumulator / SIM_DT, frameMs / 1000);
  };
}
