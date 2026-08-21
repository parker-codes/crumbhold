# Crumbhold

Arcade idle plus lane tower defence. Haul sugar by day, hold three tunnels after
dark, twelve nights then endless.

Portrait mobile web first, playable on desktop. Static site, no backend, no
accounts, no network calls.

New here? [GAME_INSTRUCTIONS.md](GAME_INSTRUCTIONS.md) covers the objective, the
mechanics, every creature, and how to actually win. This file is the build and
engineering notes.

Requires [Bun](https://bun.sh) 1.3 or newer. Bun is the package manager and the
script runner; there is no npm lockfile in the tree.

```bash
bun install
bun run dev        # dev server
bun run build      # typecheck, then a static bundle in dist/
bun run preview    # serve the built bundle
bun run typecheck  # tsc --noEmit on its own
bun run test       # unit tests, 74 of them
bun run sim -- --strategy balanced --seeds 50   # headless balance harness
```

Vite and Vitest still do the building and testing, per spec section 5, which
limits dev dependencies to Vite, TypeScript, and Vitest. Bun replaces npm around
them, and it runs `scripts/harness.ts` straight from TypeScript, so the harness
needs no build step of its own.

## Controls

Touch and keyboard are both live at all times; neither has to be enabled. A held
key is ignored while a thumb is on the stick, so the two never fight.

**Touch**

| Input | Action |
| --- | --- |
| Drag anywhere on the floor | Move. The joystick appears where you touch. A second finger waits its turn, and takes over if the first one lifts. |
| Action button, bottom right | Context sensitive: Rally, Mount, or Dismount. Hidden when none apply. |
| End day, top right | Starts the night early for the sugar bonus. Daytime only. |
| Pause button, top right | Pause. Instant, free, no timer runs. |

**Keyboard (desktop)**

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` or the arrow keys | Move. Diagonals are normalised, so no speed bonus. |
| `Space` | The action button. Its on-screen label names the key until a touch arrives, then it goes. |
| `Esc` | Pause, and press again to resume. |

You attack automatically in both cases; there is no attack input, ever. And you
never tap to buy: you walk onto a pad and stay there.

**Vibration** answers a purchase, a hit on the Brood Chamber, a knockdown, and
the open and close of a night. It rides the Vibration API, which Android
implements and iOS Safari does not, so on an iPhone there is nothing to feel and
the setting is hidden. Nothing the game has to say is said by the motor alone.

**Tutorial** on the title screen runs a guided sixteen-step version of a real
day and night. It never writes the save.

Note that walking *across* a pad pays into it. That is the presence rule working
as specified, not a misfire.

## Deviations from the spec

Four, all deliberate.

1. **Three.js instead of Canvas 2D** (spec section 5 asks for one 2D context and
   zero runtime dependencies). Requested explicitly. The renderer is a top-down
   orthographic scene with a shallow 0.22 rad tilt, which turns section 12's
   "footprint quad plus a front face plus a top" into real geometry. Everything
   is still procedural: no models, no textures beyond one generated floor grain
   canvas, no sprite sheets, no audio files.
2. **The camera fixes the vertical extent, not the shorter axis** (section 7 says
   shorter axis). On a portrait phone the literal rule puts the Warden at 12 px
   and the carry stack at 32 px, which breaks both the 24 px silhouette rule and
   the "read your wealth from across the gallery" pillar. Fixing the vertical
   extent satisfies both and is also what section 5 asks of landscape: widen the
   viewport and letterbox. See `WORLD.viewUnits` in `balance.ts`.
3. **End day is its own control, not a case on the action button.** Section 6
   puts Ready in the action button's priority list below Drum. That makes it
   unreachable: on foot in daylight with a Paddock owned, `currentAction` always
   returns Drum, so buying a Paddock silently removed the early-end bonus from
   every remaining day of the run. It now sits beside Pause, where it is always
   in the same place and always available. `tests/controls.test.ts` covers the
   regression.
4. **A structure at 0 HP is breached, not deleted.** It keeps its site and tier,
   stops working, goes dark, and comes back at the Mortar Pile. Section 9.6 lists
   barricades, posts, galleries, and the chamber as structures whose damage
   persists between nights and are repaired most-damaged-first, which only holds
   if they survive reaching zero. Deleting them makes the Mortar Pile pointless
   and turns every lost barricade into a full-price rebuild.

A few smaller notes:

- The section 10.4 threat table drifts up to two points from its own formula from
  night 7 on. `threat(n) = round(40 * 1.32^(n-1))` is the stated source of truth
  and is what ships; `tests/waves.test.ts` asserts both.
- Section 10.7 prints a full build cost of 6355, but its own breakdown counts
  three Spitter Post sites where section 7 lists four, so the printed figure is
  250 light. The harness derives the total from the cost tables instead, which
  comes to 6605 and cannot drift when a cost or a site changes.
- **The tutorial is a real run, not a slideshow.** `game/tutorial.ts` is a
  sixteen-step script that drives the same systems the game does: the same pads,
  the same 25 carry cap, the same spawn queue. Each step waits on a predicate
  over live state, so a step cannot be satisfied by anything except actually
  doing the thing. Only three things are held rather than faked — the day clock
  is parked so a lesson is never cut off, the chamber is invulnerable via the
  existing `sim.invulnerable`, and the one scripted night writes its own small
  spawn queue instead of the night-1 roster. It never writes the save.
- **One theme drives the world and the HUD.** `render/palette.ts` carries three
  things per phase: the world tones, a five-light rig (hemisphere, ambient, key,
  cool fill, rim, plus tone-mapping exposure), and the interface tokens. The
  phase cross-fade interpolates all three, then publishes the interface half onto
  the document root as custom properties, so `style.css` reads `--text`,
  `--plate`, `--hairline` and the six surface-band sky stops from the same source
  the renderer reads. When the shaft closes, the panels cool with it. Adding a
  third palette means adding one object, not editing two files that must agree.
- The display and UI faces are **Rowdies** and **Chivo** per section 12, declared
  in `src/ui/style.css` with heavy rounded and tabular fallbacks. Drop the
  subsetted woff2 files in and add the `@font-face` rules to pick them up; no
  CDN, no network fetch, exactly as section 18 requires.

## Layout

```
src/
  engine/   loop, input, audio, rng, ease, pool, spatial, viewport
  game/     balance.ts (every tunable), gallery.ts (fixed sites and lanes),
            waves.ts, state.ts, sim.ts, step.ts, save.ts, tutorial.ts, systems/
  render/   scene, floor, lighting, atmosphere, creatures, structuresView,
            padsView, props, palette, view
  ui/       hud, overlays, onboarding, debug, style.css
scripts/    harness.ts, bot.ts   headless balance tooling, run by Bun directly
tests/      vitest, no DOM
```

`balance.ts` holds every tunable value. A number appearing in a system file is a
bug. `step.ts` runs the systems in the fixed order from section 16; rendering is
a separate pass that reads state and mutates nothing.

## Balance

`bun run sim` drives the real systems through a scripted bot, so the numbers come
from the game and not from a spreadsheet.

| Check | Spec target | Measured |
| --- | --- | --- |
| Economy ceiling at night 12 | 75 to 85 percent of the full build | 80 percent, economy-first play, 50 seeds |
| Spitters only | fails around night 7 | median night 7, 20 seeds |
| Economy only | fails around night 5 | median night 5, 20 seeds |
| A built-out colony | reaches night 12 bruised | tier 2 everywhere clears 14 of 20 |

Use at least 50 seeds, as section 20 asks. Small samples swing a couple of
points, so a handful of runs is an anecdote rather than a measurement.

Determinism is per engine. A seed replays exactly on the same runtime, which is
what `tests/determinism.test.ts` asserts and what balance work needs. Wave
composition is integer and PRNG work and comes out bit-identical across engines;
the physics-heavy collection figures can move by about a point between
JavaScriptCore and V8. The table above was measured under Bun.

`ECONOMY.dropMultiplier` is the section 10.8 fix. At 1.0 the harness reproduces
the spec's own 61 to 72 percent baseline; 1.4 puts the ceiling at 80 percent,
mid-band and stable across seed ranges. Raised on drops rather than cut from
costs, so nights feel more rewarding instead of structures feeling cheap.

Useful flags: `--seed`, `--seeds`, `--nights`, `--strategy`
(`balanced` `spitters` `economy` `barricades`), `--prebuild <tier>`, `--invuln`,
`--quiet`.

## Debug

Add `?debug=1`: overlay with frame time, sim time, entity counts, threat spent and
light pool count, plus cheats for sugar, max build, kill all, skip to night,
invulnerability, slow motion, and single stepping. `window.crumbhold` exposes the
sim, loop, and view.

## Not built

- Meta progression across runs (spec section 11, milestone 8, flagged off by
  design). `META.traitsEnabled` is `false` and Royal Jelly accrues in the save
  file, but there are no traits and no run-start selection.
- Music is the ambient bed only: two synth pads on one root, major by day and
  minor at night, cross-faded, with the irregular clicking layer. No composition.
