import type { InvaderKind } from '../game/balance';
import { FIXED } from './palette';

/**
 * Silhouette-first blueprints. Every creature must be identifiable by shape
 * alone at 24 px, so the segment proportions do the work, not the colour.
 * Local space: +x is forward, +z is the creature's right, +y is up.
 */
export interface SegmentDef {
  f: number;
  z?: number;
  y: number;
  /** Half-extents along forward, up, and side. */
  l: number;
  h: number;
  w: number;
  color: number;
}

export interface SpikeDef {
  f: number;
  z: number;
  y: number;
  len: number;
  radius: number;
  /** Yaw in radians relative to forward. */
  yaw: number;
  color: number;
}

export interface Blueprint {
  segments: SegmentDef[];
  spikes: SpikeDef[];
  /**
   * Legs and antennae. Tinted from the creature's own family rather than pure
   * ink: at 24 creatures deep, six near-black limbs each would swamp the bodies
   * and every insect would read as the same dark mass.
   */
  limbColor: number;
  legs: {
    /** Attach offsets along forward, one per leg pair. */
    attach: number[];
    spread: number;
    length: number;
    thickness: number;
    swing: number;
    lift: number;
  };
  antennae: { f: number; length: number; spread: number } | null;
  shadow: number;
}

const foe = FIXED.foe;
const foeDark = FIXED.foeDark;

/** Three overlapping capsules: head, thorax, abdomen. The generic ant body. */
function antBody(scale: number, color: number, dark: number): SegmentDef[] {
  return [
    { f: 13 * scale, y: 10 * scale, l: 7 * scale, h: 6.5 * scale, w: 6.5 * scale, color },
    { f: 1 * scale, y: 10 * scale, l: 7 * scale, h: 7 * scale, w: 7 * scale, color: dark },
    { f: -13 * scale, y: 11 * scale, l: 11 * scale, h: 9 * scale, w: 9 * scale, color },
  ];
}

