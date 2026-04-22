/** Tile size in pixels */
export const TILE_SIZE = 64;

/** Map dimensions in tiles */
export const MAP_COLS = 52;
export const MAP_ROWS = 28;

/** Pixel dimensions */
export const MAP_W = MAP_COLS * TILE_SIZE;   // 3328
export const MAP_H = MAP_ROWS * TILE_SIZE;   // 1792

/** Island layout — tile x ranges */
export const P1_ISLAND_X1 = 0;
export const P1_ISLAND_X2 = 17;   // inclusive
export const WATER_X1 = 18;
export const WATER_X2 = 33;
export const P2_ISLAND_X1 = 34;
export const P2_ISLAND_X2 = MAP_COLS - 1;

/** Bridge column span (fills water gap) */
export const BRIDGE_Y_ROW = 14;   // tile row where bridge sits (center)
export const BRIDGE_X1 = WATER_X1;
export const BRIDGE_X2 = WATER_X2;

/** Castle spawn positions (tile coords, top-left of 4×4 building) */
export const P1_CASTLE_TX = 3;
export const P1_CASTLE_TY = 12;
export const P2_CASTLE_TX = 45;
export const P2_CASTLE_TY = 12;

/** Unit spawn points (px) */
export const P1_SPAWN_X = (P1_CASTLE_TX + 2) * TILE_SIZE;
export const P1_SPAWN_Y = (P1_CASTLE_TY + 4) * TILE_SIZE;
export const P2_SPAWN_X = (P2_CASTLE_TX + 2) * TILE_SIZE;
export const P2_SPAWN_Y = (P2_CASTLE_TY + 4) * TILE_SIZE;

/** Resource positions on P1 island (tile coords) */
export const P1_RESOURCES = [
  { type: 'tree' as const,     tx: 9,  ty: 4  },
  { type: 'tree' as const,     tx: 13, ty: 6  },
  { type: 'tree' as const,     tx: 8,  ty: 11 },
  { type: 'tree' as const,     tx: 12, ty: 20 },
  { type: 'tree' as const,     tx: 6,  ty: 23 },
  { type: 'goldmine' as const, tx: 15, ty: 10 },
  { type: 'goldmine' as const, tx: 11, ty: 15 },
  { type: 'goldmine' as const, tx: 7,  ty: 18 },
];

/** Resource positions on P2 island (mirrored) */
export const P2_RESOURCES = P1_RESOURCES.map(r => ({
  ...r,
  tx: MAP_COLS - 1 - r.tx,
}));

/** Game timing */
export const GAME_DURATION_SECS = 480;     // 8 min
export const BRIDGE_OPEN_SECS = 240;       // 4 min
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
