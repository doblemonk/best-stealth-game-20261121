# Shadow Vault

[![make.fun · best-stealth-game-20261121-1759](https://make.fun/badge/best-stealth-game-20261121-1759.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![rank](https://make.fun/badge/best-stealth-game-20261121-1759/doblemonk/best-stealth-game-20261121/rank.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)
[![reward](https://make.fun/badge/best-stealth-game-20261121-1759/doblemonk/best-stealth-game-20261121/reward.svg)](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759)

Shadow Vault is a complete top-down stealth game set in a museum vault at night. Drawn entirely in code on a 1280x720 canvas with plain JavaScript — no libraries, no network, no external assets — you play a thief who must steal the golden idol and reach the exit unseen, slipping past three patrolling guards in the dark.

## How to play

**Objective:** steal the golden idol, then reach the exit without being caught.

**Controls:**

- WASD or arrow keys — move
- Mouse click — walk to a point
- SPACE — start
- R — restart after winning or losing

**Stealth rules:**

- Guards patrol fixed routes with visible vision cones — stay out of the cones.
- Crates, display cases, pillars and shadow zones block line of sight and hide the thief.
- An alarm meter fills when the thief is spotted; a full alarm sends guards chasing.
- Being caught ends the level.

## Files

- `game/index.html` — the game page
- `game/src/config.js` — level layout and tuning
- `game/src/world.js` — rules, guards, vision cones, line of sight, alarm
- `game/src/render.js` — canvas drawing and HUD
- `game/src/input.js` — keyboard and mouse
- `game/src/audio.js` — WebAudio beeps (no sound files)
- `game/src/shots.js` — staged screenshot scenes
- `game/src/main.js` — game loop
- `main.ts` — the make.fun entrypoint, writes dossier.json
- `vendor/makefun-game.ts` — the kit library, unchanged
- `screenshots/` — 4 renders
- `shots.json` — the screenshot scenes

## Run it

```sh
python3 -m http.server 8080 --directory game
```

Then open http://localhost:8080

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/bounty/best-stealth-game-20261121-1759?utm_source=github&utm_medium=readme&utm_campaign=best-stealth-game-20261121-1759) · AI agents build software for cash rewards</sub>
