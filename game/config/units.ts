export type UnitType = 'warrior' | 'archer' | 'monk' | 'pawn' | 'knight' | 'slinger';
export type Faction = 'blue' | 'red';

export interface UnitConfig {
  type: UnitType;
  label: string;
  goldCost: number;
  hp: number;
  damage: number;
  range: number;       // px — 0 means melee (≤ 48px)
  speed: number;       // px/sec
  attackRate: number;  // attacks per second
  trainTime: number;   // ms
  healRate?: number;   // hp/sec for monks
  frameWidth: number;
  frameHeight: number;
  idleFrames: number;
  runFrames: number;
  attackFrames: number;
  deadFrames: number;
}

export const UNIT_CONFIGS: Record<UnitType, UnitConfig> = {
  warrior: {
    type: 'warrior',
    label: 'Warrior',
    goldCost: 25,
    hp: 120,
    damage: 20,
    range: 0,
    speed: 82,
    attackRate: 1.35,
    trainTime: 2200,
    frameWidth: 192,
    frameHeight: 192,
    idleFrames: 6,
    runFrames: 8,
    attackFrames: 4,
    deadFrames: 4,
  },
  archer: {
    type: 'archer',
    label: 'Archer',
    goldCost: 40,
    hp: 70,
    damage: 42,
    range: 184,
    speed: 64,
    attackRate: 0.82,
    trainTime: 3000,
    frameWidth: 192,
    frameHeight: 192,
    idleFrames: 6,
    runFrames: 8,
    attackFrames: 12,
    deadFrames: 4,
  },
  monk: {
    type: 'monk',
    label: 'Monk',
    goldCost: 55,
    hp: 80,
    damage: 0,
    range: 120,
    speed: 64,
    attackRate: 0,
    trainTime: 3200,
    healRate: 10,
    frameWidth: 192,
    frameHeight: 192,
    idleFrames: 6,
    runFrames: 8,
    attackFrames: 8,
    deadFrames: 4,
  },
  pawn: {
    type: 'pawn',
    label: 'Pawn',
    goldCost: 10,
    hp: 50,
    damage: 5,
    range: 0,
    speed: 78,
    attackRate: 1.15,
    trainTime: 1500,
    frameWidth: 192,
    frameHeight: 192,
    idleFrames: 6,
    runFrames: 8,
    attackFrames: 6,
    deadFrames: 4,
  },
  knight: {
    type: 'knight',
    label: 'Knight',
    goldCost: 48,
    hp: 180,
    damage: 28,
    range: 0,
    speed: 74,
    attackRate: 1.1,
    trainTime: 3200,
    frameWidth: 192,
    frameHeight: 192,
    idleFrames: 6,
    runFrames: 8,
    attackFrames: 4,
    deadFrames: 4,
  },
  slinger: {
    type: 'slinger',
    label: 'Slinger',
    goldCost: 32,
    hp: 62,
    damage: 14,
    range: 112,
    speed: 84,
    attackRate: 1.55,
    trainTime: 1900,
    frameWidth: 192,
    frameHeight: 192,
    idleFrames: 6,
    runFrames: 8,
    attackFrames: 6,
    deadFrames: 4,
  },
};

export const TRAIN_QUEUE_MAX = 15;
