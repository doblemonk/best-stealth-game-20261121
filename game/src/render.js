// render.js — Shadow Vault renderer (1280x720, canvas 2D only).
// Plain ES module, no libraries, no network, no external assets, no Math.random.
// Draw order: floor -> shadows -> exit -> idol -> vision cones -> walls/cover
// -> guards -> player -> HUD -> screen overlay. Cones are drawn before
// walls/cover so a cone looks blocked by a wall, crate, case or pillar.
// world.state = { player:{x,y,moving}, guards:[{x,y,angle,patrolIndex,
// patrolDir,suspicion,mode,loseSightTimer}], lootTaken, alarm, status, time }
// guard.mode is 'patrol'|'chase'; guard.angle is facing in radians.
import { FIELD, PLAYER, GUARD, LOOT, EXIT, START, WALLS, COVER, SHADOWS } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WON = 'won';
export const SCREEN_LOST = 'lost';

const CANVAS_W = 1280, CANVAS_H = 720, HUD_H = 44, TILE = 40;
// Palette.
const FLOOR_A = '#1b1d24', FLOOR_B = '#23262f', CARPET = '#5a1f24';
const CARPET_EDGE = '#7a2b31', CARPET_GOLD = '#8a6d2b';
const SHADOW_FILL = 'rgba(20,40,90,0.45)';
const EXIT_GREEN = '#2fbf5a', GOLD = '#f5c542', GOLD_DARK = '#b8860b';
const WALL_FILL = '#3a3d47', WALL_TOP = '#5a5e6b', WALL_EDGE = '#14151a';
const CRATE_FILL = '#6b4a2b', CRATE_EDGE = '#3d2a17', CRATE_PLANK = '#8a6238';
const CASE_FILL = '#2c3542', CASE_GLASS = 'rgba(180,220,255,0.28)';
const CASE_GLINT = 'rgba(255,255,255,0.75)';
const PILLAR_FILL = '#2e3038', PILLAR_TOP = '#4a4d59';
const GUARD_FILL = '#8c1d2f', GUARD_EDGE = '#4d0f1a';
const PLAYER_FILL = '#14b8a6', PLAYER_HOOD = '#0b6b60';
const HUD_BG = 'rgba(10,10,14,0.92)', HUD_TEXT = '#e8e6df', HUD_MUTED = '#9a978c';
const VEIL = 'rgba(5,5,10,0.72)';

// --- Small helpers ---------------------------------------------------------
function fieldW() { return (FIELD && (FIELD.w || FIELD.width)) || CANVAS_W; }
function fieldH() { return (FIELD && (FIELD.h || FIELD.height)) || CANVAS_H; }
// Rect centre, tolerant of {w,h} or {width,height}.
function rectOf(r) {
  const w = r.w !== undefined ? r.w : r.width;
  const h = r.h !== undefined ? r.h : r.height;
  return { x: r.x, y: r.y, w, h, cx: r.x + w / 2, cy: r.y + h / 2 };
}
function kindOf(e) { return (e.type || e.kind || e.shape || '').toLowerCase(); }
function formatTime(s) { // seconds -> "M:SS"
  const t = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(t / 60), sec = t % 60;
  return m + ':' + (sec < 10 ? '0' + sec : '' + sec);
}
function centerText(ctx, text, x, y, font, color) {
  ctx.font = font; ctx.fillStyle = color;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
}
function leftText(ctx, text, x, y, font, color) {
  ctx.font = font; ctx.fillStyle = color;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
}

// --- (1) Floor: dark stone checker + deep-red carpet runner ---------------
function drawFloor(ctx) {
  const w = fieldW(), h = fieldH();
  for (let ty = 0; ty < h / TILE; ty++) {
    for (let tx = 0; tx < w / TILE; tx++) {
      ctx.fillStyle = (tx + ty) % 2 === 0 ? FLOOR_A : FLOOR_B;
      ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1;
      ctx.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, TILE, TILE);
    }
  }
  // Carpet runner down the middle hall, from under the HUD to the bottom.
  const cx = w / 2 - 70, cw = 140, cy = HUD_H, ch = h - HUD_H;
  ctx.fillStyle = CARPET; ctx.fillRect(cx, cy, cw, ch);
  ctx.fillStyle = CARPET_EDGE; // border stripes
  ctx.fillRect(cx, cy, 6, ch); ctx.fillRect(cx + cw - 6, cy, 6, ch);
  ctx.fillStyle = CARPET_GOLD; // centre stripe
  ctx.fillRect(cx + cw / 2 - 2, cy, 4, ch);
  for (let fx = cx + 8; fx < cx + cw - 8; fx += 16) ctx.fillRect(fx, cy + ch - 10, 8, 10);
}

