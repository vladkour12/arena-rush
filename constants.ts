import { WeaponStats, WeaponType } from './types';

export const MAP_SIZE = 3000; // Bigger map (increased from 2000)
export const TILE_SIZE = 100;
export const PLAYER_RADIUS = 25;
export const MAP_BOUNDARY_PADDING = 500; // Extra padding to ensure no black corners beyond map edges

// Physics Constants
export const PLAYER_SPEED = 450; // Slightly faster for better responsiveness
export const BOT_SPEED = 320; // Improved bot mobility

// Camera & View
export const ZOOM_LEVEL = 0.55; // Much closer view for better visibility (increased from 0.45)
export const CAMERA_LERP = 0.04; // Much slower, smoother camera movement (reduced from 0.08 for less motion)
export const TARGET_FPS = 60; // Target 60 FPS for smooth gameplay (increased from 30)

// Mobile Performance Settings
export const MOBILE_SHADOW_BLUR_REDUCTION = 0.5; // Reduce shadow blur by 50% on mobile
export const MOBILE_MAX_PARTICLES = 20; // Limit particle count on mobile
export const DESKTOP_MAX_PARTICLES = 50; // Desktop can handle more particles
export const MOBILE_BULLET_TRAIL_LENGTH = 2; // Shorter trails on mobile (vs 3 on desktop)

// Sprint & Dash
export const SPRINT_MULTIPLIER = 1.6; // More impactful sprint
export const SPRINT_DURATION = 1800; // Longer sprint duration
export const SPRINT_COOLDOWN = 3500; // Shorter cooldown for better flow
export const DASH_MULTIPLIER = 3.5; // Quick dash boost
export const DASH_DURATION = 200; // Short dash (ms)
export const DASH_COOLDOWN = 5000; // 5 second cooldown

// Input shaping - improved responsiveness with sensitivity
export const MOVE_DEADZONE = 0.05; // Balanced for smooth and responsive movement
export const AIM_DEADZONE = 0.06; // Precise and responsive aiming

// Movement feel (tuned for smoother control)
export const MOVE_ACCEL = 40;
export const MOVE_DECEL = 25;
export const MOVE_TURN_ACCEL = 50;

// Aiming feel
export const STICK_AIM_TURN_SPEED = 15; // Improved turn speed for better responsiveness (trade-off: slightly less precision)
export const MOUSE_AIM_TURN_SPEED = 25;

// Aim assist (mobile stick only)
export const AIM_ASSIST_MAX_DISTANCE = 1500; // Increased range for better targeting
export const AIM_ASSIST_CONE = 0.45; // radians - wider cone for easier targeting
export const AIM_ASSIST_STRENGTH = 0.5; // 0..1 - stronger pull toward target

// Aiming
export const AUTO_FIRE_THRESHOLD = 0.75; // Easier to trigger fire for better responsiveness

// Aim Snap System - Very Strong for easier killing with visual feedback
export const AIM_SNAP_RANGE = 1800; // Maximum distance to snap to target - very increased
export const AIM_SNAP_ANGLE = 1.0; // Maximum angle (radians) for snap to activate (~57 degrees) - much wider
export const AIM_SNAP_STRENGTH = 0.85; // How strongly the aim pulls toward target (0-1) - very strong
export const AIM_SNAP_MAINTAIN_ANGLE = 0.5; // Maximum angle to maintain snap (~29 degrees) - very forgiving
export const AIM_SNAP_AUTO_FIRE = true; // Enable auto-fire when snapped
export const AIM_SNAP_MIN_MAGNITUDE = 0.12; // Minimum aim stick magnitude to trigger auto-fire when snapped - very easy