export const INVADER_SHAPES: Record<InvaderKind, Blueprint> = {
  // Thin, three clean segments. The baseline everything else reads against.
  raiderAnt: {
    segments: antBody(1, foe, foeDark),
    spikes: [
      { f: 19, z: -3.5, y: 10, len: 8, radius: 2.2, yaw: -0.5, color: foeDark },
      { f: 19, z: 3.5, y: 10, len: 8, radius: 2.2, yaw: 0.5, color: foeDark },
    ],
    limbColor: foeDark,
    legs: { attach: [7, -1, -9], spread: 8, length: 17, thickness: 2, swing: 0.5, lift: 3 },
    antennae: { f: 17, length: 16, spread: 0.5 },
    shadow: 17,
  },
  // Rounded dome with a raised abdomen it aims over its own back.
  bombardier: {
    segments: [
      { f: 12, y: 9, l: 6, h: 6, w: 7, color: foe },
      { f: -2, y: 12, l: 15, h: 11, w: 13, color: foeDark },
      { f: -17, y: 20, l: 7, h: 6, w: 6, color: FIXED.pale },
    ],
    spikes: [{ f: -24, z: 0, y: 22, len: 10, radius: 3, yaw: Math.PI, color: FIXED.pale }],
    limbColor: foeDark,
    legs: { attach: [8, -2, -12], spread: 10, length: 14, thickness: 2.4, swing: 0.4, lift: 2.5 },
    antennae: { f: 16, length: 11, spread: 0.6 },
    shadow: 20,
  },
  // Wide segmented oval, low to the ground, armoured across the front.
  pillbug: {
    segments: [
      { f: 12, y: 8, l: 7, h: 7, w: 13, color: foeDark },
      { f: 0, y: 9, l: 9, h: 8.5, w: 16, color: foe },
      { f: -13, y: 8, l: 8, h: 7, w: 14, color: foeDark },
    ],
    spikes: [],
    limbColor: foeDark,
    legs: { attach: [8, 0, -9], spread: 14, length: 11, thickness: 2.6, swing: 0.34, lift: 1.6 },
    antennae: { f: 17, length: 9, spread: 0.7 },
    shadow: 23,
  },
  // Pale body, bulbous abdomen. Reads as "about to go off".
  termite: {
    segments: [
      { f: 13, y: 9, l: 7, h: 6.5, w: 7, color: FIXED.pale },
      { f: 2, y: 10, l: 6, h: 6, w: 6.5, color: FIXED.pale },
      { f: -12, y: 12, l: 13, h: 12, w: 12, color: FIXED.sugar },
    ],
    spikes: [
      { f: 20, z: -3, y: 9, len: 7, radius: 2.4, yaw: -0.45, color: foeDark },
      { f: 20, z: 3, y: 9, len: 7, radius: 2.4, yaw: 0.45, color: foeDark },
    ],
    limbColor: foeDark,
    legs: { attach: [8, 0, -8], spread: 8, length: 15, thickness: 2, swing: 0.6, lift: 3.4 },
    antennae: { f: 18, length: 12, spread: 0.5 },
    shadow: 19,
  },
  // Broad shovel forelimbs. It only ever wants your walls.
  moleCricket: {
    segments: [
      { f: 15, y: 10, l: 8, h: 8, w: 10, color: foeDark },
      { f: 1, y: 12, l: 10, h: 10, w: 12, color: foe },
      { f: -16, y: 12, l: 14, h: 10, w: 11, color: foeDark },
    ],
    spikes: [
      { f: 22, z: -12, y: 8, len: 18, radius: 7, yaw: -0.75, color: FIXED.pale },
      { f: 22, z: 12, y: 8, len: 18, radius: 7, yaw: 0.75, color: FIXED.pale },
    ],
    limbColor: foeDark,
    legs: { attach: [4, -6, -16], spread: 11, length: 15, thickness: 3, swing: 0.32, lift: 2 },
    antennae: { f: 20, length: 10, spread: 0.4 },
    shadow: 26,
  },
  // Long, low, narrow. Built to sprint.
  tigerBeetle: {
    segments: [
      { f: 17, y: 9, l: 7, h: 6, w: 8, color: foeDark },
      { f: 4, y: 9, l: 7, h: 6, w: 8, color: foe },
      { f: -14, y: 9, l: 16, h: 7, w: 8, color: foeDark },
    ],
    spikes: [
      { f: 25, z: -4, y: 9, len: 10, radius: 2.2, yaw: -0.3, color: FIXED.pale },
      { f: 25, z: 4, y: 9, len: 10, radius: 2.2, yaw: 0.3, color: FIXED.pale },
    ],
    limbColor: foeDark,
    legs: { attach: [10, 0, -11], spread: 11, length: 21, thickness: 2, swing: 0.7, lift: 4 },
    antennae: { f: 22, length: 13, spread: 0.45 },
    shadow: 20,
  },
  // Huge branching mandibles, and a body heavy enough to justify them.
  stagBeetle: {
    segments: [
      { f: 14, y: 12, l: 8, h: 8, w: 11, color: foeDark },
      { f: 0, y: 14, l: 12, h: 12, w: 15, color: foe },
      { f: -18, y: 13, l: 14, h: 11, w: 14, color: foeDark },
    ],
    spikes: [
      { f: 26, z: -8, y: 12, len: 22, radius: 4, yaw: -0.34, color: FIXED.ink },
      { f: 26, z: 8, y: 12, len: 22, radius: 4, yaw: 0.34, color: FIXED.ink },
      { f: 40, z: -12, y: 12, len: 12, radius: 3, yaw: -1.3, color: FIXED.ink },
      { f: 40, z: 12, y: 12, len: 12, radius: 3, yaw: 1.3, color: FIXED.ink },
    ],
    limbColor: foeDark,
    legs: { attach: [9, -2, -14], spread: 14, length: 19, thickness: 3.4, swing: 0.34, lift: 2.4 },
    antennae: { f: 20, length: 10, spread: 0.5 },
    shadow: 28,
  },
  // Eight legs, twice everything else's footprint. A colony's nightmare.
  wolfSpider: {
    segments: [
      { f: 18, y: 20, l: 15, h: 13, w: 17, color: foeDark },
      { f: -14, y: 22, l: 24, h: 19, w: 24, color: foe },
    ],
    spikes: [
      { f: 32, z: -7, y: 18, len: 16, radius: 4, yaw: -0.5, color: FIXED.ink },
      { f: 32, z: 7, y: 18, len: 16, radius: 4, yaw: 0.5, color: FIXED.ink },
    ],
    limbColor: foeDark,
    legs: { attach: [16, 6, -6, -16], spread: 18, length: 40, thickness: 3.6, swing: 0.42, lift: 6 },
    antennae: null,
    shadow: 42,
  },
};

