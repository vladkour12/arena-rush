/** Tile size in pixels */
export const TILE_SIZE = 64;

/** Map dimensions in tiles */
export const MAP_COLS = 40;
export const MAP_ROWS = 20;

/** Pixel dimensions */
export const MAP_W = MAP_COLS * TILE_SIZE;   // 2560
export const MAP_H = MAP_ROWS * TILE_SIZE;   // 1280

/** Island layout — tile x ranges */
export const P1_ISLAND_X1 = 0;
export const P1_ISLAND_X2 = 13;   // inclusive
export const WATER_X1 = 14;
export const WATER_X2 = 25;
export const P2_ISLAND_X1 = 26;
export const P2_ISLAND_X2 = MAP_COLS - 1;

/** Bridge column span (fills water gap) */
export const BRIDGE_Y_ROW = 10;   // tile row where bridge sits (center)
export const BRIDGE_X1 = WATER_X1;
export const BRIDGE_X2 = WATER_X2;

/** Castle spawn positions (tile coords, top-left of 4×4 building) */
export const P1_CASTLE_TX = 1;
export const P1_CASTLE_TY = 8;
export const P2_CASTLE_TX = 33;
export const P2_CASTLE_TY = 8;

/** Unit spawn points (px) */
export const P1_SPAWN_X = (P1_CASTLE_TX + 2) * TILE_SIZE;
export const P1_SPAWN_Y = (P1_CASTLE_TY + 4) * TILE_SIZE;
export const P2_SPAWN_X = (P2_CASTLE_TX + 2) * TILE_SIZE;
export const P2_SPAWN_Y = (P2_CASTLE_TY + 4) * TILE_SIZE;

/** Resource positions on P1 island (tile coords) */
export const P1_RESOURCES = [
  { type: 'tree' as const,     tx: 8,  ty: 3  },
  { type: 'tree' as const,     tx: 10, ty: 4  },
  { type: 'tree' as const,     tx: 6,  ty: 14 },
  { type: 'goldmine' as const, tx: 11, ty: 12 },
  { type: 'goldmine' as const, tx: 5,  ty: 6  },
];

/** Resource positions on P2 island (mirrored) */
export const P2_RESOURCES = P1_RESOURCES.map(r => ({
  ...r,
  tx: MAP_COLS - 1 - r.tx,
}));

/** Game timing */
export const GAME_DURATION_SECS = 600;     // 10 min
export const BRIDGE_OPEN_SECS = 300;       // 5 min
export const BASE_GOLD_PER_SEC = 5;
export const BASE_WOOD_PER_SEC = 3;
export const MINE_GOLD_BONUS = 3;
export const TREE_WOOD_BONUS = 2;

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
