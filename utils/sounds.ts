/**
 * RTS Sound Manager for Tiny Kingdoms
 * All sounds synthesised via Web Audio API — no external audio files required.
 */

let audioContext: AudioContext | null = null;

export const initAudio = (): void => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
};

// ── Low-level primitives ──────────────────────────────────────────────────────

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.14,
  startDelay = 0,
  pitchEnd?: number,
) {
  const c = audioContext;
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  const t0 = c.currentTime + startDelay;
  osc.frequency.setValueAtTime(frequency, t0);
  if (pitchEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, pitchEnd), t0 + duration);
  }
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.start(t0);
  osc.stop(t0 + duration + 0.01);
}

function noise(duration: number, volume = 0.09, startDelay = 0) {
  const c = audioContext;
  if (!c) return;
  const bufSize = Math.ceil(c.sampleRate * duration);
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const gain = c.createGain();
  src.connect(gain);
  gain.connect(c.destination);
  const t0 = c.currentTime + startDelay;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.start(t0);
  src.stop(t0 + duration + 0.01);
}

// ── RTS Combat Sounds ─────────────────────────────────────────────────────────

let _lastMeleeMs = 0;

/** Sword/melee impact — rate-limited so rapid combat doesn't overwhelm. */
export const playMeleeHit = (): void => {
  const now = performance.now();
  if (now - _lastMeleeMs < 60) return;
  _lastMeleeMs = now;
  tone(190, 0.055, 'sawtooth', 0.16);
  tone(270, 0.040, 'square',   0.09, 0.01);
  noise(0.04, 0.07);
};

let _lastArrowMs = 0;

/** Arrow or stone projectile release. */
export const playArrowShoot = (): void => {
  const now = performance.now();
  if (now - _lastArrowMs < 80) return;
  _lastArrowMs = now;
  tone(900, 0.07, 'sine', 0.09, 0, 280);
  noise(0.025, 0.05);
};

/** Tower arrow shot — slightly heavier than unit arrow. */
export const playTowerShoot = (): void => {
  tone(600, 0.06, 'triangle', 0.10, 0, 900);
  noise(0.02, 0.06);
};

/** Monk healing sparkle. */
export const playHealEffect = (): void => {
  tone(880,  0.10, 'sine', 0.09);
  tone(1108, 0.09, 'sine', 0.08, 0.06);
  tone(1320, 0.08, 'sine', 0.07, 0.12);
};

// ── Building Sounds ───────────────────────────────────────────────────────────

/** Satisfying wood-and-stone thud when placing a building. */
export const playBuildingPlace = (): void => {
  noise(0.07, 0.14);
  tone(130, 0.13, 'triangle', 0.18);
  tone(200, 0.07, 'sine',     0.09, 0.04);
};

/** Explosion boom when a building is destroyed. */
export const playBuildingDestroyed = (): void => {
  noise(0.40, 0.26);
  tone(75,  0.36, 'sawtooth', 0.20, 0, 32);
  tone(130, 0.22, 'square',   0.11, 0.06);
};

let _lastCastleHitMs = 0;

/** Deep impact when the player's castle takes damage. */
export const playCastleHit = (): void => {
  const now = performance.now();
  if (now - _lastCastleHitMs < 300) return;
  _lastCastleHitMs = now;
  noise(0.18, 0.16);
  tone(52, 0.30, 'sawtooth', 0.18, 0, 24);
};

// ── Economy & Training Sounds ─────────────────────────────────────────────────

/** Short ping when a unit finishes training. */
export const playUnitTrained = (): void => {
  tone(660, 0.08, 'sine', 0.13);
  tone(880, 0.10, 'sine', 0.11, 0.07);
};

// ── UI Sounds ─────────────────────────────────────────────────────────────────

export const playButtonSound = (): void => {
  tone(580, 0.05, 'sine', 0.11);
};

// ── Victory / Defeat ──────────────────────────────────────────────────────────

export const playVictoryFanfare = (): void => {
  [523, 659, 784, 1047].forEach((freq, i) => tone(freq, 0.32, 'sine', 0.15, i * 0.10));
};

export const playDefeatSound = (): void => {
  [440, 370, 330, 262].forEach((freq, i) => tone(freq, 0.26, 'sawtooth', 0.13, i * 0.09));
};

// ── Menu Music ────────────────────────────────────────────────────────────────

let musicInterval: ReturnType<typeof setInterval> | null = null;
let musicGainNode: GainNode | null = null;

export const startMenuMusic = (): void => {
  const c = audioContext;
  if (!c) return;
  stopMenuMusic();

  musicGainNode = c.createGain();
  musicGainNode.gain.value = 0.050;
  musicGainNode.connect(c.destination);

  // D major pentatonic — uplifting medieval feel
  const melody = [587, 659, 740, 880, 740, 659, 587, 523, 587, 659, 740, 659];
  let noteIndex = 0;

  const playNote = () => {
    if (!audioContext || !musicGainNode) return;
    const osc = audioContext.createOscillator();
    const g = audioContext.createGain();
    osc.connect(g);
    g.connect(musicGainNode);
    osc.frequency.value = melody[noteIndex];
    osc.type = 'sine';
    const now = audioContext.currentTime;
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.30);
    noteIndex = (noteIndex + 1) % melody.length;
  };

  playNote();
  musicInterval = setInterval(playNote, 340);
};

export const stopMenuMusic = (): void => {
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  if (musicGainNode && audioContext) {
    try {
      musicGainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.4);
    } catch { /* context may have been closed */ }
    setTimeout(() => { musicGainNode?.disconnect(); musicGainNode = null; }, 400);
  }
};
