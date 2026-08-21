import { describe, expect, it } from 'vitest';
import { INVADERS, THREAT } from '../src/game/balance';
import { activeLanes } from '../src/game/gallery';
import { isBossNight, newestKind, planNight, threatBudget, unlockedKinds } from '../src/game/waves';

const SEEDS = [1, 7, 42, 1337, 90210];

describe('threat budget', () => {
  it('follows the section 10.4 formula', () => {
    for (let night = 1; night <= 12; night++) {
      expect(threatBudget(night)).toBe(Math.round(THREAT.base * THREAT.growth ** (night - 1)));
    }
  });

  it('tracks the section 10.4 table', () => {
    // The printed table drifts by up to two points from night 7 on, where the
    // spec rounded intermediate steps. The formula is the stated source of truth.
    const printed = [40, 53, 70, 92, 121, 160, 211, 279, 368, 486, 641, 846];
    for (let night = 1; night <= 12; night++) {
      expect(Math.abs(threatBudget(night) - printed[night - 1])).toBeLessThanOrEqual(2);
    }
  });
});

describe('wave composition', () => {
  it('spends within 5 percent of the budget', () => {
    for (const seed of SEEDS) {
      for (let night = 1; night <= 16; night++) {
        const plan = planNight(night, seed);
        const drift = Math.abs(plan.spent - plan.budget) / plan.budget;
        expect(drift, `seed ${seed} night ${night}: ${plan.spent} vs ${plan.budget}`)
          .toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('reserves budget for the newest unlocked type', () => {
    for (const seed of SEEDS) {
      // From night 2 on there is always an older type to crowd the newest out.
      for (let night = 2; night <= 12; night++) {
        const plan = planNight(night, seed);
        const newest = newestKind(night);
        const onNewest = plan.orders
          .filter((o) => o.kind === newest)
          .reduce((sum, o) => sum + INVADERS[o.kind].threat, 0);
        expect(onNewest, `seed ${seed} night ${night} newest ${newest}`)
          .toBeGreaterThanOrEqual(INVADERS[newest].threat);
      }
    }
  });

  it('sends at least one mole cricket from night 5', () => {
    for (const seed of SEEDS) {
      for (let night = 5; night <= 14; night++) {
        const plan = planNight(night, seed);
        expect(plan.orders.some((o) => o.kind === 'moleCricket')).toBe(true);
      }
    }
  });

  it('puts the wolf spider on boss nights only', () => {
    for (const seed of SEEDS) {
      for (let night = 1; night <= 14; night++) {
        const plan = planNight(night, seed);
        const hasBoss = plan.orders.some((o) => o.kind === 'wolfSpider');
        expect(hasBoss).toBe(isBossNight(night));
      }
    }
  });

  it('only uses types whose intro night has arrived', () => {
    for (const seed of SEEDS) {
      for (let night = 1; night <= 12; night++) {
        const allowed = new Set([...unlockedKinds(night), 'wolfSpider']);
        for (const order of planNight(night, seed).orders) {
          expect(allowed.has(order.kind), `night ${night} sent ${order.kind}`).toBe(true);
        }
      }
    }
  });

  it('opens tunnels on the section 10.5 schedule', () => {
    for (const seed of SEEDS) {
      for (let night = 1; night <= 12; night++) {
        const lanes = new Set(activeLanes(night));
        for (const order of planNight(night, seed).orders) {
          expect(lanes.has(order.lane)).toBe(true);
        }
      }
    }
  });

  it('splits each tunnel into three to five sub-waves inside the spawn window', () => {
    for (const seed of SEEDS) {
      for (let night = 1; night <= 12; night++) {
        const plan = planNight(night, seed);
        expect(plan.subWaveCount).toBeGreaterThanOrEqual(THREAT.subWavesMin);
        expect(plan.subWaveCount).toBeLessThanOrEqual(THREAT.subWavesMax);
        for (const order of plan.orders) {
          expect(order.at).toBeGreaterThanOrEqual(0);
          expect(order.at).toBeLessThanOrEqual(plan.spawnWindow + 2);
        }
      }
    }
  });

  it('weights heavier types later in the night', () => {
    // Averaged over seeds, the mean threat of the back half exceeds the front.
    let front = 0;
    let back = 0;
    for (const seed of SEEDS) {
      for (let night = 6; night <= 12; night++) {
        const orders = planNight(night, seed).orders.filter((o) => o.kind !== 'wolfSpider');
        const half = Math.floor(orders.length / 2);
        for (let i = 0; i < orders.length; i++) {
          const threat = INVADERS[orders[i].kind].threat;
          if (i < half) front += threat;
          else back += threat;
        }
      }
    }
    expect(back).toBeGreaterThan(front);
  });

  it('is reproducible for a given seed and night', () => {
    const a = planNight(9, 2024);
    const b = planNight(9, 2024);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
