/** Seeded PRNG. All game randomness flows through this so runs replay exactly. */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  range(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Weighted pick. Weights must be non-negative and sum above zero. */
  weighted<T>(items: readonly T[], weights: readonly number[]): T;
  fork(salt: number): Rng;
  state(): number;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    range: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)],
    weighted: (items, weights) => {
      let total = 0;
      for (let i = 0; i < weights.length; i++) total += weights[i];
      let roll = next() * total;
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return items[i];
      }
      return items[items.length - 1];
    },
    fork: (salt) => mulberry32((a ^ Math.imul(salt, 0x9e3779b1)) >>> 0),
    state: () => a,
  };
  return rng;
}
