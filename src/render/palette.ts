import { Color } from 'three';

const WHITE = new Color(0xffffff);

/**
 * The two palettes from section 12, cross-faded at phase change. Sugar, foe,
 * colony, and ink are identical in both: those are the things the player tracks
 * under pressure, and they must never shift.
 */
export const DAY = {
  floor: 0x4c3b2e,
  floorAlt: 0x66513f,
  trail: 0xa8895f,
  pebble: 0xa8b0be,
  pebbleDark: 0x5b6270,
  resin: 0xb9743a,
  shaft: 0xfff3c4,
  sky: 0x7fb4d4,
  /** Colour the frame edges and the unlit ground fall away to. */
  haze: 0x2a2118,
} as const;

export const NIGHT = {
  floor: 0x2b2939,
  floorAlt: 0x343147,
  trail: 0x413e57,
  pebble: 0x59637a,
  pebbleDark: 0x333a49,
  resin: 0x6f462a,
  shaft: 0x2b3350,
  sky: 0x161a2c,
  haze: 0x0a0a12,
} as const;

/** Fixed across both palettes. */
export const FIXED = {
  /** The money colour: costs, counters, brood cells. */
  sugar: 0xf5c147,
  sugarDeep: 0xc48a16,
  /**
   * The crystal itself, which is not the money colour. Sugar read as amber was
   * indistinguishable from a honeydew droplet at a glance; real sugar is a
   * near-white prism that refracts warm, so the body is pale and the outline
   * keeps the gold so it still ties to the economy.
   */
  sugarCrystal: 0xeef1f2,
  sugarFacet: 0xd9a63f,
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

/**
 * The lighting rig, carried by the theme rather than hard-coded in the stage.
 * Five sources, because two cannot describe a solid: a hemisphere for the bounce
 * off floor and ceiling, a thin ambient floor, a key that casts the shadows, a
 * cool fill from the opposite side, and a rim that separates a silhouette from
 * the ground behind it.
 *
 * Angles are radians. `keyAz` is measured in the floor plane and `keyEl` up from
 * it, so a rig reads as a sun position rather than a vector nobody can picture.
 */
export interface LightRig {
  hemiSky: number;
  hemiGround: number;
  hemiInt: number;
  ambColor: number;
  ambInt: number;
  keyColor: number;
  keyInt: number;
  keyAz: number;
  keyEl: number;
  fillColor: number;
  fillInt: number;
  rimColor: number;
  rimInt: number;
  /** Tone-mapping exposure. Above 1 lifts the mid-tones without clipping. */
  exposure: number;
  /** Alpha of the contact shadow under every creature. */
  blobAlpha: number;
  /** Emissive gain on resource crystals and glowcaps. */
  glow: number;
}

const DAY_RIG: LightRig = {
  // Sky cool, ground warm, ambient cool. The shaft is the only warm source, so
  // everything it does not touch has to fall the other way or the gallery reads
  // as one hue at every value.
  hemiSky: 0xdae5f4,
  hemiGround: 0x6d5843,
  hemiInt: 0.42,
  ambColor: 0xc6d4ee,
  ambInt: 0.28,
  keyColor: 0xfff0cf,
  keyInt: 1.05,
  keyAz: -2.35,
  keyEl: 0.86,
  // The cool fill is what stops an earth-toned gallery reading as one hue: it
  // carries the shadow side while the key carries the lit side.
  fillColor: 0xa9c8f0,
  fillInt: 0.44,
  rimColor: 0xffd89a,
  rimInt: 0.22,
  exposure: 1.12,
  blobAlpha: 0.24,
  glow: 0.3,
};

const NIGHT_RIG: LightRig = {
  hemiSky: 0x33406a,
  hemiGround: 0x121220,
  hemiInt: 0.4,
  ambColor: 0x3c4470,
  ambInt: 0.16,
  keyColor: 0x92abe4,
  keyInt: 0.3,
  keyAz: -2.1,
  keyEl: 0.8,
  fillColor: 0x2a3350,
  fillInt: 0.18,
  rimColor: 0x9bb4ff,
  rimInt: 0.3,
  exposure: 1.2,
  blobAlpha: 0.3,
  glow: 1,
};

/**
 * Interface tokens. Kept as numbers rather than CSS strings so the phase
 * cross-fade can interpolate them, then published as custom properties once per
 * meaningful change. One theme drives the world and the HUD together: when the
 * shaft closes, the panels cool with it.
 */
interface UiTheme {
  text: number;
  textDim: number;
  textFaint: number;
  /** Panel fill, and its alpha. */
  plate: number;
  plateAlpha: number;
  hairline: number;
  hairlineAlpha: number;
  /** The rule under a panel heading, brighter than a hairline. */
  rule: number;
  ruleAlpha: number;
  /** Frame vignette: colour, and how far in it reaches. */
  vignette: number;
  vignetteAlpha: number;
  /** Six-stop gradient for the surface band above the gallery. */
  band: readonly [number, number, number, number, number, number];
}

const DAY_UI: UiTheme = {
  text: 0xf7f0e3,
  textDim: 0xc3b39a,
  textFaint: 0x8d7f6a,
  plate: 0x1b1610,
  plateAlpha: 0.66,
  hairline: 0xc7a97c,
  hairlineAlpha: 0.22,
  rule: 0xe0bd86,
  ruleAlpha: 0.44,
  vignette: 0x15100a,
  vignetteAlpha: 0.36,
  band: [0x9fd0e8, 0x7fb4d4, 0x6b9fc4, 0x4a6f8a, 0x33485a, 0x241c14],
};

const NIGHT_UI: UiTheme = {
  text: 0xeceaf6,
  textDim: 0xa4a2bd,
  textFaint: 0x6f6d8a,
  plate: 0x0d0d16,
  plateAlpha: 0.72,
  hairline: 0x9aa6d6,
  hairlineAlpha: 0.2,
  rule: 0xb6c2f2,
  ruleAlpha: 0.4,
  vignette: 0x05050c,
  vignetteAlpha: 0.6,
  band: [0x101532, 0x161c3c, 0x1b2244, 0x1a2140, 0x14192e, 0x0c0c16],
};

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
  readonly haze = new Color();
  /** The live rig, lerped between the two phase rigs. */
  readonly rig: LightRig = { ...DAY_RIG };

  private readonly dayColors = new Map<PaletteKey, Color>();
  private readonly nightColors = new Map<PaletteKey, Color>();
  private readonly ui = blankUi();
  private readonly cssCache = new Map<string, string>();
  /** The last `update` inputs, so `publishCss` can skip an unchanged frame. */
  private lastMix = -1;
  private lastBrightness = -1;
  private publishedKey = Number.NaN;

  constructor() {
    for (const key of Object.keys(DAY) as PaletteKey[]) {
      this.dayColors.set(key, new Color(DAY[key]));
      this.nightColors.set(key, new Color(NIGHT[key]));
    }
    this.update(0, 0);
  }

  /** `mix` 0 is full day, 1 is full night. `brightness` is 0 to 1. */
  update(mix: number, brightness: number): void {
    this.lastMix = mix;
    this.lastBrightness = brightness;
    const targets: [PaletteKey, Color][] = [
      ['floor', this.floor],
      ['floorAlt', this.floorAlt],
      ['trail', this.trail],
      ['pebble', this.pebble],
      ['pebbleDark', this.pebbleDark],
      ['resin', this.resin],
      ['shaft', this.shaft],
      ['sky', this.sky],
      ['haze', this.haze],
    ];
    for (const [key, out] of targets) {
      out.copy(this.dayColors.get(key)!).lerp(this.nightColors.get(key)!, mix);
    }
    lerpRig(this.rig, DAY_RIG, NIGHT_RIG, mix);
    lerpUi(this.ui, DAY_UI, NIGHT_UI, mix);

    if (mix > 0 && brightness > 0) {
      // The accessibility slider lifts the unlit floor and the ambient term
      // together: raising the floor colour alone would flatten it again.
      const lift = brightness * mix;
      this.floor.lerp(WHITE, lift * 0.16);
      this.floorAlt.lerp(WHITE, lift * 0.16);
      this.trail.lerp(WHITE, lift * 0.12);
      this.pebble.lerp(WHITE, lift * 0.1);
      this.pebbleDark.lerp(WHITE, lift * 0.1);
      this.rig.ambInt += lift * 0.22;
      this.rig.hemiInt += lift * 0.2;
      this.ui.vignetteAlpha -= lift * 0.2;
    }
  }

  /**
   * Pushes the interface tokens onto the document root. Called every frame but
   * only writes when the theme has actually moved, because a custom-property
   * write invalidates style for the whole HUD subtree. The brightness slider is
   * part of the key: it changes the vignette without changing the phase.
   */
  publishCss(root: HTMLElement): void {
    // Quantised so a cross-fade publishes about a hundred times rather than
    // every frame, and so a settled phase publishes nothing at all.
    const key = Math.round(this.lastMix * 250) * 32 + Math.round(this.lastBrightness * 24);
    if (key === this.publishedKey) return;
    this.publishedKey = key;
    const ui = this.ui;
    this.setVar(root, '--text', hex(ui.text));
    this.setVar(root, '--text-dim', hex(ui.textDim));
    this.setVar(root, '--text-faint', hex(ui.textFaint));
    this.setVar(root, '--plate', rgba(ui.plate, ui.plateAlpha));
    this.setVar(root, '--plate-solid', hex(ui.plate));
    this.setVar(root, '--hairline', rgba(ui.hairline, ui.hairlineAlpha));
    this.setVar(root, '--hairline-soft', rgba(ui.hairline, ui.hairlineAlpha * 0.5));
    this.setVar(root, '--rule', rgba(ui.rule, ui.ruleAlpha));
    this.setVar(root, '--vignette', rgba(ui.vignette, ui.vignetteAlpha));
    this.setVar(root, '--vignette-edge', rgba(ui.vignette, Math.min(1, ui.vignetteAlpha * 1.5)));
    for (let i = 0; i < 6; i++) this.setVar(root, `--band-${i}`, hex(ui.band[i]));
    this.setVar(root, '--world-floor', '#' + this.floor.getHexString());
    this.setVar(root, '--world-trail', '#' + this.trail.getHexString());
    // The surface band is a cross-section of the same earth the gallery is dug
    // out of, so its soil has to be the floor tone rather than a second brown.
    this.setVar(root, '--soil', '#' + soilScratch.copy(this.floor).multiplyScalar(0.72).getHexString());
    this.setVar(root, '--soil-deep', '#' + soilScratch.copy(this.haze).getHexString());
  }

  private setVar(root: HTMLElement, name: string, value: string): void {
    if (this.cssCache.get(name) === value) return;
    this.cssCache.set(name, value);
    root.style.setProperty(name, value);
  }
}

