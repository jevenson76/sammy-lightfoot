// Synthesized sound, in the spirit of a 1-bit speaker: short square-wave
// blips and slides. The sim emits named events; this maps names to sounds.

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }

  // One note: start frequency, optional slide to an end frequency.
  function tone(freq, dur, { to = freq, vol = 0.06, type = 'square', at = 0 } = {}) {
    if (!ctx) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.setValueAtTime(vol, t0 + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function seq(notes, step, opts) {
    notes.forEach((f, i) => { if (f) tone(f, step * 0.9, { ...opts, at: i * step }); });
  }

  const SFX = {
    jump: () => tone(330, 0.12, { to: 660 }),
    land: () => tone(110, 0.05, { vol: 0.05 }),
    step: () => tone(90, 0.02, { vol: 0.025 }),
    bounce: () => tone(180, 0.18, { to: 720 }),
    grab: () => tone(520, 0.06, { to: 780 }),
    release: () => tone(700, 0.08, { to: 440 }),
    warn: () => tone(880, 0.05, { vol: 0.04 }),
    hit: () => { tone(400, 0.35, { to: 50, type: 'sawtooth', vol: 0.09 }); },
    fall: () => tone(900, 0.5, { to: 120, vol: 0.05 }),
    die: () => seq([392, 330, 262, 196, 131], 0.11, { vol: 0.07 }),
    pickup: () => seq([660, 880], 0.06),
    goal: () => seq([523, 659, 784, 1047], 0.09),
    tally: () => tone(1200, 0.03, { vol: 0.035 }),
    extra: () => seq([784, 988, 1175, 1568, 1175, 1568], 0.08),
    start: () => seq([262, 330, 392, 523, 392, 523], 0.1),
    gameover: () => seq([330, 311, 294, 277, 262, 0, 131], 0.16, { vol: 0.07 }),
    timeLow: () => tone(1000, 0.04, { vol: 0.04 }),
  };

  return {
    unlock,
    play(name) { if (ctx && !muted && SFX[name]) SFX[name](); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 1;
      return muted;
    },
    get muted() { return muted; },
  };
}
