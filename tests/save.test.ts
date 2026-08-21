import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SAVE_KEY, emptySave, loadSave, serializeRun, writeSave } from '../src/game/save';
import { Sim } from '../src/game/sim';
import { createRun } from '../src/game/state';

/** Minimal Storage stand-in: these cases need no DOM. */
function memoryStorage(seed?: string): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(SAVE_KEY, seed);
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe('save file', () => {
  it('returns an empty save when nothing is stored', () => {
    const save = loadSave(memoryStorage());
    expect(save.version).toBe(1);
    expect(save.activeRun).toBeNull();
    expect(save.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips a run state', () => {
    const storage = memoryStorage();
    const save = emptySave();
    const run = createRun(4242);
    run.night = 6;
    run.warden.stack.sugar = 17;
    run.stats.invadersKilled = 88;
    save.activeRun = serializeRun(run);
    save.bestNight = 6;
    writeSave(save, storage);

    const loaded = loadSave(storage);
    expect(loaded.bestNight).toBe(6);
    expect(loaded.activeRun).not.toBeNull();
    expect(loaded.activeRun!.seed).toBe(4242);
    expect(loaded.activeRun!.night).toBe(6);
    expect(loaded.activeRun!.warden.stack.sugar).toBe(17);
    expect(loaded.activeRun!.stats.invadersKilled).toBe(88);
    expect(loaded.activeRun!.pads.length).toBe(run.pads.length);
  });

  it('a resumed run keeps playing from where it left off', () => {
    const run = createRun(9);
    run.night = 3;
    run.warden.pos.x = 1000;
    run.warden.pos.y = 500;
    const sim = new Sim(1);
    sim.adopt(serializeRun(run));
    expect(sim.state.night).toBe(3);
    expect(sim.camera.x).toBe(1000);
    expect(sim.camera.y).toBe(500);
  });

  it('discards the active run on an unknown version but keeps the meta', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 99,
        royalJelly: 12,
        traits: { bigMandibles: 2 },
        bestNight: 9,
        runs: 4,
        settings: { audio: false, hudScale: 1.25, highContrast: true, nightBrightness: 0.5, damageNumbers: true },
        activeRun: { seed: 1 },
      }),
    );
    const loaded = loadSave(storage);
    expect(loaded.version).toBe(1);
    expect(loaded.activeRun).toBeNull();
    expect(loaded.royalJelly).toBe(12);
    expect(loaded.bestNight).toBe(9);
    expect(loaded.traits.bigMandibles).toBe(2);
    expect(loaded.settings.audio).toBe(false);
    expect(loaded.settings.hudScale).toBe(1.25);
  });

  it('survives corrupt json', () => {
    expect(loadSave(memoryStorage('{not json'))).toEqual(emptySave());
    expect(loadSave(memoryStorage('null'))).toEqual(emptySave());
    expect(loadSave(memoryStorage('7'))).toEqual(emptySave());
  });

  it('fills in settings added after the file was written', () => {
    const storage = memoryStorage(
      JSON.stringify({ version: 1, settings: { audio: false }, activeRun: null }),
    );
    const loaded = loadSave(storage);
    expect(loaded.settings.audio).toBe(false);
    expect(loaded.settings.nightBrightness).toBe(DEFAULT_SETTINGS.nightBrightness);
    expect(loaded.settings.hudScale).toBe(DEFAULT_SETTINGS.hudScale);
  });
});
