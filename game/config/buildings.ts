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
}

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
  },
  barracks: {
    type: 'barracks',
    label: 'Barracks',
    woodCost: 50,
    hp: 200,
    width: 1,
    height: 1,
    frameWidth: 128,
    frameHeight: 128,
    frames: 1,
  },
  tower: {
    type: 'tower',
    label: 'Tower',
    woodCost: 75,
    hp: 150,
    width: 1,
    height: 1,
    attackRange: 180,
    attackDamage: 25,
    attackRate: 0.5,
    frameWidth: 64,
    frameHeight: 128,
    frames: 1,
  },
  house: {
    type: 'house',
    label: 'House',
    woodCost: 30,
    hp: 100,
    width: 1,
    height: 1,
    frameWidth: 128,
    frameHeight: 128,
    frames: 1,
  },
  fort: {
    type: 'fort',
    label: 'Fort',
    woodCost: 120,
    hp: 360,
    width: 1,
    height: 1,
    attackRange: 210,
    attackDamage: 34,
    attackRate: 0.7,
    frameWidth: 64,
    frameHeight: 128,
    frames: 1,
  },
  workshop: {
    type: 'workshop',
    label: 'Workshop',
    woodCost: 65,
    hp: 180,
    width: 1,
    height: 1,
    frameWidth: 128,
    frameHeight: 128,
    frames: 1,
  },
};
