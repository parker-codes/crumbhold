/**
 * Uniform grid broadphase over the arena. Rebuilt once per sim step and shared
 * by projectiles, melee, the pickup magnet, and pad presence.
 */
export class SpatialHash {
  private readonly cols: number;
  private readonly rows: number;
  private readonly cells: number[][];
  readonly results: number[] = [];

  constructor(
    width: number,
    height: number,
    private readonly cell: number,
  ) {
    this.cols = Math.ceil(width / cell) + 1;
    this.rows = Math.ceil(height / cell) + 1;
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) this.cells[i].length = 0;
  }

  private index(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, (x / this.cell) | 0));
    const cy = Math.min(this.rows - 1, Math.max(0, (y / this.cell) | 0));
    return cy * this.cols + cx;
  }

  insert(x: number, y: number, ref: number): void {
    this.cells[this.index(x, y)].push(ref);
  }

  /** Fills and returns `results` with refs in every cell the radius touches. */
  query(x: number, y: number, radius: number): number[] {
    const out = this.results;
    out.length = 0;
    const x0 = Math.max(0, ((x - radius) / this.cell) | 0);
    const x1 = Math.min(this.cols - 1, ((x + radius) / this.cell) | 0);
    const y0 = Math.max(0, ((y - radius) / this.cell) | 0);
    const y1 = Math.min(this.rows - 1, ((y + radius) / this.cell) | 0);
    for (let cy = y0; cy <= y1; cy++) {
      const row = cy * this.cols;
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.cells[row + cx];
        for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  }
}
