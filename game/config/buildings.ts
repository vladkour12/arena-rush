export type BuildingType = 'castle' | 'barracks' | 'tower' | 'house' | 'fort' | 'workshop';

export interface BuildingConfig {
  type: BuildingType;
  label: string;
  woodCost: number;
  hp: number;
  width: number;   // tile width
  height: number;  // tile height
  attackRange?: number; // px — towers only
  attackDamage?: number;
  attackRate?: number;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  /** How much this building adds to population cap when built */
  popCap: number;
  /** How much population this building itself "uses" (workers/garrison) */
  popCost: number;
}

/** Starting population cap from the castle */
export const BASE_POP_CAP = 5;

export const BUILDING_CONFIGS: Record<BuildingType, BuildingConfig> = {
  castle: {
    type: 'castle',
    label: 'Castle',
    woodCost: 0,
    hp: 1000,
    width: 4,
    height: 4,
    frameWidth: 256,
    frameHeight: 256,
    frames: 1,
    popCap: 0,   // base cap comes from BASE_POP_CAP
    popCost: 0,
  },
  barracks: {
    type: 'barracks',
    label: 'Barracks',
    woodCost: 60,
    hp: 200,
    width: 1,
    height: 1,
    frameWidth: 128,
    frameHeight: 128,
    frames: 1,
    popCap: 0,   // enables training, no extra cap
    popCost: 0,
  },
  tower: {
    type: 'tower',
    label: 'Tower',
    woodCost: 90,
    hp: 150,
    width: 1,
    height: 1,
    attackRange: 180,
    attackDamage: 25,
    attackRate: 0.5,
    frameWidth: 64,
    frameHeight: 128,
    frames: 1,
    popCap: 0,
    popCost: 0,
  },
  house: {
    type: 'house',
    label: 'House',
    woodCost: 40,
    hp: 100,
    width: 1,
    height: 1,
    frameWidth: 128,
    frameHeight: 128,
    frames: 1,
    popCap: 4,   // each house adds 4 pop cap
    popCost: 0,
  },
  fort: {
    type: 'fort',
    label: 'Fort',
    woodCost: 140,
    hp: 360,
    width: 1,
    height: 1,
    attackRange: 210,
    attackDamage: 34,
    attackRate: 0.7,
    frameWidth: 64,
    frameHeight: 128,
    frames: 1,
    popCap: 0,
    popCost: 0,
  },
  workshop: {
    type: 'workshop',
    label: 'Workshop',
    woodCost: 80,
    hp: 180,
    width: 1,
    height: 1,
    frameWidth: 128,
    frameHeight: 128,
    frames: 1,
    popCap: 0,
    popCost: 0,
  },
};
