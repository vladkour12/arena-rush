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

// Shooting sounds - Enhanced and more varied
export const playShootSound = (weaponType: string) => {
  if (!audioContext) return;
  
  const ctx = audioContext;
  const now = ctx.currentTime;
  
  // Different sounds for different weapons
  switch (weaponType) {
    case 'Pistol':
      // Sharper, punchier crack
      playTone(900, 0.07, 'square', 0.35);
      playTone(180, 0.05, 'sine', 0.25);
      setTimeout(() => playTone(300, 0.04, 'sine', 0.15), 20);
      break;
    case 'Shotgun':
      // Deeper, more powerful boom
      playTone(120, 0.18, 'sawtooth', 0.45);
      playTone(60, 0.12, 'sine', 0.35);
      setTimeout(() => playTone(200, 0.08, 'triangle', 0.2), 30);
      break;
    case 'SMG':
      // Faster, crisper tap
      playTone(700, 0.035, 'square', 0.28);
      playTone(350, 0.025, 'sine', 0.18);
      break;
    case 'Sniper':
      // Loud crack with reverb
      playTone(1400, 0.08, 'square', 0.4);
      playTone(450, 0.14, 'sine', 0.25);
      setTimeout(() => playTone(800, 0.1, 'triangle', 0.15), 40);
      break;
    case 'Rocket':
      // Launch whoosh with rumble
      playTone(250, 0.25, 'sawtooth', 0.45);
      playTone(80, 0.35, 'sine', 0.35);
      setTimeout(() => playTone(150, 0.2, 'triangle', 0.25), 50);
      break;
    case 'AK47':
      // Distinctive assault rifle sound
      playTone(750, 0.08, 'square', 0.35);
      playTone(220, 0.06, 'sine', 0.25);
      setTimeout(() => playTone(400, 0.05, 'triangle', 0.18), 25);
      break;
    case 'Minigun':
      // Rapid mechanical burst
      playTone(550, 0.028, 'square', 0.22);
      playTone(280, 0.022, 'sine', 0.15);
      break;
    case 'BurstRifle':
      // Tactical burst sound
      playTone(900, 0.055, 'square', 0.3);
      playTone(350, 0.045, 'sine', 0.2);
      setTimeout(() => playTone(600, 0.04, 'triangle', 0.15), 20);
      break;
    default:
      playTone(650, 0.07, 'square', 0.32);
  }
};

// Damage/hit sound - More impactful with enhanced feedback
export const playHitSound = (isCritical: boolean = false) => {
  if (!audioContext) return;
  
  if (isCritical) {
    // Critical hit - dramatic impact with crunch
    playTone(1600, 0.11, 'square', 0.45);
    playTone(800, 0.09, 'sine', 0.35);
    setTimeout(() => playTone(400, 0.08, 'triangle', 0.25), 30);
    setTimeout(() => playTone(200, 0.06, 'sawtooth', 0.2), 50);
  } else {
    // Normal hit - solid thud with better impact feel
    playTone(1000, 0.08, 'square', 0.38);
    playTone(500, 0.06, 'sine', 0.28);
    setTimeout(() => playTone(280, 0.05, 'sine', 0.18), 25);
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

// Item pickup sound - More satisfying
export const playPickupSound = (itemType: string) => {
  if (!audioContext) return;
  
  switch (itemType) {
    case 'Medkit':
    case 'MegaHealth':
      // Healing chime - uplifting melody
      playTone(850, 0.09, 'sine', 0.35);
      setTimeout(() => playTone(1050, 0.09, 'sine', 0.35), 45);
      setTimeout(() => playTone(1300, 0.13, 'sine', 0.35), 90);
      setTimeout(() => playTone(1600, 0.08, 'triangle', 0.25), 135);
      break;
    case 'Shield':
      // Shield power-up - protective sound
      playTone(350, 0.13, 'square', 0.35);
      setTimeout(() => playTone(550, 0.13, 'square', 0.35), 65);
      setTimeout(() => playTone(750, 0.1, 'triangle', 0.25), 130);
      break;
    case 'Weapon':
      // Weapon pickup - mechanical click
      playTone(650, 0.08, 'sawtooth', 0.38);
      setTimeout(() => playTone(950, 0.1, 'sawtooth', 0.35), 50);
      setTimeout(() => playTone(1200, 0.08, 'square', 0.28), 100);
      break;
    case 'Ammo':
      // Ammo click - metallic
      playTone(550, 0.07, 'square', 0.28);
      setTimeout(() => playTone(450, 0.05, 'triangle', 0.2), 35);
      break;
    default:
      // Generic pickup - pleasant tone
      playTone(750, 0.09, 'sine', 0.33);
      setTimeout(() => playTone(950, 0.09, 'sine', 0.33), 45);
      setTimeout(() => playTone(1150, 0.07, 'triangle', 0.25), 90);
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

// Footstep sound - subtle but noticeable
export const playFootstepSound = () => {
  if (!audioContext) return;
  playTone(180, 0.04, 'sine', 0.12);
  setTimeout(() => playTone(140, 0.03, 'sine', 0.08), 15);
};

// Zombie growl sound - creepy and threatening
export const playZombieGrowlSound = () => {
  if (!audioContext) return;
  
  // Low frequency growl
  playTone(80, 0.25, 'sawtooth', 0.28);
  playTone(120, 0.2, 'square', 0.22);
  setTimeout(() => playTone(95, 0.15, 'sawtooth', 0.18), 80);
};

// Zombie attack/bite sound - aggressive
export const playZombieAttackSound = () => {
  if (!audioContext) return;
  
  // Chomping/biting sound
  playTone(220, 0.08, 'square', 0.32);
  setTimeout(() => playTone(160, 0.06, 'sawtooth', 0.25), 35);
  setTimeout(() => playTone(200, 0.05, 'square', 0.2), 70);
};

// Sprint start sound - quick whoosh
export const playSprintSound = () => {
  if (!audioContext) return;
  playTone(450, 0.08, 'sine', 0.2);
  setTimeout(() => playTone(650, 0.06, 'sine', 0.15), 35);
};

// Dash sound - powerful burst
export const playDashSound = () => {
  if (!audioContext) return;
  playTone(800, 0.12, 'sine', 0.3);
  setTimeout(() => playTone(1200, 0.1, 'triangle', 0.25), 30);
  setTimeout(() => playTone(900, 0.08, 'sine', 0.18), 60);
};

// Low ammo warning sound
export const playLowAmmoSound = () => {
  if (!audioContext) return;
  playTone(400, 0.06, 'square', 0.25);
  setTimeout(() => playTone(350, 0.05, 'square', 0.2), 60);
};
