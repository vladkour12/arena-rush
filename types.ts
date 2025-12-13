export type Vector2 = { x: number; y: number };

export type InputState = {
  /** Normalized movement input in world axes (WASD / left stick). */
  move: Vector2;
  /** Normalized aim input in world axes (right stick fallback). */
  aim: Vector2;
  /** Sprint intent (Shift / sprint button). */
  sprint: boolean;

  /**
   * Optional desktop fields (unused in mobile build).
   * Kept optional to avoid coupling input shape to a specific platform.
   */
  fire?: boolean;
  pointer?: Vector2;
  isPointerAiming?: boolean;
};

export enum WeaponType {
  Pistol = 'Pistol',
  Shotgun = 'Shotgun',
  SMG = 'SMG',
  Sniper = 'Sniper',
  Rocket = 'Rocket',
  Knife = 'Knife'
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