function blankUi(): UiTheme {
  return { ...DAY_UI, band: [...DAY_UI.band] as unknown as UiTheme['band'] };
}

const rigScratchA = new Color();
const rigScratchB = new Color();
const soilScratch = new Color();

/** Rig fields holding a packed colour rather than a scalar. */
const RIG_COLOR_KEYS: readonly (keyof LightRig)[] = [
  'hemiSky', 'hemiGround', 'ambColor', 'keyColor', 'fillColor', 'rimColor',
];

function lerpRig(out: LightRig, a: LightRig, b: LightRig, t: number): void {
  for (const key of Object.keys(a) as (keyof LightRig)[]) {
    out[key] = RIG_COLOR_KEYS.includes(key)
      ? lerpHex(a[key], b[key], t)
      : a[key] + (b[key] - a[key]) * t;
  }
}

function lerpUi(out: UiTheme, a: UiTheme, b: UiTheme, t: number): void {
  out.text = lerpHex(a.text, b.text, t);
  out.textDim = lerpHex(a.textDim, b.textDim, t);
  out.textFaint = lerpHex(a.textFaint, b.textFaint, t);
  out.plate = lerpHex(a.plate, b.plate, t);
  out.plateAlpha = a.plateAlpha + (b.plateAlpha - a.plateAlpha) * t;
  out.hairline = lerpHex(a.hairline, b.hairline, t);
  out.hairlineAlpha = a.hairlineAlpha + (b.hairlineAlpha - a.hairlineAlpha) * t;
  out.rule = lerpHex(a.rule, b.rule, t);
  out.ruleAlpha = a.ruleAlpha + (b.ruleAlpha - a.ruleAlpha) * t;
  out.vignette = lerpHex(a.vignette, b.vignette, t);
  out.vignetteAlpha = a.vignetteAlpha + (b.vignetteAlpha - a.vignetteAlpha) * t;
  const band = out.band as unknown as number[];
  for (let i = 0; i < 6; i++) band[i] = lerpHex(a.band[i], b.band[i], t);
}

function lerpHex(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return rigScratchA.setHex(a).lerp(rigScratchB.setHex(b), t).getHex();
}

function hex(value: number): string {
  return '#' + value.toString(16).padStart(6, '0');
}

function rgba(value: number, alpha: number): string {
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}
