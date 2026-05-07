// Procedural shooter SFX. No external audio files — everything synthesised via Web Audio API.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function initShooterAudio(): void { getCtx(); }

function noiseBuffer(c: AudioContext, durationMs: number): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * (durationMs / 1000)));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function envelope(c: AudioContext, gain: GainNode, attack: number, release: number, peak: number): void {
  const t0 = c.currentTime;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
}

function gunshot(weapon: 'pistol' | 'shotgun' | 'smg' | 'sniper'): void {
  const c = getCtx();
  if (!c) return;
  const presets = {
    pistol:  { freq: 220, dur: 90,  noiseGain: 0.18, lpf: 1500 },
    shotgun: { freq: 110, dur: 220, noiseGain: 0.32, lpf: 1100 },
    smg:     { freq: 280, dur: 60,  noiseGain: 0.14, lpf: 2000 },
    sniper:  { freq: 90,  dur: 320, noiseGain: 0.28, lpf: 900  },
  } as const;
  const p = presets[weapon];

  // Body — short low oscillator pop
  const osc = c.createOscillator();
  const oGain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(p.freq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + p.dur / 1000);
  osc.connect(oGain);
  oGain.connect(c.destination);
  envelope(c, oGain, 0.001, p.dur / 1000, 0.16);
  osc.start();
  osc.stop(c.currentTime + p.dur / 1000 + 0.05);

  // Crack — filtered white noise
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, p.dur);
  const lpf = c.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = p.lpf;
  const nGain = c.createGain();
  src.connect(lpf);
  lpf.connect(nGain);
  nGain.connect(c.destination);
  envelope(c, nGain, 0.001, p.dur / 1000, p.noiseGain);
  src.start();
  src.stop(c.currentTime + p.dur / 1000 + 0.05);
}

export function playFire(weapon: string): void {
  const w = (['pistol', 'shotgun', 'smg', 'sniper'] as const).find(x => x === weapon) ?? 'pistol';
  gunshot(w);
}

export function playHit(): void {
  const c = getCtx();
  if (!c) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 80);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 700;
  bp.Q.value = 2;
  const g = c.createGain();
  src.connect(bp);
  bp.connect(g);
  g.connect(c.destination);
  envelope(c, g, 0.001, 0.08, 0.22);
  src.start();
  src.stop(c.currentTime + 0.12);
}

export function playDeath(): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(220, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(40, c.currentTime + 0.4);
  const g = c.createGain();
  osc.connect(g);
  g.connect(c.destination);
  envelope(c, g, 0.005, 0.4, 0.18);
  osc.start();
  osc.stop(c.currentTime + 0.5);
}

export function playPickup(): void {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const make = (freq: number, when: number) => {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0 + when);
    osc.connect(g);
    g.connect(c.destination);
    g.gain.setValueAtTime(0, t0 + when);
    g.gain.linearRampToValueAtTime(0.18, t0 + when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + when + 0.12);
    osc.start(t0 + when);
    osc.stop(t0 + when + 0.14);
  };
  make(660, 0);
  make(990, 0.06);
}

let lastFootstepAt = 0;
export function playFootstep(): void {
  const c = getCtx();
  if (!c) return;
  const now = performance.now();
  if (now - lastFootstepAt < 280) return;
  lastFootstepAt = now;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, 40);
  const lpf = c.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 600;
  const g = c.createGain();
  src.connect(lpf);
  lpf.connect(g);
  g.connect(c.destination);
  envelope(c, g, 0.001, 0.05, 0.06);
  src.start();
  src.stop(c.currentTime + 0.08);
}
