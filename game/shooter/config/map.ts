export const MAP_WIDTH = 2880;
export const MAP_HEIGHT = 1920;
export const TILE_SIZE = 64;

export interface Wall { x: number; y: number; w: number; h: number; }
export interface Spawn { x: number; y: number; }
export interface PickupSpawn { id: number; kind: string; x: number; y: number; }

const W = MAP_WIDTH;
const H = MAP_HEIGHT;

export const WALLS: Wall[] = [
  { x: -32, y: -32, w: W + 64, h: 32 },
  { x: -32, y: H, w: W + 64, h: 32 },
  { x: -32, y: -32, w: 32, h: H + 64 },
  { x: W,   y: -32, w: 32, h: H + 64 },

  { x: 384,             y: 320,           w: 320, h: 64 },
  { x: W - 384 - 320,   y: 320,           w: 320, h: 64 },
  { x: 384,             y: H - 320 - 64,  w: 320, h: 64 },
  { x: W - 384 - 320,   y: H - 320 - 64,  w: 320, h: 64 },

  { x: 640,           y: 768, w: 64, h: 384 },
  { x: W - 640 - 64,  y: 768, w: 64, h: 384 },

  { x: W / 2 - 384 - 192, y: H / 2 - 32, w: 192, h: 64 },
  { x: W / 2 + 384,       y: H / 2 - 32, w: 192, h: 64 },

  { x: W / 2 - 32, y: H / 2 - 384 - 192, w: 64, h: 192 },
  { x: W / 2 - 32, y: H / 2 + 384,       w: 64, h: 192 },

  { x: W / 2 - 96, y: H / 2 - 96, w: 192, h: 192 },
];

export const PICKUP_SPAWNS: PickupSpawn[] = [
  { id: 1, kind: 'shotgun', x: W / 2,        y: 384 },
  { id: 2, kind: 'sniper',  x: W / 2,        y: H - 384 },
  { id: 3, kind: 'smg',     x: W / 2 - 640,  y: H / 2 },
];
