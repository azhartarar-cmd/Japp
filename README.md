# Echo Thief

A 2D top-down stealth puzzle where **the screen is black and you only see what your own noise lights up**.
Footsteps, thrown pebbles and a bell send out sonar pulses that briefly reveal nearby geometry, then fade back to black.
The guards are blind too and hunt purely by sound, so every reveal is a risk.

Runs in the browser (static build, GitHub Pages friendly) and as a macOS app (DMG) from the same codebase.

## Controls

| Action | Keys |
|---|---|
| Move (8-way) | `WASD` / arrow keys |
| Sneak (slower, tiny pulse) | hold `Shift` |
| Run (faster, huge pulse) | hold `Space` |
| Throw a pebble at the cursor | left click |
| Ring the bell (1 per level) | `E` or right click |
| Restart level | `R` |
| Pause | `Esc` / `P` |
| Mute / CRT scanlines | `M` / `C` |
| Menus | arrows / `WASD` + `Enter`, or mouse |

Goal: **steal the artifact, then reach the exit.** Touching a guard restarts the level. Levels 2 and 3 unlock when the previous level is completed; progress and best ranks are stored in `localStorage`.

## How sound works

Every sound is `{origin, loudness, surface}`. Effective pulse radius (tiles) = `loudness × surface multiplier`.

| Source | Loudness | | Surface | Multiplier | Sound |
|---|---|---|---|---|---|
| Sneak step | 1.2 | | Carpet | ×0.5 | soft thud |
| Walk step | 3.5 | | Stone | ×1.0 | dry click |
| Run step | 8 | | Water | ×1.4 | splash |
| Pebble landing | 10 | | Metal | ×1.8 | loud, ringing |
| Bell | 26 (ignores floor) | | | | |

* **Propagation:** a flood-fill over the tile grid with line-of-sight shortcuts (`src/game/sound.ts`). Rings are round in open rooms and bend around corners. Sonar *stops* at walls (it lights them up); for **hearing**, a wall tile costs 3 extra tiles, so thin walls muffle and thick walls block.
* **Guards** (`src/game/guard.ts`): `Patrol → Suspicious → Hunting → Search → Patrol`.
  * A pebble, or one soft player sound, makes a guard **suspicious**: it walks to the origin.
  * The bell, any sound with radius ≥ 6 tiles (running, walking on metal), or two player sounds within 1 s make it **hunt** the last heard position.
  * Losing the target starts a **search** sweep around it, then it returns to patrol. Hunters ignore pebbles.
  * Guards take footsteps too. If you are inside a guard step's radius, its silhouette flickers into view; `?` / `!` marks a guard that just became suspicious / started hunting.
* **Standing still makes no sound.** Hide in a pocket and let patrols pass.
* **Scoring:** `noise = Σ sound weights` (sneak 0.5, walk 1, run 2, pebble 3, bell 10) plus 1 per 15 s. Lower is better; thresholds for **S / A / B / C** are per level. The results screen also shows sounds, pebbles used and time.

## Development

Requires Node 20.19+ (22 recommended).

```bash
npm install
npm run dev          # Vite dev server with hot reload
npm test             # unit tests (Vitest)
npm run typecheck
npm run build        # static web build -> dist/
npm run preview      # serve dist/ locally
```

### Web build

`npm run build` produces a fully static `dist/` (relative asset paths, no server code). Serve it from anywhere:

```bash
npx vite preview          # or: python3 -m http.server -d dist
```

Opening `dist/index.html` straight from `file://` does not work in browsers (they block module scripts there); use any static server. The Electron app avoids this with a custom `app://` protocol.

### macOS DMG

The desktop app is a thin Electron shell (`electron/main.cjs`) around the same `dist/`.

```bash
npm run electron     # build + run the desktop app locally (any OS)
npm run dist:mac     # on macOS: build + package -> release/Echo-Thief-<version>-<arch>.dmg
```

