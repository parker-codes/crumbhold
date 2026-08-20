import type { BuildableKind } from './balance';

/**
 * Hand-authored arena layout, exactly as specified in section 7. Never
 * procedurally generated: lane geometry is load-bearing for Spitter placement.
 */

export type SiteId =
  | 'brood'
  | 'mortar'
  | 'barricadeN'
  | 'barricadeSW'
  | 'barricadeSE'
  | 'spitter1'
  | 'spitter2'
  | 'spitter3'
  | 'spitter4'
  | 'battery'
  | 'galleryA'
  | 'galleryB'
  | 'paddock'
  | 'venomWell'
  | 'hoard'
  | 'aphidA'
  | 'aphidB'
  | 'nectarVat'
  | 'fungusGarden';

export interface SiteDef {
  id: SiteId;
  kind: BuildableKind;
  x: number;
  y: number;
  /** Pad footprint radius. */
  radius: number;
  label: string;
  /** Locked until the Brood Chamber reaches this tier. */
  unlockBroodTier?: number;
  /** Lane index this site sits on, for barricade blocking checks. */
  lane?: 0 | 1 | 2;
  /** Scent marker the gallery's majors hold. */
  marker?: { x: number; y: number };
}

export const TUNNEL_MOUTHS = [
  { x: 720, y: 260, spawn: { x: 720, y: 140 } },
  { x: 300, y: 1900, spawn: { x: 220, y: 2020 } },
  { x: 1140, y: 1900, spawn: { x: 1220, y: 2020 } },
] as const;

export const BROOD_POS = { x: 720, y: 1180 } as const;

export const SITES: readonly SiteDef[] = [
  { id: 'brood', kind: 'broodChamber', x: 720, y: 1180, radius: 78, label: 'Brood' },
  { id: 'mortar', kind: 'mortarPile', x: 720, y: 1290, radius: 46, label: 'Mortar' },

  { id: 'barricadeN', kind: 'barricade', x: 720, y: 400, radius: 62, label: 'Barricade', lane: 0 },
  { id: 'barricadeSW', kind: 'barricade', x: 380, y: 1760, radius: 62, label: 'Barricade', lane: 1 },
  { id: 'barricadeSE', kind: 'barricade', x: 1060, y: 1760, radius: 62, label: 'Barricade', lane: 2 },

  { id: 'spitter1', kind: 'spitter', x: 560, y: 940, radius: 48, label: 'Spitter' },
  { id: 'spitter2', kind: 'spitter', x: 880, y: 940, radius: 48, label: 'Spitter' },
  { id: 'spitter3', kind: 'spitter', x: 500, y: 1420, radius: 48, label: 'Spitter', unlockBroodTier: 2 },
  { id: 'spitter4', kind: 'spitter', x: 940, y: 1420, radius: 48, label: 'Spitter', unlockBroodTier: 4 },
  { id: 'battery', kind: 'battery', x: 720, y: 1020, radius: 52, label: 'Battery', unlockBroodTier: 3 },

  { id: 'galleryA', kind: 'gallery', x: 640, y: 700, radius: 54, label: 'Gallery', marker: { x: 700, y: 520 } },
  { id: 'galleryB', kind: 'gallery', x: 800, y: 1620, radius: 54, label: 'Gallery', marker: { x: 860, y: 1780 } },

  { id: 'paddock', kind: 'paddock', x: 430, y: 1140, radius: 50, label: 'Paddock' },
  { id: 'venomWell', kind: 'venomWell', x: 1010, y: 1140, radius: 50, label: 'Venom' },
  { id: 'hoard', kind: 'hoard', x: 720, y: 1500, radius: 52, label: 'Hoard' },

  { id: 'aphidA', kind: 'aphidPen', x: 240, y: 800, radius: 44, label: 'Aphids' },
  { id: 'aphidB', kind: 'aphidPen', x: 360, y: 920, radius: 44, label: 'Aphids' },
  { id: 'nectarVat', kind: 'nectarVat', x: 560, y: 1300, radius: 50, label: 'Nectar' },
  { id: 'fungusGarden', kind: 'fungusGarden', x: 880, y: 1300, radius: 50, label: 'Fungus' },
];

export const SITE_BY_ID: Readonly<Record<SiteId, SiteDef>> = Object.freeze(
  Object.fromEntries(SITES.map((s) => [s.id, s])) as Record<SiteId, SiteDef>,
);

/** Root Fringe: five hanging roots that regrow on a timer. */
export const ROOT_FRINGE = { x: 1130, y: 800 } as const;
export const ROOT_POSITIONS: readonly { x: number; y: number }[] = [
  { x: 1090, y: 726 },
  { x: 1128, y: 764 },
  { x: 1156, y: 806 },
  { x: 1132, y: 850 },
  { x: 1088, y: 880 },
];

/** Two fixed glowworm lanterns flanking the Brood Chamber. */
export const GLOWWORMS: readonly { x: number; y: number }[] = [
  { x: 596, y: 1120 },
  { x: 844, y: 1120 },
];

/**
 * Lane polylines from spawn to the chamber ring, each passing through its
 * barricade site. The final waypoint sits on the converge ring (radius 320).
 */
function ringPoint(fromX: number, fromY: number): { x: number; y: number } {
  const dx = fromX - BROOD_POS.x;
  const dy = fromY - BROOD_POS.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: BROOD_POS.x + (dx / len) * 320,
    y: BROOD_POS.y + (dy / len) * 320,
  };
}

export const LANES: readonly (readonly { x: number; y: number }[])[] = [
  [
    { x: 720, y: 140 },
    { x: 720, y: 400 },
    { x: 720, y: 700 },
    { x: 720, y: 860 },
    ringPoint(720, 700),
  ],
  [
    { x: 220, y: 2020 },
    { x: 380, y: 1760 },
    { x: 500, y: 1620 },
    { x: 620, y: 1420 },
    ringPoint(560, 1480),
  ],
  [
    { x: 1220, y: 2020 },
    { x: 1060, y: 1760 },
    { x: 940, y: 1620 },
    { x: 820, y: 1420 },
    ringPoint(880, 1480),
  ],
];

/** The barricade site guarding each lane, by lane index. */
export const LANE_BARRICADE: readonly SiteId[] = ['barricadeN', 'barricadeSW', 'barricadeSE'];

/**
 * Which tunnels are active on a given night (section 10.5 rule 4).
 * Nights 1 to 2 north only, 3 to 5 add southwest, 6 onward all three.
 */
export function activeLanes(night: number): number[] {
  if (night <= 2) return [0];
  if (night <= 5) return [0, 1];
  return [0, 1, 2];
}
