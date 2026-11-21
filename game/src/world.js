// world.js — Shadow Vault: simulation state and step logic.
//
// Plain ES module, no libraries, no network, no external assets and
// no randomness anywhere: the simulation is fully deterministic. A fixed
// timestep (STEP, 1/60s) drives every update, so the same inputs always
// produce the same run. No randomness is used anywhere in this file.
//
// Game flow: status starts at 'title' (guards patrol, nothing else moves).
// Gameplay runs in 'play': the player sneaks to the golden idol, grabs it,
// then reaches the exit. Being caught ends the run as 'lost'; reaching the
// exit with the idol ends it as 'won'. Once won or lost, step() is a no-op.

import { FIELD, STEP, PLAYER, GUARD, LOOT, EXIT, START, WALLS, COVER, SHADOWS, PATROLS } from './config.js';

// Step event flags, returned by world.step() as a bitmask.
export const EVENT_NONE = 0;
export const EVENT_CAUGHT = 1;
export const EVENT_WON = 2;
export const EVENT_LOOT = 4;
export const EVENT_SPOTTED = 8;

// ---------------------------------------------------------------------------
// Geometry helpers (pure functions, shared by the world methods below).
// ---------------------------------------------------------------------------

// True when the point (x, y) lies inside rect (edges count as inside).
export function pointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// True when the circle at (x, y) with radius r touches or overlaps rect.
// Finds the closest point on the rect to the circle centre and compares
// its distance with the radius.
export function circleHitsRect(x, y, r, rect) {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy <= r * r;
}

// Orientation of the ordered triplet (a, b, c): 0 = collinear,
// 1 = clockwise, 2 = counter-clockwise.
function orient(ax, ay, bx, by, cx, cy) {
  const value = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

// True when point b lies on segment a-c (collinear case only).
function onSegment(ax, ay, bx, by, cx, cy) {
  return bx >= Math.min(ax, cx) - 1e-9 && bx <= Math.max(ax, cx) + 1e-9 &&
    by >= Math.min(ay, cy) - 1e-9 && by <= Math.max(ay, cy) + 1e-9;
}

// True when the two line segments intersect (touching counts).
function segmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const o1 = orient(x1, y1, x2, y2, x3, y3);
  const o2 = orient(x1, y1, x2, y2, x4, y4);
  const o3 = orient(x3, y3, x4, y4, x1, y1);
  const o4 = orient(x3, y3, x4, y4, x2, y2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(x1, y1, x3, y3, x2, y2)) return true;
  if (o2 === 0 && onSegment(x1, y1, x4, y4, x2, y2)) return true;
  if (o3 === 0 && onSegment(x3, y3, x1, y1, x4, y4)) return true;
  if (o4 === 0 && onSegment(x3, y3, x2, y2, x4, y4)) return true;
  return false;
}

// True when the segment from (x1, y1) to (x2, y2) touches rect, including
// when either endpoint sits inside it.
function segmentHitsRect(x1, y1, x2, y2, rect) {
  if (pointInRect(x1, y1, rect) || pointInRect(x2, y2, rect)) return true;
  const { x, y, w, h } = rect;
  return segmentsIntersect(x1, y1, x2, y2, x, y, x + w, y) ||
    segmentsIntersect(x1, y1, x2, y2, x + w, y, x + w, y + h) ||
    segmentsIntersect(x1, y1, x2, y2, x + w, y + h, x, y + h) ||
    segmentsIntersect(x1, y1, x2, y2, x, y + h, x, y);
}

// True when the point (x, y) lies inside any shadow zone.
function pointInShadows(x, y) {
  for (const shadow of SHADOWS) {
    if (pointInRect(x, y, shadow)) return true;
  }
  return false;
}

// True when the circle at (x, y) hits any wall or cover rect.
function circleHitsSolid(x, y, r) {
  for (const rect of WALLS) {
    if (circleHitsRect(x, y, r, rect)) return true;
  }
  for (const rect of COVER) {
    if (circleHitsRect(x, y, r, rect)) return true;
  }
  return false;
}