export const WEAPONS: Record<WeaponType, WeaponStats> = {
  [WeaponType.Pistol]: {
    name: WeaponType.Pistol,
    damage: 12, // Reduced for survival mode (was 22)
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
    damage: 10, // Reduced per pellet for survival mode (was 18)
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
    damage: 6, // Reduced for survival mode (was 10)
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
    damage: 50, // Reduced for survival mode (was 90)
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
    damage: 40, // Reduced for survival mode (was 70)
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
    damage: 20, // Reduced for survival mode (was 35)
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
    damage: 14, // Reduced for survival mode (was 26)
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
    damage: 8, // Reduced for survival mode (was 14)
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
    damage: 18, // Reduced for survival mode (was 32)
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
export const LOOT_SPAWN_INTERVAL = 10000; // 10 seconds between loot spawns
export const LOOT_SPAWN_COUNT = 3; // Spawn 3 items at a time
export const MAX_LOOT_ITEMS = 30; // More loot items for better gameplay variety

// Item Drop Rates (must sum to 100)
export const DROP_RATES = {
  Rocket: 4,              // 4% - Rocket Launcher
  SlowTrap: 6,            // 6% - Slow Trap
  Sniper: 6,              // 6% - Sniper Rifle
  AK47: 11,               // 11% - AK47
  Minigun: 4,             // 4% - Minigun
  BurstRifle: 7,          // 7% - Burst Rifle
  Shotgun: 12,            // 12% - Shotgun
  SMG: 12,                // 12% - SMG
  MegaHealth: 9,          // 9% - Mega Health Pack
  Medkit: 20,             // 20% - Regular Medkit
  Shield: 11,             // 11% - Shield/Armor
  Ammo: 4,                // 4% - Ammo
  SpeedBoost: 5,          // 5% - Speed Boost power-up
  InvincibilityShield: 3, // 3% - Invincibility power-up
  DamageBoost: 6          // 6% - Damage Boost power-up
};

// Validation: Drop rates must sum to 100
const dropRateSum = Object.values(DROP_RATES).reduce((sum, rate) => sum + rate, 0);
if (dropRateSum !== 100) {
  console.error(`DROP_RATES sum is ${dropRateSum}, expected 100. Please check constants.ts`);
}

// Nickname validation
export const NICKNAME_REGEX = /^[a-zA-Z0-9_]+$/;
export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 20;

// Health & Regeneration - Survival Mode (30+ seconds TTK)
export const PLAYER_MAX_HP = 300; // Significantly increased for survival gameplay (was 150)
export const HEALTH_REGEN_DELAY = 5000; // 5 seconds after taking damage before regen
export const HEALTH_REGEN_RATE = 2.5; // 2.5 HP per tick for better sustainability
export const MEGA_HEALTH_AMOUNT = 100; // Mega health pack heals 100 HP
export const MEDKIT_HEALTH_AMOUNT = 75; // Regular medkit heals 75 HP

// Bot AI Configuration - Made less powerful for better gameplay balance
export const BOT_MIN_SEPARATION_DISTANCE = 800; // Minimum spawn distance from player
export const BOT_ACCURACY = 0.65; // 65% chance to fire when targeting (reduced from 88%)
export const BOT_LOOT_SEARCH_RADIUS = 700; // Search radius for health/armor when low (reduced)
export const BOT_LEAD_FACTOR = 0.20; // Target leading factor for prediction (reduced from 0.35)
export const BOT_LEAD_MULTIPLIER = 0.0008; // Lead calculation multiplier (reduced from 0.0012)
export const BOT_REACTION_TIME = 300; // ms delay before bot reacts to player (increased for easier gameplay)

// Visual Effects
export const MUZZLE_FLASH_DURATION = 100; // milliseconds
export const DAMAGE_FLASH_DURATION = 200; // milliseconds

// Loot Animation Constants
export const LOOT_BOB_SPEED = 350; // milliseconds for bobbing animation
export const LOOT_PULSE_SPEED = 250; // milliseconds for pulsing
export const LOOT_BOB_AMOUNT = 10; // pixels of vertical movement (increased for visibility)
export const LOOT_PULSE_AMOUNT = 0.35; // scale increase (increased for visibility)
export const LOOT_BASE_SCALE = 1.4; // base scale multiplier (increased for visibility)

// Wall Brick Texture Constants
export const BRICK_WIDTH = 40; // pixels
export const BRICK_HEIGHT = 20; // pixels
export const MORTAR_WIDTH = 3; // pixels

// Network Configuration
export const CONNECTION_TIMEOUT = 10000; // 10 seconds

// Minimap Configuration
export const MINIMAP_SIZE = 75; // Size of minimap in pixels (2x smaller - was 150)
export const MINIMAP_SCALE = MINIMAP_SIZE / MAP_SIZE; // Scale factor for minimap (map to minimap)
export const MINIMAP_ITEM_DETECTION_RANGE = 400; // Range to detect items on minimap scanner
export const MINIMAP_PADDING = 10; // Padding from screen edge

// Slow Trap Configuration
export const SLOW_TRAP_DURATION = 3000; // 3 seconds slow effect
export const SLOW_TRAP_AMOUNT = 0.5; // 50% speed reduction
export const SLOW_TRAP_RADIUS = 80; // Activation radius

// Power-Up Configurations
export const SPEED_BOOST_DURATION = 5000; // 5 seconds speed boost
export const SPEED_BOOST_MULTIPLIER = 1.8; // 80% speed increase
export const INVINCIBILITY_DURATION = 3000; // 3 seconds invincibility
export const DAMAGE_BOOST_DURATION = 8000; // 8 seconds damage boost
export const DAMAGE_BOOST_MULTIPLIER = 1.5; // 50% damage increase

// Camera Perspective (Isometric View)
export const CAMERA_ANGLE = Math.PI / 6; // 30 degrees angle for isometric view
export const CAMERA_OFFSET_Y = -50; // Offset camera upward for better visibility