import { Color } from 'three';

const WHITE = new Color(0xffffff);

/**
 * The two palettes from section 12, cross-faded at phase change. Sugar, foe,
 * colony, and ink are identical in both: those are the things the player tracks
 * under pressure, and they must never shift.
 */
export const DAY = {
  floor: 0x6e5a4c,
  floorAlt: 0x7b6656,
  trail: 0xa78d6b,
  pebble: 0x8e97a8,
  pebbleDark: 0x59616f,
  resin: 0xb4713a,
  shaft: 0xfff3c4,
  sky: 0x7fb4d4,
} as const;

export const NIGHT = {
  floor: 0x2c2a3a,
  floorAlt: 0x343247,
  trail: 0x46435c,
  pebble: 0x5b6577,
  pebbleDark: 0x39414f,
  resin: 0x7a4d2a,
  shaft: 0x2b3350,
  sky: 0x1b2036,
} as const;

/** Fixed across both palettes. */
export const FIXED = {
  sugar: 0xf5c147,
  sugarDeep: 0xc48a16,
  colony: 0x2e6f8e,
  foe: 0xc2405b,
  foeDark: 0x8a2039,
  ink: 0x22212b,
  glowcap: 0x9be86b,
  glowworm: 0xffb347,
  honeydew: 0xffd98a,
  leaf: 0x8fc95a,
  pale: 0xd8cfae,
} as const;

export type PaletteKey = keyof typeof DAY;

/** Live palette, re-evaluated each frame from the night cross-fade mix. */
export class Palette {
  readonly floor = new Color();
  readonly floorAlt = new Color();
  readonly trail = new Color();
  readonly pebble = new Color();
  readonly pebbleDark = new Color();
  readonly resin = new Color();
  readonly shaft = new Color();
  readonly sky = new Color();
  /** Base ambient level, raised by the night-brightness accessibility slider. */
  ambient = 1;

  private readonly dayColors = new Map<PaletteKey, Color>();
  private readonly nightColors = new Map<PaletteKey, Color>();

  constructor() {
    for (const key of Object.keys(DAY) as PaletteKey[]) {
      this.dayColors.set(key, new Color(DAY[key]));
      this.nightColors.set(key, new Color(NIGHT[key]));
    }
    this.update(0, 0);
  }

  /** `mix` 0 is full day, 1 is full night. `brightness` is 0 to 1. */
  update(mix: number, brightness: number): void {
    const targets: [PaletteKey, Color][] = [
      ['floor', this.floor],
      ['floorAlt', this.floorAlt],
      ['trail', this.trail],
      ['pebble', this.pebble],
      ['pebbleDark', this.pebbleDark],
      ['resin', this.resin],
      ['shaft', this.shaft],
      ['sky', this.sky],
    ];
    for (const [key, out] of targets) {
      out.copy(this.dayColors.get(key)!).lerp(this.nightColors.get(key)!, mix);
    }
    // The night tokens are already the dark values, so lighting must not dim
    // them again: areas outside every pool sit exactly at the night palette,
    // which is dark but never black. Invaders have to be visible before they
    // reach the light.
    this.ambient = 1 - mix * 0.08;
    if (mix > 0 && brightness > 0) {
      // The accessibility slider lifts the unlit floor, up to 40 percent.
      const lift = brightness * 0.4 * mix;
      this.floor.lerp(WHITE, lift * 0.28);
      this.floorAlt.lerp(WHITE, lift * 0.28);
      this.trail.lerp(WHITE, lift * 0.2);
      this.pebble.lerp(WHITE, lift * 0.16);
      this.pebbleDark.lerp(WHITE, lift * 0.16);
    }
  }
}