// Wrap an angle difference into the range [-PI, PI].
function wrapAngle(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

// ---------------------------------------------------------------------------
// Vision and line of sight.
// ---------------------------------------------------------------------------

// True when the segment from (x1, y1) to (x2, y2) crosses no wall or
// cover rect — i.e. there is a clear line of sight between the points.
function losClearImpl(x1, y1, x2, y2) {
  for (const rect of WALLS) {
    if (segmentHitsRect(x1, y1, x2, y2, rect)) return false;
  }
  for (const rect of COVER) {
    if (segmentHitsRect(x1, y1, x2, y2, rect)) return false;
  }
  return true;
}

// True when the guard can see the point (x, y): it must be within view
// distance, inside the guard's view cone, and in clear line of sight.
// A point hiding in a shadow zone is only visible at close range.
function canSeeImpl(guard, x, y) {
  const dx = x - guard.x;
  const dy = y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > GUARD.viewDist) return false;
  const angleToPoint = Math.atan2(dy, dx);
  if (Math.abs(wrapAngle(angleToPoint - guard.angle)) > GUARD.viewHalfAngle) return false;
  if (!losClearImpl(guard.x, guard.y, x, y)) return false;
  if (pointInShadows(x, y) && dist > GUARD.viewDist * 0.55) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Guard movement.
// ---------------------------------------------------------------------------

// Move a patrolling guard along its patrol waypoints for dt seconds.
// patrolIndex is the waypoint the guard is heading for; patrolDir (+1 / -1)
// reverses at the ends so the guard ping-pongs along the loop. The guard
// faces its direction of travel. A step long enough to pass a waypoint
// keeps going toward the next one.
function movePatrol(guard, patrol, dt) {
  let remaining = GUARD.speed * dt;
  while (remaining > 1e-9) {
    const target = patrol.points[guard.patrolIndex];
    const dx = target[0] - guard.x;
    const dy = target[1] - guard.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= remaining) {
      if (dist > 1e-9) guard.angle = Math.atan2(dy, dx);
      guard.x = target[0];
      guard.y = target[1];
      remaining -= dist;
      // Advance to the next waypoint, reversing at either end.
      guard.patrolIndex += guard.patrolDir;
      if (guard.patrolIndex >= patrol.points.length) {
        guard.patrolIndex = patrol.points.length - 2;
        guard.patrolDir = -1;
      } else if (guard.patrolIndex < 0) {
        guard.patrolIndex = 1;
        guard.patrolDir = 1;
      }
    } else {
      guard.angle = Math.atan2(dy, dx);
      guard.x += (dx / dist) * remaining;
      guard.y += (dy / dist) * remaining;
      remaining = 0;
    }
  }
}

// Move a chasing guard toward the player for dt seconds, facing the player.
// The guard stops on the player rather than overshooting past them.
function moveChase(guard, player, dt) {
  const dx = player.x - guard.x;
  const dy = player.y - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-9) return;
  guard.angle = Math.atan2(dy, dx);
  const step = Math.min(GUARD.chaseSpeed * dt, dist);
  guard.x += (dx / dist) * step;
  guard.y += (dy / dist) * step;
}

// ---------------------------------------------------------------------------
// World construction.
// ---------------------------------------------------------------------------

// Build a fresh state object: player at START, guards at their patrol
// starts facing the second waypoint, idol untouched, alarm quiet.
function buildInitialState() {
  return {
    player: { x: START.x, y: START.y, moving: false },
    guards: PATROLS.map((patrol) => {
      const [sx, sy] = patrol.points[0];
      const [tx, ty] = patrol.points[1];
      return {
        x: sx,
        y: sy,
        angle: Math.atan2(ty - sy, tx - sx),
        patrolIndex: 1,
        patrolDir: 1,
        suspicion: 0,
        mode: 'patrol',
        loseSightTimer: 0,
      };
    }),
    lootTaken: false,
    alarm: 0,
    status: 'title',
    time: 0,
  };
}

