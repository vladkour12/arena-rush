export type UnitType = 'warrior' | 'archer' | 'monk' | 'pawn';
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
    speed: 65,
    attackRate: 1.2,
    trainTime: 3000,
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
    damage: 35,
    range: 160,
    speed: 55,
    attackRate: 0.8,
    trainTime: 4000,
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
    speed: 50,
    attackRate: 0,
    trainTime: 5000,
    healRate: 8,
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
    speed: 60,
    attackRate: 1.0,
    trainTime: 2000,
    frameWidth: 192,
    frameHeight: 192,
    idleFrames: 6,
    runFrames: 8,
    attackFrames: 6,
    deadFrames: 4,
  },
};

export const TRAIN_QUEUE_MAX = 5;
