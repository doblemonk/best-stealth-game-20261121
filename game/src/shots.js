// Shadow Vault — deterministic staged screenshots.
//
// stageShot(name, world) plays the REAL game rules forward from a fresh
// world with a deterministic autopilot, so each staged frame is what a
// short real game looks like. No Math.random anywhere: the same shot
// always produces the same frame.
//
// Shots:
//   start — guards patrol behind the title screen.
//   hide  — the player slips behind cover and waits.
//   idol  — the player grabs the idol and stops just short of the exit.
//   win   — the player grabs the idol and walks out through the exit.
//   anything else behaves like 'start'.

import { STEP, LOOT, EXIT } from './config.js';
import {
  SCREEN_TITLE,
  SCREEN_PLAY,
  SCREEN_WON,
} from './render.js';

// Distance in pixels between two points.
function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

// Normalised step toward a target, or {0, 0} once within 10 px of it.
function moveToward(world, targetX, targetY) {
  const { x, y } = world.state.player;
  const dx = targetX - x;
  const dy = targetY - y;
  const dist = Math.hypot(dx, dy);
  if (dist < 10) return { dx: 0, dy: 0 };
  return { dx: dx / dist, dy: dy / dist };
}

// True while any guard is actively chasing the player.
function isChased(world) {
  return world.state.guards.some((guard) => guard.mode === 'chase');
}

// Direction away from the nearest chasing guard (normalised), so the
// autopilot outruns a chase instead of freezing in the open. The player
// (210 px/s) is faster than a chasing guard (168 px/s).
function fleeDirection(world) {
  const p = world.state.player;
  let best = null;
  let bestDist = Infinity;
  for (const guard of world.state.guards) {
    if (guard.mode !== 'chase') continue;
    const d = distance(p.x, p.y, guard.x, guard.y);
    if (d < bestDist) {
      bestDist = d;
      best = guard;
    }
  }
  if (!best || bestDist < 1) return { dx: 0, dy: 0 };
  return { dx: (p.x - best.x) / bestDist, dy: (p.y - best.y) / bestDist };
}

// Route up the left side, through the left door gap and the central door,
// to the idol. Straight lines through the museum would run into the
// divider walls, so the waypoints thread the door gaps.
const UP_ROUTE = [
  { x: 114, y: 560 },
  { x: 114, y: 460 },
  { x: 200, y: 400 },
  { x: 350, y: 380 },
  { x: 400, y: 320 },
  { x: 560, y: 300 },
  { x: 640, y: 280 },
  { x: 640, y: 210 },
  { x: LOOT.x, y: LOOT.y },
];

// Route back down the right side, through the right door gap, to the exit.
const DOWN_ROUTE = [
  { x: 640, y: 280 },
  { x: 1000, y: 300 },
  { x: 1150, y: 380 },
  { x: 1150, y: 460 },
  { x: 1150, y: 560 },
];

// Drive the autopilot through waypoints in order, one fixed STEP at a
// time, for at most maxSeconds. When the player reaches a waypoint
// (within 10 px) the next one becomes the target; once the last one is
// reached the player stands still. While any guard is chasing, the
// autopilot flees away from the nearest chaser until the chase ends.
// Stops early if the game is won or lost, or if stopEarly(world) returns
// true.
function runAutopilot(world, waypoints, maxSeconds, stopEarly) {
  let index = 0;
  const steps = Math.round(maxSeconds / STEP);
  for (let i = 0; i < steps; i++) {
    if (world.state.status === 'won' || world.state.status === 'lost') break;
    if (stopEarly && stopEarly(world)) break;

    let input = { dx: 0, dy: 0 };
    if (index < waypoints.length) {
      const target = waypoints[index];
      if (
        distance(world.state.player.x, world.state.player.y, target.x, target.y) < 10
      ) {
        // Reached this waypoint — advance to the next one.
        index += 1;
      } else if (isChased(world)) {
        input = fleeDirection(world);
      } else {
        input = moveToward(world, target.x, target.y);
      }
    }
    world.step(STEP, input);
  }
}

// How long the title-screen patrol runs, in seconds.
const START_SECONDS = 5;

// Step a fresh world forward with no input (guards patrol on their own).
function stepIdle(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    world.step(STEP, { dx: 0, dy: 0 });
  }
}

// Stage one named shot. Always starts from a fresh world.
export function stageShot(name, world) {
  world.reset();

  switch (name) {
    case 'start': {
      // Guards patrol for 5 s behind the title screen.
      stepIdle(world, START_SECONDS);
      return { screen: SCREEN_TITLE, best: 0 };
    }

    case 'hide': {
      world.state.status = 'play';
      // Slip up the left side and hide just north of the middle display
      // case, inside the middle shadow zone: the case blocks the middle
      // guard's line of sight from the south while its cone sweeps the hall.
      runAutopilot(
        world,
        [
          { x: 114, y: 560 },
          { x: 114, y: 460 },
          { x: 200, y: 400 },
          { x: 350, y: 380 },
          { x: 400, y: 320 },
          { x: 475, y: 310 },
        ],
        14,
      );
      return { screen: SCREEN_PLAY, best: 0 };
    }

    case 'idol': {
      world.state.status = 'play';
      // Up the left side to the idol, then back down the right side and
      // stop just short of the exit with the idol secured.
      const staging = { x: 1150, y: 580 };
      runAutopilot(
        world,
        [...UP_ROUTE, ...DOWN_ROUTE, staging],
        40,
        (staged) => {
          // Stop once the idol is taken and the player is staged
          // just short of the exit.
          if (!staged.state.lootTaken) return false;
          const { x, y } = staged.state.player;
          return distance(x, y, staging.x, staging.y) < 10;
        },
      );
      return { screen: SCREEN_PLAY, best: 0 };
    }

    case 'win': {
      world.state.status = 'play';
      // Up to the idol, then all the way down into the exit.
      runAutopilot(
        world,
        [...UP_ROUTE, ...DOWN_ROUTE, { x: EXIT.x + EXIT.w / 2, y: EXIT.y + EXIT.h / 2 }],
        60,
        (staged) => staged.state.status === 'won',
      );
      if (world.state.status === 'won') {
        return { screen: SCREEN_WON, best: world.state.time };
      }
      return { screen: SCREEN_PLAY, best: 0 };
    }

    default: {
      // Any other name behaves like 'start'.
      stepIdle(world, START_SECONDS);
      return { screen: SCREEN_TITLE, best: 0 };
    }
  }
}
