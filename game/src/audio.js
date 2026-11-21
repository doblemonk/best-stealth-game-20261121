// audio.js — tiny Web Audio sound effects for Shadow Vault.
//
// No audio files, no libraries: every sound is a synthesised oscillator
// note. createAudio() returns
//   { ensure, blip, spotted, loot, win, lose, footstep }.
// ensure() must be called from a user gesture first (browsers block
// AudioContext creation before one). Until then — and whenever the
// context is suspended — every other method is a silent no-op, and
// every method is guarded so audio can never throw and break the game.

export function createAudio() {
  let ctx = null; // AudioContext, created lazily by ensure().

  // Create (or resume) the context. Call from a click / keypress.
  function ensure() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return; // No Web Audio support — stay silent.
        ctx = new AC();
      }
      if (ctx.state === 'suspended') {
        // resume() returns a promise; ignore failures silently.
        ctx.resume().catch(() => {});
      }
    } catch (_err) {
      ctx = null; // Audio unavailable; everything else no-ops.
    }
  }

  // True only when we can actually play sound right now.
  function ready() {
    return ctx !== null && ctx.state === 'running';
  }

  // Play one short oscillator note with a quick exponential fade-out,
  // so the note ends cleanly instead of clicking. `when` is an offset
  // in seconds from now, for scheduling arpeggios.
  function blip(freq, dur, type = 'sine', vol = 0.08, when = 0) {
    try {
      if (!ready()) return;
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      // Start at full volume, fade exponentially to near-silence.
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (_err) {
      // Never let audio break the game.
    }
  }

  // Two quick low beeps — a guard has spotted the player.
  function spotted() {
    try {
      blip(220, 0.09, 'square', 0.07);
      blip(180, 0.09, 'square', 0.07, 0.11);
    } catch (_err) {}
  }

  // Rising 3-note arpeggio — loot picked up.
  function loot() {
    try {
      blip(523, 0.12);
      blip(659, 0.12, 'sine', 0.08, 0.1);
      blip(784, 0.12, 'sine', 0.08, 0.2);
    } catch (_err) {}
  }

  // Short 4-note fanfare — level cleared.
  function win() {
    try {
      blip(523, 0.14);
      blip(659, 0.14, 'sine', 0.08, 0.12);
      blip(784, 0.14, 'sine', 0.08, 0.24);
      blip(1047, 0.28, 'sine', 0.08, 0.36);
    } catch (_err) {}
  }

  // Descending buzz — caught / game over.
  function lose() {
    try {
      if (!ready()) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, t0);
      osc.frequency.exponentialRampToValueAtTime(110, t0 + 0.5);
      gain.gain.setValueAtTime(0.06, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.52);
    } catch (_err) {}
  }

  // Very short quiet tick — a footstep while sneaking.
  function footstep() {
    try {
      blip(90, 0.03, 'triangle', 0.03);
    } catch (_err) {}
  }

  return { ensure, blip, spotted, loot, win, lose, footstep };
}
