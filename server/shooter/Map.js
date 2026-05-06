// All coordinates in world-space pixels.
export const MAP_WIDTH = 2880;
export const MAP_HEIGHT = 1920;
export const TILE_SIZE = 64;

const W = MAP_WIDTH;
const H = MAP_HEIGHT;

const WALLS = [
  // Outer borders (server-only collision; off-map so they aren't drawn)
  { x: -32, y: -32, w: W + 64, h: 32 },
  { x: -32, y: H, w: W + 64, h: 32 },
  { x: -32, y: -32, w: 32, h: H + 64 },
  { x: W,   y: -32, w: 32, h: H + 64 },

  // Long horizontal cover near each corner-ish region
  { x: 384,             y: 320,           w: 320, h: 64 },
  { x: W - 384 - 320,   y: 320,           w: 320, h: 64 },
  { x: 384,             y: H - 320 - 64,  w: 320, h: 64 },
  { x: W - 384 - 320,   y: H - 320 - 64,  w: 320, h: 64 },

  // Vertical cover along left/right mid
  { x: 640,           y: 768, w: 64, h: 384 },
  { x: W - 640 - 64,  y: 768, w: 64, h: 384 },

  // Short walls flanking center horizontally
  { x: W / 2 - 384 - 192, y: H / 2 - 32, w: 192, h: 64 },
  { x: W / 2 + 384,       y: H / 2 - 32, w: 192, h: 64 },

  // Short walls flanking center vertically
  { x: W / 2 - 32, y: H / 2 - 384 - 192, w: 64, h: 192 },
  { x: W / 2 - 32, y: H / 2 + 384,       w: 64, h: 192 },

  // Center pillar
  { x: W / 2 - 96, y: H / 2 - 96, w: 192, h: 192 },
];

const SPAWNS = [
  { x: 192, y: 192 },
  { x: W - 192, y: H - 192 },
];

const PICKUP_SPAWNS = [
  { id: 1, kind: 'shotgun', x: W / 2,        y: 384 },
  { id: 2, kind: 'sniper',  x: W / 2,        y: H - 384 },
  { id: 3, kind: 'smg',     x: W / 2 - 640,  y: H / 2 },
];

export const MAP = Object.freeze({
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tileSize: TILE_SIZE,
  walls: WALLS,
  spawns: SPAWNS,
  pickupSpawns: PICKUP_SPAWNS,
});

export function isInsideWall(x, y, radius) {
  for (const w of WALLS) {
    if (x + radius > w.x && x - radius < w.x + w.w &&
        y + radius > w.y && y - radius < w.y + w.h) return true;
  }
  return false;
}

export function clampToBounds(x, y, radius) {
  return {
    x: Math.max(radius, Math.min(MAP_WIDTH - radius, x)),
    y: Math.max(radius, Math.min(MAP_HEIGHT - radius, y)),
  };
}

export function pickFarSpawn(awayFromX, awayFromY) {
  let best = SPAWNS[0];
  let bestD = -1;
  for (const s of SPAWNS) {
    const dx = s.x - awayFromX;
    const dy = s.y - awayFromY;
    const d = dx*dx + dy*dy;
    if (d > bestD) { bestD = d; best = s; }
  }
  return best;
}