`dist:mac` produces both `arm64` and `x64` DMGs. They are **unsigned** (no Apple Developer account needed): on first launch, right-click the app → **Open**, or run `xattr -dr com.apple.quarantine "/Applications/Echo Thief.app"`.

### CI / CD (GitHub Actions)

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | PRs, pushes to non-`main` branches | typecheck, tests, build |
| `deploy.yml` | push to `main` | tests, build, deploy `dist/` to **GitHub Pages** |
| `release.yml` | tag `v*` (or manual run) | builds the DMGs on `macos-latest`, attaches them to the GitHub Release |

One-time setup: repo **Settings → Pages → Source: GitHub Actions**. To cut a release: `git tag v0.1.0 && git push origin v0.1.0`.

## Tech choices

* **TypeScript + Vite + plain Canvas 2D.** The look is a 320×180, 16-colour image. A software framebuffer of palette indices (flushed to one `ImageData`) gives exact control over palette, ordered-dither fades and stepped rings; a game framework would add weight without helping. The canvas is scaled with `image-rendering: pixelated` at an **integer** factor and letterboxed.
* **Palette:** 16 colours, defined once in `src/palette.ts`. Fading stays inside it: pixels walk a dim ramp and are dithered to black with a 4×4 Bayer matrix, so no in-between colours ever appear.
* **All art is generated in code** (tiles procedurally, sprites as inline character maps, a 3×5 bitmap font). **All audio is synthesized** with Web Audio (square/triangle voices + filtered noise). There are no asset files.
* **Electron over Tauri** for the DMG: no Rust toolchain, one small `main.cjs`, and `electron-builder` emits a DMG in a single command on a stock macOS runner. The trade-off is binary size.
* **Fixed 60 Hz timestep**; the simulation (`src/game/*`) has no DOM access, which is what makes it unit-testable and lets tests play the levels headlessly.

## Project layout

```
src/game/      grid, sound propagation, pathfinding, guard AI, level loader, world, scoring, save
src/render/    framebuffer (palette + dither), bitmap font, sprites, renderer
src/audio/     Web Audio synth
src/ui/        menu widget and screens
src/levels/    level JSON + index.ts
electron/      desktop shell        tests/   Vitest suites and the level-solving bot
scripts/       icon generator, level painter (authoring aid)
```

## Adding a level

1. Create `src/levels/04-my-level.json`:

```json
{
  "id": "04-my-level",
  "name": "MY LEVEL",
  "hint": ["SHOWN AT THE BOTTOM, ONE LINE EVERY 7 SECONDS"],
  "pebbles": 3,
  "ranks": { "S": 40, "A": 70, "B": 120 },
  "map": [
    "##########",
    "#S,,.==~A#",
    "#####.####",
    "#X.......#",
    "##########"
  ],
  "guards": [
    { "path": [[3, 3], [8, 3]], "mode": "pingpong", "pause": 1.5 },
    { "path": [[5, 1]] }
  ]
}
```

| Map char | Meaning |
|---|---|
| `#` (or space) | wall |
| `.` `,` `=` `~` | stone, carpet, metal, water |
| `S` `A` `X` | start, artifact, exit (exactly one each; they sit on stone) |

* Maps may be up to **40×21** tiles (they are centred, no scrolling). Coordinates are `[x, y]` tiles, 0-based.
* `guards[].path` is a list of waypoints; a single waypoint is a static guard. `mode` is `loop` (default) or `pingpong`; `pause` is seconds waited at each waypoint.
* `ranks` are the maximum noise scores for S, A and B; anything above is C. Sneak-only play scores about 0.5 per step, walking 1, running 2.

2. Register it in `src/levels/index.ts` (order = play order).
3. `npm test` checks that the map parses and that start → artifact → exit is connected. To prove it is *beatable*, add a scripted solution to `SOLUTIONS` in `tests/levels.test.ts` (see the existing ones: `go`, `throw`, `until`, ...).

`scripts/levelgen.py` is an optional helper that paints the shipped levels from rectangles.
