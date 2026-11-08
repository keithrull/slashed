// Traditional Japanese Synthesizer Audio Engine (Web Audio API)
// Synthesizes Shakuhachi bamboo flute, Taiko war drums, Koto plucks, Katana clangs, and Watercolor brush whooshes

export class SoundEngine {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private ensureContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  // Deep resonant Taiko drum beat
  public playTaiko(intensity: number = 1.0, pitch: number = 78): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch * 1.6, now);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.48, now + 0.32);

    gain.gain.setValueAtTime(0.45 * intensity, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);

    // Stick skin transient click
    this.playNoiseBurst(0.04, 800, 0.2 * intensity);
  }

  // Expressive brush slash / katana air cut
  public playBrushSlash(heavy: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = heavy ? 0.28 : 0.16;

    // Filtered noise for wet sumi brush + blade wind
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.3);
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(heavy ? 480 : 950, now);
    filter.frequency.exponentialRampToValueAtTime(heavy ? 1800 : 2800, now + duration * 0.6);
    filter.Q.value = 2.2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(heavy ? 0.36 : 0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);

    // Subtle metallic blade ring
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'triangle';
    ring.frequency.setValueAtTime(heavy ? 1120 : 1680, now);
    ring.frequency.exponentialRampToValueAtTime(heavy ? 540 : 880, now + duration);
    ringGain.gain.setValueAtTime(0.08, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    ring.connect(ringGain);
    ringGain.connect(ctx.destination);
    ring.start(now);
    ring.stop(now + duration);
  }

  // Flesh / Ink impact + crimson blossom burst
  public playHitImpact(heavy: boolean = false, blocked: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (blocked) {
      // Steel guard clang
      this.playMetalClang(1450, 0.22);
      return;
    }

    this.playTaiko(heavy ? 1.1 : 0.7, heavy ? 64 : 92);
    this.playNoiseBurst(heavy ? 0.22 : 0.12, heavy ? 1200 : 1900, heavy ? 0.35 : 0.22);
  }

  // Mind's Eye Parry (Shingan) — Golden resonant bell + steel spark
  public playParryFlash(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [1046.5, 1567.98, 2093.0, 2637.02]; // Japanese In-Sen / Pentatonic harmonic chime
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);
      gain.gain.setValueAtTime(0.18 / (idx + 1), now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.75);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.78);
    });
    this.playTaiko(1.2, 58);
  }

  // Koto string arpeggio for Round Start / Super Activation / K.O.
  public playKotoArpeggio(dramatic: boolean = false): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    // Hirajoshi / In-sen Japanese pentatonic scale frequencies
    const notes = dramatic
      ? [220, 233.08, 293.66, 329.63, 349.23, 440, 466.16, 587.33]
      : [293.66, 329.63, 392.0, 440.0, 587.33];

    notes.forEach((freq, i) => {
      const start = ctx.currentTime + i * (dramatic ? 0.055 : 0.075);
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.2, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    });
  }

  private playMetalClang(baseFreq: number, duration: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [1, 1.41, 2.13].forEach((ratio) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(baseFreq * ratio, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration);
    });
  }

  private playNoiseBurst(duration: number, centerFreq: number, volume: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = centerFreq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }
}

export const sound = new SoundEngine();
