export type Vector2 = { x: number; y: number };

export type InputState = {
  /** Normalized movement input in world axes (WASD / left stick). */
  move: Vector2;
  /** Normalized aim input in world axes (right stick fallback). */
  aim: Vector2;
  /** Sprint intent (Shift / sprint button). */
  sprint: boolean;
  /** Dash intent (dash button). */
  dash: boolean;
  /** Primary fire (mouse / touch button). */
  fire: boolean;
  /** Pointer position in screen pixels (mouse aim). */
  pointer: Vector2;
  /** When true, aim is derived from `pointer` instead of `aim` stick. */
  isPointerAiming: boolean;
};

export enum WeaponType {
  Pistol = 'Pistol',
  Shotgun = 'Shotgun',
  SMG = 'SMG',
  Sniper = 'Sniper',
  Rocket = 'Rocket',
  Knife = 'Knife',
  AK47 = 'AK47',
  Minigun = 'Minigun',
  BurstRifle = 'BurstRifle'
}

export enum ItemType {
  Medkit = 'Medkit',
  Shield = 'Shield',
  Ammo = 'Ammo',
  Weapon = 'Weapon',
  SlowTrap = 'SlowTrap',
  MegaHealth = 'MegaHealth',
  SpeedBoost = 'SpeedBoost', // Temporary speed increase
  InvincibilityShield = 'InvincibilityShield', // Brief invincibility
  DamageBoost = 'DamageBoost' // Temporary damage multiplier
}

export enum SkinType {
  Police = 'Police',
  Terrorist = 'Terrorist',
  Homeless = 'Homeless'
}

export interface WeaponStats {
  name: WeaponType;
  damage: number;
  fireRate: number; // ms between shots
  clipSize: number;
  reloadTime: number; // ms
  range: number;
  speed: number;
  spread: number;
  color: string;
}

export interface Entity {
  id: string;
  position: Vector2;
  radius: number;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  armor: number;
  velocity: Vector2;
  angle: number;
  weapon: WeaponType;
  ammo: number;
  isReloading: boolean;
  reloadTimer: number;
  lastFired: number;
  speedMultiplier: number;
  invulnerable: number; // time left
  isBot: boolean;
  skin: SkinType; // Character skin
  
  // Sprint
  sprintTime: number; // Remaining sprint duration
  sprintCooldown: number; // Remaining cooldown
  
  // Dash
  dashTime: number; // Remaining dash duration
  dashCooldown: number; // Remaining cooldown

  // Health Regen
  lastDamageTime: number;
  regenTimer: number;

  // Slow effect from traps
  slowedUntil: number; // timestamp when slow effect ends
  slowAmount: number; // multiplier for speed reduction
  
  // Power-ups
  speedBoostUntil: number; // timestamp when speed boost ends
  damageBoostUntil: number; // timestamp when damage boost ends
}

export interface Bullet extends Entity {
  ownerId: string;
  velocity: Vector2;
  damage: number;
  rangeRemaining: number;
  color: string;
}

export interface LootItem extends Entity {
  type: ItemType;
  weaponType?: WeaponType; // Only if type is Weapon
  value: number; // HP amount, or ammo amount
  slowAmount?: number; // Only for SlowTrap - percentage to slow (0-1)
  slowDuration?: number; // Only for SlowTrap - duration in ms
}

export interface Wall extends Entity {
  width: number;
  height: number;
  isCircular?: boolean; // If true, treat as circular obstacle using radius
}

// Networking Types

export enum NetworkMsgType {
  Init = 'Init',
  Input = 'Input',
  State = 'State',
  GameOver = 'GameOver',
  Ping = 'Ping'
}

export interface NetworkMessage {
  type: NetworkMsgType;
  payload: any;
  timestamp: number;
}

export interface InitPackage {
  walls: Wall[];
  playerStart: Vector2;
  enemyStart: Vector2;
  seed: number;
}

export interface InputPackage {
  move: Vector2;
  aim: Vector2;
  sprint: boolean;
  fire: boolean;
  angle: number; // Client sends their angle since they control aim locally
}

export interface StatePackage {
  players: Player[]; // [0] is host, [1] is client
  bullets: Bullet[];
  loot: LootItem[];
  zoneRadius: number;
  timeRemaining: number;
}

// Player Statistics and Profile
export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
  damageDealt: number;
  damageReceived: number;
  itemsCollected: number;
  playTime: number; // in seconds
}

export interface PlayerProfile {
  nickname: string;
  stats: PlayerStats;
  botStats: PlayerStats; // Separate stats for games against bots
  pvpStats: PlayerStats; // Separate stats for games against real players
  lastPlayed: number; // timestamp
}

export interface LeaderboardEntry {
  nickname: string;
  wins: number;
  kills: number;
  gamesPlayed: number;
  winRate: number;
  isBot?: boolean; // For bot leaderboard
}