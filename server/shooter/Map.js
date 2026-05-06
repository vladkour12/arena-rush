// All coordinates in world-space pixels.
export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 1280;
export const TILE_SIZE = 64;

const WALLS = [
  // Outer border (drawn as 4 thin walls so map is bounded server-side)
  { x: -32, y: -32, w: MAP_WIDTH + 64, h: 32 },
  { x: -32, y: MAP_HEIGHT, w: MAP_WIDTH + 64, h: 32 },
  { x: -32, y: -32, w: 32, h: MAP_HEIGHT + 64 },
  { x: MAP_WIDTH, y: -32, w: 32, h: MAP_HEIGHT + 64 },
  // Mid cover (symmetric)
  { x: 320,  y: 480, w: 192, h: 64 },
  { x: MAP_WIDTH - 320 - 192, y: 480, w: 192, h: 64 },
  { x: 320,  y: MAP_HEIGHT - 480 - 64, w: 192, h: 64 },
  { x: MAP_WIDTH - 320 - 192, y: MAP_HEIGHT - 480 - 64, w: 192, h: 64 },
  // Center pillar
  { x: MAP_WIDTH / 2 - 64, y: MAP_HEIGHT / 2 - 64, w: 128, h: 128 },
];

const SPAWNS = [
  { x: 128, y: 128 },
  { x: MAP_WIDTH - 128, y: MAP_HEIGHT - 128 },
];

const PICKUP_SPAWNS = [
  { id: 1, kind: 'shotgun', x: MAP_WIDTH / 2,            y: 192 },
  { id: 2, kind: 'sniper',  x: MAP_WIDTH / 2,            y: MAP_HEIGHT - 192 },
  { id: 3, kind: 'smg',     x: MAP_WIDTH / 2,            y: MAP_HEIGHT / 2 + 256 },
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
