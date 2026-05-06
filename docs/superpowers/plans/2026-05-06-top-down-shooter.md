# Top-Down Shooter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an online 1v1 top-down shooter game mode (mobile-first, PC-supported) with authoritative server netcode, room-code lobby, weapon pickups, and bots — alongside the existing Island Wars RTS mode.

**Architecture:** Server-as-simulator (`server/shooter/`) runs a 30Hz tick loop owning all state and broadcasts 20Hz snapshots. Client (`game/shooter/`) is render-only with local-player prediction and remote-entity interpolation. Shared protocol constants and weapon stats are duplicated between server (JS) and client (TS) but kept in lockstep. Lobby uses 4-letter room codes; bots fill empty rooms after 30s and power Practice mode.

**Tech Stack:** Node + Express + ws (server), Phaser 4 + React 19 + Vite + TypeScript (client), Vitest (tests).

**Spec:** [`docs/superpowers/specs/2026-05-06-top-down-shooter-design.md`](../specs/2026-05-06-top-down-shooter-design.md)

**Testing strategy:**
- Server logic (collision, damage, room manager, bot decisions, protocol validation) — unit tests with Vitest.
- Client networking (prediction reconciliation, interpolation interpolation math) — unit tests with Vitest.
- Phaser rendering / React HUD / Mobile sticks — manual smoke testing only (browser at desktop + DevTools mobile emulation).
- End-to-end — open two browser tabs against `npm run dev:full` and confirm a match plays through.

**Vitest config note:** the existing `vitest.config.ts` only includes `game/**/*.test.ts`. Task 1 widens it to also include `server/**/*.test.js`.

---

## File Structure

**New server files:**
- `server/shooter/protocol.js` — message-type constants
- `server/shooter/Weapons.js` — weapon stats (mirror of `game/shooter/config/weapons.ts`)
- `server/shooter/Map.js` — walls + spawn points + pickup positions (mirror of `game/shooter/config/map.ts`)
- `server/shooter/MatchManager.js` — room registry by 4-letter code; lifecycle
- `server/shooter/Match.js` — single-match state + tick + serialize-to-snapshot
- `server/shooter/GameLoop.js` — drives `Match.tick()` at 30Hz; broadcasts at 20Hz
- `server/shooter/Bot.js` — server-side AI

**New client files:**
- `game/shooter/config/weapons.ts` — TS mirror of `Weapons.js`
- `game/shooter/config/map.ts` — TS mirror of `Map.js`
- `game/shooter/net/protocol.ts` — TS mirror of `protocol.js`
- `game/shooter/net/ShooterClient.ts` — WS client; sends INPUT, applies SNAP, fires events
- `game/shooter/net/Prediction.ts` — local-player prediction + reconciliation
- `game/shooter/net/Interpolation.ts` — remote-entity interpolation buffer
- `game/shooter/scenes/ShooterPreloadScene.ts` — preloads asset pack
- `game/shooter/scenes/ShooterScene.ts` — render-only Phaser scene
- `game/shooter/input/DesktopInput.ts` — WASD + mouse aim + click
- `game/shooter/input/MobileInput.ts` — twin virtual sticks
- `components/Shooter.tsx` — mounts Phaser + React HUD overlay
- `components/ShooterLobby.tsx` — name + Create/Join/Practice screens

**Modified files:**
- `server.js` — register shooter routes + WS message routing for JOIN_MATCH/INPUT/LEAVE_MATCH/REMATCH_REQUEST
- `vitest.config.ts` — include `server/**/*.test.js`
- `App.tsx` — add `'shooter-lobby'` and `'shooter'` app states
- `components/Menu.tsx` — replace "Coming Soon" Arena Battle card with active Top-Down Shooter card
- `index.css` — add `.tk-shooter-*` classes for lobby + HUD

---

## Conventions used by every task

- Server JS uses ES modules (matches `server.js`).
- Client TS uses ES modules with explicit `.ts` extensions in imports omitted (Vite resolves).
- `playerId`s are UUIDs from existing `/api/auth/login` flow; reused for shooter.
- Coordinates: world-space pixels, integer `x`/`y` rounded to 1 decimal in network messages to keep payload small.
- Time: server timestamps in ms since process start (`Date.now()` is fine — no monotonic clock needed for this scope).
- Match codes: 4 uppercase letters from `ABCDEFGHJKLMNPQRSTUVWXYZ` (no I, O, 0, 1).

---

## Task 1: Set up test config and shared protocol

**Files:**
- Modify: `vitest.config.ts`
- Create: `server/shooter/protocol.js`
- Create: `game/shooter/net/protocol.ts`
- Test: `server/shooter/protocol.test.js`

- [ ] **Step 1: Widen vitest config**

Replace `vitest.config.ts` with:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['game/**/*.test.ts', 'server/**/*.test.js'],
    globals: false,
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `server/shooter/protocol.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MSG } from './protocol.js';

describe('shooter protocol', () => {
  it('exports all required client→server message types', () => {
    expect(MSG.INPUT).toBe('INPUT');
    expect(MSG.JOIN_MATCH).toBe('JOIN_MATCH');
    expect(MSG.LEAVE_MATCH).toBe('LEAVE_MATCH');
    expect(MSG.REMATCH_REQUEST).toBe('REMATCH_REQUEST');
  });
  it('exports all required server→client message types', () => {
    expect(MSG.SNAP).toBe('SNAP');
    expect(MSG.KILL).toBe('KILL');
    expect(MSG.PICKUP).toBe('PICKUP');
    expect(MSG.MATCH_START).toBe('MATCH_START');
    expect(MSG.MATCH_END).toBe('MATCH_END');
    expect(MSG.RESPAWN).toBe('RESPAWN');
  });
});
```

- [ ] **Step 3: Run test to confirm it fails**

Run: `npx vitest run server/shooter/protocol.test.js`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement protocol.js**

Create `server/shooter/protocol.js`:

```js
export const MSG = Object.freeze({
  // client → server
  INPUT: 'INPUT',
  JOIN_MATCH: 'JOIN_MATCH',
  LEAVE_MATCH: 'LEAVE_MATCH',
  REMATCH_REQUEST: 'REMATCH_REQUEST',
  // server → client
  SNAP: 'SNAP',
  KILL: 'KILL',
  PICKUP: 'PICKUP',
  MATCH_START: 'MATCH_START',
  MATCH_END: 'MATCH_END',
  RESPAWN: 'RESPAWN',
});
```

- [ ] **Step 5: Mirror in TypeScript**

Create `game/shooter/net/protocol.ts`:

```ts
export const MSG = {
  INPUT: 'INPUT',
  JOIN_MATCH: 'JOIN_MATCH',
  LEAVE_MATCH: 'LEAVE_MATCH',
  REMATCH_REQUEST: 'REMATCH_REQUEST',
  SNAP: 'SNAP',
  KILL: 'KILL',
  PICKUP: 'PICKUP',
  MATCH_START: 'MATCH_START',
  MATCH_END: 'MATCH_END',
  RESPAWN: 'RESPAWN',
} as const;

export type MsgType = typeof MSG[keyof typeof MSG];

export interface InputMsg {
  t: 'INPUT';
  seq: number;
  mv: { x: number; y: number };
  aim: number;
  fire: boolean;
  swap: boolean;
  reload: boolean;
}

export interface SnapPlayer {
  id: string;
  x: number;
  y: number;
  hp: number;
  weapon: string;
  ammo: number;
  reloading: boolean;
  dead: boolean;
}

export interface SnapBullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: string;
  weapon: string;
}

export interface SnapPickup {
  id: number;
  kind: string;
  x: number;
  y: number;
  available: boolean;
}

export interface SnapMsg {
  t: 'SNAP';
  tick: number;
  ackSeq: number;
  serverTime: number;
  players: SnapPlayer[];
  bullets: SnapBullet[];
  pickups: SnapPickup[];
  score: Record<string, number>;
  timeLeftMs: number;
}
```

- [ ] **Step 6: Confirm test passes**

Run: `npx vitest run server/shooter/protocol.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts server/shooter/protocol.js game/shooter/net/protocol.ts server/shooter/protocol.test.js
git commit -m "shooter: add protocol constants and widen vitest include"
```

---

## Task 2: Weapon configs (server + client mirrors)

**Files:**
- Create: `server/shooter/Weapons.js`
- Create: `game/shooter/config/weapons.ts`
- Test: `server/shooter/Weapons.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/shooter/Weapons.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { WEAPONS, getWeapon } from './Weapons.js';

describe('weapons config', () => {
  it('defines all 4 weapons', () => {
    expect(Object.keys(WEAPONS).sort()).toEqual(['pistol', 'shotgun', 'smg', 'sniper']);
  });
  it('pistol has infinite reserve flag', () => {
    expect(WEAPONS.pistol.infiniteReserve).toBe(true);
  });
  it('sniper deals 80 damage', () => {
    expect(WEAPONS.sniper.damage).toBe(80);
  });
  it('shotgun fires 5 pellets', () => {
    expect(WEAPONS.shotgun.pellets).toBe(5);
  });
  it('getWeapon returns same object as direct lookup', () => {
    expect(getWeapon('smg')).toBe(WEAPONS.smg);
  });
  it('getWeapon throws on unknown', () => {
    expect(() => getWeapon('rocket')).toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run server/shooter/Weapons.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Weapons.js**

Create `server/shooter/Weapons.js`:

```js
export const WEAPONS = Object.freeze({
  pistol: {
    id: 'pistol',
    damage: 18,
    fireRate: 3,        // shots per second
    magSize: 12,
    reloadMs: 1200,
    rangePx: 700,
    bulletSpeed: 900,
    spreadRad: 0.05,
    pellets: 1,
    infiniteReserve: true,
    droppable: false,
  },
  smg: {
    id: 'smg',
    damage: 10,
    fireRate: 12,
    magSize: 30,
    reloadMs: 1800,
    rangePx: 500,
    bulletSpeed: 1000,
    spreadRad: 0.10,
    pellets: 1,
    infiniteReserve: false,
    droppable: true,
  },
  shotgun: {
    id: 'shotgun',
    damage: 8,           // per pellet
    fireRate: 1.2,
    magSize: 6,
    reloadMs: 2000,
    rangePx: 280,
    bulletSpeed: 850,
    spreadRad: 0.30,     // wide cone
    pellets: 5,
    infiniteReserve: false,
    droppable: true,
  },
  sniper: {
    id: 'sniper',
    damage: 80,
    fireRate: 0.8,
    magSize: 4,
    reloadMs: 2500,
    rangePx: 1500,
    bulletSpeed: 1600,
    spreadRad: 0.0,
    pellets: 1,
    infiniteReserve: false,
    droppable: true,
  },
});