/**
 * The Warden: bulkier than a worker, oversized head, visible mandibles, colony
 * teal across the thorax, and a facing wedge so her heading is never in doubt.
 */
export const WARDEN_SHAPE: Blueprint = {
  segments: [
    { f: 17, y: 14, l: 12, h: 11, w: 12, color: 0x7d6f78 },
    { f: 0, y: 15, l: 11, h: 11, w: 12, color: FIXED.colony },
    { f: -19, y: 16, l: 15, h: 13, w: 13, color: 0x7d6f78 },
  ],
  spikes: [
    { f: 28, z: -6, y: 12, len: 14, radius: 3.6, yaw: -0.42, color: FIXED.pale },
    { f: 28, z: 6, y: 12, len: 14, radius: 3.6, yaw: 0.42, color: FIXED.pale },
    { f: 30, z: 0, y: 20, len: 16, radius: 5, yaw: 0, color: FIXED.sugar },
  ],
  limbColor: 0x4a434c,
  legs: { attach: [10, -2, -13], spread: 11, length: 22, thickness: 2.8, swing: 0.5, lift: 4 },
  antennae: { f: 22, length: 20, spread: 0.5 },
  shadow: 24,
};

/** Allied majors: the Warden's silhouette at worker scale, teal-marked. */
export const MAJOR_SHAPE: Blueprint = {
  segments: [
    { f: 11, y: 9, l: 7, h: 6.5, w: 7, color: 0x6f636c },
    { f: 0, y: 10, l: 7, h: 7, w: 7.5, color: FIXED.colony },
    { f: -12, y: 10, l: 10, h: 8, w: 8, color: 0x6f636c },
  ],
  spikes: [
    { f: 18, z: -3.5, y: 9, len: 8, radius: 2.4, yaw: -0.45, color: FIXED.pale },
    { f: 18, z: 3.5, y: 9, len: 8, radius: 2.4, yaw: 0.45, color: FIXED.pale },
  ],
  limbColor: 0x4a434c,
  legs: { attach: [7, -1, -9], spread: 8, length: 16, thickness: 2.2, swing: 0.5, lift: 3 },
  antennae: { f: 16, length: 14, spread: 0.5 },
  shadow: 16,
};

/** The saddled rhinoceros beetle. Broad shell, one horn, no HP: it is a toy. */
export const BEETLE_SHAPE: Blueprint = {
  segments: [
    { f: 16, y: 13, l: 9, h: 8, w: 12, color: 0x8a5527 },
    { f: -4, y: 17, l: 20, h: 15, w: 19, color: 0xb4713a },
    { f: -22, y: 13, l: 9, h: 9, w: 13, color: 0x8a5527 },
  ],
  spikes: [
    { f: 30, z: 0, y: 18, len: 26, radius: 5, yaw: 0, color: 0x6d4220 },
    { f: 8, z: 0, y: 30, len: 10, radius: 6, yaw: 0, color: FIXED.colony },
  ],
  limbColor: 0x4a434c,
  legs: { attach: [11, -2, -16], spread: 15, length: 20, thickness: 4, swing: 0.4, lift: 3 },
  antennae: { f: 22, length: 10, spread: 0.4 },
  shadow: 30,
};
