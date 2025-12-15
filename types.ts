export type Vector2 = { x: number; y: number };

export type InputState = {
  /** Normalized movement input in world axes (WASD / left stick). */
  move: Vector2;
  /** Normalized aim input in world axes (right stick fallback). */
  aim: Vector2;
  /** Sprint intent (Shift / sprint button). */
  sprint: boolean;
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
  Weapon = 'Weapon'
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
  
  // Sprint
  sprintTime: number; // Remaining sprint duration
  sprintCooldown: number; // Remaining cooldown

  // Health Regen
  lastDamageTime: number;
  regenTimer: number;
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
}

export interface Wall extends Entity {
  width: number;
  height: number;
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