/** Tile size in pixels */
export const TILE_SIZE = 64;

/** Map dimensions in tiles */
export const MAP_COLS = 160;
export const MAP_ROWS = 96;

/** Pixel dimensions */
export const MAP_W = MAP_COLS * TILE_SIZE;
export const MAP_H = MAP_ROWS * TILE_SIZE;

/** Island layout — larger islands with sea on all sides */
export const SEA_MARGIN_X = 16;
export const ISLAND_WIDTH = 40;

export const P1_ISLAND_X1 = SEA_MARGIN_X;
export const P1_ISLAND_X2 = P1_ISLAND_X1 + ISLAND_WIDTH - 1;
export const P2_ISLAND_X2 = MAP_COLS - SEA_MARGIN_X - 1;
export const P2_ISLAND_X1 = P2_ISLAND_X2 - ISLAND_WIDTH + 1;

/** Open sea between islands */
export const WATER_X1 = P1_ISLAND_X2 + 1;
export const WATER_X2 = P2_ISLAND_X1 - 1;
export const WATER_GAP_COLS = WATER_X2 - WATER_X1 + 1;

/** Time when drifting islands finish connecting and war can begin */
export const ISLAND_COLLIDE_SECS = 240;

/** Castle spawn positions (tile coords, top-left of 4×4 building) */
export const P1_CASTLE_TX = P1_ISLAND_X2 - 11;
export const P1_CASTLE_TY = Math.floor(MAP_ROWS / 2) - 2;
export const P2_CASTLE_TX = P2_ISLAND_X1 + 8;
export const P2_CASTLE_TY = P1_CASTLE_TY;

/** Unit spawn points (px) */
export const P1_SPAWN_X = (P1_CASTLE_TX + 2) * TILE_SIZE;
export const P1_SPAWN_Y = (P1_CASTLE_TY + 4) * TILE_SIZE;
export const P2_SPAWN_X = (P2_CASTLE_TX + 2) * TILE_SIZE;
export const P2_SPAWN_Y = (P2_CASTLE_TY + 4) * TILE_SIZE;

/** Resource positions on P1 island (tile coords, relative to wider island) */
const P1_RESOURCE_TEMPLATE = [
  { type: 'tree' as const,     dx: 8,  ty: 18 },
  { type: 'tree' as const,     dx: 14, ty: 26 },
  { type: 'tree' as const,     dx: 24, ty: 30 },
  { type: 'tree' as const,     dx: 10, ty: 52 },
  { type: 'tree' as const,     dx: 28, ty: 60 },
  { type: 'tree' as const,     dx: 18, ty: 72 },
  { type: 'goldmine' as const, dx: 26, ty: 22 },
  { type: 'goldmine' as const, dx: 30, ty: 40 },
  { type: 'goldmine' as const, dx: 20, ty: 50 },
  { type: 'goldmine' as const, dx: 12, ty: 36 },
];

export const P1_RESOURCES = P1_RESOURCE_TEMPLATE.map((r) => ({
  type: r.type,
  tx: P1_ISLAND_X1 + r.dx,
  ty: r.ty,
}));

/** Resource positions on P2 island (mirrored) */
export const P2_RESOURCES = P1_RESOURCES.map(r => ({
  ...r,
  tx: MAP_COLS - 1 - r.tx,
}));

/** Game timing */
export const GAME_DURATION_SECS = 480;     // 8 min
export const BASE_GOLD_PER_SEC = 8;
export const BASE_WOOD_PER_SEC = 5;
export const MINE_GOLD_BONUS = 4;
export const TREE_WOOD_BONUS = 3;

/** Tileset — Tilemap_Flat.png is 320×320, 5×5 tiles of 64px each */
export const TILESET_COLS = 5;

/** Tile indices in Tilemap_Flat.png spritesheet (row*5+col) */
export const TILE_GRASS = 12;   // center tile
export const TILE_WATER = 0;    // use Water.png separately
export const TILE_SAND  = 17;   // edge of island

/** Arena map */
export const ARENA_COLS = 20;
export const ARENA_ROWS = 15;
export const ARENA_W = ARENA_COLS * TILE_SIZE;
export const ARENA_H = ARENA_ROWS * TILE_SIZE;
export const ARENA_P1_CASTLE_TX = 1;
export const ARENA_P1_CASTLE_TY = 5;
export const ARENA_P2_CASTLE_TX = 15;
export const ARENA_P2_CASTLE_TY = 5;
