# Echo Thief — Plan

A top-down stealth puzzle where the screen is black and you only "see" what your own noise lights up. Guards are blind too and hunt purely by sound.

## Stack (and why)

| Need | Choice | Reason |
|---|---|---|
| Language / bundler | TypeScript + Vite | Fast dev server, static output that drops straight onto GitHub Pages, first-class Vitest integration. |
| Rendering | Plain Canvas 2D, software framebuffer | The look is a 320x180, 16-colour, dithered-fade image. A `Uint8Array` of palette indices flushed to an `ImageData` gives exact control over palette, ordered-dither fades and stepped rings; a framework would add nothing. The `<canvas>` is scaled with CSS `image-rendering: pixelated` at an integer factor and letterboxed. |
| Audio | Web Audio API, all synthesized | Square/triangle oscillators and filtered noise; no audio files. |
| Desktop / DMG | **Electron + electron-builder** | Tauri needs a Rust toolchain plus icon/bundle plumbing; Electron is one small `main.cjs`, `electron-builder` emits a DMG in a single command on a `macos-latest` runner, and it loads the exact same `dist/` as the web build. Bigger binary, but the least fragile path. Builds are unsigned (documented in README). |
| Tests | Vitest | Same config as Vite; core simulation is DOM-free so it runs in plain Node. |

## Architecture

```
src/
  config.ts            constants (resolution, tile size, fade time, speeds)
  palette.ts           the one 16-colour palette (+ dim ramp)
  game/                DOM-free simulation (unit-testable)
    grid.ts            tile/surface enums, Grid
    sound.ts           sound model + propagation (Theta*-style Dijkstra flood-fill)
    pathfind.ts        A* on the tile grid (guards)
    guard.ts           guard AI state machine
    level.ts           JSON level -> Level (validation)
    world.ts           one level's runtime: player, tools, pulses, guards, events
    scoring.ts         noise score + S/A/B/C rank
    save.ts            localStorage progress
  render/              framebuffer (dither, palette), bitmap font, sprites, renderer
  audio/               Web Audio synth engine
  ui/                  menu widget + screens (title, select, pause, results)
  levels/              *.json level data + index
  app.ts / main.ts     scene flow, fixed-timestep loop, input
electron/main.cjs      desktop shell
tests/                 sound propagation, guard transitions, level loader, level playthrough bots
```

**Sound model.** Every sound is `{origin, loudness, surface}`; `radius = loudness x surfaceMultiplier` (tiles). One flood-fill from the origin gives a per-tile distance map. Two modes: *reveal* (walls are terminal - sonar hits them and stops) and *hearing* (walls attenuate: entering a wall tile costs extra distance, so thin walls muffle and thick walls block). Pulses reveal tiles as the expanding front passes their distance, so rings wrap around corners.

**Guards.** `patrol -> suspicious -> hunting -> search -> patrol`. Pebbles make them suspicious; bell or loud (large-radius) player sounds, or two player sounds in quick succession, make them hunt the last heard position.

**Fade.** Revealed pixels use true palette colours; brightness decay is a palette-only dim ramp plus a 4x4 Bayer dither, so nothing outside the 16 colours ever appears.

## Milestones

1. **(a)** Scaffold, palette, framebuffer, sprites, level loader, sound propagation, pulse-reveal renderer.
2. **(b)** Player movement, surfaces, footstep sound emission.
3. **(c)** Guards, pathfinding, AI state machine, tests.
4. **(d)** Pebble, bell, scoring, save data, UI screens and flow.
5. **(e)** The three levels, verified completable by headless bot tests.
6. **(f)** Web Audio synthesis.
7. **(g)** GitHub Actions (CI, Pages deploy, tagged DMG release), Electron shell, README.
8. Final verification pass (static-server run in a real browser, all levels).