export function getWeapon(id) {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
```

- [ ] **Step 4: Mirror in TypeScript**

Create `game/shooter/config/weapons.ts`:

```ts
export interface WeaponConfig {
  id: string;
  damage: number;
  fireRate: number;
  magSize: number;
  reloadMs: number;
  rangePx: number;
  bulletSpeed: number;
  spreadRad: number;
  pellets: number;
  infiniteReserve: boolean;
  droppable: boolean;
}

export const WEAPONS: Record<string, WeaponConfig> = {
  pistol:  { id: 'pistol',  damage: 18,  fireRate: 3,    magSize: 12, reloadMs: 1200, rangePx: 700,  bulletSpeed: 900,  spreadRad: 0.05, pellets: 1, infiniteReserve: true,  droppable: false },
  smg:     { id: 'smg',     damage: 10,  fireRate: 12,   magSize: 30, reloadMs: 1800, rangePx: 500,  bulletSpeed: 1000, spreadRad: 0.10, pellets: 1, infiniteReserve: false, droppable: true  },
  shotgun: { id: 'shotgun', damage: 8,   fireRate: 1.2,  magSize: 6,  reloadMs: 2000, rangePx: 280,  bulletSpeed: 850,  spreadRad: 0.30, pellets: 5, infiniteReserve: false, droppable: true  },
  sniper:  { id: 'sniper',  damage: 80,  fireRate: 0.8,  magSize: 4,  reloadMs: 2500, rangePx: 1500, bulletSpeed: 1600, spreadRad: 0.0,  pellets: 1, infiniteReserve: false, droppable: true  },
};

export function getWeapon(id: string): WeaponConfig {
  const w = WEAPONS[id];
  if (!w) throw new Error(`Unknown weapon: ${id}`);
  return w;
}
```

- [ ] **Step 5: Confirm test passes and commit**

Run: `npx vitest run server/shooter/Weapons.test.js`
Expected: PASS.

```bash
git add server/shooter/Weapons.js server/shooter/Weapons.test.js game/shooter/config/weapons.ts
git commit -m "shooter: add weapon configs (server JS + client TS mirror)"
```

---

## Task 3: Map data (walls, spawns, pickups)

**Files:**
- Create: `server/shooter/Map.js`
- Create: `game/shooter/config/map.ts`
- Test: `server/shooter/Map.test.js`

- [ ] **Step 1: Write failing test**

Create `server/shooter/Map.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { MAP, isInsideWall, clampToBounds, MAP_WIDTH, MAP_HEIGHT } from './Map.js';

describe('shooter map', () => {
  it('has expected dimensions', () => {
    expect(MAP_WIDTH).toBe(1920);
    expect(MAP_HEIGHT).toBe(1280);
  });
  it('has exactly 2 spawn points', () => {
    expect(MAP.spawns.length).toBe(2);
  });
  it('has exactly 3 pickup spawns', () => {
    expect(MAP.pickupSpawns.length).toBe(3);
    const kinds = MAP.pickupSpawns.map(p => p.kind).sort();
    expect(kinds).toEqual(['shotgun', 'smg', 'sniper']);
  });
  it('isInsideWall detects a wall point', () => {
    // Place a known test by checking any wall has nonzero size
    const w = MAP.walls[0];
    expect(isInsideWall(w.x + 1, w.y + 1, 0)).toBe(true);
  });
  it('isInsideWall returns false for spawn points', () => {
    for (const s of MAP.spawns) {
      expect(isInsideWall(s.x, s.y, 16)).toBe(false);
    }
  });
  it('clampToBounds keeps point inside map', () => {
    expect(clampToBounds(-50, 5000, 16)).toEqual({ x: 16, y: MAP_HEIGHT - 16 });
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run server/shooter/Map.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement Map.js**

Create `server/shooter/Map.js`:

```js
// All coordinates in world-space pixels.
export const MAP_WIDTH = 1920;
export const MAP_HEIGHT = 1280;
export const TILE_SIZE = 64;

// Walls are AABBs: { x, y, w, h }. Hand-tuned for symmetry.
const WALLS = [
  // Outer border (drawn as 4 thin walls so map is bounded server-side)
  { x: -32, y: -32, w: MAP_WIDTH + 64, h: 32 },              // top
  { x: -32, y: MAP_HEIGHT, w: MAP_WIDTH + 64, h: 32 },       // bottom
  { x: -32, y: -32, w: 32, h: MAP_HEIGHT + 64 },             // left
  { x: MAP_WIDTH, y: -32, w: 32, h: MAP_HEIGHT + 64 },       // right
  // Mid cover (symmetric — mirror across center)
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

// Clamp a circle of given radius to stay inside the playable bounds.
export function clampToBounds(x, y, radius) {
  return {
    x: Math.max(radius, Math.min(MAP_WIDTH - radius, x)),
    y: Math.max(radius, Math.min(MAP_HEIGHT - radius, y)),
  };
}

// Pick the spawn point farthest from `awayFrom` (used at respawn).
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
```

- [ ] **Step 4: Mirror in TypeScript**

Create `game/shooter/config/map.ts`:

```ts
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
```

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run server/shooter/Map.test.js`
Expected: PASS.

```bash
git add server/shooter/Map.js server/shooter/Map.test.js game/shooter/config/map.ts
git commit -m "shooter: add map data (walls, spawns, pickup spots)"
```

---

## Task 4: MatchManager — room codes and lifecycle

**Files:**
- Create: `server/shooter/MatchManager.js`
- Test: `server/shooter/MatchManager.test.js`

`MatchManager` is the registry of active rooms keyed by code. It does NOT own ticking or gameplay — that's `Match` + `GameLoop`. For now, `MatchManager.create()` returns a placeholder `Match`-like object; we'll wire the real Match in Task 6.

- [ ] **Step 1: Write failing test**

Create `server/shooter/MatchManager.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { MatchManager } from './MatchManager.js';

describe('MatchManager', () => {
  let mgr;
  beforeEach(() => { mgr = new MatchManager({ maxConcurrent: 4 }); });

  it('createRoom returns a 4-letter code from the safe alphabet', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'Alice' });
    expect(r.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    expect(r.hostId).toBe('H1');
  });

  it('joinRoom adds a guest', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'Alice' });
    const j = mgr.joinRoom(r.code, { guestId: 'G1', guestName: 'Bob' });
    expect(j.ok).toBe(true);
    expect(mgr.getRoom(r.code).guestId).toBe('G1');
  });

  it('joinRoom returns full when 2 already present', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'Alice' });
    mgr.joinRoom(r.code, { guestId: 'G1', guestName: 'Bob' });
    const second = mgr.joinRoom(r.code, { guestId: 'G2', guestName: 'Eve' });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('full');
  });

  it('joinRoom returns not_found for unknown code', () => {
    const r = mgr.joinRoom('ZZZZ', { guestId: 'G1', guestName: 'Bob' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not_found');
  });

  it('refuses creation when over maxConcurrent', () => {
    const small = new MatchManager({ maxConcurrent: 1 });
    small.createRoom({ hostId: 'H1', hostName: 'A' });
    expect(() => small.createRoom({ hostId: 'H2', hostName: 'B' })).toThrow(/busy/i);
  });

  it('removeRoom deletes by code', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'A' });
    mgr.removeRoom(r.code);
    expect(mgr.getRoom(r.code)).toBeUndefined();
  });

  it('expireWaitingRooms removes rooms older than ttl in waiting state', () => {
    const r = mgr.createRoom({ hostId: 'H1', hostName: 'A' });
    // simulate aging
    mgr.getRoom(r.code).createdAt = Date.now() - 6 * 60 * 1000;
    mgr.expireWaitingRooms();
    expect(mgr.getRoom(r.code)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run server/shooter/MatchManager.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement MatchManager.js**

Create `server/shooter/MatchManager.js`:

```js
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 4;
const WAITING_TTL_MS = 5 * 60 * 1000;

function genCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

export class MatchManager {
  constructor({ maxConcurrent = 4 } = {}) {
    this.rooms = new Map();
    this.maxConcurrent = maxConcurrent;
  }

  _uniqueCode() {
    for (let i = 0; i < 50; i++) {
      const c = genCode();
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('Could not allocate unique room code');
  }

  createRoom({ hostId, hostName }) {
    if (this.rooms.size >= this.maxConcurrent) {
      throw new Error('Server busy: too many concurrent matches');
    }
    const code = this._uniqueCode();
    const room = {
      code,
      hostId,
      hostName,
      guestId: null,
      guestName: null,
      isBotGuest: false,
      botDifficulty: null,
      state: 'waiting',           // waiting | playing | ended
      match: null,                // populated when transition to 'playing'
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code, { guestId, guestName, isBot = false, botDifficulty = null }) {
    const room = this.rooms.get(code);
    if (!room) return { ok: false, reason: 'not_found' };
    if (room.guestId) return { ok: false, reason: 'full' };
    if (room.state !== 'waiting') return { ok: false, reason: 'not_waiting' };
    room.guestId = guestId;
    room.guestName = guestName;
    room.isBotGuest = isBot;
    room.botDifficulty = botDifficulty;
    return { ok: true, room };
  }

  getRoom(code) { return this.rooms.get(code); }

  setMatch(code, match) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.match = match;
    room.state = 'playing';
  }

  endMatch(code) {
    const room = this.rooms.get(code);
    if (room) room.state = 'ended';
  }

  removeRoom(code) { this.rooms.delete(code); }

  expireWaitingRooms() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (room.state === 'waiting' && now - room.createdAt > WAITING_TTL_MS) {
        this.rooms.delete(code);
      }
    }
  }

  size() { return this.rooms.size; }
}
```

- [ ] **Step 4: Tests pass, commit**

Run: `npx vitest run server/shooter/MatchManager.test.js`
Expected: PASS.

```bash
git add server/shooter/MatchManager.js server/shooter/MatchManager.test.js
git commit -m "shooter: add MatchManager with room codes and lifecycle"
```

---

## Task 5: Match — state, INPUT processing, movement

**Files:**
- Create: `server/shooter/Match.js`
- Test: `server/shooter/Match.test.js`

The `Match` instance owns all gameplay state. This task implements **state shape, applyInput, and movement** only. Combat, pickups, scoring come in later tasks.

- [ ] **Step 1: Write failing test**

Create `server/shooter/Match.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function newMatch() {
  return new Match({
    matchId: 'M1',
    code: 'ABCD',
    p1: { id: 'A', name: 'Alice', isBot: false },
    p2: { id: 'B', name: 'Bob',   isBot: false },
  });
}

describe('Match — state and movement', () => {
  it('initializes both players at the spawn points', () => {
    const m = newMatch();
    const A = m.players.A, B = m.players.B;
    expect(A.hp).toBe(100);
    expect(B.hp).toBe(100);
    expect(A.weapon).toBe('pistol');
    expect(A.x).toBeGreaterThan(0);
    expect(A.x).not.toBe(B.x);
  });

  it('applyInput then tick moves the player', () => {
    const m = newMatch();
    const startX = m.players.A.x;
    m.applyInput('A', { seq: 1, mv: { x: 1, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    expect(m.players.A.x).toBeGreaterThan(startX);
    expect(m.players.A.lastAckSeq).toBe(1);
  });

  it('movement is clamped by walls', () => {
    const m = newMatch();
    // Place A near top wall, push up
    m.players.A.x = 200; m.players.A.y = 32;
    m.applyInput('A', { seq: 1, mv: { x: 0, y: -1 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    expect(m.players.A.y).toBeGreaterThanOrEqual(16);   // body radius
  });

  it('mv vector is normalized so diagonal isn’t faster', () => {
    const m = newMatch();
    const startX = m.players.A.x;
    m.applyInput('A', { seq: 1, mv: { x: 1, y: 1 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    const dx = m.players.A.x - startX;
    // Speed = 200 px/s, dt = 1/30 → max 6.67 px in any direction
    expect(dx).toBeLessThan(6.7 / Math.SQRT2 + 0.01);
  });

  it('rejects out-of-order inputs', () => {
    const m = newMatch();
    m.applyInput('A', { seq: 5, mv: { x: 0, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    m.applyInput('A', { seq: 3, mv: { x: 1, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    m.tick(1 / 30);
    expect(m.players.A.lastAckSeq).toBe(5);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run server/shooter/Match.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement Match.js (state + movement only)**

Create `server/shooter/Match.js`:

```js
import { MAP, MAP_WIDTH, MAP_HEIGHT, isInsideWall, clampToBounds, pickFarSpawn } from './Map.js';
import { WEAPONS } from './Weapons.js';

const PLAYER_SPEED = 200;          // px/s
const PLAYER_RADIUS = 16;
const MATCH_DURATION_MS = 5 * 60 * 1000;
const KILL_TARGET = 10;

export class Match {
  constructor({ matchId, code, p1, p2 }) {
    this.matchId = matchId;
    this.code = code;
    this.tickCount = 0;
    this.startedAt = Date.now();
    this.endedAt = null;
    this.endReason = null;
    this.winnerId = null;

    const spawnA = MAP.spawns[0];
    const spawnB = MAP.spawns[1];
    this.players = {
      A: this._mkPlayer(p1, spawnA),
      B: this._mkPlayer(p2, spawnB),
    };
    this.score = { A: 0, B: 0 };
    this.bullets = [];
    this.nextBulletId = 1;
    this.events = [];           // queued one-shot events for this tick
    this.pickups = MAP.pickupSpawns.map(p => ({
      id: p.id, kind: p.kind, x: p.x, y: p.y, available: true, respawnAt: 0,
    }));
    this.pendingInputs = { A: [], B: [] };
  }

  _mkPlayer(info, spawn) {
    return {
      id: info.id, name: info.name, isBot: !!info.isBot,
      slot: info.slot,                                  // 'A' | 'B' (set by caller below)
      x: spawn.x, y: spawn.y,
      hp: 100, dead: false, respawnAt: 0,
      weapon: 'pistol',
      pickupWeapon: null,                               // currently-held pickup (null if only pistol)
      ammo: WEAPONS.pistol.magSize,
      reloadingUntil: 0,
      nextShotAt: 0,
      aim: 0,
      lastAckSeq: 0,
    };
  }

  applyInput(slot, input) {
    if (!input || typeof input.seq !== 'number') return;
    this.pendingInputs[slot].push(input);
  }

  tick(dt) {
    this.tickCount++;
    this.events = [];
    this._processInputs(dt);
    // (combat, bullets, pickups, win check come in later tasks)
  }

  _processInputs(dt) {
    for (const slot of ['A', 'B']) {
      const inputs = this.pendingInputs[slot];
      if (inputs.length === 0) continue;
      // Sort by seq, drop anything <= lastAckSeq
      inputs.sort((a, b) => a.seq - b.seq);
      const p = this.players[slot];
      for (const inp of inputs) {
        if (inp.seq <= p.lastAckSeq) continue;
        p.lastAckSeq = inp.seq;
        p.aim = inp.aim ?? p.aim;
        if (!p.dead) this._applyMovement(p, inp.mv, dt);
      }
      this.pendingInputs[slot] = [];
    }
  }

  _applyMovement(p, mv, dt) {
    if (!mv) return;
    let mx = mv.x ?? 0, my = mv.y ?? 0;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    let nx = p.x + mx * PLAYER_SPEED * dt;
    let ny = p.y + my * PLAYER_SPEED * dt;
    // Try X then Y so we slide along walls
    if (!isInsideWall(nx, p.y, PLAYER_RADIUS)) p.x = nx;
    if (!isInsideWall(p.x, ny, PLAYER_RADIUS)) p.y = ny;
    const c = clampToBounds(p.x, p.y, PLAYER_RADIUS);
    p.x = c.x; p.y = c.y;
  }

  serializeSnapshot() {
    return {
      tick: this.tickCount,
      players: ['A', 'B'].map(slot => {
        const p = this.players[slot];
        return {
          id: p.id, slot,
          x: Math.round(p.x * 10) / 10,
          y: Math.round(p.y * 10) / 10,
          hp: p.hp, weapon: p.weapon, ammo: p.ammo,
          reloading: this._isReloading(p),
          dead: p.dead,
          aim: Math.round(p.aim * 1000) / 1000,
        };
      }),
      bullets: this.bullets.map(b => ({
        id: b.id, x: Math.round(b.x), y: Math.round(b.y),
        vx: b.vx, vy: b.vy, owner: b.owner, weapon: b.weapon,
      })),
      pickups: this.pickups.map(p => ({
        id: p.id, kind: p.kind, x: p.x, y: p.y, available: p.available,
      })),
      score: { ...this.score },
      timeLeftMs: Math.max(0, MATCH_DURATION_MS - (Date.now() - this.startedAt)),
    };
  }

  _isReloading(p) { return Date.now() < p.reloadingUntil; }

  getAckSeq(slot) { return this.players[slot].lastAckSeq; }
}

export const _testing = { PLAYER_SPEED, PLAYER_RADIUS, MATCH_DURATION_MS, KILL_TARGET };
```

- [ ] **Step 4: Confirm tests pass and commit**

Run: `npx vitest run server/shooter/Match.test.js`
Expected: PASS.

```bash
git add server/shooter/Match.js server/shooter/Match.test.js
git commit -m "shooter: add Match with state and movement input handling"
```

---

## Task 6: Match — combat (firing, bullets, hit detection)

**Files:**
- Modify: `server/shooter/Match.js`
- Test: `server/shooter/Match.combat.test.js`

- [ ] **Step 1: Write failing test**

Create `server/shooter/Match.combat.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function setup() {
  const m = new Match({
    matchId: 'M', code: 'ABCD',
    p1: { id: 'A', name: 'A', slot: 'A' },
    p2: { id: 'B', name: 'B', slot: 'B' },
  });
  // Place A and B 200 px apart along x, A aiming right
  m.players.A.x = 400; m.players.A.y = 400; m.players.A.aim = 0;
  m.players.B.x = 600; m.players.B.y = 400;
  return m;
}

describe('Match — combat', () => {
  it('firing creates a bullet with correct owner and direction', () => {
    const m = setup();
    m.applyInput('A', { seq: 1, mv: { x:0, y:0 }, aim: 0, fire: true, swap: false, reload: false });
    m.tick(1/30);
    expect(m.bullets.length).toBe(1);
    expect(m.bullets[0].owner).toBe('A');
    expect(m.bullets[0].vx).toBeGreaterThan(0);
  });

  it('bullets travel and damage on hit', () => {
    const m = setup();
    m.applyInput('A', { seq: 1, mv: { x:0, y:0 }, aim: 0, fire: true, swap: false, reload: false });
    m.tick(1/30);
    // Run several ticks; pistol bullet 900 px/s, distance 184 px → ~0.2s
    for (let i = 0; i < 30; i++) m.tick(1/30);
    expect(m.players.B.hp).toBeLessThan(100);
  });

  it('pistol fire rate respected (only one bullet per tick when held)', () => {
    const m = setup();
    // Hold fire across 3 ticks at 1/30s each = 0.1s. Pistol fires 3/s → ~1 shot.
    for (let s = 1; s <= 3; s++) {
      m.applyInput('A', { seq: s, mv:{x:0,y:0}, aim:0, fire:true, swap:false, reload:false });
      m.tick(1/30);
    }
    expect(m.bullets.length).toBe(1);
  });

  it('bullets stop on wall', () => {
    const m = setup();
    // Aim into the central pillar (1920/2-64..1920/2+64, 1280/2-64..1280/2+64)
    m.players.A.x = 100; m.players.A.y = 1280/2; m.players.A.aim = 0;
    m.applyInput('A', { seq: 1, mv:{x:0,y:0}, aim:0, fire:true, swap:false, reload:false });
    m.tick(1/30);
    for (let i = 0; i < 200; i++) m.tick(1/30);
    expect(m.bullets.length).toBe(0); // bullet despawned by wall hit
    expect(m.players.B.hp).toBe(100); // B unhurt
  });

  it('shotgun spawns 5 pellets', () => {
    const m = setup();
    m.players.A.weapon = 'shotgun';
    m.players.A.ammo = 6;
    m.applyInput('A', { seq: 1, mv:{x:0,y:0}, aim:0, fire:true, swap:false, reload:false });
    m.tick(1/30);
    expect(m.bullets.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run, expect failure (multiple tests)**

Run: `npx vitest run server/shooter/Match.combat.test.js`
Expected: FAIL.

- [ ] **Step 3: Add combat to Match.js**

In `server/shooter/Match.js`, modify the imports and add new methods. Replace the existing `tick(dt)` and add `_processFire`, `_stepBullets`, `_segmentHitsWall`, `_segmentHitsPlayer`, `_damage`. Keep prior code intact.

Replace `tick`:

```js
tick(dt) {
  this.tickCount++;
  this.events = [];
  this._processInputs(dt);
  this._stepBullets(dt);
}
```

In `_processInputs`, after the `_applyMovement` line, add fire/reload/swap handling:

```js
if (!p.dead) {
  this._applyMovement(p, inp.mv, dt);
  if (inp.reload) this._tryReload(p);
  if (inp.swap) this._trySwap(p);
  if (inp.fire) this._tryFire(p);
}
```

Add methods inside the class:

```js
_tryFire(p) {
  if (Date.now() < this.players[p.slot ?? this._slotOf(p)].nextShotAt) return;
  if (this._isReloading(p)) return;
  const w = WEAPONS[p.weapon];
  if (p.ammo <= 0) { this._tryReload(p); return; }
  const now = Date.now();
  p.nextShotAt = now + 1000 / w.fireRate;
  p.ammo--;
  // Spawn pellets
  for (let i = 0; i < w.pellets; i++) {
    const spread = (Math.random() - 0.5) * 2 * w.spreadRad;
    const ang = p.aim + spread;
    const speed = w.bulletSpeed;
    this.bullets.push({
      id: this.nextBulletId++,
      x: p.x + Math.cos(p.aim) * 20,    // muzzle offset
      y: p.y + Math.sin(p.aim) * 20,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      owner: p.id,
      ownerSlot: this._slotOf(p),
      weapon: p.weapon,
      damage: w.damage,
      ttlMs: (w.rangePx / w.bulletSpeed) * 1000,
      bornAt: now,
    });
  }
  // Pistol auto-reload when empty? Skip — explicit reload via input.reload only.
}

_tryReload(p) {
  if (this._isReloading(p)) return;
  const w = WEAPONS[p.weapon];
  if (p.ammo === w.magSize) return;
  p.reloadingUntil = Date.now() + w.reloadMs;
  // Ammo set after reload completes — checked in _processInputs each tick. Simpler:
  // schedule via tick check.
}

_finishReloads() {
  const now = Date.now();
  for (const slot of ['A', 'B']) {
    const p = this.players[slot];
    if (p.reloadingUntil > 0 && now >= p.reloadingUntil) {
      const w = WEAPONS[p.weapon];
      p.ammo = w.magSize;
      p.reloadingUntil = 0;
    }
  }
}

_trySwap(p) {
  if (!p.pickupWeapon) return;
  const tmp = p.weapon;
  p.weapon = p.pickupWeapon;
  p.pickupWeapon = tmp === 'pistol' ? null : tmp;
  // Reset ammo to magSize on swap (simplifies; no ammo persistence between swaps)
  p.ammo = WEAPONS[p.weapon].magSize;
  p.reloadingUntil = 0;
}

_slotOf(p) { return this.players.A === p ? 'A' : 'B'; }

_stepBullets(dt) {
  this._finishReloads();
  const next = [];
  for (const b of this.bullets) {
    const stepX = b.vx * dt;
    const stepY = b.vy * dt;
    const newX = b.x + stepX;
    const newY = b.y + stepY;
    // Check hit on wall along the segment
    if (this._segmentHitsWall(b.x, b.y, newX, newY)) continue;
    // Check hit on enemy player along the segment
    const targetSlot = b.ownerSlot === 'A' ? 'B' : 'A';
    const tgt = this.players[targetSlot];
    if (!tgt.dead && this._segmentHitsCircle(b.x, b.y, newX, newY, tgt.x, tgt.y, 16)) {
      this._damage(tgt, b.damage, b.ownerSlot, b.weapon);
      continue;
    }
    // Range check
    b.x = newX; b.y = newY;
    if (Date.now() - b.bornAt > b.ttlMs) continue;
    next.push(b);
  }
  this.bullets = next;
}

_segmentHitsWall(x1, y1, x2, y2) {
  // Cheap: sample 4 points along segment
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    if (isInsideWall(x, y, 0)) return true;
  }
  return false;
}

_segmentHitsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx*dx + dy*dy;
  if (a === 0) return Math.hypot(fx, fy) < r;
  const b = 2 * (fx*dx + fy*dy);
  const c = fx*fx + fy*fy - r*r;
  let disc = b*b - 4*a*c;
  if (disc < 0) return false;
  disc = Math.sqrt(disc);
  const t1 = (-b - disc) / (2*a);
  const t2 = (-b + disc) / (2*a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1);
}

_damage(target, amount, fromSlot, weapon) {
  if (target.dead) return;
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) {
    target.dead = true;
    target.respawnAt = Date.now() + 2000;
    this.score[fromSlot]++;
    this.events.push({ t: 'KILL', killer: this.players[fromSlot].id, victim: target.id, weapon, at: { x: target.x, y: target.y } });
  }
}
```

(Note: the `slot` field on each player object is set when the player is constructed — we already have the variable but didn't assign it. Update `_mkPlayer` calls in the constructor to pass slot.)

In the constructor, change:

```js
this.players = {
  A: this._mkPlayer({ ...p1, slot: 'A' }, spawnA),
  B: this._mkPlayer({ ...p2, slot: 'B' }, spawnB),
};
```

And in `_mkPlayer`, store `slot: info.slot`.

- [ ] **Step 4: Confirm tests pass**

Run: `npx vitest run server/shooter/Match.combat.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/shooter/Match.js server/shooter/Match.combat.test.js
git commit -m "shooter: add firing, bullets, and hit detection"
```

---

## Task 7: Match — respawn, scoring, MATCH_END

**Files:**
- Modify: `server/shooter/Match.js`
- Test: `server/shooter/Match.endgame.test.js`

- [ ] **Step 1: Write failing test**

Create `server/shooter/Match.endgame.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function setup() {
  return new Match({
    matchId: 'M', code: 'ABCD',
    p1: { id: 'A', name: 'A' },
    p2: { id: 'B', name: 'B' },
  });
}

describe('Match — respawn and end conditions', () => {
  it('respawns player after 2s', () => {
    const m = setup();
    m.players.A.hp = 0; m.players.A.dead = true; m.players.A.respawnAt = Date.now() - 100;
    m.tick(1/30);
    expect(m.players.A.dead).toBe(false);
    expect(m.players.A.hp).toBe(100);
  });

  it('respawn picks the spawn far from enemy', () => {
    const m = setup();
    m.players.B.x = 128; m.players.B.y = 128;
    m.players.A.dead = true; m.players.A.hp = 0; m.players.A.respawnAt = Date.now() - 100;
    m.tick(1/30);
    // Should have spawned at the far spawn (1920-128, 1280-128)
    expect(m.players.A.x).toBeGreaterThan(1000);
  });

  it('match ends when score hits 10', () => {
    const m = setup();
    m.score.A = 10;
    m.tick(1/30);
    expect(m.endedAt).not.toBeNull();
    expect(m.endReason).toBe('score');
    expect(m.winnerId).toBe('A');
  });

  it('match ends on timer with higher-score winner', () => {
    const m = setup();
    m.score.A = 5; m.score.B = 3;
    m.startedAt = Date.now() - 6 * 60 * 1000;
    m.tick(1/30);
    expect(m.endedAt).not.toBeNull();
    expect(m.endReason).toBe('timeout');
    expect(m.winnerId).toBe('A');
  });

  it('tied at timeout enters sudden death (winner stays null until next kill)', () => {
    const m = setup();
    m.score.A = 4; m.score.B = 4;
    m.startedAt = Date.now() - 6 * 60 * 1000;
    m.tick(1/30);
    expect(m.endReason).toBe(null);
    expect(m.suddenDeath).toBe(true);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run server/shooter/Match.endgame.test.js`
Expected: FAIL.

- [ ] **Step 3: Modify Match.js**

In `Match.js`:

Add `this.suddenDeath = false;` in constructor.

Add a `_processRespawns` method:

```js
_processRespawns() {
  const now = Date.now();
  for (const slot of ['A', 'B']) {
    const p = this.players[slot];
    if (p.dead && now >= p.respawnAt) {
      const enemy = this.players[slot === 'A' ? 'B' : 'A'];
      const sp = pickFarSpawn(enemy.x, enemy.y);
      p.x = sp.x; p.y = sp.y;
      p.hp = 100; p.dead = false; p.respawnAt = 0;
      p.weapon = 'pistol'; p.pickupWeapon = null;
      p.ammo = WEAPONS.pistol.magSize;
      p.reloadingUntil = 0;
      this.events.push({ t: 'RESPAWN', player: p.id, x: p.x, y: p.y });
    }
  }
}

_checkEndConditions() {
  if (this.endedAt) return;
  // Score
  if (this.score.A >= 10) { this._endMatch('A', 'score'); return; }
  if (this.score.B >= 10) { this._endMatch('B', 'score'); return; }
  // Timer
  const elapsed = Date.now() - this.startedAt;
  if (elapsed >= 5 * 60 * 1000) {
    if (this.score.A === this.score.B) {
      this.suddenDeath = true;
      // First kill wins handled in _damage by re-checking _checkEndConditions
    } else {
      const winner = this.score.A > this.score.B ? 'A' : 'B';
      this._endMatch(winner, 'timeout');
    }
  }
}

_endMatch(winnerSlot, reason) {
  this.endedAt = Date.now();
  this.endReason = reason;
  this.winnerId = this.players[winnerSlot].id;
  this.events.push({
    t: 'MATCH_END',
    winner: this.players[winnerSlot].id,
    finalScore: { A: this.score.A, B: this.score.B },
    reason,
  });
}
```

Update `tick`:

```js
tick(dt) {
  if (this.endedAt) return;
  this.tickCount++;
  this.events = [];
  this._processRespawns();
  this._processInputs(dt);
  this._stepBullets(dt);
  this._checkEndConditions();
}
```

Update `_damage`: at the end, if `this.suddenDeath`, immediately end match:

```js
if (target.hp === 0) {
  // ...existing kill logic...
  if (this.suddenDeath) this._endMatch(fromSlot, 'sudden_death');
}
```

- [ ] **Step 4: Run tests, fix, commit**

Run: `npx vitest run server/shooter/Match.endgame.test.js`
Expected: PASS.

```bash
git add server/shooter/Match.js server/shooter/Match.endgame.test.js
git commit -m "shooter: add respawn, scoring, and end-of-match logic"
```

---

## Task 8: Pickups

**Files:**
- Modify: `server/shooter/Match.js`
- Test: `server/shooter/Match.pickups.test.js`

- [ ] **Step 1: Write failing test**

Create `server/shooter/Match.pickups.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { Match } from './Match.js';

function setup() {
  return new Match({
    matchId: 'M', code: 'ABCD',
    p1: { id: 'A', name: 'A' },
    p2: { id: 'B', name: 'B' },
  });
}

describe('Match — pickups', () => {
  it('walking onto a pickup grants weapon and emits PICKUP event', () => {
    const m = setup();
    const pu = m.pickups[0]; // shotgun pickup
    m.players.A.x = pu.x; m.players.A.y = pu.y;
    m.tick(1/30);
    expect(m.players.A.weapon).toBe(pu.kind);
    expect(m.players.A.pickupWeapon).toBe(null); // pistol stays as backup
    expect(m.pickups[0].available).toBe(false);
    expect(m.events.some(e => e.t === 'PICKUP' && e.player === 'A')).toBe(true);
  });

  it('pickup respawns after 15s', () => {
    const m = setup();
    const pu = m.pickups[0];
    m.players.A.x = pu.x; m.players.A.y = pu.y;
    m.tick(1/30);
    expect(m.pickups[0].available).toBe(false);
    // Force time travel
    m.pickups[0].respawnAt = Date.now() - 100;
    m.tick(1/30);
    expect(m.pickups[0].available).toBe(true);
  });

  it('replacing pickup weapon via second pickup swaps current to backup', () => {
    const m = setup();
    // First grab shotgun
    m.players.A.x = m.pickups[0].x; m.players.A.y = m.pickups[0].y;
    m.tick(1/30);
    expect(m.players.A.weapon).toBe('shotgun');
    // Now grab smg
    const smgPickup = m.pickups.find(p => p.kind === 'smg');
    smgPickup.available = true;
    m.players.A.x = smgPickup.x; m.players.A.y = smgPickup.y;
    m.tick(1/30);
    expect(m.players.A.weapon).toBe('smg');
    // (shotgun is discarded — pickupWeapon stays null per our pistol+pickup model)
  });
});
```

Note the pickup model per spec §5.2: "Always carries: pistol with infinite reserve ammo + one pickup weapon." So picking up a new pickup REPLACES the current pickup weapon, not creates a third slot. Picking up a pickup makes `weapon = pickupKind` and `pickupWeapon = pickupKind` (so swap returns to pistol). When the player presses swap, they swap between pistol and pickupWeapon. Update `_trySwap` accordingly.

Revise the model in this task:
- `weapon`: currently equipped (the one used to fire)
- `pickupWeapon`: stored pickup (null = nothing). When you pick up X:
  - Set both `weapon = X` and `pickupWeapon = X` (you're now holding it)
- Swap: if `pickupWeapon != null`, toggle weapon between `pistol` and `pickupWeapon`.
- On respawn: clear pickupWeapon, weapon = pistol.

Adjust the test's assertion: `m.players.A.pickupWeapon` should be `'shotgun'` (the held pickup), not null. Fix the test:

```js
expect(m.players.A.pickupWeapon).toBe('shotgun');
```

Also adjust the swap test in Task 6 (no swap test there yet — fine).

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run server/shooter/Match.pickups.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement pickup logic in Match.js**

Add method:

```js
_processPickups() {
  const now = Date.now();
  for (const pu of this.pickups) {
    if (!pu.available) {
      if (now >= pu.respawnAt) pu.available = true;
      continue;
    }
    for (const slot of ['A', 'B']) {
      const p = this.players[slot];
      if (p.dead) continue;
      const dx = p.x - pu.x, dy = p.y - pu.y;
      if (dx*dx + dy*dy < (16 + 24) ** 2) {
        // Grant pickup
        p.weapon = pu.kind;
        p.pickupWeapon = pu.kind;
        p.ammo = WEAPONS[pu.kind].magSize;
        p.reloadingUntil = 0;
        pu.available = false;
        pu.respawnAt = now + 15000;
        this.events.push({ t: 'PICKUP', player: slot, pickupId: pu.id, kind: pu.kind });
        break;
      }
    }
  }
}
```

Fix `_trySwap` to match new model:

```js
_trySwap(p) {
  if (!p.pickupWeapon) return;
  p.weapon = p.weapon === 'pistol' ? p.pickupWeapon : 'pistol';
  p.ammo = WEAPONS[p.weapon].magSize;
  p.reloadingUntil = 0;
}
```

Insert `_processPickups` call into `tick` between inputs and bullets:

```js
tick(dt) {
  if (this.endedAt) return;
  this.tickCount++;
  this.events = [];
  this._processRespawns();
  this._processInputs(dt);
  this._processPickups();
  this._stepBullets(dt);
  this._checkEndConditions();
}
```

- [ ] **Step 4: Run tests, commit**

```bash
npx vitest run server/shooter/Match.pickups.test.js
git add server/shooter/Match.js server/shooter/Match.pickups.test.js
git commit -m "shooter: add pickup grab and respawn"
```

- [ ] **Step 5: Add drop-on-death test (extends spec §5.1)**

Append to `server/shooter/Match.pickups.test.js`:

```js
it('drops pickup weapon as temp pickup on death (8s ttl)', () => {
  const m = setup();
  // Give A a shotgun
  m.players.A.weapon = 'shotgun'; m.players.A.pickupWeapon = 'shotgun';
  // Kill A
  m.players.A.x = 500; m.players.A.y = 500;
  m._damage(m.players.A, 999, 'B', 'pistol');
  expect(m.pickups.find(p => p.kind === 'shotgun' && p.temporary)).toBeTruthy();
});

it('does not drop pistol on death', () => {
  const m = setup();
  m.players.A.weapon = 'pistol'; m.players.A.pickupWeapon = null;
  m._damage(m.players.A, 999, 'B', 'pistol');
  const tempPickups = m.pickups.filter(p => p.temporary);
  expect(tempPickups.length).toBe(0);
});

it('temp pickup expires after 8s', () => {
  const m = setup();
  m.players.A.weapon = 'shotgun'; m.players.A.pickupWeapon = 'shotgun';
  m._damage(m.players.A, 999, 'B', 'pistol');
  const temp = m.pickups.find(p => p.temporary);
  temp.expiresAt = Date.now() - 100;
  m.tick(1/30);
  expect(m.pickups.find(p => p.id === temp.id)).toBeUndefined();
});
```

- [ ] **Step 6: Run, expect failure**

Run: `npx vitest run server/shooter/Match.pickups.test.js`
Expected: 3 new failing tests.

- [ ] **Step 7: Implement drop-on-death**

In `server/shooter/Match.js`, modify `_damage` so that when a kill happens, drop the player's pickup (if any) as a temporary pickup:

```js
_damage(target, amount, fromSlot, weapon) {
  if (target.dead) return;
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) {
    target.dead = true;
    target.respawnAt = Date.now() + 2000;
    this.score[fromSlot]++;
    this.events.push({ t: 'KILL', killer: this.players[fromSlot].id, victim: target.id, weapon, at: { x: target.x, y: target.y } });
    // Drop pickup weapon (if any, never the pistol)
    if (target.pickupWeapon && target.pickupWeapon !== 'pistol') {
      this.pickups.push({
        id: this._nextTempPickupId(),
        kind: target.pickupWeapon,
        x: target.x, y: target.y,
        available: true,
        respawnAt: 0,
        temporary: true,
        expiresAt: Date.now() + 8000,
      });
    }
    if (this.suddenDeath) this._endMatch(fromSlot, 'sudden_death');
  }
}

_nextTempPickupId() {
  const max = this.pickups.reduce((m, p) => Math.max(m, p.id), 0);
  return max + 1;
}
```

Add expiration sweep into `_processPickups`:

```js
_processPickups() {
  const now = Date.now();
  // Expire temp pickups
  this.pickups = this.pickups.filter(p => !p.temporary || (p.available && now < p.expiresAt));
  // (rest of method unchanged)
  for (const pu of this.pickups) {
    // ...
  }
}
```

- [ ] **Step 8: Run tests pass and commit**

Run: `npx vitest run server/shooter/Match.pickups.test.js`
Expected: PASS.

```bash
git add server/shooter/Match.js server/shooter/Match.pickups.test.js
git commit -m "shooter: drop pickup weapon on death (8s temp pickup)"
```

---

## Task 9: GameLoop — drive Match.tick at 30Hz, broadcast snapshots at 20Hz

**Files:**
- Create: `server/shooter/GameLoop.js`
- Test: `server/shooter/GameLoop.test.js`

- [ ] **Step 1: Write failing test**

Create `server/shooter/GameLoop.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { GameLoop } from './GameLoop.js';

function fakeMatch() {
  return {
    tickCount: 0,
    endedAt: null,
    events: [],
    tick: vi.fn(function () { this.tickCount++; }),
    serializeSnapshot: vi.fn(function () { return { tick: this.tickCount, players: [], bullets: [], pickups: [], score: {A:0,B:0}, timeLeftMs: 0 }; }),
  };
}

describe('GameLoop', () => {
  it('calls tick at ~30Hz and snapshot at ~20Hz over 1 second', async () => {
    vi.useFakeTimers();
    const m = fakeMatch();
    const sent = [];
    const loop = new GameLoop({
      match: m,
      onSnapshot: snap => sent.push(snap),
      onEvent: () => {},
    });
    loop.start();
    vi.advanceTimersByTime(1000);
    loop.stop();
    // Tick rate 30Hz over 1s: ~30 calls (allow ±2)
    expect(m.tick.mock.calls.length).toBeGreaterThanOrEqual(28);
    expect(m.tick.mock.calls.length).toBeLessThanOrEqual(32);
    // Snapshot 20Hz: ~20 sends
    expect(sent.length).toBeGreaterThanOrEqual(18);
    expect(sent.length).toBeLessThanOrEqual(22);
    vi.useRealTimers();
  });

  it('flushes events through onEvent', () => {
    vi.useFakeTimers();
    const m = fakeMatch();
    m.tick = function () { this.events = [{ t: 'KILL', killer: 'A', victim: 'B' }]; };
    const events = [];
    const loop = new GameLoop({ match: m, onSnapshot: () => {}, onEvent: e => events.push(e) });
    loop.start();
    vi.advanceTimersByTime(50);
    loop.stop();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].t).toBe('KILL');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run server/shooter/GameLoop.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement GameLoop.js**

```js
const TICK_HZ = 30;
const SNAP_HZ = 20;
const TICK_MS = 1000 / TICK_HZ;
const SNAP_MS = 1000 / SNAP_HZ;

export class GameLoop {
  constructor({ match, onSnapshot, onEvent }) {
    this.match = match;
    this.onSnapshot = onSnapshot;
    this.onEvent = onEvent;
    this.tickInterval = null;
    this.snapInterval = null;
  }

  start() {
    this.tickInterval = setInterval(() => {
      if (this.match.endedAt) return;
      this.match.tick(TICK_MS / 1000);
      // flush events
      if (this.match.events && this.match.events.length) {
        for (const e of this.match.events) this.onEvent(e);
        this.match.events.length = 0;
      }
    }, TICK_MS);
    this.snapInterval = setInterval(() => {
      const snap = this.match.serializeSnapshot();
      this.onSnapshot(snap);
    }, SNAP_MS);
  }

  stop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.snapInterval) clearInterval(this.snapInterval);
    this.tickInterval = null;
    this.snapInterval = null;
  }
}
```

- [ ] **Step 4: Run tests, commit**

```bash
npx vitest run server/shooter/GameLoop.test.js
git add server/shooter/GameLoop.js server/shooter/GameLoop.test.js
git commit -m "shooter: add GameLoop driving Match at 30/20 Hz"
```

---

## Task 10: Server REST routes for shooter rooms

**Files:**
- Modify: `server.js`
- Test: integration via http (manual + scripted curl)

We register four REST endpoints. All hold a singleton `MatchManager` instance attached to `globalThis.shooterMgr`.

- [ ] **Step 1: Modify server.js — add imports + manager**

Near the top of `server.js`, after existing imports, add:

```js
import { MatchManager } from './server/shooter/MatchManager.js';
import { Match } from './server/shooter/Match.js';
import { GameLoop } from './server/shooter/GameLoop.js';
import { MSG } from './server/shooter/protocol.js';

const shooterMgr = new MatchManager({ maxConcurrent: 4 });
globalThis.shooterMgr = shooterMgr;
const matchSockets = new Map();         // matchCode -> { A: ws|null, B: ws|null }
const matchLoops = new Map();           // matchCode -> GameLoop
setInterval(() => shooterMgr.expireWaitingRooms(), 60_000);
```

- [ ] **Step 2: Add routes**

Add these routes (after the existing routes, before `wss.on('connection')`):

```js
// Create shooter room
app.post('/api/shooter/rooms', (req, res) => {
  const { hostId, hostName } = req.body;
  if (!hostId || !hostName) return res.status(400).json({ error: 'hostId and hostName required' });
  try {
    const room = shooterMgr.createRoom({ hostId, hostName });
    res.json({ code: room.code, hostId: room.hostId });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});

// Join shooter room
app.post('/api/shooter/rooms/:code/join', (req, res) => {
  const { guestId, guestName } = req.body;
  if (!guestId || !guestName) return res.status(400).json({ error: 'guestId and guestName required' });
  const r = shooterMgr.joinRoom(req.params.code, { guestId, guestName });
  if (!r.ok) return res.status(r.reason === 'not_found' ? 404 : 409).json({ error: r.reason });
  res.json({ ok: true, code: req.params.code });
});

// Force-add a bot to room (for "Add Bot Now" or Practice)
app.post('/api/shooter/rooms/:code/bot', (req, res) => {
  const difficulty = req.body.difficulty || 'normal';
  const r = shooterMgr.joinRoom(req.params.code, {
    guestId: 'bot-' + req.params.code,
    guestName: `Bot (${difficulty})`,
    isBot: true,
    botDifficulty: difficulty,
  });
  if (!r.ok) return res.status(r.reason === 'not_found' ? 404 : 409).json({ error: r.reason });
  res.json({ ok: true });
});

// Practice mode shortcut
app.post('/api/shooter/practice', (req, res) => {
  const { hostId, hostName, difficulty = 'normal' } = req.body;
  if (!hostId || !hostName) return res.status(400).json({ error: 'hostId and hostName required' });
  try {
    const room = shooterMgr.createRoom({ hostId, hostName });
    shooterMgr.joinRoom(room.code, {
      guestId: 'bot-' + room.code,
      guestName: `Bot (${difficulty})`,
      isBot: true,
      botDifficulty: difficulty,
    });
    res.json({ code: room.code });
  } catch (e) {
    res.status(503).json({ error: e.message });
  }
});
```

- [ ] **Step 3: Manual smoke test**

Start the server: `npm run server`
In another terminal:

```bash
curl -s -X POST http://localhost:3001/api/shooter/rooms -H 'content-type: application/json' -d '{"hostId":"u1","hostName":"Alice"}'
# → { "code": "XXXX", "hostId": "u1" }
```

Use the returned code to test join/bot/practice. Confirm 4xx responses for bad inputs.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "shooter: add REST endpoints for room create/join/bot/practice"
```

---

## Task 11: Server WS routing — JOIN_MATCH, INPUT, LEAVE_MATCH

**Files:**
- Modify: `server.js`

Players already have a WS connection via existing auth flow. After joining a room (REST), the client sends `JOIN_MATCH` over WS to signal "I'm at the match screen and ready to receive snapshots." When both sockets are bound, the server starts the `GameLoop`.

- [ ] **Step 1: Add WS message handlers**

Inside the existing `wss.on('connection', (ws) => { ... })` switch statement, add cases:

```js
case MSG.JOIN_MATCH: {
  const { code, playerId } = message;
  const room = shooterMgr.getRoom(code);
  if (!room) {
    ws.send(JSON.stringify({ t: MSG.MATCH_END, reason: 'not_found' }));
    break;
  }
  let slot = null;
  if (room.hostId === playerId) slot = 'A';
  else if (room.guestId === playerId) slot = 'B';
  if (!slot) {
    ws.send(JSON.stringify({ t: MSG.MATCH_END, reason: 'not_in_room' }));
    break;
  }
  if (!matchSockets.has(code)) matchSockets.set(code, { A: null, B: null });
  matchSockets.get(code)[slot] = ws;
  ws._shooter = { code, slot };

  // If both slots bound (or B is bot), start the match if not already started
  const sockets = matchSockets.get(code);
  const bothReady = sockets.A && (sockets.B || room.isBotGuest);
  if (bothReady && !room.match) {
    const match = new Match({
      matchId: code,
      code,
      p1: { id: room.hostId,  name: room.hostName },
      p2: { id: room.guestId, name: room.guestName, isBot: room.isBotGuest },
    });
    shooterMgr.setMatch(code, match);
    const loop = new GameLoop({
      match,
      onSnapshot: (snap) => broadcastToMatch(code, { t: MSG.SNAP, ackSeq: 0, ...snap, /* per-socket ack injected below */ }),
      onEvent: (ev) => broadcastToMatch(code, { ...ev }),
    });
    matchLoops.set(code, loop);
    loop.start();
    broadcastToMatch(code, { t: MSG.MATCH_START, code, players: { A: room.hostId, B: room.guestId } });
  }
  break;
}

case MSG.INPUT: {
  const sm = ws._shooter;
  if (!sm) break;
  const room = shooterMgr.getRoom(sm.code);
  if (!room || !room.match) break;
  room.match.applyInput(sm.slot, message);
  break;
}

case MSG.LEAVE_MATCH: {
  endShooterMatch(ws, 'left');
  break;
}

case MSG.REMATCH_REQUEST: {
  const sm = ws._shooter;
  if (!sm) break;
  handleRematchRequest(sm.code, sm.slot);
  break;
}
```

- [ ] **Step 2: Add helpers**

In `server.js`, add (above `wss.on('connection', ...)`):

```js
function broadcastToMatch(code, msg) {
  const sockets = matchSockets.get(code);
  if (!sockets) return;
  const slots = ['A', 'B'];
  for (const slot of slots) {
    const s = sockets[slot];
    if (!s || s.readyState !== WebSocket.OPEN) continue;
    let toSend = msg;
    // Inject per-player ackSeq into SNAP messages
    if (msg.t === MSG.SNAP) {
      const room = shooterMgr.getRoom(code);
      const ackSeq = room?.match?.getAckSeq?.(slot) ?? 0;
      toSend = { ...msg, ackSeq };
    }
    s.send(JSON.stringify(toSend));
  }
}

function endShooterMatch(ws, reason) {
  const sm = ws._shooter;
  if (!sm) return;
  const { code, slot } = sm;
  const sockets = matchSockets.get(code);
  if (!sockets) return;
  sockets[slot] = null;
  ws._shooter = null;
  // If the other socket is gone, tear down
  if (!sockets.A && !sockets.B) {
    const loop = matchLoops.get(code);
    if (loop) { loop.stop(); matchLoops.delete(code); }
    matchSockets.delete(code);
    shooterMgr.removeRoom(code);
    return;
  }
  // Otherwise notify the remaining player after a 5s grace
  const remainSlot = slot === 'A' ? 'B' : 'A';
  setTimeout(() => {
    const cur = matchSockets.get(code);
    if (!cur) return;
    if (cur[slot]) return;       // they reconnected
    if (cur[remainSlot] && cur[remainSlot].readyState === WebSocket.OPEN) {
      cur[remainSlot].send(JSON.stringify({
        t: MSG.MATCH_END,
        winner: shooterMgr.getRoom(code)?.[remainSlot === 'A' ? 'hostId' : 'guestId'],
        finalScore: shooterMgr.getRoom(code)?.match?.score ?? { A: 0, B: 0 },
        reason: 'opponent_disconnected',
      }));
    }
    const loop = matchLoops.get(code);
    if (loop) { loop.stop(); matchLoops.delete(code); }
    matchSockets.delete(code);
    shooterMgr.removeRoom(code);
  }, 5000);
}

function handleRematchRequest(code, slot) {
  const room = shooterMgr.getRoom(code);
  if (!room) return;
  room.rematch = room.rematch || { A: false, B: false };
  room.rematch[slot] = true;
  if (room.rematch.A && room.rematch.B) {
    const loop = matchLoops.get(code);
    if (loop) loop.stop();
    const match = new Match({
      matchId: code, code,
      p1: { id: room.hostId,  name: room.hostName },
      p2: { id: room.guestId, name: room.guestName, isBot: room.isBotGuest },
    });
    room.match = match;
    room.state = 'playing';
    room.rematch = { A: false, B: false };
    const newLoop = new GameLoop({
      match,
      onSnapshot: (snap) => broadcastToMatch(code, { t: MSG.SNAP, ackSeq: 0, ...snap }),
      onEvent: (ev) => broadcastToMatch(code, { ...ev }),
    });
    matchLoops.set(code, newLoop);
    newLoop.start();
    broadcastToMatch(code, { t: MSG.MATCH_START, code, players: { A: room.hostId, B: room.guestId } });
  }
}
```

Also in the existing `ws.on('close', ...)` handler, add at the top:

```js
if (ws._shooter) endShooterMatch(ws, 'disconnect');
```

- [ ] **Step 3: Smoke test with raw WS**

Start `npm run server`. Use a quick wscat or Node script to:
- POST /api/auth/login (existing) for two userIds
- POST /api/shooter/rooms with hostId=u1
- POST /api/shooter/rooms/<code>/join with guestId=u2
- Open two WS connections, send JOIN_MATCH for each
- Confirm both receive a `MATCH_START` followed by `SNAP` messages

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "shooter: WS routing for JOIN_MATCH/INPUT/LEAVE/REMATCH + start GameLoop"
```

---

## Task 12: Server-side bot AI

**Files:**
- Create: `server/shooter/Bot.js`
- Modify: `server/shooter/Match.js` (call bot decision once per tick if guest is bot)
- Test: `server/shooter/Bot.test.js`

- [ ] **Step 1: Write failing test**

Create `server/shooter/Bot.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { Bot } from './Bot.js';

function dummyMatch(overrides = {}) {
  return {
    players: {
      A: { id:'A', x:100, y:100, hp:100, dead:false, weapon:'pistol', aim:0, ...overrides.A },
      B: { id:'B', x:300, y:100, hp:100, dead:false, weapon:'pistol', aim:0, ...overrides.B },
    },
    pickups: [{ id:1, kind:'shotgun', x:200, y:200, available:true }],
  };
}

describe('Bot', () => {
  it('produces an INPUT-shaped message each tick', () => {
    const b = new Bot({ slot: 'B', difficulty: 'normal' });
    const inp = b.decide(dummyMatch(), 1/30);
    expect(inp).toHaveProperty('mv');
    expect(inp).toHaveProperty('aim');
    expect(typeof inp.fire).toBe('boolean');
  });

  it('engages: aims toward enemy when in line of sight', () => {
    const b = new Bot({ slot: 'B', difficulty: 'hard' });
    const m = dummyMatch();
    // Wait past reaction lag
    for (let i = 0; i < 10; i++) b.decide(m, 1/30);
    const inp = b.decide(m, 1/30);
    // Enemy is to the left → aim near π
    expect(Math.abs(inp.aim - Math.PI)).toBeLessThan(0.5);
  });

  it('flees when low HP toward pickup', () => {
    const b = new Bot({ slot: 'B', difficulty: 'normal' });
    const m = dummyMatch({ B: { hp: 20 } });
    const inp = b.decide(m, 1/30);
    // Pickup is south-east of B, so mv should be toward (200,200)
    expect(inp.mv.x).toBeLessThan(0.1);   // slightly west
    expect(inp.mv.y).toBeGreaterThan(0.1); // south
  });

  it('easy difficulty has higher reaction lag (delays first shot)', () => {
    const easy = new Bot({ slot: 'B', difficulty: 'easy' });
    const m = dummyMatch();
    let fired = false;
    for (let i = 0; i < 5; i++) {
      const inp = easy.decide(m, 1/30);
      if (inp.fire) fired = true;
    }
    // 5 ticks = 167ms, easy reaction = 500ms → not fired yet
    expect(fired).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run server/shooter/Bot.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement Bot.js**

```js
const PROFILES = {
  easy:   { reactionMs: 500, accuracy: 0.60, contestPickups: false, prefSniper: false },
  normal: { reactionMs: 250, accuracy: 0.80, contestPickups: true,  prefSniper: false },
  hard:   { reactionMs: 100, accuracy: 0.92, contestPickups: true,  prefSniper: true  },
};

export class Bot {
  constructor({ slot, difficulty = 'normal' }) {
    this.slot = slot;
    this.profile = PROFILES[difficulty] ?? PROFILES.normal;
    this.elapsedMs = 0;
    this.seq = 0;
    this.targetAim = 0;
  }

  decide(match, dt) {
    this.elapsedMs += dt * 1000;
    const me = match.players[this.slot];
    const enemy = match.players[this.slot === 'A' ? 'B' : 'A'];
    if (!me || me.dead) return this._idle();

    const lowHp = me.hp < 30;
    const reactionReady = this.elapsedMs > this.profile.reactionMs;

    let mv = { x: 0, y: 0 };
    let fire = false;
    let aim = me.aim;

    if (lowHp && match.pickups?.some(p => p.available)) {
      // Flee toward nearest available pickup
      const target = match.pickups.find(p => p.available);
      const dx = target.x - me.x, dy = target.y - me.y;
      const len = Math.hypot(dx, dy) || 1;
      mv = { x: dx / len, y: dy / len };
      aim = Math.atan2(dy, dx);
    } else if (enemy && !enemy.dead && reactionReady) {
      // Engage
      const dx = enemy.x - me.x, dy = enemy.y - me.y;
      const dist = Math.hypot(dx, dy);
      const idealAim = Math.atan2(dy, dx);
      // Aim with accuracy noise
      const miss = (1 - this.profile.accuracy) * 0.4;
      aim = idealAim + (Math.random() - 0.5) * 2 * miss;
      // Strafe slightly
      mv = { x: Math.cos(idealAim + Math.PI / 2) * 0.4, y: Math.sin(idealAim + Math.PI / 2) * 0.4 };
      // Fire if close enough
      if (dist < 600) fire = true;
    } else {
      // Roam toward map center
      const cx = 1920 / 2, cy = 1280 / 2;
      const dx = cx - me.x, dy = cy - me.y;
      const len = Math.hypot(dx, dy) || 1;
      mv = { x: dx / len, y: dy / len };
    }

    return {
      seq: ++this.seq,
      mv, aim, fire,
      swap: false,
      reload: me.ammo === 0,
    };
  }

  _idle() {
    return { seq: ++this.seq, mv: { x: 0, y: 0 }, aim: 0, fire: false, swap: false, reload: false };
  }
}
```

- [ ] **Step 4: Wire into Match.js**

In Match constructor, if `p2.isBot`:

```js
import { Bot } from './Bot.js';
// ...
if (p2.isBot) {
  this.bot = new Bot({ slot: 'B', difficulty: p2.botDifficulty || 'normal' });
}
```

In `tick`, before `_processInputs`:

```js
if (this.bot && !this.endedAt) {
  const inp = this.bot.decide(this, dt);
  this.applyInput('B', inp);
}
```

Also accept `botDifficulty` in `_mkPlayer`'s `info` if present and store on player object so the Match constructor knows it. Easiest: pass `botDifficulty` directly into Match constructor as part of `p2`.

- [ ] **Step 5: Tests pass and commit**

```bash
npx vitest run server/shooter/Bot.test.js
git add server/shooter/Bot.js server/shooter/Match.js server/shooter/Bot.test.js
git commit -m "shooter: add server-side bot AI (easy/normal/hard)"
```

---

## Task 13: Auto-add bot after 30s in waiting room

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Schedule bot fill on room creation**

In the `POST /api/shooter/rooms` handler (added in Task 10), after `shooterMgr.createRoom(...)`, schedule a bot fill:

```js
const code = room.code;
setTimeout(() => {
  const r = shooterMgr.getRoom(code);
  if (!r) return;
  if (r.guestId) return;
  if (r.state !== 'waiting') return;
  shooterMgr.joinRoom(code, {
    guestId: 'bot-' + code,
    guestName: 'Bot (normal)',
    isBot: true,
    botDifficulty: 'normal',
  });
  // Notify host via WS that room is now joinable / start match if host already on JOIN_MATCH
  const sockets = matchSockets.get(code);
  if (sockets && sockets.A) {
    // Re-trigger JOIN_MATCH path: just call internal start logic by re-invoking handler stub.
    // Simplest: send a synthetic message back to the host telling client "guest joined", and the
    // host's existing flow will call match start when it gets MATCH_START. But we want server-initiated.
    // Instead, directly start the match here:
    if (!r.match) {
      const match = new Match({
        matchId: code, code,
        p1: { id: r.hostId, name: r.hostName },
        p2: { id: r.guestId, name: r.guestName, isBot: true, botDifficulty: r.botDifficulty },
      });
      shooterMgr.setMatch(code, match);
      const loop = new GameLoop({
        match,
        onSnapshot: (snap) => broadcastToMatch(code, { t: MSG.SNAP, ackSeq: 0, ...snap }),
        onEvent: (ev) => broadcastToMatch(code, { ...ev }),
      });
      matchLoops.set(code, loop);
      loop.start();
      broadcastToMatch(code, { t: MSG.MATCH_START, code, players: { A: r.hostId, B: r.guestId } });
    }
  }
}, 30_000);
```

(Yes, this duplicates a chunk of the JOIN_MATCH start path. Acceptable for v1; refactor into `startMatchIfReady(code)` helper if it bothers you.)

- [ ] **Step 2: Refactor — extract `startMatchIfReady(code)`**

Pull the duplicated start logic into a helper function `startMatchIfReady(code)` and call it from both:
- the JOIN_MATCH handler (after binding socket to slot)
- the 30s bot-fill setTimeout
- the Practice room creation (Task 10) — call immediately after creating the bot guest

Function:

```js
function startMatchIfReady(code) {
  const r = shooterMgr.getRoom(code);
  if (!r || r.match) return;
  const sockets = matchSockets.get(code);
  const hostBound = sockets?.A;
  const guestBound = sockets?.B || r.isBotGuest;
  if (!hostBound || !guestBound) return;
  const match = new Match({
    matchId: code, code,
    p1: { id: r.hostId, name: r.hostName },
    p2: { id: r.guestId, name: r.guestName, isBot: r.isBotGuest, botDifficulty: r.botDifficulty },
  });
  shooterMgr.setMatch(code, match);
  const loop = new GameLoop({
    match,
    onSnapshot: (snap) => broadcastToMatch(code, { t: MSG.SNAP, ackSeq: 0, ...snap }),
    onEvent: (ev) => broadcastToMatch(code, { ...ev }),
  });
  matchLoops.set(code, loop);
  loop.start();
  broadcastToMatch(code, { t: MSG.MATCH_START, code, players: { A: r.hostId, B: r.guestId } });
}
```

Replace the inline match-start logic in:
- The JOIN_MATCH switch case (Task 11): replace the "if (bothReady && !room.match)" block with `startMatchIfReady(code);`
- The 30s setTimeout above: same.

- [ ] **Step 3: Smoke test**

Start `npm run server`. POST a room, do nothing for 31s, verify (via logs you may add or by attempting JOIN as the host) that the room transitions to `playing`.

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "shooter: auto-fill empty room with normal bot after 30s"
```

---

## Task 14: Client — ShooterClient (WS connection + send INPUT)

**Files:**
- Create: `game/shooter/net/ShooterClient.ts`
- Test: `game/shooter/net/ShooterClient.test.ts`

`ShooterClient` is a thin event-emitter wrapper around `WebSocket`. Phaser scene + React HUD subscribe to it.

- [ ] **Step 1: Write failing test (with mock WS)**

Create `game/shooter/net/ShooterClient.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShooterClient } from './ShooterClient';

class MockWS {
  static OPEN = 1;
  readyState = 1;
  sent: any[] = [];
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close() { this.readyState = 3; this.onclose?.(); }
}

describe('ShooterClient', () => {
  let mock: MockWS;
  beforeEach(() => {
    mock = new MockWS();
    (globalThis as any).WebSocket = vi.fn(() => mock);
  });

  it('sends JOIN_MATCH on open', () => {
    const c = new ShooterClient({ url: 'ws://x', code: 'ABCD', playerId: 'u1', name: 'Alice' });
    c.connect();
    mock.onopen?.();
    expect(mock.sent[0].t).toBe('JOIN_MATCH');
    expect(mock.sent[0].code).toBe('ABCD');
  });

  it('sendInput packages INPUT message with seq', () => {
    const c = new ShooterClient({ url: 'ws://x', code: 'ABCD', playerId: 'u1', name: 'Alice' });
    c.connect();
    mock.onopen?.();
    mock.sent.length = 0;
    c.sendInput({ mv: { x: 1, y: 0 }, aim: 0, fire: false, swap: false, reload: false });
    expect(mock.sent[0].t).toBe('INPUT');
    expect(mock.sent[0].seq).toBe(1);
  });

  it('emits "snap" event on SNAP message', () => {
    const c = new ShooterClient({ url: 'ws://x', code: 'ABCD', playerId: 'u1', name: 'Alice' });
    const handler = vi.fn();
    c.on('snap', handler);
    c.connect();
    mock.onopen?.();
    mock.onmessage?.({ data: JSON.stringify({ t: 'SNAP', tick: 1, ackSeq: 0, players: [], bullets: [], pickups: [], score: {}, timeLeftMs: 0 }) });
    expect(handler).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run game/shooter/net/ShooterClient.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement ShooterClient.ts**

```ts
import { MSG, type SnapMsg } from './protocol';

type Handler = (data: any) => void;

interface ClientArgs {
  url: string;
  code: string;
  playerId: string;
  name: string;
}

export class ShooterClient {
  private url: string;
  private code: string;
  private playerId: string;
  private name: string;
  private ws: WebSocket | null = null;
  private seq = 0;
  private handlers: Record<string, Handler[]> = {};
  private isOpen = false;

  constructor(args: ClientArgs) {
    this.url = args.url;
    this.code = args.code;
    this.playerId = args.playerId;
    this.name = args.name;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.isOpen = true;
      this._send({ t: MSG.JOIN_MATCH, code: this.code, playerId: this.playerId, name: this.name });
      this._emit('open', null);
    };
    this.ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.t) {
        case MSG.SNAP:        this._emit('snap', msg as SnapMsg); break;
        case MSG.KILL:        this._emit('kill', msg); break;
        case MSG.PICKUP:      this._emit('pickup', msg); break;
        case MSG.MATCH_START: this._emit('matchStart', msg); break;
        case MSG.MATCH_END:   this._emit('matchEnd', msg); break;
        case MSG.RESPAWN:     this._emit('respawn', msg); break;
      }
    };
    this.ws.onclose = () => { this.isOpen = false; this._emit('close', null); };
  }

  sendInput(input: { mv: { x: number; y: number }; aim: number; fire: boolean; swap: boolean; reload: boolean }): number {
    this.seq++;
    this._send({ t: MSG.INPUT, seq: this.seq, ...input });
    return this.seq;
  }

  sendRematch(): void { this._send({ t: MSG.REMATCH_REQUEST, code: this.code }); }
  sendLeave(): void { this._send({ t: MSG.LEAVE_MATCH, code: this.code }); }

  on(event: string, handler: Handler): void {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  off(event: string, handler: Handler): void {
    this.handlers[event] = (this.handlers[event] || []).filter(h => h !== handler);
  }

  disconnect(): void { this.ws?.close(); }

  getSeq(): number { return this.seq; }

  private _send(msg: any): void {
    if (this.ws && this.isOpen && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private _emit(event: string, data: any): void {
    for (const h of this.handlers[event] || []) h(data);
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
npx vitest run game/shooter/net/ShooterClient.test.ts
git add game/shooter/net/ShooterClient.ts game/shooter/net/ShooterClient.test.ts
git commit -m "shooter: add ShooterClient WS wrapper"
```

---

## Task 15: Client — Prediction (local-player movement + reconciliation)

**Files:**
- Create: `game/shooter/net/Prediction.ts`
- Test: `game/shooter/net/Prediction.test.ts`

The local player applies its own input immediately for responsiveness. When SNAP arrives with `ackSeq = N`, snap to the server-confirmed position and re-apply inputs `> N`.

- [ ] **Step 1: Write failing test**

Create `game/shooter/net/Prediction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Prediction } from './Prediction';

describe('Prediction', () => {
  it('applies input immediately', () => {
    const p = new Prediction({ x: 100, y: 100, speed: 200, radius: 16 });
    p.applyInput({ seq: 1, mv: { x: 1, y: 0 } }, 1/30);
    const pos = p.getPosition();
    expect(pos.x).toBeGreaterThan(100);
  });

  it('reconciles to server position and re-applies later inputs', () => {
    const p = new Prediction({ x: 100, y: 100, speed: 200, radius: 16 });
    p.applyInput({ seq: 1, mv: { x: 1, y: 0 } }, 1/30);
    p.applyInput({ seq: 2, mv: { x: 1, y: 0 } }, 1/30);
    p.applyInput({ seq: 3, mv: { x: 1, y: 0 } }, 1/30);
    // Server confirmed seq=2 at x=120
    p.reconcile({ x: 120, y: 100, ackSeq: 2 }, 1/30);
    // Should have re-applied seq 3 on top of (120, 100)
    expect(p.getPosition().x).toBeGreaterThan(120);
    expect(p.getPosition().x).toBeLessThan(140);
  });

  it('drops inputs older than reconciled ack', () => {
    const p = new Prediction({ x: 100, y: 100, speed: 200, radius: 16 });
    p.applyInput({ seq: 1, mv: { x: 1, y: 0 } }, 1/30);
    p.reconcile({ x: 200, y: 100, ackSeq: 5 }, 1/30); // ack jumped past
    expect(p.getPosition()).toEqual({ x: 200, y: 100 });
    // Subsequent reconciles same ack stay stable
    p.reconcile({ x: 200, y: 100, ackSeq: 5 }, 1/30);
    expect(p.getPosition()).toEqual({ x: 200, y: 100 });
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run game/shooter/net/Prediction.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Prediction.ts**

```ts
interface InputFrame {
  seq: number;
  mv: { x: number; y: number };
  dt: number;
}

export class Prediction {
  private x: number;
  private y: number;
  private speed: number;
  private radius: number;
  private pending: InputFrame[] = [];

  constructor({ x, y, speed, radius }: { x: number; y: number; speed: number; radius: number }) {
    this.x = x; this.y = y; this.speed = speed; this.radius = radius;
  }

  applyInput(input: { seq: number; mv: { x: number; y: number } }, dt: number): void {
    this.pending.push({ seq: input.seq, mv: input.mv, dt });
    const { x, y } = this._step(this.x, this.y, input.mv, dt);
    this.x = x; this.y = y;
  }

  reconcile(server: { x: number; y: number; ackSeq: number }, _dt: number): void {
    this.x = server.x;
    this.y = server.y;
    // Drop acked inputs
    this.pending = this.pending.filter(f => f.seq > server.ackSeq);
    // Re-apply remaining
    for (const f of this.pending) {
      const { x, y } = this._step(this.x, this.y, f.mv, f.dt);
      this.x = x; this.y = y;
    }
  }

  getPosition() { return { x: this.x, y: this.y }; }

  private _step(x: number, y: number, mv: { x: number; y: number }, dt: number) {
    let mx = mv.x, my = mv.y;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    return { x: x + mx * this.speed * dt, y: y + my * this.speed * dt };
  }
}
```

- [ ] **Step 4: Run tests and commit**

```bash
npx vitest run game/shooter/net/Prediction.test.ts
git add game/shooter/net/Prediction.ts game/shooter/net/Prediction.test.ts
git commit -m "shooter: add client-side prediction with reconciliation"
```

---

## Task 16: Client — Interpolation buffer for remote entities

**Files:**
- Create: `game/shooter/net/Interpolation.ts`
- Test: `game/shooter/net/Interpolation.test.ts`

We hold the two most recent snapshots and render at `now - delayMs`, lerping between them.

- [ ] **Step 1: Write failing test**

Create `game/shooter/net/Interpolation.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { Interpolation } from './Interpolation';

describe('Interpolation', () => {
  it('returns single snapshot value when only one stored', () => {
    const buf = new Interpolation({ delayMs: 100 });
    buf.push({ serverTime: 1000, x: 50, y: 50 });
    expect(buf.getAt(1100)).toEqual({ x: 50, y: 50 });
  });

  it('lerps between two snapshots at the render time', () => {
    const buf = new Interpolation({ delayMs: 100 });
    buf.push({ serverTime: 1000, x: 0, y: 0 });
    buf.push({ serverTime: 1100, x: 100, y: 0 });
    // render time = 1100 → 1100-delay=1000 → return earliest snap
    expect(buf.getAt(1100)).toEqual({ x: 0, y: 0 });
    // render time = 1150 → render at 1050 → halfway
    const r = buf.getAt(1150)!;
    expect(r.x).toBeCloseTo(50, 1);
  });

  it('drops snapshots older than delay window', () => {
    const buf = new Interpolation({ delayMs: 100 });
    for (let t = 0; t < 1000; t += 50) buf.push({ serverTime: t, x: t / 10, y: 0 });
    // Should not retain all 20 snapshots
    expect(buf.size()).toBeLessThan(10);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run game/shooter/net/Interpolation.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement Interpolation.ts**

```ts
interface Snap { serverTime: number; x: number; y: number; }

export class Interpolation {
  private buf: Snap[] = [];
  private delayMs: number;

  constructor({ delayMs = 100 }: { delayMs?: number } = {}) {
    this.delayMs = delayMs;
  }

  push(s: Snap): void {
    this.buf.push(s);
    // Keep only last 5 snapshots — well past our delay window
    while (this.buf.length > 5) this.buf.shift();
  }

  getAt(now: number): { x: number; y: number } | null {
    if (this.buf.length === 0) return null;
    const t = now - this.delayMs;
    if (this.buf.length === 1 || t <= this.buf[0].serverTime) return { x: this.buf[0].x, y: this.buf[0].y };
    for (let i = 1; i < this.buf.length; i++) {
      const a = this.buf[i - 1], b = this.buf[i];
      if (t <= b.serverTime) {
        const f = (t - a.serverTime) / Math.max(1, b.serverTime - a.serverTime);
        return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
      }
    }
    const last = this.buf[this.buf.length - 1];
    return { x: last.x, y: last.y };
  }

  size(): number { return this.buf.length; }
}
```

- [ ] **Step 4: Tests pass and commit**

```bash
npx vitest run game/shooter/net/Interpolation.test.ts
git add game/shooter/net/Interpolation.ts game/shooter/net/Interpolation.test.ts
git commit -m "shooter: add interpolation buffer for remote entities"
```

---

## Task 17: ShooterPreloadScene — load top-down asset pack

**Files:**
- Create: `game/shooter/scenes/ShooterPreloadScene.ts`

- [ ] **Step 1: Implement preload scene**

Create `game/shooter/scenes/ShooterPreloadScene.ts`:

```ts
import * as Phaser from 'phaser';

export class ShooterPreloadScene extends Phaser.Scene {
  constructor() { super({ key: 'ShooterPreload' }); }

  preload(): void {
    const root = '/Top-down shooter asset pack';
    this.load.image('shooter-skins',   `${root}/Skins.png`);
    this.load.image('shooter-weapons', `${root}/Weapons.png`);
    this.load.image('shooter-tileset', `${root}/Tileset with cell size 256x256.png`);
  }

  create(): void {
    const ctx = this.registry.get('shooterContext');
    this.scene.start('Shooter', ctx);
  }
}
```

- [ ] **Step 2: Manual smoke test**

Wire this scene into a temporary `npm run dev` test page after Task 18 to verify assets load. (Skip running for now; covered in Task 18 smoke test.)

- [ ] **Step 3: Commit**

```bash
git add game/shooter/scenes/ShooterPreloadScene.ts
git commit -m "shooter: add Preload scene that loads asset pack"
```

---

## Task 18: ShooterScene — render players, walls, camera follow

**Files:**
- Create: `game/shooter/scenes/ShooterScene.ts`

The scene receives a `ShooterClient` and a `localPlayerId` via `this.scene.start('Shooter', { client, localPlayerId })`.

- [ ] **Step 1: Implement ShooterScene.ts**

Create `game/shooter/scenes/ShooterScene.ts`:

```ts
import * as Phaser from 'phaser';
import { WALLS, MAP_WIDTH, MAP_HEIGHT, PICKUP_SPAWNS } from '../config/map';
import { Prediction } from '../net/Prediction';
import { Interpolation } from '../net/Interpolation';
import type { ShooterClient } from '../net/ShooterClient';
import type { SnapMsg, SnapPlayer, SnapBullet, SnapPickup } from '../net/protocol';

interface InitData {
  client: ShooterClient;
  localPlayerId: string;
}

export class ShooterScene extends Phaser.Scene {
  private client!: ShooterClient;
  private localPlayerId!: string;
  private localSlot: 'A' | 'B' | null = null;

  private playerSprites = new Map<string, Phaser.GameObjects.Container>();
  private bulletSprites = new Map<number, Phaser.GameObjects.Arc>();
  private pickupSprites = new Map<number, Phaser.GameObjects.Container>();

  private prediction!: Prediction;
  private remoteInterp = new Map<string, Interpolation>();

  private latestSnap: SnapMsg | null = null;

  constructor() { super({ key: 'Shooter' }); }

  init(data: InitData) {
    this.client = data.client;
    this.localPlayerId = data.localPlayerId;
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1a26');
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Draw walls as static rectangles
    const g = this.add.graphics();
    g.fillStyle(0x3a3a4a, 1);
    g.lineStyle(2, 0x6a6a8a, 1);
    for (const w of WALLS) {
      g.fillRect(w.x, w.y, w.w, w.h);
      g.strokeRect(w.x, w.y, w.w, w.h);
    }

    // Pickup placeholders
    for (const sp of PICKUP_SPAWNS) {
      const c = this.add.container(sp.x, sp.y);
      const ring = this.add.circle(0, 0, 24, 0x44ff88, 0.3);
      const label = this.add.text(0, 0, sp.kind[0].toUpperCase(), { fontSize: '20px', color: '#ffffff' }).setOrigin(0.5);
      c.add([ring, label]);
      this.pickupSprites.set(sp.id, c);
    }

    // Hook client events
    this.client.on('snap', (snap: SnapMsg) => this._onSnap(snap));
    this.client.on('matchStart', (msg: any) => this._onMatchStart(msg));

    // Local prediction starts at (0,0) until first snapshot
    this.prediction = new Prediction({ x: 0, y: 0, speed: 200, radius: 16 });
  }

  private _onMatchStart(msg: { code: string; players: { A: string; B: string } }) {
    this.localSlot = msg.players.A === this.localPlayerId ? 'A' : 'B';
  }

  private _onSnap(snap: SnapMsg) {
    this.latestSnap = snap;

    for (const sp of snap.players) {
      let cont = this.playerSprites.get(sp.id);
      if (!cont) {
        const c = this.add.container(sp.x, sp.y);
        const body = this.add.circle(0, 0, 16, sp.id === this.localPlayerId ? 0x66aaff : 0xff6666);
        const aim = this.add.rectangle(20, 0, 24, 4, 0xffffff).setOrigin(0, 0.5);
        const name = this.add.text(0, -30, sp.id.slice(0, 6), { fontSize: '12px', color: '#fff' }).setOrigin(0.5);
        c.add([body, aim, name]);
        this.playerSprites.set(sp.id, c);
        cont = c;
      }
      if (sp.id === this.localPlayerId) {
        const slot = sp.slot as 'A' | 'B';
        // Reconcile prediction
        this.prediction.reconcile({ x: sp.x, y: sp.y, ackSeq: snap.ackSeq }, 1/30);
        const pos = this.prediction.getPosition();
        cont.setPosition(pos.x, pos.y);
        this.cameras.main.startFollow(cont, true, 0.2, 0.2);
      } else {
        let interp = this.remoteInterp.get(sp.id);
        if (!interp) { interp = new Interpolation({ delayMs: 100 }); this.remoteInterp.set(sp.id, interp); }
        interp.push({ serverTime: snap.serverTime ?? Date.now(), x: sp.x, y: sp.y });
      }
      cont.setRotation(sp['aim'] ?? 0);
      cont.setVisible(!sp.dead);
    }

    // Bullets
    const seenBullets = new Set<number>();
    for (const b of snap.bullets) {
      seenBullets.add(b.id);
      let s = this.bulletSprites.get(b.id);
      if (!s) {
        s = this.add.circle(b.x, b.y, 4, 0xffee44);
        this.bulletSprites.set(b.id, s);
      } else {
        s.setPosition(b.x, b.y);
      }
    }
    for (const [id, s] of this.bulletSprites) {
      if (!seenBullets.has(id)) { s.destroy(); this.bulletSprites.delete(id); }
    }

    // Pickups availability
    for (const pu of snap.pickups) {
      const c = this.pickupSprites.get(pu.id);
      if (c) c.setAlpha(pu.available ? 1 : 0.2);
    }
  }

  update(_t: number, _dt: number): void {
    // Interpolate remote players
    if (!this.latestSnap) return;
    const now = Date.now();
    for (const [id, interp] of this.remoteInterp) {
      const cont = this.playerSprites.get(id);
      if (!cont) continue;
      const p = interp.getAt(now);
      if (p) cont.setPosition(p.x, p.y);
    }
  }
}
```

- [ ] **Step 2: Add `serverTime` to server snapshots**

In `server/shooter/Match.js`, in `serializeSnapshot()`, add `serverTime: Date.now()` to the returned object. Also update the `SnapMsg` interface in `protocol.ts` if not already done — it is.

- [ ] **Step 3: Commit**

```bash
git add game/shooter/scenes/ShooterScene.ts server/shooter/Match.js
git commit -m "shooter: add ShooterScene rendering players/walls/bullets/pickups"
```

---

## Task 19: Input handlers (Desktop + Mobile)

**Files:**
- Create: `game/shooter/input/DesktopInput.ts`
- Create: `game/shooter/input/MobileInput.ts`

These poll-style adapters expose a uniform shape:

```ts
interface InputFrame { mv: { x: number; y: number }; aim: number; fire: boolean; swap: boolean; reload: boolean; }
interface InputAdapter { sample(scene: Phaser.Scene, localContainer: Phaser.GameObjects.Container): InputFrame; destroy(): void; }
```

- [ ] **Step 1: Implement DesktopInput.ts**

Create `game/shooter/input/DesktopInput.ts`:

```ts
import * as Phaser from 'phaser';

export interface InputFrame {
  mv: { x: number; y: number };
  aim: number;
  fire: boolean;
  swap: boolean;
  reload: boolean;
}

export class DesktopInput {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private swapPressed = false;
  private reloadPressed = false;

  constructor(scene: Phaser.Scene) {
    const k = scene.input.keyboard!;
    this.keys = {
      W: k.addKey('W'), A: k.addKey('A'), S: k.addKey('S'), D: k.addKey('D'),
      Q: k.addKey('Q'), R: k.addKey('R'),
    };
    k.on('keydown-Q', () => { this.swapPressed = true; });
    k.on('keydown-R', () => { this.reloadPressed = true; });
  }

  sample(scene: Phaser.Scene, localContainer: Phaser.GameObjects.Container): InputFrame {
    const mv = { x: 0, y: 0 };
    if (this.keys.W.isDown) mv.y -= 1;
    if (this.keys.S.isDown) mv.y += 1;
    if (this.keys.A.isDown) mv.x -= 1;
    if (this.keys.D.isDown) mv.x += 1;
    const ptr = scene.input.activePointer;
    const wp = scene.cameras.main.getWorldPoint(ptr.x, ptr.y);
    const aim = Math.atan2(wp.y - localContainer.y, wp.x - localContainer.x);
    const fire = ptr.leftButtonDown();
    const f = { mv, aim, fire, swap: this.swapPressed, reload: this.reloadPressed };
    this.swapPressed = false;
    this.reloadPressed = false;
    return f;
  }

  destroy() {}
}
```

- [ ] **Step 2: Implement MobileInput.ts**

Create `game/shooter/input/MobileInput.ts`:

```ts
import * as Phaser from 'phaser';
import type { InputFrame } from './DesktopInput';

interface Stick { active: boolean; pointerId: number; ox: number; oy: number; vx: number; vy: number; }

export class MobileInput {
  private leftStick: Stick = { active: false, pointerId: -1, ox: 0, oy: 0, vx: 0, vy: 0 };
  private rightStick: Stick = { active: false, pointerId: -1, ox: 0, oy: 0, vx: 0, vy: 0 };
  private swapBtnHandler: (e: Event) => void;
  private swapPressed = false;
  private radius = 60;

  constructor(scene: Phaser.Scene) {
    scene.input.addPointer(2);
    scene.input.on('pointerdown', this._down, this);
    scene.input.on('pointermove', this._move, this);
    scene.input.on('pointerup',   this._up,   this);
    // Swap button is rendered in HTML overlay (Shooter.tsx); event surfaces via window CustomEvent
    this.swapBtnHandler = () => { this.swapPressed = true; };
    window.addEventListener('shooter-swap', this.swapBtnHandler);
  }

  private _down(p: Phaser.Input.Pointer) {
    const isLeft = p.x < window.innerWidth / 2;
    const stick = isLeft ? this.leftStick : this.rightStick;
    if (stick.active) return;
    stick.active = true;
    stick.pointerId = p.id;
    stick.ox = p.x; stick.oy = p.y;
    stick.vx = 0; stick.vy = 0;
  }

  private _move(p: Phaser.Input.Pointer) {
    for (const stick of [this.leftStick, this.rightStick]) {
      if (!stick.active || stick.pointerId !== p.id) continue;
      let dx = p.x - stick.ox, dy = p.y - stick.oy;
      const len = Math.hypot(dx, dy);
      if (len > this.radius) { dx = dx * this.radius / len; dy = dy * this.radius / len; }
      stick.vx = dx / this.radius;
      stick.vy = dy / this.radius;
    }
  }

  private _up(p: Phaser.Input.Pointer) {
    for (const stick of [this.leftStick, this.rightStick]) {
      if (stick.pointerId !== p.id) continue;
      stick.active = false;
      stick.pointerId = -1;
      stick.vx = 0; stick.vy = 0;
    }
  }

  sample(_scene: Phaser.Scene, localContainer: Phaser.GameObjects.Container): InputFrame {
    const mv = { x: this.leftStick.vx, y: this.leftStick.vy };
    const rxy = this.rightStick.active ? { x: this.rightStick.vx, y: this.rightStick.vy } : null;
    const aim = rxy ? Math.atan2(rxy.y, rxy.x) : (localContainer.rotation ?? 0);
    const fire = this.rightStick.active && Math.hypot(rxy!.x, rxy!.y) > 0.2;
    const f: InputFrame = { mv, aim, fire, swap: this.swapPressed, reload: false };
    this.swapPressed = false;
    return f;
  }

  destroy() { window.removeEventListener('shooter-swap', this.swapBtnHandler); }
}
```

- [ ] **Step 3: Wire input loop into ShooterScene**

In `ShooterScene.create()`, after creating `this.prediction`:

```ts
const isMobile = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
this.input.addPointer(isMobile ? 2 : 0);
this.inputAdapter = isMobile ? new MobileInput(this) : new DesktopInput(this);
this.lastInputAt = 0;
```

Add field declarations near the top of class:

```ts
private inputAdapter: { sample: (scene: Phaser.Scene, c: Phaser.GameObjects.Container) => any; destroy: () => void } | null = null;
private lastInputAt = 0;
```

In `update(_t, _dt)`, after the interpolation loop:

```ts
const now = performance.now();
if (now - this.lastInputAt >= 33 && this.inputAdapter && this.localSlot) {
  const localCont = this.playerSprites.get(this.localPlayerId);
  if (localCont) {
    const f = this.inputAdapter.sample(this, localCont);
    const seq = this.client.sendInput(f);
    this.prediction.applyInput({ seq, mv: f.mv }, 1/30);
    const pos = this.prediction.getPosition();
    localCont.setPosition(pos.x, pos.y);
    localCont.setRotation(f.aim);
    this.lastInputAt = now;
  }
}
```

Also handle scene shutdown:

```ts
shutdown() { this.inputAdapter?.destroy(); }
```

- [ ] **Step 4: Commit**

```bash
git add game/shooter/input/DesktopInput.ts game/shooter/input/MobileInput.ts game/shooter/scenes/ShooterScene.ts
git commit -m "shooter: add desktop/mobile input adapters and input loop"
```

---

## Task 20: Shooter.tsx — React HUD overlay + Phaser bootstrap

**Files:**
- Create: `components/Shooter.tsx`

The component does two things:
1. Boots a `Phaser.Game` with `ShooterPreloadScene` + `ShooterScene`.
2. Renders an HTML HUD overlay with HP / weapon / ammo (top-left), score (top-center), kill feed (top-right), end screen (center).

- [ ] **Step 1: Implement Shooter.tsx**

Create `components/Shooter.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { ShooterPreloadScene } from '../game/shooter/scenes/ShooterPreloadScene';
import { ShooterScene } from '../game/shooter/scenes/ShooterScene';
import { ShooterClient } from '../game/shooter/net/ShooterClient';
import type { SnapMsg } from '../game/shooter/net/protocol';
import { MAP_WIDTH, MAP_HEIGHT } from '../game/shooter/config/map';

interface Props {
  code: string;
  playerId: string;
  playerName: string;
  wsUrl: string;
  onLeave: () => void;
}

interface KillFeed { killer: string; victim: string; weapon: string; ts: number; }

export default function Shooter({ code, playerId, playerName, wsUrl, onLeave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const clientRef = useRef<ShooterClient | null>(null);

  const [hp, setHp] = useState(100);
  const [weapon, setWeapon] = useState('pistol');
  const [ammo, setAmmo] = useState(12);
  const [score, setScore] = useState({ A: 0, B: 0 });
  const [timeLeft, setTimeLeft] = useState(5 * 60 * 1000);
  const [feed, setFeed] = useState<KillFeed[]>([]);
  const [matchEnd, setMatchEnd] = useState<{ winnerId: string; reason: string; finalScore: { A: number; B: number } } | null>(null);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    const client = new ShooterClient({ url: wsUrl, code, playerId, name: playerName });
    clientRef.current = client;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current!,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#0a0a14',
      pixelArt: false,
      physics: { default: 'arcade' },
      scene: [ShooterPreloadScene, ShooterScene],   // Phaser auto-starts the first
    });
    gameRef.current = game;

    // Pass the client and local player id to the scenes via the registry.
    // ShooterPreloadScene.create() reads these and calls scene.start('Shooter', { client, localPlayerId })
    game.registry.set('shooterContext', { client, localPlayerId: playerId });

    client.on('snap', (snap: SnapMsg) => {
      const me = snap.players.find(p => p.id === playerId);
      if (me) {
        setHp(me.hp);
        setWeapon(me.weapon);
        setAmmo(me.ammo);
        setDead(me.dead);
      }
      setScore({ A: snap.score.A ?? 0, B: snap.score.B ?? 0 });
      setTimeLeft(snap.timeLeftMs);
    });
    client.on('kill', (msg: any) => {
      setFeed(prev => [...prev, { killer: msg.killer, victim: msg.victim, weapon: msg.weapon, ts: Date.now() }].slice(-3));
    });
    client.on('matchEnd', (msg: any) => setMatchEnd(msg));
    client.on('matchStart', () => setMatchEnd(null));
    client.connect();

    const cleanup = () => {
      client.disconnect();
      gameRef.current?.destroy(true);
    };
    return cleanup;
  }, [code, playerId, playerName, wsUrl]);

  // Trim kill feed
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setFeed(prev => prev.filter(k => now - k.ts < 4000));
    }, 500);
    return () => clearInterval(id);
  }, []);

  const mm = Math.floor(timeLeft / 60000);
  const ss = Math.floor((timeLeft % 60000) / 1000).toString().padStart(2, '0');

  return (
    <div className="tk-shooter">
      <div ref={containerRef} className="tk-shooter-canvas" />

      <div className="tk-shooter-hud-tl">
        <div className="tk-hp-bar">
          <div className="tk-hp-fill" style={{ width: `${hp}%` }} />
          <div className="tk-hp-text">{hp} HP</div>
        </div>
        <div className="tk-weapon-row">
          <div className="tk-weapon-icon">{weapon[0].toUpperCase()}</div>
          <div className="tk-ammo">{ammo}</div>
        </div>
      </div>

      <div className="tk-shooter-hud-tc">
        {playerName} <strong>{score.A}</strong> — <strong>{score.B}</strong> Opponent
        <div className="tk-shooter-timer">{mm}:{ss}</div>
      </div>

      <div className="tk-shooter-hud-tr">
        {feed.map((k, i) => (
          <div key={i} className="tk-kill-line">{k.killer.slice(0,6)} ▶ {k.weapon} ▶ {k.victim.slice(0,6)}</div>
        ))}
      </div>

      {dead && !matchEnd && <div className="tk-shooter-dead">You died — respawning…</div>}

      {matchEnd && (
        <div className="tk-shooter-end">
          <div className="tk-shooter-end-box">
            <div className={`tk-shooter-result ${matchEnd.winnerId === playerId ? 'win' : 'loss'}`}>
              {matchEnd.winnerId === playerId ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="tk-shooter-final">Final: {matchEnd.finalScore.A} — {matchEnd.finalScore.B}</div>
            <div className="tk-shooter-end-buttons">
              <button onClick={() => { clientRef.current?.sendRematch(); }}>Rematch</button>
              <button onClick={() => { clientRef.current?.sendLeave(); onLeave(); }}>Back to Menu</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile swap button */}
      <button
        className="tk-shooter-swap-mobile"
        onClick={() => window.dispatchEvent(new CustomEvent('shooter-swap'))}
      >SWAP</button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/Shooter.tsx
git commit -m "shooter: add Shooter component (Phaser bootstrap + React HUD)"
```

---

## Task 21: ShooterLobby.tsx — name + Create/Join/Practice

**Files:**
- Create: `components/ShooterLobby.tsx`

Three screens controlled by local state: `'menu' | 'hosting' | 'joining'`. On match-ready (host got opponent or practice mode created), call `onMatchReady(code, playerId, playerName)`.

- [ ] **Step 1: Implement ShooterLobby.tsx**

Create `components/ShooterLobby.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { getApiUrl } from '../utils/api';

type Difficulty = 'easy' | 'normal' | 'hard';

interface Props {
  onMatchReady: (code: string, playerId: string, playerName: string, wsUrl: string) => void;
  onBack: () => void;
}

function makePlayerId(): string {
  let id = localStorage.getItem('shooterPlayerId');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('shooterPlayerId', id);
  }
  return id;
}

function getWsUrl(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return `ws://${host}:3001`;
  return 'wss://arena-rush-backend.onrender.com';
}

export default function ShooterLobby({ onMatchReady, onBack }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('shooterPlayerName') || '');
  const [screen, setScreen] = useState<'menu' | 'hosting' | 'joining' | 'difficulty'>('menu');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hosting, setHosting] = useState(false);
  const playerId = makePlayerId();

  useEffect(() => { localStorage.setItem('shooterPlayerName', name); }, [name]);

  const wsUrl = getWsUrl();

  const create = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    setError(null); setHosting(true);
    try {
      const res = await fetch(getApiUrl('/api/shooter/rooms'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostId: playerId, hostName: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'create failed');
      const data = await res.json();
      setCode(data.code);
      setScreen('hosting');
      // Move directly into match — server will start once guest joins or bot fills.
      onMatchReady(data.code, playerId, name.trim(), wsUrl);
    } catch (e: any) { setError(e.message); setHosting(false); }
  };

  const join = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    if (!joinCode.match(/^[A-Z]{4}$/)) { setError('4-letter code, A–Z (no I/O)'); return; }
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/shooter/rooms/${joinCode}/join`), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guestId: playerId, guestName: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'join failed');
      onMatchReady(joinCode, playerId, name.trim(), wsUrl);
    } catch (e: any) { setError(e.message); }
  };

  const practice = async (difficulty: Difficulty) => {
    if (!name.trim()) { setError('Enter a name'); return; }
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/shooter/practice'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostId: playerId, hostName: name.trim(), difficulty }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'practice failed');
      const data = await res.json();
      onMatchReady(data.code, playerId, name.trim(), wsUrl);
    } catch (e: any) { setError(e.message); }
  };

  const addBotNow = async () => {
    try {
      await fetch(getApiUrl(`/api/shooter/rooms/${code}/bot`), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ difficulty: 'normal' }),
      });
    } catch {}
  };

  return (
    <div className="tk-shooter-lobby">
      <h1>1v1 Top-Down Shooter</h1>
      <input
        className="tk-input"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 20))}
      />
      {error && <div className="tk-error">{error}</div>}

      {screen === 'menu' && (
        <div className="tk-lobby-buttons">
          <button onClick={create} disabled={hosting}>Create Room</button>
          <button onClick={() => setScreen('joining')}>Join Room</button>
          <button onClick={() => setScreen('difficulty')}>Practice vs Bot</button>
          <button className="tk-btn-secondary" onClick={onBack}>Back</button>
        </div>
      )}

      {screen === 'hosting' && (
        <div className="tk-hosting">
          <p>Share this code with your friend:</p>
          <div className="tk-code-display">{code}</div>
          <button onClick={() => navigator.clipboard.writeText(code)}>Copy code</button>
          <button onClick={addBotNow}>Add Bot Now</button>
          <p className="tk-muted">Bot will fill the slot automatically after 30s.</p>
        </div>
      )}

      {screen === 'joining' && (
        <div className="tk-joining">
          <input
            className="tk-input tk-input-code"
            placeholder="CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
          />
          <button onClick={join}>Join</button>
          <button className="tk-btn-secondary" onClick={() => setScreen('menu')}>Back</button>
        </div>
      )}

      {screen === 'difficulty' && (
        <div className="tk-difficulty">
          <p>Choose bot difficulty:</p>
          <button onClick={() => practice('easy')}>Easy</button>
          <button onClick={() => practice('normal')}>Normal</button>
          <button onClick={() => practice('hard')}>Hard</button>
          <button className="tk-btn-secondary" onClick={() => setScreen('menu')}>Back</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ShooterLobby.tsx
git commit -m "shooter: add ShooterLobby with create/join/practice flows"
```

---

## Task 22: App.tsx — add shooter routes

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace `App.tsx` with:

```tsx
import React, { useState, useCallback } from 'react';
import Menu from './components/Menu';
import IslandWars from './components/IslandWars';
import ShooterLobby from './components/ShooterLobby';
import Shooter from './components/Shooter';

type AppState = 'menu' | 'island-wars' | 'game-over' | 'shooter-lobby' | 'shooter';

interface GameResult { winner: string; reason: string; }
interface ShooterMatch { code: string; playerId: string; playerName: string; wsUrl: string; }

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('menu');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [shooterMatch, setShooterMatch] = useState<ShooterMatch | null>(null);

  const handleStartGame = useCallback(() => {
    setGameResult(null);
    setAppState('island-wars');
  }, []);

  const handleStartShooter = useCallback(() => {
    setAppState('shooter-lobby');
  }, []);

  const handleIslandWarsEnd = useCallback((winner: 'player' | 'bot', reason: string) => {
    setGameResult({ winner, reason });
    setAppState('game-over');
  }, []);

  const handleShooterReady = useCallback((code: string, playerId: string, playerName: string, wsUrl: string) => {
    setShooterMatch({ code, playerId, playerName, wsUrl });
    setAppState('shooter');
  }, []);

  const handleBackToMenu = () => {
    setAppState('menu');
    setGameResult(null);
    setShooterMatch(null);
  };

  return (
    <div className="app">
      {appState === 'menu' && <Menu onStartGame={handleStartGame} onStartShooter={handleStartShooter} />}

      {appState === 'island-wars' && <IslandWars onGameEnd={handleIslandWarsEnd} />}

      {appState === 'shooter-lobby' && <ShooterLobby onMatchReady={handleShooterReady} onBack={handleBackToMenu} />}

      {appState === 'shooter' && shooterMatch && (
        <Shooter
          code={shooterMatch.code}
          playerId={shooterMatch.playerId}
          playerName={shooterMatch.playerName}
          wsUrl={shooterMatch.wsUrl}
          onLeave={handleBackToMenu}
        />
      )}

      {appState === 'game-over' && gameResult && (
        <div className="tk-game-over">
          <div className="tk-game-over-box">
            <div className={`tk-go-result ${gameResult.winner === 'player' ? 'tk-go-win' : 'tk-go-loss'}`}>
              {gameResult.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="tk-go-reason">{gameResult.reason}</div>
            <div className="tk-go-buttons">
              <button className="tk-btn tk-btn-large" onClick={handleStartGame}>Play Again</button>
              <button className="tk-btn tk-btn-large tk-btn-secondary" onClick={handleBackToMenu}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
```

- [ ] **Step 2: Commit**

```bash
git add App.tsx
git commit -m "shooter: add 'shooter-lobby' and 'shooter' app states"
```

---

## Task 23: Menu.tsx — replace Coming Soon with active card

**Files:**
- Modify: `components/Menu.tsx`

- [ ] **Step 1: Update Menu.tsx**

Replace `components/Menu.tsx` with:

```tsx
import React from 'react';

interface MenuProps {
  onStartGame: () => void;
  onStartShooter: () => void;
}

const Menu: React.FC<MenuProps> = ({ onStartGame, onStartShooter }) => {
  return (
    <div className="tk-menu-container">
      <div className="tk-menu-bg" />

      <div className="tk-menu-content">
        <div className="tk-menu-title-wrap">
          <div className="tk-menu-eyebrow">⚔ A Tiny Kingdoms Game ⚔</div>
          <h1 className="tk-menu-title">TINY KINGDOMS</h1>
          <p className="tk-menu-subtitle">Pick your battle.</p>
        </div>

        <div className="tk-menu-cards">
          <button className="tk-menu-card tk-menu-card-rts" onClick={onStartGame}>
            <div className="tk-card-icon tk-card-icon-rts" aria-hidden="true" />
            <div className="tk-card-title">Island Wars</div>
            <div className="tk-card-desc">
              Main mode. Gather resources, expand your base, train units, and win before
              the clock hits zero.
            </div>
            <div className="tk-card-badge">8 min · Strategy</div>
          </button>

          <button className="tk-menu-card tk-menu-card-arena" onClick={onStartShooter}>
            <div className="tk-card-icon tk-card-icon-arena" aria-hidden="true" />
            <div className="tk-card-title">1v1 Shooter</div>
            <div className="tk-card-desc">
              Top-down twin-stick deathmatch. Play your friend over the internet, or duel a bot.
            </div>
            <div className="tk-card-badge">~5 min · Action</div>
          </button>
        </div>

        <footer className="tk-menu-footer">
          <p>Powered by Tiny Swords + Top-Down Shooter assets · Built with Phaser 4</p>
        </footer>
      </div>
    </div>
  );
};

export default Menu;
```

- [ ] **Step 2: Commit**

```bash
git add components/Menu.tsx
git commit -m "shooter: enable shooter card in main menu"
```

---

## Task 24: CSS — shooter lobby + HUD styles

**Files:**
- Modify: `index.css`

- [ ] **Step 1: Append shooter styles**

Add at the bottom of `index.css`:

```css
/* === Shooter Lobby === */
.tk-shooter-lobby {
  position: fixed; inset: 0;
  background: linear-gradient(180deg, #0e1320, #050810);
  color: #e6f0ff;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 20px; padding: 24px;
  font-family: system-ui, sans-serif;
}
.tk-shooter-lobby h1 { font-size: 32px; margin: 0 0 12px; color: #66ddff; }
.tk-input {
  background: rgba(8,14,24,0.97); border: 1px solid #4a6a8a;
  color: #fff; padding: 12px; border-radius: 8px; font-size: 16px; width: 240px;
}
.tk-input-code { font-size: 28px; letter-spacing: 12px; text-align: center; text-transform: uppercase; }
.tk-error { color: #ff7766; font-size: 14px; }
.tk-lobby-buttons, .tk-hosting, .tk-joining, .tk-difficulty {
  display: flex; flex-direction: column; gap: 10px; align-items: center;
}
.tk-shooter-lobby button {
  min-width: 220px; padding: 12px 18px; font-size: 16px;
  background: #2a5577; border: 1px solid #66ddff; color: #fff;
  border-radius: 8px; cursor: pointer;
}
.tk-shooter-lobby button:disabled { opacity: 0.5; cursor: not-allowed; }
.tk-shooter-lobby .tk-btn-secondary { background: transparent; border-color: #4a6a8a; color: #aac; }
.tk-code-display {
  font-size: 56px; letter-spacing: 16px; padding: 20px 40px;
  background: rgba(8,14,24,0.97); border: 2px solid #66ddff; border-radius: 12px;
  font-family: 'Courier New', monospace;
}
.tk-muted { color: #99a; font-size: 13px; }

/* === Shooter In-Game HUD === */
.tk-shooter { position: fixed; inset: 0; background: #0a0a14; }
.tk-shooter-canvas { position: absolute; inset: 0; }

.tk-shooter-hud-tl {
  position: fixed; top: 12px; left: 12px;
  background: rgba(8,14,24,0.85); padding: 10px 14px; border-radius: 8px;
  border: 1px solid #2a4a6a; min-width: 180px;
}
.tk-hp-bar {
  position: relative; height: 18px; background: #2a1010; border: 1px solid #6a2020;
  border-radius: 4px; overflow: hidden;
}
.tk-hp-fill { height: 100%; background: linear-gradient(90deg, #44ff66, #aaff44); transition: width 100ms; }
.tk-hp-text {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 12px; color: #fff; font-weight: bold; text-shadow: 0 0 2px #000;
}
.tk-weapon-row { display: flex; gap: 10px; align-items: center; margin-top: 8px; }
.tk-weapon-icon {
  width: 36px; height: 36px; background: #2a4a6a; color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; font-weight: bold; border-radius: 6px;
}
.tk-ammo { font-size: 22px; font-weight: bold; color: #ffee88; }

.tk-shooter-hud-tc {
  position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(8,14,24,0.85); padding: 8px 16px; border-radius: 8px;
  border: 1px solid #2a4a6a; color: #fff; text-align: center;
}
.tk-shooter-timer { color: #ffaa44; font-size: 18px; font-weight: bold; margin-top: 4px; }

.tk-shooter-hud-tr {
  position: fixed; top: 12px; right: 12px;
  display: flex; flex-direction: column; gap: 4px; align-items: flex-end;
}
.tk-kill-line {
  background: rgba(8,14,24,0.85); padding: 4px 10px; border-radius: 4px;
  border-left: 3px solid #ff4444; font-size: 13px; color: #fff;
}

.tk-shooter-dead {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.7); padding: 20px 40px; border-radius: 12px;
  font-size: 24px; color: #ff8866;
}

.tk-shooter-end {
  position: fixed; inset: 0; background: rgba(0,0,0,0.7);
  display: flex; align-items: center; justify-content: center;
}
.tk-shooter-end-box {
  background: rgba(8,14,24,0.97); padding: 32px 48px; border: 2px solid #66ddff;
  border-radius: 12px; text-align: center;
}
.tk-shooter-result { font-size: 48px; font-weight: bold; margin-bottom: 12px; }
.tk-shooter-result.win { color: #66ff88; }
.tk-shooter-result.loss { color: #ff6666; }
.tk-shooter-final { color: #ccd; margin-bottom: 24px; }
.tk-shooter-end-buttons { display: flex; gap: 12px; justify-content: center; }
.tk-shooter-end-buttons button {
  padding: 12px 24px; font-size: 16px;
  background: #2a5577; border: 1px solid #66ddff; color: #fff; border-radius: 8px; cursor: pointer;
}

.tk-shooter-swap-mobile {
  display: none;
  position: fixed; bottom: 80px; right: 80px;
  width: 60px; height: 60px; border-radius: 50%;
  background: rgba(102, 221, 255, 0.7); border: 2px solid #fff; color: #000;
  font-weight: bold; font-size: 12px;
}
@media (pointer: coarse) {
  .tk-shooter-swap-mobile { display: block; }
}
```

- [ ] **Step 2: Commit**

```bash
git add index.css
git commit -m "shooter: add CSS for lobby, HUD, kill feed, end screen"
```

---

## Task 25: End-to-end smoke test (manual)

**Files:** none — verification only.

- [ ] **Step 1: Start dev server + game server**

```bash
npm run dev:full
```

- [ ] **Step 2: Practice mode smoke test**

- Open http://localhost:5173
- Click the "1v1 Shooter" card
- Enter a name, click "Practice vs Bot", choose Normal
- Verify:
  - Match starts within 1s
  - You can move (WASD on PC, drag left side on mobile emu)
  - You can fire (click on PC, drag right side on mobile emu)
  - Bot moves and shoots back
  - HP bar drops when shot, you can die and respawn
  - Kill feed appears top-right
  - Score updates top-center
  - End screen shows after 10 kills

- [ ] **Step 3: Two-tab online smoke test**

- Open two browser tabs to http://localhost:5173
- Tab 1: name "Alice", click Create Room, copy 4-letter code.
- Tab 2: name "Bob", Join Room, paste code.
- Both transition into match.
- Move both, verify:
  - Each player sees the other moving smoothly (interpolation working)
  - Shots register and damage applies
  - Score updates on both clients
  - When one closes the tab, the other gets MATCH_END after ~5s

- [ ] **Step 4: Mobile emulation smoke test**

- Open Chrome DevTools, toggle device toolbar, pick a phone profile.
- Reload, walk through Practice vs Bot.
- Verify both virtual sticks register touches (left side = move, right side = aim+fire).

- [ ] **Step 5: Run typecheck and full test suite**

```bash
npx tsc --noEmit
npm test
```

Both must pass with no errors.

- [ ] **Step 6: If anything fails, fix in place and commit**

For any bug discovered: write a failing test (where possible), fix the production code, run tests, commit.

```bash
git add <changed files>
git commit -m "shooter: fix <specific bug found in smoke test>"
```

- [ ] **Step 7: Final commit (if any docs need updating)**

If you discovered behaviour that diverges from the spec, update the spec in `docs/superpowers/specs/2026-05-06-top-down-shooter-design.md` and commit:

```bash
git add docs/superpowers/specs/2026-05-06-top-down-shooter-design.md
git commit -m "docs: update shooter spec to match implemented behavior"
```

---

## Task 26: Render production CORS / WSS sanity check

**Files:** none — verification only.

The existing `utils/api.ts` switches to `https://arena-rush-backend.onrender.com` in production. Confirm:

- [ ] **Step 1: Verify WSS URL matches REST URL host**

In `components/ShooterLobby.tsx`, `getWsUrl()` returns `wss://arena-rush-backend.onrender.com` for production. Confirm Render allows WS upgrades (it does by default). No code change unless this fails.

- [ ] **Step 2: Document Render cold-start UX**

Update the spec's risk #1 if needed. v1 ships without an explicit "waking server" loader — the lobby just shows a generic error if first request fails. Acceptable for v1, deferred polish.

- [ ] **Step 3: No commit needed if no change.**

---

## Final Checklist

- [ ] All Vitest tests pass (`npm test`)
- [ ] TypeScript clean (`npx tsc --noEmit`)
- [ ] Practice vs Bot plays through to match end
- [ ] Two-tab online match plays through to match end
- [ ] Disconnect mid-match awards remaining player after 5s
- [ ] Mobile emulation sticks respond
- [ ] Kill feed, score, HP, ammo all update correctly
- [ ] Rematch flow works (both clients get fresh match on agreement)
- [ ] Spec doc still accurate; any divergences captured