// --- (2) Shadows: translucent dark-blue overlays, soft edge ---------------
function drawShadows(ctx) {
  for (const s of SHADOWS || []) {
    const r = rectOf(s);
    // Larger faint halo first, then the main body: a soft, not hard, edge.
    ctx.fillStyle = 'rgba(20,40,90,0.18)';
    ctx.fillRect(r.x - 8, r.y - 8, r.w + 16, r.h + 16);
    ctx.fillStyle = SHADOW_FILL; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = 'rgba(90,130,200,0.18)'; ctx.fillRect(r.x, r.y, r.w, 3);
  }
}

// --- (3) Exit: glowing green doorway, EXIT painted on the floor -----------
function drawExit(ctx, time) {
  const r = rectOf(EXIT);
  const pulse = 0.28 + 0.10 * Math.sin(time * 2.4); // gentle breathing glow
  ctx.fillStyle = 'rgba(47,191,90,' + pulse.toFixed(3) + ')';
  ctx.fillRect(r.x - 14, r.y - 14, r.w + 28, r.h + 28);
  ctx.fillStyle = '#12351d'; ctx.fillRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
  ctx.fillStyle = EXIT_GREEN; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#0f5c2a'; ctx.lineWidth = 3; // door split line
  ctx.beginPath(); ctx.moveTo(r.cx, r.y); ctx.lineTo(r.cx, r.y + r.h); ctx.stroke();
  ctx.fillStyle = '#eafff0'; // two handle dots
  ctx.beginPath(); ctx.arc(r.cx - 8, r.cy, 3, 0, Math.PI * 2);
  ctx.arc(r.cx + 8, r.cy, 3, 0, Math.PI * 2); ctx.fill();
  // EXIT painted on the floor in front of the door (side with more room).
  const labelY = r.y < fieldH() / 2 ? r.y + r.h + 26 : r.y - 26;
  ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText('EXIT', r.cx, labelY);
  ctx.fillStyle = EXIT_GREEN; ctx.fillText('EXIT', r.cx, labelY);
}

// --- (4) Golden idol: glowing gold diamond on a small pedestal ------------
function drawLoot(ctx, time) {
  const lx = LOOT.x, ly = LOOT.y, lr = LOOT.r || LOOT.radius || 14;
  const glow = 0.25 + 0.12 * Math.sin(time * 2.0);
  ctx.fillStyle = 'rgba(245,197,66,' + glow.toFixed(3) + ')';
  ctx.beginPath(); ctx.arc(lx, ly, lr + 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = WALL_FILL; ctx.fillRect(lx - 18, ly + 8, 36, 12); // pedestal
  ctx.fillStyle = WALL_TOP; ctx.fillRect(lx - 18, ly + 8, 36, 4);
  ctx.fillStyle = GOLD; // diamond
  ctx.beginPath(); ctx.moveTo(lx, ly - lr); ctx.lineTo(lx + lr * 0.72, ly);
  ctx.lineTo(lx, ly + lr); ctx.lineTo(lx - lr * 0.72, ly); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = GOLD_DARK; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.65)'; // facet highlight
  ctx.beginPath(); ctx.moveTo(lx, ly - lr + 3); ctx.lineTo(lx, ly + lr - 3); ctx.stroke();
  ctx.fillStyle = '#ffffff'; // sparkle dot
  ctx.beginPath(); ctx.arc(lx - 3, ly - 5, 2, 0, Math.PI * 2); ctx.fill();
}

