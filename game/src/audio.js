// All sound is synthesized with WebAudio: no audio files ship with the game.
// Engine hum and sirens are continuous oscillators whose pitch follows the game;
// shots, hits and pickups are short envelopes. Starts on the first user gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let sirenPhase = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    return true;
  }

  function blip(freq, dur, type = 'square', vol = 0.16, slideTo = null) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
  }

  return {
    unlock: ensure,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted: () => muted,
    // Called every frame: engine pitch by speed, siren loudness by nearest cop distance.
    update(dt, engineSpeed, sirenLevel) {
      if (!ctx) return;
      sirenPhase += dt;
      const t = ctx.currentTime;
      if (engineGain) {
        engineGain.gain.setTargetAtTime(engineSpeed > 0.02 ? 0.05 + engineSpeed * 0.05 : 0, t, 0.08);
        engineOsc.frequency.setTargetAtTime(55 + engineSpeed * 165, t, 0.08);
      }
      if (sirenGain) {
        sirenGain.gain.setTargetAtTime(sirenLevel * 0.07, t, 0.1);
        sirenOsc.frequency.setValueAtTime(Math.floor(sirenPhase * 1.6) % 2 === 0 ? 720 : 960, t);
      }
    },
    shot() { noiseBurst(0.09, 0.5, 2600); blip(190, 0.05, 'square', 0.12, 60); },
    shotgun() { noiseBurst(0.22, 0.7, 1500); },
    punch() { noiseBurst(0.07, 0.3, 700); },
    hit() { blip(140, 0.08, 'triangle', 0.2, 80); },
    crash(strength) { noiseBurst(0.18, Math.min(0.7, 0.25 + strength * 0.5), 900); },
    explosion() { noiseBurst(0.7, 0.9, 500); blip(60, 0.6, 'sine', 0.5, 30); },
    pickup() { blip(880, 0.09, 'sine', 0.2); blip(1320, 0.12, 'sine', 0.16); },
    cash() { blip(990, 0.07, 'square', 0.12); setTimeout(() => blip(1480, 0.1, 'square', 0.12), 60); },
    door() { blip(240, 0.08, 'triangle', 0.2, 140); },
    horn() { blip(370, 0.28, 'square', 0.1); blip(466, 0.28, 'square', 0.08); },
    missionPass() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'triangle', 0.2), i * 110));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.26, 'triangle', 0.2), i * 140));
    },
    star() { blip(1568, 0.12, 'sine', 0.14); },
  };
}
