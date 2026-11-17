// audio.js — every sound in Solmar Heat is synthesised live with WebAudio:
// no audio files, no network, nothing to download. All calls are safe
// before the player has interacted (the context simply stays suspended).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = false;
  }

  /** Create the context. Call from a user gesture; safe to call any time. */
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineHum();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** A low engine drone whose pitch follows the car's speed. */
  startEngineHum() {
    const ctx = this.ctx;
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  /** speedPxPerSec: 0 when on foot or idle. */
  setEngine(speedPxPerSec, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + Math.min(0.1, speedPxPerSec / 560 * 0.1) : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(
      42 + Math.min(120, speedPxPerSec * 0.22), t, 0.1,
    );
  }

  /** Two-tone police siren, on while the player is wanted. */
  setSiren(on) {
    if (!this.ctx) return;
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (on) {
      const ctx = this.ctx;
      this.sirenOsc = ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 740;
      this.sirenGain = ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      lfo.start();
      this.sirenLfo = lfo;
    } else if (this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch { /* already stopped */ }
      try { this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null;
      this.sirenLfo = null;
    }
  }

  /** Short filtered noise burst: a gunshot. */
  gunshot() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.14;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
  }

  /** A low thud: a punch landing. */
  punch() {
    this.blip(90, 0.12, 'sine', 0.5);
  }

  /** A two-note chime: picking something up. */
  pickup() {
    this.blip(660, 0.09, 'sine', 0.35);
    setTimeout(() => this.blip(990, 0.12, 'sine', 0.35), 90);
  }

  /** A cash-register-ish ka-ching for mission rewards. */
  cash() {
    [880, 1174, 1568].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.14, 'triangle', 0.3), i * 90);
    });
  }

  /** A short fanfare arpeggio: mission complete. */
  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.18, 'triangle', 0.32), i * 110);
    });
  }

  /** A dull boom: a car exploding. */
  explosion() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const dur = 0.6;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 1.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0.7;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    this.blip(55, 0.5, 'sine', 0.6);
  }

  /** A single synth tone. */
  blip(freq, dur, type, vol) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.3;
    gain.gain.setTargetAtTime(0, ctx.currentTime + dur * 0.6, 0.05);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  /** A laid-back bassline loop for the menu and free roam. */
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    // A minor-key bass walk: A, F, C, G — one note per beat, 96 BPM.
    const bass = [55, 55, 43.65, 43.65, 65.41, 65.41, 49, 49];
    const stepMs = 625;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) { this.musicStep++; return; }
      const note = bass[this.musicStep % bass.length];
      this.blip(note, 0.5, 'triangle', 0.16);
      if (this.musicStep % 4 === 2) this.blip(note * 4, 0.12, 'sine', 0.05);
      this.musicStep++;
    }, stepMs);
  }

  stopMusic() {
    this.musicOn = false;
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}
