import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/engine/loop';
import { COMBAT, INVADERS, WARDEN } from '../src/game/balance';
import { applyPurchase, structureAt } from '../src/game/state';
import { Sim } from '../src/game/sim';
import { ai } from '../src/game/systems/ai';
import { combat } from '../src/game/systems/combat';
import { movement } from '../src/game/systems/movement';
import { invaderScale, scaledHp } from '../src/game/waves';
import type { SiteId } from '../src/game/gallery';

function nightSim(): Sim {
  const sim = new Sim(17);
  sim.state.phase = 'night';
  return sim;
}

function buy(sim: Sim, site: SiteId, times = 1): void {
  for (let i = 0; i < times; i++) {
    const pad = sim.state.pads.find((p) => p.id === site)!;
    if (pad.targetTier === 0) return;
    pad.paid = pad.cost;
    applyPurchase(sim.state, pad);
  }
}

describe('invader stat scaling', () => {
  it('grows five percent a night and caps at three times', () => {
    expect(invaderScale('raiderAnt', 1)).toBeCloseTo(1, 5);
    expect(invaderScale('raiderAnt', 11)).toBeCloseTo(1.5, 5);
    expect(invaderScale('raiderAnt', 60)).toBe(COMBAT.scaleCap);
    expect(scaledHp('raiderAnt', 11)).toBe(45);
  });

  it('scales the wolf spider on its own curve from its intro night', () => {
    expect(invaderScale('wolfSpider', 6)).toBeCloseTo(1, 5);
    expect(scaledHp('wolfSpider', 12)).toBe(Math.round(1200 * (1 + 0.35 * 6)));
  });
});

describe('pillbug frontal armour', () => {
  it('reduces projectile damage arriving inside its facing arc', () => {
    const sim = nightSim();
    const front = sim.spawnInvader('pillbug', 0, 700, 700, 70, 9)!;
    front.facing = 0;
    sim.hurtInvader(front, 20, 900, 700, true);
    expect(front.hp).toBeCloseTo(70 - 20 * (1 - 0.6), 5);
    // Curling is a reaction, and it never stops the walk.
    expect(front.curledUntil).toBeGreaterThan(sim.state.time);

    const flanked = sim.spawnInvader('pillbug', 0, 700, 700, 70, 9)!;
    flanked.facing = 0;
    sim.hurtInvader(flanked, 20, 700, 900, true);
    expect(flanked.hp).toBeCloseTo(50, 5);
  });

  it('does not reduce melee or horn damage', () => {
    const sim = nightSim();
    const bug = sim.spawnInvader('pillbug', 0, 700, 700, 70, 9)!;
    bug.facing = 0;
    sim.hurtInvader(bug, 20, 900, 700, false);
    expect(bug.hp).toBeCloseTo(50, 5);
  });
});

describe('mole cricket', () => {
  it('ignores the Warden entirely and goes for structures', () => {
    const sim = nightSim();
    buy(sim, 'barricadeN');
    const cricket = sim.spawnInvader('moleCricket', 0, 720, 340, 150, 40)!;
    sim.state.warden.pos.x = 725;
    sim.state.warden.pos.y = 345;
    cricket.retargetAt = 0;
    ai(sim, SIM_DT);
    expect(cricket.targetType).toBe('structure');
    expect(INVADERS.moleCricket.aggro).toBe(0);
  });

  it('chews through a barricade that blocks its lane', () => {
    const sim = nightSim();
    buy(sim, 'barricadeN');
    const barricade = structureAt(sim.state, 'barricadeN')!;
    const before = barricade.hp;
    const cricket = sim.spawnInvader('moleCricket', 0, 720, 350, 150, 40)!;
    cricket.retargetAt = 0;
    ai(sim, SIM_DT);
    combat(sim, SIM_DT);
    expect(barricade.hp).toBe(before - 40);
  });
});

