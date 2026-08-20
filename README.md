# Crumbhold

Arcade idle plus lane tower defence, built from `CRUMBHOLD-SPEC.md`. Haul sugar by
day, hold three tunnels after dark, twelve nights then endless.

Portrait mobile web first, playable on desktop. Static site, no backend, no
accounts, no network calls.

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
| Drag in the left 45 percent, bottom 70 percent | Move. The joystick appears where you touch. |
| Action button, bottom right | Context sensitive: Trail, Drum, dismount, or Ready. |
| Pause button, top right | Pause. Instant, free, no timer runs. |

**Keyboard (desktop)**

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` or the arrow keys | Move. Diagonals are normalised, so no speed bonus. |
| `Space` | The action button. Its on-screen label names the key on a desktop pointer. |
| `Esc` | Pause, and press again to resume. |

Attacks are fully automatic in both cases; there is no attack input, ever. And
you never tap to buy: you walk onto a pad and stay there.

Note that walking *across* a pad pays into it. That is the presence rule working
as specified, not a misfire.

## Deviations from the spec

Three, all deliberate.

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
3. **A structure at 0 HP is breached, not deleted.** It keeps its site and tier,
   stops working, goes dark, and comes back at the Mortar Pile. Section 9.6 lists
   barricades, posts, galleries, and the chamber as structures whose damage
   persists between nights and are repaired most-damaged-first, which only holds
   if they survive reaching zero. Deleting them makes the Mortar Pile pointless
   and turns every lost barricade into a full-price rebuild.

Two smaller notes:

- The section 10.4 threat table drifts up to two points from its own formula from
  night 7 on. `threat(n) = round(40 * 1.32^(n-1))` is the stated source of truth
  and is what ships; `tests/waves.test.ts` asserts both.
- The display and UI faces are **Rowdies** and **Chivo** per section 12, declared
  in `src/ui/style.css` with heavy rounded and tabular fallbacks. Drop the
  subsetted woff2 files in and add the `@font-face` rules to pick them up; no
  CDN, no network fetch, exactly as section 18 requires.

## Layout

```
src/
  engine/   loop, input, audio, rng, ease, pool, spatial, viewport
  game/     balance.ts (every tunable), gallery.ts (fixed sites and lanes),
            waves.ts, state.ts, sim.ts, step.ts, save.ts, systems/
  render/   scene, floor, lighting, creatures, structuresView, padsView,
            props, palette, view
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
| Economy ceiling at night 12 | 75 to 85 percent of the 6355 full build | 78 to 79 percent, economy-first play, 50 seeds |
| Spitters only | fails around night 7 | median night 8, 20 seeds |
| Economy only | fails around night 5 | median night 5, 20 seeds |
| A built-out colony | reaches night 12 bruised | tier 2 everywhere clears 11 of 20 |

Use at least 50 seeds, as section 20 asks. Small samples swing several points:
the same invariant reads 74 percent over 5 seeds and 78 to 79 percent over 50,
so a handful of runs is an anecdote rather than a measurement.

Determinism is per engine. A seed replays exactly on the same runtime, which is
what `tests/determinism.test.ts` asserts and what balance work needs. Wave
composition is integer and PRNG work and comes out bit-identical across engines;
the physics-heavy collection figures can move by about a point between
JavaScriptCore and V8. The table above was measured under Bun.

`ECONOMY.dropMultiplier` is the section 10.8 fix. At 1.0 the harness reproduces
the spec's own 61 to 72 percent baseline; 1.3 lands the ceiling inside the target
band. Raised on drops rather than cut from costs, so nights feel more rewarding
instead of structures feeling cheap.

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
# crumbhold
