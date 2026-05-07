export const MAP_WIDTH = 2880;
export const MAP_HEIGHT = 1920;
export const TILE_SIZE = 64;

export interface Wall { x: number; y: number; w: number; h: number; }
export interface Spawn { x: number; y: number; }
export interface PickupSpawn { id: number; kind: string; x: number; y: number; }
export interface DecorItem { kind: 'pad' | 'mark'; x: number; y: number; }

const W = MAP_WIDTH;
const H = MAP_HEIGHT;

export const WALLS: Wall[] = [
  { x: -32,    y: -32,   w: W + 64, h: 32 },
  { x: -32,    y: H,     w: W + 64, h: 32 },
  { x: -32,    y: -32,   w: 32,     h: H + 64 },
  { x: W,      y: -32,   w: 32,     h: H + 64 },

  { x: 256,           y: 256,           w: 224, h: 64 },
  { x: W - 256 - 224, y: H - 256 - 64,  w: 224, h: 64 },

  { x: 480,             y: 528,            w: 320, h: 64 },
  { x: W - 480 - 320,   y: 528,            w: 320, h: 64 },
  { x: 480,             y: H - 528 - 64,   w: 320, h: 64 },
  { x: W - 480 - 320,   y: H - 528 - 64,   w: 320, h: 64 },

  { x: 832,             y: 768,  w: 64,  h: 384 },
  { x: W - 832 - 64,    y: 768,  w: 64,  h: 384 },

  { x: W / 2 - 480 - 192, y: H / 2 - 32, w: 192, h: 64 },
  { x: W / 2 + 480,       y: H / 2 - 32, w: 192, h: 64 },

  { x: W / 2 - 32, y: H / 2 - 480 - 192, w: 64, h: 192 },
  { x: W / 2 - 32, y: H / 2 + 480,       w: 64, h: 192 },

  { x: 1056, y: 320, w: 64, h: 192 },
  { x: W - 1056 - 64, y: H - 320 - 192, w: 64, h: 192 },

  { x: W / 2 - 112, y: H / 2 - 112, w: 224, h: 224 },
];

export const PICKUP_SPAWNS: PickupSpawn[] = [
  { id: 1, kind: 'shotgun', x: W / 2,       y: 384 },
  { id: 2, kind: 'sniper',  x: W / 2,       y: H - 384 },
  { id: 3, kind: 'smg',     x: W / 2 - 768, y: H / 2 },
];

export const DECOR: DecorItem[] = [
  { kind: 'pad', x: W / 2,       y: 384 },
  { kind: 'pad', x: W / 2,       y: H - 384 },
  { kind: 'pad', x: W / 2 - 768, y: H / 2 },
  { kind: 'mark', x: W / 4,    y: H / 2 },
  { kind: 'mark', x: W * 0.75, y: H / 2 },
];
