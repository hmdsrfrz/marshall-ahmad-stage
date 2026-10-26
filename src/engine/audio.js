const MAX_SONG_BYTES = 200 * 1024 * 1024;

// Plays either a synthesized drum + bass loop or a user-supplied song; both feed the analyser that drives the lights.
export class BeatMachine {
  constructor() {
    this.bpm = 100;
    this.volume = 0.6;
    this.playing = false;
    this.source = 'beat';
    this.songName = '';
    this.levels = { bass: 0, mid: 0, high: 0 };
    this.ctx = null;
  }

  start() {
    if (this.playing) return;
    if (!this.ctx) this.#init();
    this.ctx.resume();
    this.playing = true;
    if (this.source === 'song') this.songEl.play().catch((err) => console.warn('[audio] song play failed', err));
    else this.nextTime = this.ctx.currentTime + 0.05;
  }

  stop() {
    this.playing = false;
    this.songEl?.pause();
  }

  // The file stays local: it is played from an object URL, never uploaded.
  async loadSong(file) {
    if (!file || !file.type.startsWith('audio/')) throw new Error('Not an audio file');
    if (file.size > MAX_SONG_BYTES) throw new Error('File is larger than 200 MB');
    if (!this.ctx) this.#init();
    if (!this.songEl) {
      this.songEl = new Audio();
      this.songEl.loop = true;
      // straight into the analyser: the drum-machine compressor would squash a mastered track
      this.ctx.createMediaElementSource(this.songEl).connect(this.analyser);
    }
    this.stop();
    if (this.songUrl) URL.revokeObjectURL(this.songUrl);
    this.songUrl = URL.createObjectURL(file);
    this.songEl.src = this.songUrl;
    this.source = 'song';
    this.songName = file.name;
    console.info('[audio] loaded song', file.name, `${(file.size / 1e6).toFixed(1)} MB`);
    this.start();
  }

  useBeat() {
    this.stop();
    this.source = 'beat';
    this.songName = '';
    this.start();
  }

  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  update() {
    if (!this.analyser) return this.levels;
    this.analyser.getByteFrequencyData(this.freq);
    const band = (from, to) => {
      let s = 0;
      for (let i = from; i < to; i++) s += this.freq[i];
      return s / ((to - from) * 255);
    };
    // fftSize 1024 @ 48kHz → ~47Hz per bin
    const target = { bass: band(1, 4), mid: band(6, 40), high: band(80, 300) };
    for (const k in target) {
      const cur = this.levels[k];
      // fast attack, slower release so pulses read clearly
      this.levels[k] = target[k] > cur ? target[k] : cur + (target[k] - cur) * 0.12;
    }
    return this.levels;
  }

  #init() {
    const ctx = (this.ctx = new AudioContext());
    this.bus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.5;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.out = ctx.createGain();
    this.out.gain.value = this.volume;
    // analyser sits before the volume control so lights keep reacting when muted
    this.bus.connect(comp).connect(this.analyser).connect(this.out).connect(ctx.destination);

    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.step = 0;
    setInterval(() => this.#schedule(), 25);
  }

  #schedule() {
    if (!this.playing || this.source !== 'beat') return;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.#playStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 32;
    }
  }

  #playStep(s, t) {
    const s16 = s % 16;
    if ([0, 7, 10].includes(s16)) this.#kick(t);
    if (s16 === 4 || s16 === 12) this.#snare(t);
    if (s16 % 2 === 0) this.#hat(t, s16 === 14 ? 0.25 : 0.045, s16 % 4 === 2 ? 0.16 : 0.09);
    const bassline = { 0: 55, 3: 55, 6: 65.41, 10: 49, 13: 49, 16: 43.65, 19: 43.65, 22: 49, 26: 41.2, 29: 49 };
    if (bassline[s]) this.#bass(t, bassline[s]);
  }

  #env(t, peak, decay) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + decay);
    g.connect(this.bus);
    return g;
  }

  #kick(t) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    o.connect(this.#env(t, 1.0, 0.45));
    o.start(t);
    o.stop(t + 0.5);
  }

  #noiseHit(t, type, freq, peak, decay) {
    const n = this.ctx.createBufferSource();
    n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    n.connect(f).connect(this.#env(t, peak, decay));
    n.start(t, Math.random() * 0.5);
    n.stop(t + decay + 0.05);
  }

  #snare(t) {
    this.#noiseHit(t, 'highpass', 1200, 0.5, 0.2);
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.connect(this.#env(t, 0.4, 0.1));
    o.start(t);
    o.stop(t + 0.15);
  }

  #hat(t, decay, peak) {
    this.#noiseHit(t, 'highpass', 7500, peak, decay);
  }

  #bass(t, hz) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 6;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(140, t + 0.25);
    o.connect(f).connect(this.#env(t, 0.32, 0.35));
    o.start(t);
    o.stop(t + 0.4);
  }
}
