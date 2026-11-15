// Synthesised sound effects with plain WebAudio: no audio files, no network.
// Every effect is a short burst of filtered noise or an oscillator sweep.
export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noiseBurst(duration, filterFreq, gainValue, type = 'lowpass') {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  function tone(freq, duration, gainValue, type = 'sine', slideTo = null) {
    if (!enabled || !ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') void ctx.resume(); },
    setEnabled(value) { enabled = value; },
    shot(kind) {
      if (kind === 'sniper') { noiseBurst(0.28, 900, 0.9); tone(160, 0.18, 0.25, 'square', 60); }
      else if (kind === 'smg') noiseBurst(0.09, 1800, 0.5);
      else if (kind === 'pistol') noiseBurst(0.12, 1400, 0.6);
      else noiseBurst(0.14, 1200, 0.7); // rifle
    },
    distantShot() { noiseBurst(0.12, 500, 0.22); },
    dryFire() { tone(1200, 0.03, 0.15, 'square'); },
    reload() { tone(500, 0.05, 0.2, 'square'); setTimeout(() => tone(700, 0.05, 0.2, 'square'), 180); },
    hit() { tone(1800, 0.05, 0.25, 'sine'); },
    kill() { tone(880, 0.08, 0.25, 'sine'); setTimeout(() => tone(1320, 0.1, 0.25, 'sine'), 90); },
    hurt() { noiseBurst(0.1, 300, 0.4); },
    grenade() { noiseBurst(0.5, 400, 0.9); tone(90, 0.5, 0.5, 'sine', 40); },
    explosion() { noiseBurst(0.9, 220, 1.0); tone(70, 0.8, 0.6, 'sine', 30); },
    beep(final) { tone(final ? 1400 : 1000, final ? 0.2 : 0.08, 0.25, 'sine'); },
    plant() { tone(1000, 0.1, 0.25, 'sine'); setTimeout(() => tone(1000, 0.1, 0.25, 'sine'), 250); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.25, 'triangle'), i * 130)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.22, 'triangle'), i * 140)); },
    buy() { tone(1200, 0.06, 0.2, 'sine'); },
  };
}
