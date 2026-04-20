export type Vector2 = {
  x: number;
  y: number;
};

export type GameState = 'menu' | 'character-select' | 'arena' | 'game-over';

export interface Ability {
  id: string;
  name: string;
  description: string;
  cooldown: number;
  currentCooldown: number;
  manaCost: number;
  damage?: number;
  range?: number;
  castTime?: number;
}

export interface CharacterTemplate {
  id: string;
  name: string;
  description: string;
  maxHealth: number;
  maxMana: number;
  manaRegen: number;
  abilities: Ability[];
  ultimate: Ability;
  dodge: {
    cooldown: number;
    duration: number;
    distance: number;
  };
  color: string;
  stats: {
    damage: number;
    defense: number;
    attackSpeed: number;
    movementSpeed: number;
  };
}

export interface Player {
  playerNumber: 1 | 2;
  position: Vector2;
  velocity: Vector2;
  angle: number;
  health: number;
  mana: number;
  dodging: boolean;
  dodgeEndTime: number;
}

export interface Projectile {
  id: string;
  position: Vector2;
  velocity: Vector2;
  ownerPlayerNumber: 1 | 2;
  damage: number;
  radius: number;
  maxDistance: number;
  distanceTraveled: number;
  type: 'fireball' | 'lightning' | 'ice' | 'projectile' | 'slash';
  lifetime: number;
  createdAt: number;
}

export interface GameStats {
  player1Kills: number;
  player2Kills: number;
  player1Damage: number;
  player2Damage: number;
  duration: number;
}
