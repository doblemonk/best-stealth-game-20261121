// Shadow Vault — game entrypoint.
//
// Runs on import. Two modes:
//   * ?shot=<name> — stage one deterministic frame (see shots.js) and draw
//     it once, with no game loop. Used for screenshots.
//   * No query — run the real game: fixed-step simulation, input, audio,
//     and a requestAnimationFrame render loop.
//
// Plain ES modules, no libraries, no network, no external assets.

import { FIELD, STEP } from './config.js';
import {
  createWorld,
  EVENT_CAUGHT,
  EVENT_WON,
  EVENT_LOOT,
  EVENT_SPOTTED,
} from './world.js';
import { draw } from './render.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

// Canvas setup: the playfield is 1280x720 (see FIELD in config.js).
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = FIELD.width;
canvas.height = FIELD.height;

// Screenshot mode: stage the requested shot, draw exactly one frame,
// and stop — no loop, no input, no audio.
const shot = new URLSearchParams(location.search).get('shot');

if (shot) {
  const world = createWorld();
  const { screen } = stageShot(shot, world);
  draw(ctx, world, screen, world.state.time);
} else {
  runGame();
}

// Real game: fixed-step simulation driven by requestAnimationFrame.
function runGame() {
  const world = createWorld();
  const input = createInput(canvas);
  const audio = createAudio();

  // Fixed-step accumulator (seconds of simulated time waiting to run).
  let last = performance.now();
  let accumulator = 0;
  // Time of the last footstep sound, in seconds (performance.now() clock).
  let lastFootstep = 0;

  function frame(now) {
    // Frame delta, clamped so a tab switch can't spiral the simulation.
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const nowSeconds = now / 1000;

    const { dx, dy, pressed, target } = input.poll(world.state.player);
    if (pressed) audio.ensure();

    // Title screen: any press starts the game.
    if (world.state.status === 'title' && pressed) {
      world.state.status = 'play';
    } else if (
      (world.state.status === 'won' || world.state.status === 'lost') &&
      pressed
    ) {
      // End screen: any press restarts from a fresh world.
      world.reset();
      accumulator = 0;
      world.state.status = 'play';
    }

    // Advance the simulation in fixed STEP slices while playing. The
    // loop condition re-checks status, so a win/loss mid-frame stops
    // stepping immediately.
    if (world.state.status === 'play') {
      accumulator += dt;
      while (accumulator >= STEP && world.state.status === 'play') {
        accumulator -= STEP;
        const events = world.step(STEP, { dx, dy });
        if (events & EVENT_SPOTTED) audio.spotted();
        if (events & EVENT_LOOT) audio.loot();
        if (events & EVENT_WON) audio.win();
        if (events & EVENT_CAUGHT) audio.lose();
      }
    }

    // Footsteps: one soft step while moving, at most every 0.35 s.
    if ((dx !== 0 || dy !== 0) && nowSeconds - lastFootstep >= 0.35) {
      audio.footstep();
      lastFootstep = nowSeconds;
    }

    // Clear a click-to-move target once the player has arrived at it.
    if (target) {
      const toTargetX = target.x - world.state.player.x;
      const toTargetY = target.y - world.state.player.y;
      if (
        Math.hypot(toTargetX, toTargetY) < 8 &&
        typeof input.clearTarget === 'function'
      ) {
        input.clearTarget();
      }
    }

    // Render the current state. The clock is seconds, matching the
    // timestamps the renderer's animations are built on.
    draw(ctx, world, world.state.status, nowSeconds);

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
