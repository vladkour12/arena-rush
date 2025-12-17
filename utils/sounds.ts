/**
 * Sound Manager for Arena Rush
 * Uses Web Audio API for game sounds
 */

// Audio Context (singleton)
let audioContext: AudioContext | null = null;

// Volume settings
const MASTER_VOLUME = 0.3;
const MUSIC_VOLUME = 0.15;
const SFX_VOLUME = 0.4;

// Initialize Audio Context (must be called after user interaction)
export const initAudio = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

// Create oscillator-based sounds (no external files needed)
const playTone = (frequency: number, duration: number, type: OscillatorType = 'sine', volume: number = 0.3) => {
  if (!audioContext) return;
  
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  
  gainNode.gain.setValueAtTime(volume * MASTER_VOLUME * SFX_VOLUME, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
};

// Shooting sounds
export const playShootSound = (weaponType: string) => {
  if (!audioContext) return;
  
  const ctx = audioContext;
  const now = ctx.currentTime;
  
  // Different sounds for different weapons
  switch (weaponType) {
    case 'Pistol':
      // Sharp crack
      playTone(800, 0.08, 'square', 0.3);
      playTone(200, 0.06, 'sine', 0.2);
      break;
    case 'Shotgun':
      // Deep boom
      playTone(150, 0.15, 'sawtooth', 0.4);
      playTone(80, 0.1, 'sine', 0.3);
      break;
    case 'SMG':
      // Fast tap
      playTone(600, 0.04, 'square', 0.25);
      break;
    case 'Sniper':
      // Sharp crack with echo
      playTone(1200, 0.1, 'square', 0.35);
      playTone(400, 0.15, 'sine', 0.2);
      break;
    case 'Rocket':
      // Whoosh
      playTone(300, 0.2, 'sawtooth', 0.4);
      playTone(100, 0.3, 'sine', 0.3);
      break;
    case 'AK47':
      // Mid-range crack
      playTone(700, 0.09, 'square', 0.32);
      playTone(250, 0.07, 'sine', 0.22);
      break;
    case 'Minigun':
      // Rapid burst
      playTone(500, 0.03, 'square', 0.2);
      break;
    case 'BurstRifle':
      // Crisp burst
      playTone(850, 0.06, 'square', 0.28);
      break;
    default:
      playTone(600, 0.08, 'square', 0.3);
  }
};

// Damage/hit sound
export const playHitSound = (isCritical: boolean = false) => {
  if (!audioContext) return;
  
  if (isCritical) {
    // Critical hit - higher pitch
    playTone(1200, 0.1, 'square', 0.35);
    playTone(600, 0.08, 'sine', 0.25);
  } else {
    // Normal hit
    playTone(800, 0.08, 'square', 0.3);
    playTone(400, 0.06, 'sine', 0.2);
  }
};

// Death sound
export const playDeathSound = () => {
  if (!audioContext) return;
  
  const ctx = audioContext;
  const now = ctx.currentTime;
  
  // Descending tone
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  
  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(600, now);
  oscillator.frequency.exponentialRampToValueAtTime(100, now + 0.5);
  
  gainNode.gain.setValueAtTime(0.4 * MASTER_VOLUME * SFX_VOLUME, now);
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
  
  oscillator.start(now);
  oscillator.stop(now + 0.5);
};

// Item pickup sound
export const playPickupSound = (itemType: string) => {
  if (!audioContext) return;
  
  switch (itemType) {
    case 'Medkit':
    case 'MegaHealth':
      // Healing chime
      playTone(800, 0.1, 'sine', 0.3);
      setTimeout(() => playTone(1000, 0.1, 'sine', 0.3), 50);
      setTimeout(() => playTone(1200, 0.15, 'sine', 0.3), 100);
      break;
    case 'Shield':
      // Shield power-up
      playTone(400, 0.15, 'square', 0.3);
      setTimeout(() => playTone(600, 0.15, 'square', 0.3), 75);
      break;
    case 'Weapon':
      // Weapon pickup
      playTone(600, 0.1, 'sawtooth', 0.35);
      setTimeout(() => playTone(900, 0.12, 'sawtooth', 0.3), 60);
      break;
    case 'Ammo':
      // Ammo click
      playTone(500, 0.08, 'square', 0.25);
      break;
    default:
      // Generic pickup
      playTone(700, 0.1, 'sine', 0.3);
      setTimeout(() => playTone(900, 0.1, 'sine', 0.3), 50);
  }
};

// Reload sound
export const playReloadSound = () => {
  if (!audioContext) return;
  
  playTone(300, 0.1, 'square', 0.25);
  setTimeout(() => playTone(400, 0.08, 'square', 0.2), 100);
  setTimeout(() => playTone(500, 0.1, 'square', 0.25), 200);
};

// UI sounds
export const playButtonSound = () => {
  if (!audioContext) return;
  playTone(800, 0.05, 'sine', 0.2);
};

export const playVictorySound = () => {
  if (!audioContext) return;
  
  // Victory fanfare
  const notes = [523, 659, 784, 1047]; // C, E, G, C (major chord)
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.3, 'sine', 0.35), i * 100);
  });
};

export const playDefeatSound = () => {
  if (!audioContext) return;
  
  // Defeat sound - descending
  const notes = [400, 350, 300, 250];
  notes.forEach((freq, i) => {
    setTimeout(() => playTone(freq, 0.2, 'sawtooth', 0.3), i * 80);
  });
};

// Background music (simple melody loop)
let musicInterval: any = null;
let musicGainNode: GainNode | null = null;

export const startMenuMusic = () => {
  if (!audioContext) return;
  stopMenuMusic(); // Stop any existing music
  
  const ctx = audioContext;
  musicGainNode = ctx.createGain();
  musicGainNode.gain.value = MASTER_VOLUME * MUSIC_VOLUME;
  musicGainNode.connect(ctx.destination);
  
  // Simple melody pattern (frequencies in Hz)
  const melody = [
    { freq: 523.25, duration: 0.3 }, // C5
    { freq: 659.25, duration: 0.3 }, // E5
    { freq: 783.99, duration: 0.3 }, // G5
    { freq: 659.25, duration: 0.3 }, // E5
    { freq: 523.25, duration: 0.3 }, // C5
    { freq: 587.33, duration: 0.3 }, // D5
    { freq: 659.25, duration: 0.6 }, // E5 (longer)
  ];
  
  let noteIndex = 0;
  
  const playNote = () => {
    if (!audioContext || !musicGainNode) return;
    
    const note = melody[noteIndex];
    const oscillator = ctx.createOscillator();
    const noteGain = ctx.createGain();
    
    oscillator.connect(noteGain);
    noteGain.connect(musicGainNode);
    
    oscillator.frequency.value = note.freq;
    oscillator.type = 'sine';
    
    const now = ctx.currentTime;
    noteGain.gain.setValueAtTime(0.15, now);
    noteGain.gain.exponentialRampToValueAtTime(0.01, now + note.duration);
    
    oscillator.start(now);
    oscillator.stop(now + note.duration);
    
    noteIndex = (noteIndex + 1) % melody.length;
  };
  
  playNote();
  musicInterval = setInterval(playNote, 300);
};

export const stopMenuMusic = () => {
  if (musicInterval) {
    clearInterval(musicInterval);
    musicInterval = null;
  }
  if (musicGainNode && audioContext) {
    musicGainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    setTimeout(() => {
      musicGainNode?.disconnect();
      musicGainNode = null;
    }, 500);
  }
};
