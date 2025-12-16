import { WeaponStats, WeaponType } from './types';

export const MAP_SIZE = 2000; // 30m scaled up
export const TILE_SIZE = 100;
export const PLAYER_RADIUS = 25;

// Physics Constants
export const PLAYER_SPEED = 420; 
export const BOT_SPEED = 280;

// Camera & View
export const ZOOM_LEVEL = 0.2; // Bigger Field of View (even more)
export const CAMERA_LERP = 0.08; // Smoother camera interpolation

// Sprint
export const SPRINT_MULTIPLIER = 1.5;
export const SPRINT_DURATION = 1500; // ms
export const SPRINT_COOLDOWN = 4000; // ms

// Input shaping
export const MOVE_DEADZONE = 0.05; // More responsive
export const AIM_DEADZONE = 0.1; // More precise aiming

// Movement feel (tuned for smoother control)
export const MOVE_ACCEL = 40;
export const MOVE_DECEL = 25;
export const MOVE_TURN_ACCEL = 50;

// Aiming feel
export const STICK_AIM_TURN_SPEED = 12; // Slower turn for precision
export const MOUSE_AIM_TURN_SPEED = 25;

// Aim assist (mobile stick only)
export const AIM_ASSIST_MAX_DISTANCE = 1200;
export const AIM_ASSIST_CONE = 0.35; // radians
export const AIM_ASSIST_STRENGTH = 0.35; // 0..1

// Aiming
export const AUTO_FIRE_THRESHOLD = 0.85; // Require more push to fire to prevent accidental firing while aiming

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  [WeaponType.Pistol]: {
    name: WeaponType.Pistol,
    damage: 20, // Slightly buffed for starter weapon
    fireRate: 200,
    clipSize: 15,
    reloadTime: 1000,
    range: 650,
    speed: 1100, // Faster bullets
    spread: 0.04, // More accurate
    color: '#fbbf24' // amber
  },
  [WeaponType.Shotgun]: {
    name: WeaponType.Shotgun,
    damage: 16, // Buffed per pellet
    fireRate: 700, // Faster pump
    clipSize: 6, // One more shell
    reloadTime: 1700, // Faster reload
    range: 420, // Slightly longer range
    speed: 800, 
    spread: 0.32, // Slightly tighter spread
    color: '#9ca3af' // gray
  },
  [WeaponType.SMG]: {
    name: WeaponType.SMG,
    damage: 9, // Slight buff
    fireRate: 60, // Very fast fire rate
    clipSize: 50,
    reloadTime: 1400,
    range: 580, // Better range
    speed: 1250, 
    spread: 0.16, // Better accuracy
    color: '#60a5fa' // blue
  },
  [WeaponType.Sniper]: {
    name: WeaponType.Sniper,
    damage: 90, // Higher damage for skill shots
    fireRate: 1000, // Slightly faster
    clipSize: 5,
    reloadTime: 2000,
    range: 1400, // Longer range
    speed: 2200, // Even faster bullets
    spread: 0,
    color: '#10b981' // emerald
  },
  [WeaponType.Rocket]: {
    name: WeaponType.Rocket,
    damage: 70, // Buffed
    fireRate: 1100, // Faster
    clipSize: 4, // One more rocket
    reloadTime: 2500,
    range: 900,
    speed: 650, 
    spread: 0.05,
    color: '#ef4444' // red
  },
  [WeaponType.Knife]: {
    name: WeaponType.Knife,
    damage: 35,
    fireRate: 400,
    clipSize: Infinity,
    reloadTime: 0,
    range: 70,
    speed: 0,
    spread: 0,
    color: '#f3f4f6' // white
  },
  [WeaponType.AK47]: {
    name: WeaponType.AK47,
    damage: 24, // Better damage
    fireRate: 100, // Faster fire
    clipSize: 30,
    reloadTime: 1500, // Faster reload
    range: 800, // Better range
    speed: 1400, // Faster bullets
    spread: 0.08, // Better accuracy
    color: '#d97706' // amber-600
  },
  [WeaponType.Minigun]: {
    name: WeaponType.Minigun,
    damage: 13, // Slight buff
    fireRate: 35, // Insane speed
    clipSize: 100,
    reloadTime: 3000,
    range: 650, // Better range
    speed: 1200, // Faster bullets
    spread: 0.22, // Slightly better accuracy
    color: '#71717a' // zinc-500
  },
  [WeaponType.BurstRifle]: {
    name: WeaponType.BurstRifle,
    damage: 30, // Higher damage per burst
    fireRate: 140, // Faster bursts
    clipSize: 27, // More ammo
    reloadTime: 1300, // Faster reload
    range: 900, // Longer range
    speed: 1500, // Faster bullets
    spread: 0.02, // Accurate
    color: '#0ea5e9' // sky-500
  }
};

export const INITIAL_ZONE_RADIUS = MAP_SIZE / 1.5;
export const SHRINK_START_TIME = 60 * 1000;
export const SHRINK_DURATION = 30 * 1000;
export const MIN_ZONE_RADIUS = 200;

export const LOOT_SPAWN_INTERVAL = 8000;