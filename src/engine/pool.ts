/**
 * Dense object pool. Live items occupy [0, size); freeing swaps with the last
 * live slot, so iteration never allocates and never sees holes.
 */
export class Pool<T> {
  readonly items: T[] = [];
  size = 0;

  constructor(
    private readonly make: () => T,
    private readonly reset: (item: T) => void,
    capacity: number,
  ) {
    for (let i = 0; i < capacity; i++) this.items.push(make());
  }

  get capacity(): number {
    return this.items.length;
  }

  /** Returns null when the hard cap is reached; callers decide how to degrade. */
  spawn(): T | null {
    if (this.size >= this.items.length) return null;
    const item = this.items[this.size++];
    this.reset(item);
    return item;
  }

  /** Grow past the initial capacity. Only used off the hot path. */
  spawnGrowing(): T {
    if (this.size >= this.items.length) this.items.push(this.make());
    const item = this.items[this.size++];
    this.reset(item);
    return item;
  }

  freeAt(index: number): void {
    const last = --this.size;
    if (index !== last) {
      const tmp = this.items[index];
      this.items[index] = this.items[last];
      this.items[last] = tmp;
    }
  }

  clear(): void {
    this.size = 0;
  }
}