describe('exploding termite', () => {
  it('detonates on contact and damages everything inside the blast', () => {
    const sim = nightSim();
    buy(sim, 'barricadeN');
    const barricade = structureAt(sim.state, 'barricadeN')!;
    const hpBefore = barricade.hp;
    const termite = sim.spawnInvader('termite', 0, 720, 420, 40, 35)!;
    termite.targetType = 'structure';
    termite.targetId = barricade.id;
    combat(sim, SIM_DT);
    expect(termite.alive).toBe(false);
    expect(barricade.hp).toBe(hpBefore - 35);
  });
});

describe('wolf spider', () => {
  it('summons three spiderlings once, at sixty percent health, and they drop nothing', () => {
    const sim = nightSim();
    const boss = sim.spawnInvader('wolfSpider', 0, 720, 500, 1200, 30)!;
    boss.hp = 1200 * 0.55;
    combat(sim, SIM_DT);
    const spiderlings = sim.state.invaders.filter((i) => i.kind === 'raiderAnt');
    expect(spiderlings.length).toBe(3);
    expect(spiderlings.every((s) => s.noDrop)).toBe(true);
    expect(boss.hasSummoned).toBe(true);
    combat(sim, SIM_DT);
    expect(sim.state.invaders.filter((i) => i.kind === 'raiderAnt').length).toBe(3);
  });

  it('drops far more sugar than a raider when it falls', () => {
    const sim = nightSim();
    const boss = sim.spawnInvader('wolfSpider', 0, 720, 500, 1200, 30)!;
    sim.killInvader(boss);
    const dropped = sim.state.stats.sugarDropped;
    expect(dropped).toBeGreaterThan(INVADERS.raiderAnt.drop * 10);
  });
});

describe('tiger beetle', () => {
  it('moves in stop-start bursts rather than at a constant speed', () => {
    const sim = nightSim();
    const beetle = sim.spawnInvader('tigerBeetle', 0, 720, 300, 90, 12)!;
    beetle.bursting = false;
    beetle.burstTimer = INVADERS.tigerBeetle.burst!.pause;
    let stalled = 0;
    let moving = 0;
    for (let i = 0; i < 240; i++) {
      const before = beetle.pos.y;
      movement(sim, SIM_DT);
      if (Math.abs(beetle.pos.y - before) < 0.05) stalled++;
      else moving++;
    }
    expect(stalled).toBeGreaterThan(10);
    expect(moving).toBeGreaterThan(10);
  });
});

describe('warden targeting', () => {
  it('keeps its target until it leaves range plus the hysteresis margin', () => {
    const sim = nightSim();
    const near = sim.spawnInvader('raiderAnt', 0, 720, 1180 - 200, 30, 6)!;
    sim.state.warden.pos.x = 720;
    sim.state.warden.pos.y = 1180;
    combat(sim, SIM_DT);
    expect(sim.state.warden.targetId).toBe(near.id);

    // Just past range, still inside the margin: the target must not switch.
    near.pos.y = 1180 - (WARDEN.range + WARDEN.targetHysteresis - 5);
    const closer = sim.spawnInvader('raiderAnt', 0, 720, 1180 - 120, 30, 6)!;
    combat(sim, SIM_DT);
    expect(sim.state.warden.targetId).toBe(near.id);

    // Past the margin: it retargets to the nearer one.
    near.pos.y = 1180 - (WARDEN.range + WARDEN.targetHysteresis + 40);
    combat(sim, SIM_DT);
    expect(sim.state.warden.targetId).toBe(closer.id);
  });

  it('holds fire outside the night phase', () => {
    const sim = new Sim(17);
    sim.state.phase = 'day';
    sim.spawnInvader('raiderAnt', 0, 720, 1180 - 100, 30, 6);
    combat(sim, SIM_DT);
    expect(sim.state.warden.targetId).toBe(-1);
    expect(sim.state.projectiles.length).toBe(0);
  });
});
