export class AudioSystem {
  constructor() {
    this.context = null;
    this.master = null;
    this.volume = 0.7;
    this.mutedByPlatform = false;
    this.lastStep = 0;
    window.addEventListener("platform-audio-settings", (event) => {
      this.mutedByPlatform = Boolean(event.detail?.muted);
      this.applyVolume();
    });
  }

  ensure() {
    if (this.context) {
      if (this.context.state === "suspended") this.context.resume().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.context = new Ctx();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
  }

  applyVolume() {
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.mutedByPlatform ? 0 : this.volume, this.context.currentTime, 0.04);
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.applyVolume();
  }

  tone(frequency, duration, type = "square", gain = 0.12, slide = 0) {
    this.ensure();
    if (!this.context || this.mutedByPlatform) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const amp = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + slide), now + duration);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  noise(duration = 0.14, gain = 0.12, cutoff = 1800) {
    this.ensure();
    if (!this.context || this.mutedByPlatform) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const amp = this.context.createGain();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    amp.gain.setValueAtTime(gain, this.context.currentTime);
    amp.gain.exponentialRampToValueAtTime(0.0001, this.context.currentTime + duration);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    source.start();
  }

  play(name) {
    switch (name) {
      case "shoot": this.noise(0.075, 0.22, 2800); this.tone(92, 0.08, "sawtooth", 0.11, -55); break;
      case "mk2": this.noise(0.095, 0.24, 3200); this.tone(145, 0.13, "sawtooth", 0.12, 260); this.tone(620, 0.08, "sine", 0.045, -180); break;
      case "shotgun": this.noise(0.22, 0.3, 1500); this.tone(55, 0.18, "sawtooth", 0.16, -30); break;
      case "reload": this.tone(520, 0.045, "square", 0.045); setTimeout(() => this.tone(330, 0.06, "square", 0.05), 120); break;
      case "hit": this.tone(860, 0.07, "sine", 0.09); break;
      case "kill": this.tone(480, 0.09, "triangle", 0.09, 260); break;
      case "buy": this.tone(420, 0.1, "sine", 0.1, 180); setTimeout(() => this.tone(720, 0.12, "sine", 0.07), 95); break;
      case "hurt": this.noise(0.2, 0.18, 450); this.tone(70, 0.2, "sawtooth", 0.1, -25); break;
      case "round": this.tone(330, 0.18, "triangle", 0.1, 150); setTimeout(() => this.tone(490, 0.24, "triangle", 0.12, 170), 140); break;
      case "power": this.tone(110, 0.65, "sawtooth", 0.1, 500); this.tone(440, 0.4, "sine", 0.08, 240); break;
      case "boss": this.tone(62, 0.9, "sawtooth", 0.12, -20); break;
      case "step": this.noise(0.045, 0.025, 260); break;
      default: this.tone(600, 0.04, "sine", 0.04);
    }
  }
}