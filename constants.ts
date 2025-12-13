import { WeaponStats, WeaponType } from './types';

export const MAP_SIZE = 2000; // 30m scaled up
export const TILE_SIZE = 100;
export const PLAYER_RADIUS = 25;

// Physics Constants
export const PLAYER_SPEED = 380; 
export const BOT_SPEED = 280;

// Camera & View
export const ZOOM_LEVEL = 0.45; // Zoom out further for better awareness
export const CAMERA_LERP = 0.05; // Smoother camera interpolation

// Sprint
export const SPRINT_MULTIPLIER = 1.6;
export const SPRINT_DURATION = 1500; // ms
export const SPRINT_COOLDOWN = 4000; // ms

// Aiming
export const AUTO_FIRE_THRESHOLD = 0.4; // Joystick magnitude to start firing

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  [WeaponType.Pistol]: {
    name: WeaponType.Pistol,
    damage: 18,
    fireRate: 200, // Faster tapping
    clipSize: 15, // More bullets
    reloadTime: 1000,
    range: 650,
    speed: 1000, 
    spread: 0.05,
    color: '#fbbf24' // amber
  },
  [WeaponType.Shotgun]: {
    name: WeaponType.Shotgun,
    damage: 15,
    fireRate: 750, // Faster pump
    clipSize: 5, // More shells
    reloadTime: 1800,
    range: 400,
    speed: 750, 
    spread: 0.35,
    color: '#9ca3af' // gray
  },
  [WeaponType.SMG]: {
    name: WeaponType.SMG,
    damage: 8,
    fireRate: 60, // Very fast fire rate
    clipSize: 50, // Huge clip
    reloadTime: 1400,
    range: 550,
    speed: 1200, 
    spread: 0.18,
    color: '#60a5fa' // blue
  },
  [WeaponType.Sniper]: {
    name: WeaponType.Sniper,
    damage: 85,
    fireRate: 1100, // Faster bolt action
    clipSize: 5,
    reloadTime: 2000,
    range: 1300,
    speed: 2000, 
    spread: 0,
    color: '#10b981' // emerald
  },
  [WeaponType.Rocket]: {
    name: WeaponType.Rocket,
    damage: 65,
    fireRate: 1200,
    clipSize: 3, // More rockets
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
  }
};

export const INITIAL_ZONE_RADIUS = MAP_SIZE / 1.5;
export const SHRINK_START_TIME = 60 * 1000;
export const SHRINK_DURATION = 30 * 1000;
export const MIN_ZONE_RADIUS = 200;

export const LOOT_SPAWN_INTERVAL = 8000;