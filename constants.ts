import { CharacterTemplate, Ability } from './types';

// Arena dimensions
export const ARENA_WIDTH = 1200;
export const ARENA_HEIGHT = 800;
export const ARENA_CENTER = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };

// Maze exploration mode constants
export const MAZE_WIDTH = 80;
export const MAZE_HEIGHT = 80;
export const MAZE_TILE_SIZE = 1;
export const MAZE_SEED = 1337;
export const DARKNESS_RADIUS = 7;
export const WEAPON_LOOT_COUNT = 16;
export const ARMOR_LOOT_COUNT = 14;

// Player constants
export const PLAYER_RADIUS = 25;
export const PLAYER_BASE_SPEED = 300;
export const MAX_VELOCITY = 400;

// Combat constants
export const BASE_ATTACK_COOLDOWN = 0.5;
export const MANA_REGEN_RATE = 20; // per second
export const DAMAGE_FADE_TIME = 2000; // milliseconds

// Character Templates
export const CHARACTERS: Record<string, CharacterTemplate> = {
  knight: {
    id: 'knight',
    name: 'Knight',
    description: 'Tank with defensive abilities',
    maxHealth: 200,
    maxMana: 60,
    manaRegen: 15,
    color: '#4169E1', // Blue
    stats: {
      damage: 60,
      defense: 40,
      attackSpeed: 0.8,
      movementSpeed: 250
    },
    abilities: [
      {
        id: 'shield-bash',
        name: 'Shield Bash',
        description: 'Stun enemy for 1s, deal 40 damage',
        cooldown: 3,
        currentCooldown: 0,
        manaCost: 30,
        damage: 40,
        range: 200
      },
      {
        id: 'slash',
        name: 'Slash',
        description: 'Quick melee attack, deal 50 damage',
        cooldown: 2,
        currentCooldown: 0,
        manaCost: 20,
        damage: 50,
        range: 150
      },
      {
        id: 'barrier',
        name: 'Barrier',
        description: 'Block 50% damage for 3s',
        cooldown: 5,
        currentCooldown: 0,
        manaCost: 40,
        castTime: 0.3
      }
    ],
    ultimate: {
      id: 'holy-ground',
      name: 'Holy Ground',
      description: 'Create protective zone, heal 80 HP over 5s',
      cooldown: 20,
      currentCooldown: 0,
      manaCost: 80,
      range: 300
    },
    dodge: {
      cooldown: 1.5,
      duration: 0.4,
      distance: 250
    }
  },

  mage: {
    id: 'mage',
    name: 'Mage',
    description: 'High damage caster with powerful spells',
    maxHealth: 120,
    maxMana: 150,
    manaRegen: 35,
    color: '#FF69B4', // Hot Pink
    stats: {
      damage: 90,
      defense: 15,
      attackSpeed: 1.2,
      movementSpeed: 320
    },
    abilities: [
      {
        id: 'fireball',
        name: 'Fireball',
        description: 'Launch fireball, deal 70 damage',
        cooldown: 2,
        currentCooldown: 0,
        manaCost: 35,
        damage: 70,
        range: 400
      },
      {
        id: 'ice-bolt',
        name: 'Ice Bolt',
        description: 'Freeze enemy for 2s, deal 40 damage',
        cooldown: 3,
        currentCooldown: 0,
        manaCost: 40,
        damage: 40,
        range: 350
      },
      {
        id: 'teleport',
        name: 'Teleport',
        description: 'Blink to location, avoid damage',
        cooldown: 4,
        currentCooldown: 0,
        manaCost: 50,
        range: 300
      }
    ],
    ultimate: {
      id: 'meteor-storm',
      name: 'Meteor Storm',
      description: 'Rain meteors on enemy, deal 150 total damage',
      cooldown: 25,
      currentCooldown: 0,
      manaCost: 120,
      range: 500
    },
    dodge: {
      cooldown: 2,
      duration: 0.3,
      distance: 300
    }
  },

  ranger: {
    id: 'ranger',
    name: 'Ranger',
    description: 'Agile damage dealer with ranged attacks',
    maxHealth: 140,
    maxMana: 80,
    manaRegen: 25,
    color: '#228B22', // Forest Green
    stats: {
      damage: 75,
      defense: 20,
      attackSpeed: 1.5,
      movementSpeed: 350
    },
    abilities: [
      {
        id: 'arrow-shot',
        name: 'Arrow Shot',
        description: 'Fire arrow, deal 55 damage',
        cooldown: 1.5,
        currentCooldown: 0,
        manaCost: 25,
        damage: 55,
        range: 450
      },
      {
        id: 'multishot',
        name: 'Multishot',
        description: 'Fire 3 arrows, deal 30 damage each',
        cooldown: 4,
        currentCooldown: 0,
        manaCost: 45,
        damage: 30,
        range: 400
      },
      {
        id: 'snare-trap',
        name: 'Snare Trap',
        description: 'Root enemy for 2.5s',
        cooldown: 5,
        currentCooldown: 0,
        manaCost: 35,
        range: 300
      }
    ],
    ultimate: {
      id: 'rapid-fire',
      name: 'Rapid Fire',
      description: 'Barrage of arrows, 100 total damage',
      cooldown: 22,
      currentCooldown: 0,
      manaCost: 100,
      range: 500
    },
    dodge: {
      cooldown: 1.2,
      duration: 0.35,
      distance: 350
    }
  },

  assassin: {
    id: 'assassin',
    name: 'Assassin',
    description: 'High burst damage, glass cannon',
    maxHealth: 100,
    maxMana: 70,
    manaRegen: 30,
    color: '#8B0000', // Dark Red
    stats: {
      damage: 110,
      defense: 10,
      attackSpeed: 1.8,
      movementSpeed: 380
    },
    abilities: [
      {
        id: 'backstab',
        name: 'Backstab',
        description: 'Quick backstab, deal 80 damage',
        cooldown: 1.5,
        currentCooldown: 0,
        manaCost: 30,
        damage: 80,
        range: 200
      },
      {
        id: 'poison-strike',
        name: 'Poison Strike',
        description: 'Deal 50 damage + poison DoT',
        cooldown: 2.5,
        currentCooldown: 0,
        manaCost: 40,
        damage: 50,
        range: 180
      },
      {
        id: 'shadow-clone',
        name: 'Shadow Clone',
        description: 'Create decoy, confuse enemy',
        cooldown: 4,
        currentCooldown: 0,
        manaCost: 45,
        range: 250
      }
    ],
    ultimate: {
      id: 'death-mark',
      name: 'Death Mark',
      description: 'Mark enemy for execution, 200 damage if health < 30%',
      cooldown: 25,
      currentCooldown: 0,
      manaCost: 90,
      range: 300
    },
    dodge: {
      cooldown: 0.8,
      duration: 0.35,
      distance: 350
    }
  }
};

// UI Colors
export const UI_COLORS = {
  primary: '#4169E1',
  secondary: '#FF69B4',
  success: '#00FF88',
  danger: '#FF0055',
  warning: '#FFD700',
  background: '#0a0e27',
  border: '#333366',
  text: '#FFFFFF'
};

// Game balance
export const DODGE_INVULNERABILITY_DURATION = 0.4; // seconds
export const MIN_DODGE_DISTANCE = 150;
export const MAX_DODGE_DISTANCE = 350;
export const ABILITY_CAST_TIME = 0.2; // seconds