export function createWorld() {
  const world = {
    state: buildInitialState(),

    // Reset to a fresh state (same as a newly created world).
    reset() {
      world.state = buildInitialState();
    },

    // True when the segment crosses no wall or cover rect.
    losClear(x1, y1, x2, y2) {
      return losClearImpl(x1, y1, x2, y2);
    },

    // True when the guard can see the point (x, y).
    canSee(guard, x, y) {
      return canSeeImpl(guard, x, y);
    },

    pointInRect,
    circleHitsRect,

    // Advance the simulation by dt seconds with the given player input
    // ({ dx, dy }, each in -1..1). Returns an event bitmask (OR of the
    // EVENT_* flags). The fixed timestep is STEP (1/60s).
    step(dt, input) {
      const state = world.state;

      // Game over: nothing moves or changes any more.
      if (state.status === 'won' || state.status === 'lost') return EVENT_NONE;

      // Title screen: guards patrol, no detection, no player movement.
      if (state.status === 'title') {
        state.player.moving = false;
        state.guards.forEach((guard, i) => movePatrol(guard, PATROLS[i], dt));
        return EVENT_NONE;
      }

      // --- status 'play' from here on. ---
      state.time += dt;
      let events = EVENT_NONE;

      // Player movement: x first, then y. An axis that would hit a wall
      // or cover rect is reverted, so the player slides along obstacles.
      const ix = input && typeof input.dx === 'number' ? input.dx : 0;
      const iy = input && typeof input.dy === 'number' ? input.dy : 0;
      state.player.moving = ix !== 0 || iy !== 0;
      const nextX = state.player.x + ix * PLAYER.speed * dt;
      if (!circleHitsSolid(nextX, state.player.y, PLAYER.radius)) state.player.x = nextX;
      const nextY = state.player.y + iy * PLAYER.speed * dt;
      if (!circleHitsSolid(state.player.x, nextY, PLAYER.radius)) state.player.y = nextY;
      // Stay inside the field (the outer walls already block this, but
      // the clamp keeps the player in bounds no matter what).
      state.player.x = Math.max(PLAYER.radius, Math.min(state.player.x, FIELD.width - PLAYER.radius));
      state.player.y = Math.max(PLAYER.radius, Math.min(state.player.y, FIELD.height - PLAYER.radius));

      // Grab the idol by touching it.
      if (!state.lootTaken) {
        const lootDist = Math.hypot(state.player.x - LOOT.x, state.player.y - LOOT.y);
        if (lootDist < PLAYER.radius + LOOT.radius) {
          state.lootTaken = true;
          events |= EVENT_LOOT;
        }
      }

      // With the idol, stepping into the exit zone wins the game.
      if (state.lootTaken && pointInRect(state.player.x, state.player.y, EXIT)) {
        state.status = 'won';
        events |= EVENT_WON;
        return events;
      }

      // Guards: spot, suspect, chase, give up.
      for (let i = 0; i < state.guards.length; i++) {
        const guard = state.guards[i];
        const seen = canSeeImpl(guard, state.player.x, state.player.y);
        const previousSuspicion = guard.suspicion;
        if (seen) {
          guard.suspicion = Math.min(100, guard.suspicion + GUARD.suspicionRate * dt);
          // The first frame suspicion rises from zero is a spotting.
          if (previousSuspicion === 0 && guard.suspicion > 0) events |= EVENT_SPOTTED;
          guard.loseSightTimer = 0;
          if (guard.suspicion >= 100) guard.mode = 'chase';
        } else {
          guard.suspicion = Math.max(0, guard.suspicion - GUARD.decayRate * dt);
          if (guard.mode === 'chase') {
            guard.loseSightTimer += dt;
            if (guard.loseSightTimer >= GUARD.chaseGiveUpSeconds) {
              guard.mode = 'patrol';
              guard.suspicion = 0;
              guard.loseSightTimer = 0;
            }
          }
        }
        if (guard.mode === 'chase') moveChase(guard, state.player, dt);
        else movePatrol(guard, PATROLS[i], dt);
      }

      // The alarm shows the most suspicious guard (0..100).
      state.alarm = 0;
      for (const guard of state.guards) {
        if (guard.suspicion > state.alarm) state.alarm = guard.suspicion;
      }

      // Caught: any guard within catch distance ends the run.
      for (const guard of state.guards) {
        const catchDist = Math.hypot(guard.x - state.player.x, guard.y - state.player.y);
        if (catchDist <= GUARD.catchDist) {
          state.status = 'lost';
          events |= EVENT_CAUGHT;
          break;
        }
      }

      return events;
    },
  };

  return world;
}