// --- (5) Vision cone: wedge coloured by alertness --------------------------
function drawVisionCone(ctx, guard) {
  const half = GUARD.viewHalfAngle, dist = GUARD.viewDist;
  const suspicion = guard.suspicion || 0;
  let fill;
  if (guard.mode === 'chase') fill = 'rgba(255,60,50,0.30)'; // red: chasing
  else if (suspicion > 0) fill = 'rgba(255,150,40,0.28)'; // orange: suspicious
  else fill = 'rgba(255,230,80,0.20)'; // yellow: calm patrol
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.moveTo(guard.x, guard.y);
  ctx.arc(guard.x, guard.y, dist, guard.angle - half, guard.angle + half);
  ctx.closePath(); ctx.fill();
  // Stronger edge along both cone sides so the boundary reads clearly.
  ctx.strokeStyle = fill.replace(/0\.\d+\)$/, '0.55)'); ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(guard.x, guard.y);
  ctx.lineTo(guard.x + Math.cos(guard.angle - half) * dist, guard.y + Math.sin(guard.angle - half) * dist);
  ctx.moveTo(guard.x, guard.y);
  ctx.lineTo(guard.x + Math.cos(guard.angle + half) * dist, guard.y + Math.sin(guard.angle + half) * dist);
  ctx.stroke();
}

// --- (6) Walls and cover, drawn AFTER cones so they block the view ---------
function drawWall(ctx, wall) {
  const r = rectOf(wall);
  ctx.fillStyle = WALL_FILL; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = WALL_TOP; ctx.fillRect(r.x, r.y, r.w, 6); // lighter top edge
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
}
function drawCrate(ctx, c) { // brown box with cross planks
  const r = rectOf(c);
  ctx.fillStyle = CRATE_FILL; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = CRATE_EDGE; ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.strokeStyle = CRATE_PLANK; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(r.x + 4, r.y + 4); ctx.lineTo(r.x + r.w - 4, r.y + r.h - 4);
  ctx.moveTo(r.x + r.w - 4, r.y + 4); ctx.lineTo(r.x + 4, r.y + r.h - 4);
  ctx.stroke();
}
function drawCase(ctx, c) { // glass-topped display case with a glint
  const r = rectOf(c);
  ctx.fillStyle = CASE_FILL; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = '#10141c'; ctx.lineWidth = 2;
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  ctx.fillStyle = CASE_GLASS; ctx.fillRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10);
  ctx.strokeStyle = CASE_GLINT; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(r.x + r.w * 0.25, r.y + r.h * 0.65);
  ctx.lineTo(r.x + r.w * 0.45, r.y + r.h * 0.30); ctx.stroke();
}
function drawPillar(ctx, c) { // dark stone circle
  const r = rectOf(c);
  const pr = c.r || c.radius || Math.min(r.w, r.h) / 2;
  const cx = (c.r || c.radius) ? c.x : r.cx, cy = (c.r || c.radius) ? c.y : r.cy;
  ctx.fillStyle = PILLAR_FILL;
  ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PILLAR_TOP; // lighter top disc
  ctx.beginPath(); ctx.arc(cx, cy, pr * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = WALL_EDGE; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, pr, 0, Math.PI * 2); ctx.stroke();
}
function drawWallsAndCover(ctx) {
  for (const wall of WALLS || []) drawWall(ctx, wall);
  for (const entry of COVER || []) {
    const kind = kindOf(entry);
    if (kind === 'pillar' || kind === 'column') drawPillar(ctx, entry);
    else if (kind === 'case' || kind === 'display' || kind === 'glass') drawCase(ctx, entry);
    else drawCrate(ctx, entry); // default cover shape is a crate
  }
}

