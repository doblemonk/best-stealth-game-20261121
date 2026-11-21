// config.js — Shadow Vault: static level configuration.
// Top-down stealth museum. Start bottom-left, sneak up the left corridor,
// cross the middle hall, steal the golden idol (top-centre), then slip
// down the right side to the exit (bottom-right). Fully deterministic:
// no randomness anywhere in this file.

export const FIELD = { width: 1280, height: 720 };

export const STEP = 1 / 60;

export const PLAYER = { radius: 14, speed: 210 };

export const GUARD = {
  radius: 15,
  speed: 95,
  chaseSpeed: 168,
  viewDist: 235,
  viewHalfAngle: 0.62,
  suspicionRate: 60,
  decayRate: 24,
  chaseGiveUpSeconds: 2.5,
  catchDist: 30,
};

// The golden idol, top-centre of the museum.
export const LOOT = { x: 640, y: 148, radius: 16 };

// Exit zone, bottom-right corner (inside the outer border).
export const EXIT = { x: 1184, y: 632, w: 72, h: 64 };

// Player start, bottom-left corner.
export const START = { x: 84, y: 648 };

// Walls: outer border (thickness 24) plus interior walls splitting the
// museum into three rooms — top gallery, middle hall, bottom corridor.
// Top divider leaves a central door (x 584-704) under the idol; the
// bottom divider leaves a left door (x 24-204) and a right door
// (x 1060-1256), so the left-up / right-down route stays open.
export const WALLS = [
  { x: 0, y: 0, w: 1280, h: 24 }, // outer border, top
  { x: 0, y: 696, w: 1280, h: 24 }, // outer border, bottom
  { x: 0, y: 0, w: 24, h: 720 }, // outer border, left
  { x: 1256, y: 0, w: 24, h: 720 }, // outer border, right
  { x: 24, y: 232, w: 560, h: 20 }, // top divider, left of door
  { x: 704, y: 232, w: 552, h: 20 }, // top divider, right of door
  { x: 204, y: 472, w: 856, h: 20 }, // bottom divider, middle segment
  { x: 380, y: 24, w: 20, h: 108 }, // stub shaping the top gallery
  { x: 880, y: 492, w: 20, h: 120 }, // stub shaping the bottom corridor
];

// Cover: crates, display cases and pillars to hide behind. Two pieces sit
// near the idol, three in the middle hall, the rest guard the corners.
// All are kept clear of START, LOOT and EXIT.
export const COVER = [
  { x: 180, y: 90, w: 60, h: 60 }, // pillar, top-left
  { x: 1000, y: 90, w: 60, h: 60 }, // pillar, top-right
  { x: 540, y: 90, w: 70, h: 36 }, // display case, left of the idol
  { x: 730, y: 90, w: 70, h: 36 }, // display case, right of the idol
  { x: 180, y: 300, w: 90, h: 50 }, // crate, middle-left
  { x: 420, y: 340, w: 110, h: 56 }, // display case, middle hall
  { x: 760, y: 320, w: 90, h: 50 }, // crate, middle-right
  { x: 1000, y: 560, w: 90, h: 50 }, // crate, bottom-right
];

// Shadow zones: darkness that shrinks a guard's view distance. Each one
// overlaps some cover, so the player can hide in the dark behind it.
export const SHADOWS = [
  { x: 24, y: 492, w: 180, h: 204 }, // left corridor, bottom stretch
  { x: 300, y: 300, w: 280, h: 120 }, // middle hall, centre
  { x: 700, y: 280, w: 260, h: 120 }, // middle hall, right side
];

// Guard patrols, one per room. Each guard loops its waypoints ping-pong
// (direction reverses at the ends). Waypoints stay on open floor.
export const PATROLS = [
  // Top gallery guard, circling the idol room.
  { points: [[320, 140], [640, 190], [960, 140], [1080, 180], [480, 180]] },
  // Middle hall guard, sweeping the hall.
  { points: [[180, 380], [520, 430], [900, 380], [1100, 430]] },
  // Bottom corridor guard, walking the ground floor.
  { points: [[320, 620], [640, 650], [1000, 650], [1100, 620]] },
];
