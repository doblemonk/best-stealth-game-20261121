// input.js — keyboard + mouse input for Shadow Vault.
//
// createInput(canvas) attaches listeners immediately and returns { poll() }.
// poll() returns { dx, dy, pressed, target }:
//   dx/dy   -1..1 movement vector (keys, or click-to-move direction)
//   pressed true only in the frame a start/restart action happened
//   target  the click-to-move destination { x, y } in canvas pixels, or null
//
// The game loop owns the player position, so poll() accepts it as an
// optional argument — poll(playerPos) — to steer toward the click target
// and to clear the target within 8 px. Called with no argument, poll()
// still reports the raw target so the caller can steer/clear it itself.

export function createInput(canvas) {
  // Keys currently held down, keyed by e.code (e.g. 'KeyW', 'ArrowUp').
  const keys = new Set();

  // Click-to-move destination in canvas pixels, or null.
  let target = null;

  // Set on Space/Enter keydown or canvas mousedown; consumed by poll().
  let pressedFlag = false;

  // Movement keys, by e.code. Any of these clears the click target.
  const MOVE_CODES = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  ]);

  function isMoveCode(code) {
    return MOVE_CODES.has(code);
  }

  function onKeyDown(e) {
    // Space / arrows scroll the page — stop that.
    if (e.code === 'Space' || e.code.startsWith('Arrow')) {
      e.preventDefault();
    }
    // Ignore repeats: holding Space must not re-trigger start/restart.
    if (e.repeat) return;
    if (isMoveCode(e.code)) {
      keys.add(e.code);
      target = null; // A movement key always wins over click-to-move.
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      pressedFlag = true;
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function onMouseDown(e) {
    // A click is also a start/restart action (e.g. "click to start").
    pressedFlag = true;
    // Convert client coords to canvas coords, honouring CSS scaling.
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    target = {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  // Keys on window (the canvas may not have focus); mouse on the canvas.
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('contextmenu', onContextMenu);

  // Movement vector from the held keys, normalised so diagonals are
  // no faster than straight movement.
  function keyVector() {
    let dx = 0;
    let dy = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) dy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) dy += 1;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    return { dx, dy };
  }

  function poll(playerPos) {
    // Consume the press flag: true for exactly one poll() after the event.
    const pressed = pressedFlag;
    pressedFlag = false;

    const { dx, dy } = keyVector();
    if (dx !== 0 || dy !== 0) {
      return { dx, dy, pressed, target: null };
    }

    // No movement key held: steer toward the click target, if any.
    if (target && playerPos) {
      const tx = target.x - playerPos.x;
      const ty = target.y - playerPos.y;
      const dist = Math.hypot(tx, ty);
      if (dist <= 8) {
        target = null; // Arrived — stop here.
        return { dx: 0, dy: 0, pressed, target: null };
      }
      return { dx: tx / dist, dy: ty / dist, pressed, target: { ...target } };
    }

    // No keys and either no target or no player position to steer from:
    // report the raw target so the caller can steer/clear it itself.
    return { dx: 0, dy: 0, pressed, target: target ? { ...target } : null };
  }

  return { poll };
}
