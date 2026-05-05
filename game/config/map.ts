/** Tile size in pixels */
export const TILE_SIZE = 64;

/** Map dimensions in tiles — single large world map */
export const MAP_COLS = 160;
export const MAP_ROWS = 96;

/** Pixel dimensions */
export const MAP_W = MAP_COLS * TILE_SIZE;
export const MAP_H = MAP_ROWS * TILE_SIZE;

/** Castle spawn positions — P1 in NW, P2 in SE */
export const P1_CASTLE_TX = 20;
export const P1_CASTLE_TY = 16;
export const P2_CASTLE_TX = 130;
export const P2_CASTLE_TY = 72;

/** Unit spawn points (px) */
export const P1_SPAWN_X = (P1_CASTLE_TX + 2) * TILE_SIZE;
export const P1_SPAWN_Y = (P1_CASTLE_TY + 4) * TILE_SIZE;
export const P2_SPAWN_X = (P2_CASTLE_TX + 2) * TILE_SIZE;
export const P2_SPAWN_Y = (P2_CASTLE_TY + 4) * TILE_SIZE;

/** Resource positions — western half for P1, eastern half for P2 */
export const P1_RESOURCES: Array<{ type: 'goldmine' | 'tree'; tx: number; ty: number }> = [
  // ── Gold Mines (6) ──────────────────────────────────────────────────────
  { type: 'goldmine', tx: 30, ty: 24 },
  { type: 'goldmine', tx: 48, ty: 52 },
  { type: 'goldmine', tx: 22, ty: 68 },
  { type: 'goldmine', tx: 58, ty: 35 },
  { type: 'goldmine', tx: 35, ty: 80 },
  { type: 'goldmine', tx: 62, ty: 70 },
  // ── Forest Trees (20) ───────────────────────────────────────────────────
  { type: 'tree', tx: 12, ty: 14 },
  { type: 'tree', tx: 18, ty: 18 },
  { type: 'tree', tx: 28, ty: 14 },
  { type: 'tree', tx: 22, ty: 12 },
  { type: 'tree', tx: 35, ty: 16 },
  { type: 'tree', tx: 11, ty: 32 },
  { type: 'tree', tx: 10, ty: 48 },
  { type: 'tree', tx: 12, ty: 62 },
  { type: 'tree', tx: 11, ty: 76 },
  { type: 'tree', tx: 68, ty: 28 },
  { type: 'tree', tx: 70, ty: 42 },
  { type: 'tree', tx: 67, ty: 56 },
  { type: 'tree', tx: 69, ty: 72 },
  { type: 'tree', tx: 18, ty: 78 },
  { type: 'tree', tx: 28, ty: 82 },
  { type: 'tree', tx: 42, ty: 80 },
  { type: 'tree', tx: 52, ty: 76 },
  { type: 'tree', tx: 62, ty: 82 },
  { type: 'tree', tx: 40, ty: 35 },
  { type: 'tree', tx: 55, ty: 45 },
];

/** Resource positions on P2 side (mirrored east half) */
export const P2_RESOURCES: Array<{ type: 'goldmine' | 'tree'; tx: number; ty: number }> = P1_RESOURCES.map(r => ({
  type: r.type,
  tx: MAP_COLS - 1 - r.tx,
  ty: r.ty,
}));

/** Game timing */
export type MatchStageId = 'economy' | 'prepare' | 'war';

export const STAGE_ECONOMY_DURATION_SECS = 600; // 10 min: gather, build, expand
export const STAGE_PREPARE_DURATION_SECS = 600; // 10 min: scout, stage, reinforce
export const STAGE_WAR_DURATION_SECS = 600;     // 10 min: full war
export const GAME_DURATION_SECS =
  STAGE_ECONOMY_DURATION_SECS +
  STAGE_PREPARE_DURATION_SECS +
  STAGE_WAR_DURATION_SECS;
/** Pre-war phases combined: economy + preparation. */
export const PREP_DURATION_SECS = STAGE_ECONOMY_DURATION_SECS + STAGE_PREPARE_DURATION_SECS;
/** Light background income from taxes/foraging so stalled openings can recover. */
export const BASE_GOLD_PER_SEC = 1;
/** Wood must come from workers and economy buildings, not passive map ownership. */
export const BASE_WOOD_PER_SEC = 0;
/** Worker harvest yields per completed gather cycle. */
export const MINE_GOLD_BONUS = 10;
export const TREE_WOOD_BONUS = 8;
/** Harvestable tree target per side = base tree anchors * multiplier. */
export const RESOURCE_TREE_MULTIPLIER = 18;
/** Decorative world-tree density scalar (lower = fewer non-harvestable trees). */
export const DECORATIVE_TREE_DENSITY_SCALE = 0.06;
/** Midline X (in pixels) — neutral zone separating P1 (west) from P2 (east). */
export const MIDLINE_X = MAP_W * 0.5;
/** Stage 1 territory edges — armies stay home while the economy develops. */
export const P1_TERRITORY_MAX_X = MAP_W * 0.46;
export const P2_TERRITORY_MIN_X = MAP_W * 0.54;
/** Stage 2 forward line — armies may stage near mid without entering enemy land. */
export const P1_STAGING_MAX_X = MAP_W * 0.495;
export const P2_STAGING_MIN_X = MAP_W * 0.505;

/** Tileset — Tilemap_Flat.png is 320×320, 5×5 tiles of 64px each */
export const TILESET_COLS = 5;

/** Tile indices in Tilemap_Flat.png spritesheet (row*5+col) */
export const TILE_GRASS = 12;   // center tile
export const TILE_WATER = 0;    // use Water.png separately
export const TILE_SAND  = 17;   // edge of island

// ── Hill / decoration tunables (tilemap redesign 2026-05-04) ─────────────
export const HILL_SEED_DENSITY       = 1 / 144;   // seeds per tile²
export const HILL_BLOB_MIN           = 6;
export const HILL_BLOB_MAX           = 18;
export const SUMMIT_PROMOTION_CHANCE = 0.30;
export const CASTLE_FLAT_RADIUS      = 8;
export const WAR_CORRIDOR_FLAT_BIAS  = 0.7;
export const GRASS_TUFT_DENSITY      = 0.25;

/** Arena map */
export const ARENA_COLS = 20;
export const ARENA_ROWS = 15;
export const ARENA_W = ARENA_COLS * TILE_SIZE;
export const ARENA_H = ARENA_ROWS * TILE_SIZE;
export const ARENA_P1_CASTLE_TX = 1;
export const ARENA_P1_CASTLE_TY = 5;
export const ARENA_P2_CASTLE_TX = 15;
export const ARENA_P2_CASTLE_TY = 5;
