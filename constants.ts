import { WeaponStats, WeaponType } from './types';

export const MAP_SIZE = 2000; // 30m scaled up
export const TILE_SIZE = 100;
export const PLAYER_RADIUS = 25;
export const MAP_BOUNDARY_PADDING = 500; // Extra padding to ensure no black corners beyond map edges

// Physics Constants
export const PLAYER_SPEED = 450; // Slightly faster for better responsiveness
export const BOT_SPEED = 320; // Improved bot mobility

// Camera & View
export const ZOOM_LEVEL = 0.37; // Better view while maintaining tactical awareness
export const CAMERA_LERP = 0.12; // Smoother camera with better responsiveness
export const TARGET_FPS = 30; // Target frame rate for consistent performance

// Mobile Performance Settings
export const MOBILE_SHADOW_BLUR_REDUCTION = 0.5; // Reduce shadow blur by 50% on mobile
export const MOBILE_MAX_PARTICLES = 20; // Limit particle count on mobile
export const DESKTOP_MAX_PARTICLES = 50; // Desktop can handle more particles
export const MOBILE_BULLET_TRAIL_LENGTH = 2; // Shorter trails on mobile (vs 3 on desktop)

// Sprint
export const SPRINT_MULTIPLIER = 1.6; // More impactful sprint
export const SPRINT_DURATION = 1800; // Longer sprint duration
export const SPRINT_COOLDOWN = 3500; // Shorter cooldown for better flow

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

// Aim Snap System
export const AIM_SNAP_RANGE = 800; // Maximum distance to snap to target
export const AIM_SNAP_ANGLE = 0.4; // Maximum angle (radians) for snap to activate (~23 degrees)
export const AIM_SNAP_STRENGTH = 0.3; // How strongly the aim pulls toward target (0-1)
export const AIM_SNAP_MAINTAIN_ANGLE = 0.15; // Maximum angle to maintain snap (~8.5 degrees)
export const AIM_SNAP_AUTO_FIRE = true; // Enable auto-fire when snapped
export const AIM_SNAP_MIN_MAGNITUDE = 0.3; // Minimum aim stick magnitude to trigger auto-fire when snapped

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  [WeaponType.Pistol]: {
    name: WeaponType.Pistol,
    damage: 22, // Improved damage for better starter weapon
    fireRate: 180, // Slightly faster fire rate
    clipSize: 15,
    reloadTime: 950,
    range: 700, // Extended range
    speed: 1200, // Faster bullets
    spread: 0.03, // More accurate
    color: '#fbbf24' // amber
  },
  [WeaponType.Shotgun]: {
    name: WeaponType.Shotgun,
    damage: 18, // Better per pellet damage
    fireRate: 650, // Faster pump
    clipSize: 7, // One more shell for better sustained fire
    reloadTime: 1600, // Faster reload
    range: 450, // Better range
    speed: 850, 
    spread: 0.3, // Tighter spread for more consistency
    color: '#9ca3af' // gray
  },
  [WeaponType.SMG]: {
    name: WeaponType.SMG,
    damage: 10, // Better damage per bullet
    fireRate: 55, // Even faster fire rate
    clipSize: 50,
    reloadTime: 1300, // Faster reload
    range: 620, // Better range
    speed: 1300, 
    spread: 0.14, // Better accuracy
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
    damage: 26, // Better damage for versatile weapon
    fireRate: 95, // Faster fire
    clipSize: 30,
    reloadTime: 1400, // Faster reload
    range: 850, // Better range
    speed: 1450, // Faster bullets
    spread: 0.07, // Better accuracy
    color: '#d97706' // amber-600
  },
  [WeaponType.Minigun]: {
    name: WeaponType.Minigun,
    damage: 14, // Better damage for sustained fire
    fireRate: 32, // Insane speed
    clipSize: 100,
    reloadTime: 2800, // Slightly faster reload
    range: 700, // Better range
    speed: 1250, // Faster bullets
    spread: 0.20, // Better accuracy
    color: '#71717a' // zinc-500
  },
  [WeaponType.BurstRifle]: {
    name: WeaponType.BurstRifle,
    damage: 32, // Higher damage per burst for skill-based weapon
    fireRate: 130, // Faster bursts
    clipSize: 30, // More ammo
    reloadTime: 1250, // Faster reload
    range: 950, // Longer range
    speed: 1550, // Faster bullets
    spread: 0.015, // Very accurate
    color: '#0ea5e9' // sky-500
  }
};

// Zone Configuration
export const INITIAL_ZONE_RADIUS = MAP_SIZE / 1.5;
export const SHRINK_START_TIME = 50 * 1000; // 50 seconds before zone starts shrinking (faster pace)
export const SHRINK_DURATION = 35 * 1000; // 35 seconds to fully shrink (more gradual)
export const MIN_ZONE_RADIUS = 250; // Slightly larger final zone for better gameplay
export const ZONE_DAMAGE_PER_SECOND = 6; // HP damage per second outside zone (more threatening)

// Loot Configuration
export const LOOT_SPAWN_INTERVAL = 7000; // 7 seconds between loot spawns (more frequent)
export const MAX_LOOT_ITEMS = 18; // More loot items for better gameplay variety

// Health & Regeneration
export const HEALTH_REGEN_DELAY = 4500; // 4.5 seconds after taking damage before regen (faster recovery)
export const HEALTH_REGEN_RATE = 1.5; // 1.5 HP per tick (better regeneration)

// Bot AI Configuration
export const BOT_MIN_SEPARATION_DISTANCE = 800; // Minimum spawn distance from player
export const BOT_ACCURACY = 0.88; // 88% chance to fire when targeting (improved)
export const BOT_LOOT_SEARCH_RADIUS = 900; // Search radius for health/armor when low (extended)
export const BOT_LEAD_FACTOR = 0.35; // Target leading factor for prediction (improved)
export const BOT_LEAD_MULTIPLIER = 0.0012; // Lead calculation multiplier (enhanced)
export const BOT_REACTION_TIME = 150; // ms delay before bot reacts to player (more human-like)

// Visual Effects
export const MUZZLE_FLASH_DURATION = 100; // milliseconds
export const DAMAGE_FLASH_DURATION = 200; // milliseconds

// Network Configuration
export const CONNECTION_TIMEOUT = 10000; // 10 seconds