// --- (7) Guards: dark-red circle, facing tick, suspicion arc ---------------
function drawGuard(ctx, guard) {
  const radius = GUARD.radius || GUARD.r || 16;
  ctx.fillStyle = GUARD_FILL;
  ctx.beginPath(); ctx.arc(guard.x, guard.y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = GUARD_EDGE; ctx.lineWidth = 3; ctx.stroke();
  // White direction tick showing which way the guard is facing.
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(guard.x, guard.y);
  ctx.lineTo(guard.x + Math.cos(guard.angle) * (radius + 8), guard.y + Math.sin(guard.angle) * (radius + 8));
  ctx.stroke();
  // Suspicion arc above the guard while suspicion > 0 (fills 0 -> 100).
  if ((guard.suspicion || 0) > 0) {
    const frac = Math.min(1, (guard.suspicion || 0) / 100);
    const arcR = radius + 7, arcY = guard.y - radius - 12;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(guard.x, arcY, arcR, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = guard.mode === 'chase' ? '#ff3c32' : '#ffa028';
    ctx.beginPath(); ctx.arc(guard.x, arcY, arcR, Math.PI * 1.15, Math.PI * 1.15 + Math.PI * 0.7 * frac); ctx.stroke();
    if (guard.mode === 'chase') centerText(ctx, '!', guard.x, guard.y - radius - 30, 'bold 20px sans-serif', '#ff3c32');
  }
}

// --- (8) Player: teal hooded figure with a facing tick ----------------------
function drawPlayer(ctx, player) {
  const radius = PLAYER.radius || PLAYER.r || 15, x = player.x, y = player.y;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; // soft shadow blob under the figure
  ctx.beginPath(); ctx.ellipse(x, y + radius * 0.75, radius * 0.9, radius * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PLAYER_FILL; // body
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#073b35'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = PLAYER_HOOD; // darker hood arc across the top half
  ctx.beginPath(); ctx.arc(x, y, radius * 0.72, Math.PI * 1.05, Math.PI * 1.95); ctx.closePath(); ctx.fill();
  ctx.beginPath(); // hood peak
  ctx.moveTo(x - 5, y - radius * 0.55); ctx.lineTo(x, y - radius - 4);
  ctx.lineTo(x + 5, y - radius * 0.55); ctx.closePath(); ctx.fill();
  // Facing tick (player has no stored angle, so it points up, toward the hall).
  ctx.strokeStyle = '#e6fffa'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - radius - 8); ctx.stroke();
}

// --- (9) HUD top bar: alarm meter, loot icon, timer, objective -------------
function drawHUD(ctx, state, time) {
  const w = fieldW();
  ctx.fillStyle = HUD_BG; ctx.fillRect(0, 0, w, HUD_H);
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(0, HUD_H - 1, w, 1);
  // Alarm meter (left): label + bar, yellow, then red above 70.
  leftText(ctx, 'ALARM', 16, HUD_H / 2, 'bold 18px sans-serif', HUD_TEXT);
  const barX = 92, barY = 12, barW = 180, barH = 20;
  const alarm = Math.max(0, Math.min(100, state.alarm || 0));
  ctx.fillStyle = '#26262c'; ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = alarm > 70 ? '#e5322b' : '#f5c542';
  ctx.fillRect(barX, barY, barW * (alarm / 100), barH);
  ctx.strokeStyle = '#55555e'; ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, barY + 0.5, barW, barH);
  if (alarm > 70) { // pulsing red border when the alarm is critical
    const pulse = 0.55 + 0.45 * Math.sin(time * 6);
    ctx.strokeStyle = 'rgba(255,50,40,' + pulse.toFixed(3) + ')'; ctx.lineWidth = 3;
    ctx.strokeRect(barX - 4, barY - 4, barW + 8, barH + 8);
  }
  // Loot indicator: outline idol icon, filled gold once the idol is taken.
  const iconX = 320, iconY = HUD_H / 2, iconR = 11;
  ctx.save(); ctx.translate(iconX, iconY);
  ctx.beginPath(); ctx.moveTo(0, -iconR); ctx.lineTo(iconR * 0.72, 0);
  ctx.lineTo(0, iconR); ctx.lineTo(-iconR * 0.72, 0); ctx.closePath();
  if (state.lootTaken) { ctx.fillStyle = GOLD; ctx.fill(); ctx.strokeStyle = GOLD_DARK; }
  else { ctx.strokeStyle = HUD_MUTED; ctx.fillStyle = 'rgba(0,0,0,0)'; ctx.fill(); }
  ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  leftText(ctx, 'IDOL', 340, HUD_H / 2, 'bold 16px sans-serif', state.lootTaken ? GOLD : HUD_MUTED);
  // Timer (right), M:SS.
  ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = HUD_TEXT;
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  ctx.fillText(formatTime(state.time), w - 16, HUD_H / 2);
  // Objective (centre): changes once the idol is secured.
  const objective = state.lootTaken
    ? 'Idol secured — reach the EXIT unseen'
    : 'Steal the golden idol, then reach the EXIT unseen';
  centerText(ctx, objective, w / 2 + 40, HUD_H / 2, 'bold 17px sans-serif', HUD_TEXT);
}

// --- World: the shared scene under every screen -----------------------------
function drawWorld(ctx, world, time) {
  const state = world.state;
  drawFloor(ctx);
  drawShadows(ctx);
  drawExit(ctx, time);
  if (!state.lootTaken) drawLoot(ctx, time);
  for (const guard of state.guards || []) drawVisionCone(ctx, guard);
  drawWallsAndCover(ctx);
  for (const guard of state.guards || []) drawGuard(ctx, guard);
  drawPlayer(ctx, state.player);
  drawHUD(ctx, state, time);
}

// --- Screen overlays: dark veil over the world, then big legible text -------
function drawVeil(ctx) {
  ctx.fillStyle = VEIL; ctx.fillRect(0, 0, fieldW(), fieldH());
}
function drawTitleOverlay(ctx) {
  drawVeil(ctx);
  const cx = fieldW() / 2;
  centerText(ctx, 'SHADOW VAULT', cx, 170, 'bold 84px sans-serif', GOLD);
  centerText(ctx, 'a museum heist at night', cx, 232, 'italic 28px sans-serif', '#cfc9b8');
  ctx.fillStyle = GOLD; ctx.fillRect(cx - 180, 262, 360, 3); // gold rule
  centerText(ctx, 'WASD / arrow keys to move — click to walk', cx, 330, 'bold 24px sans-serif', HUD_TEXT);
  centerText(ctx, "Stay out of the guards' vision cones — crates, cases and shadows hide you", cx, 372, 'bold 24px sans-serif', HUD_TEXT);
  centerText(ctx, 'Steal the golden idol, then reach the EXIT unseen', cx, 414, 'bold 24px sans-serif', HUD_TEXT);
  centerText(ctx, 'Press SPACE to start', cx, 500, 'bold 32px sans-serif', GOLD);
}
function drawWonOverlay(ctx, state) {
  drawVeil(ctx);
  const cx = fieldW() / 2;
  centerText(ctx, 'CLEAN GETAWAY', cx, 250, 'bold 72px sans-serif', '#2fbf5a');
  centerText(ctx, 'You stole the idol and slipped out unseen.', cx, 330, 'bold 26px sans-serif', HUD_TEXT);
  centerText(ctx, 'Time: ' + formatTime(state.time), cx, 382, 'bold 30px sans-serif', GOLD);
  centerText(ctx, 'Press R to play again', cx, 470, 'bold 28px sans-serif', HUD_TEXT);
}
function drawLostOverlay(ctx) {
  drawVeil(ctx);
  const cx = fieldW() / 2;
  centerText(ctx, 'CAUGHT!', cx, 270, 'bold 84px sans-serif', '#e5322b');
  centerText(ctx, 'A guard caught you in the vault.', cx, 350, 'bold 26px sans-serif', HUD_TEXT);
  centerText(ctx, 'Press R to try again', cx, 430, 'bold 28px sans-serif', HUD_TEXT);
}

// --- Main entry point --------------------------------------------------------
export function draw(ctx, world, screen, time) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H); // never smear one frame into the next
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  // The world is drawn behind every screen: on the title screen the
  // guards are still patrolling behind the veil, which sets the scene.
  drawWorld(ctx, world, time);
  if (screen === SCREEN_TITLE) drawTitleOverlay(ctx);
  else if (screen === SCREEN_WON) drawWonOverlay(ctx, world.state);
  else if (screen === SCREEN_LOST) drawLostOverlay(ctx);
  // SCREEN_PLAY: no overlay — just the world + HUD.
}

// START is owned by the game loop (spawn point), not the renderer, but it
// is part of this module's shared contract, so keep the import referenced.
void START;
