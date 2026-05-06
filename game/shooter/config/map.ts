export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 1280;
export const TILE_SIZE = 64;

export interface Wall { x: number; y: number; w: number; h: number; }
export interface Spawn { x: number; y: number; }
export interface PickupSpawn { id: number; kind: string; x: number; y: number; }

export const WALLS: Wall[] = [
  { x: -32, y: -32, w: MAP_WIDTH + 64, h: 32 },
  { x: -32, y: MAP_HEIGHT, w: MAP_WIDTH + 64, h: 32 },
  { x: -32, y: -32, w: 32, h: MAP_HEIGHT + 64 },
  { x: MAP_WIDTH, y: -32, w: 32, h: MAP_HEIGHT + 64 },
  { x: 320,  y: 480, w: 192, h: 64 },
  { x: MAP_WIDTH - 320 - 192, y: 480, w: 192, h: 64 },
  { x: 320,  y: MAP_HEIGHT - 480 - 64, w: 192, h: 64 },
  { x: MAP_WIDTH - 320 - 192, y: MAP_HEIGHT - 480 - 64, w: 192, h: 64 },
  { x: MAP_WIDTH / 2 - 64, y: MAP_HEIGHT / 2 - 64, w: 128, h: 128 },
];

export const PICKUP_SPAWNS: PickupSpawn[] = [
  { id: 1, kind: 'shotgun', x: MAP_WIDTH / 2, y: 192 },
  { id: 2, kind: 'sniper',  x: MAP_WIDTH / 2, y: MAP_HEIGHT - 192 },
  { id: 3, kind: 'smg',     x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 + 256 },
];
