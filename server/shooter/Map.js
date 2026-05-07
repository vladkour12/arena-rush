// All coordinates in world-space pixels.
export const MAP_WIDTH = 2880;
export const MAP_HEIGHT = 1920;
export const TILE_SIZE = 64;

const W = MAP_WIDTH;
const H = MAP_HEIGHT;

// Symmetric layout. Mirror across both centerlines so spawn fairness is preserved.
const WALLS = [
  // Outer borders (off-map collision)
  { x: -32,    y: -32,   w: W + 64, h: 32 },
  { x: -32,    y: H,     w: W + 64, h: 32 },
  { x: -32,    y: -32,   w: 32,     h: H + 64 },
  { x: W,      y: -32,   w: 32,     h: H + 64 },

  // Spawn-shoulder cover (close to each corner spawn)
  { x: 256,           y: 256,  w: 224, h: 64 },
  { x: W - 256 - 224, y: H - 256 - 64, w: 224, h: 64 },

  // Outer corner cover (long horizontals)
  { x: 480,             y: 528,  w: 320, h: 64 },
  { x: W - 480 - 320,   y: 528,  w: 320, h: 64 },
  { x: 480,             y: H - 528 - 64,  w: 320, h: 64 },
  { x: W - 480 - 320,   y: H - 528 - 64,  w: 320, h: 64 },

  // Mid-flank vertical walls (closer to mid lane)
  { x: 832,             y: 768,  w: 64,  h: 384 },
  { x: W - 832 - 64,    y: 768,  w: 64,  h: 384 },

  // Lane-block walls flanking center (force flanking)
  { x: W / 2 - 480 - 192, y: H / 2 - 32, w: 192, h: 64 },
  { x: W / 2 + 480,       y: H / 2 - 32, w: 192, h: 64 },

  // Vertical pillars north and south of center
  { x: W / 2 - 32, y: H / 2 - 480 - 192, w: 64, h: 192 },
  { x: W / 2 - 32, y: H / 2 + 480,       w: 64, h: 192 },

  // L-shaped diagonal cover near each spawn (encourages flanking)
  { x: 1056, y: 320, w: 64,  h: 192 },
  { x: W - 1056 - 64, y: H - 320 - 192, w: 64,  h: 192 },

  // Center pillar (slightly larger than before)
  { x: W / 2 - 112, y: H / 2 - 112, w: 224, h: 224 },
];

const SPAWNS = [
  { x: 192, y: 192 },
  { x: W - 192, y: H - 192 },
];

// Three weapon pickups arranged to cover north / center / south of map.
const PICKUP_SPAWNS = [
  { id: 1, kind: 'shotgun', x: W / 2,        y: 384 },
  { id: 2, kind: 'sniper',  x: W / 2,        y: H - 384 },
  { id: 3, kind: 'smg',     x: W / 2 - 768,  y: H / 2 },
];

// Decorative-only map elements — sent to client to render but not collidable.
// Used to add visual variety without affecting gameplay.
const DECOR = [
  // Floor decals near each pickup (highlight pads)
  { kind: 'pad', x: W / 2,       y: 384 },
  { kind: 'pad', x: W / 2,       y: H - 384 },
  { kind: 'pad', x: W / 2 - 768, y: H / 2 },
  // Decorative crosses in dead-zones
  { kind: 'mark', x: W / 4,     y: H / 2 },
  { kind: 'mark', x: W * 0.75,  y: H / 2 },
];

export const MAP = Object.freeze({
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  tileSize: TILE_SIZE,
  walls: WALLS,
  spawns: SPAWNS,
  pickupSpawns: PICKUP_SPAWNS,
  decor: DECOR,
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
