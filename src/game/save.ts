import type { RunState, SaveFile, Settings } from './types';

const KEY = 'crumbhold.v1';
const VERSION = 1 as const;

export const DEFAULT_SETTINGS: Settings = {
  audio: true,
  music: false,
  hudScale: 1,
  highContrast: false,
  nightBrightness: 0,
  damageNumbers: false,
};

export function emptySave(): SaveFile {
  return {
    version: VERSION,
    royalJelly: 0,
    traits: {},
    bestNight: 0,
    runs: 0,
    settings: { ...DEFAULT_SETTINGS },
    activeRun: null,
  };
}

/**
 * Reads the save. An unknown version discards the active run and keeps the meta,
 * so a mid-run format change never bricks a player's progress.
 */
export function loadSave(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): SaveFile {
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return emptySave();
  }
  if (!raw) return emptySave();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptySave();
  }
  if (typeof parsed !== 'object' || parsed === null) return emptySave();
  const data = parsed as Partial<SaveFile>;
  const base = emptySave();
  const save: SaveFile = {
    version: VERSION,
    royalJelly: numberOr(data.royalJelly, 0),
    traits: typeof data.traits === 'object' && data.traits ? data.traits : {},
    bestNight: numberOr(data.bestNight, 0),
    runs: numberOr(data.runs, 0),
    settings: { ...base.settings, ...(data.settings ?? {}) },
    activeRun: data.version === VERSION ? (data.activeRun ?? null) : null,
  };
  return save;
}

export function writeSave(save: SaveFile, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(save));
  } catch {
    // A full or blocked quota must never interrupt play.
  }
}

/** Strips the transient fields a resumed run should not carry across. */
export function serializeRun(state: RunState): RunState {
  return JSON.parse(JSON.stringify(state)) as RunState;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export { KEY as SAVE_KEY, VERSION as SAVE_VERSION };
