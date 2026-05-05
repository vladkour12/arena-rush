# Tilemap Redesign + Adventure Mode Removal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current per-tile sprite map renderer with a layered Phaser Tilemap that uses Tiny Swords elevation tiles, add cliff-blocked traversal with stair-only level changes, populate the world with ambient decoration, and remove the unfinished Adventure Mode.

**Architecture:** Three Phaser Tilemap layers (`groundLayer`, `cliffLayer`, `pathLayer`) handle the static 160×96 grid in a few batched draw calls. Animated decoration (foam, swaying trees, wildlife) lives in separate sprite layers driven by a single `AmbientSwaySystem` instead of per-sprite tweens. A new `MovementSystem` performs A* pathfinding with cliff-blocked traversal; units route through it instead of steering directly toward targets.

**Tech Stack:** TypeScript 5.8, React 19, Phaser 4, Vite 6 (existing). Vitest 1.6 (added for unit tests on pure logic).

**Spec:** `docs/superpowers/specs/2026-05-04-tilemap-redesign-design.md`

---

## File Structure (new and modified)

### New files

```
vitest.config.ts                              # Vitest config
game/render/cliffBitmask.ts                   # 16-entry edge-tile lookup
game/render/cliffBitmask.test.ts              # unit test
game/render/TilemapBuilder.ts                 # builds groundLayer/cliffLayer/pathLayer from terrainGrid
game/render/decoSpawner.ts                    # spawns grass tufts, cluster deco, foam, etc.
game/world/terrainGen.ts                      # pure terrain generation (extract from IslandWarsScene)
game/world/terrainGen.test.ts                 # unit test
game/world/hillSeeding.ts                     # Poisson hill seed placement
game/world/hillSeeding.test.ts                # unit test
game/world/connectivity.ts                    # flood-fill reachability check + stair injection
game/world/connectivity.test.ts               # unit test
game/systems/MovementSystem.ts                # A* + canEnterTile + isReachable
game/systems/MovementSystem.test.ts           # unit test
game/systems/WildlifeSystem.ts                # sheep/cow/chicken/butterfly spawn + wander
game/systems/AmbientSwaySystem.ts             # shared sine-wave sway driver
```

### Modified files

```
package.json                                  # add vitest dev dep + test script
game/scenes/PreloadScene.ts                   # load tilesets + foam atlas + extra deco
game/scenes/IslandWarsScene.ts                # remove old terrain render; wire TilemapBuilder + new systems
game/entities/Unit.ts                         # route movement through MovementSystem; elevation Y-offset
game/systems/CombatSystem.ts                  # add losBlockedByCliff; archer hill range bonus
game/systems/AISystem.ts                      # use MovementSystem.isReachable when picking targets
game/config/map.ts                            # new tunables (HILL_SEED_DENSITY, etc.)
App.tsx                                       # remove Adventure routing
components/Menu.tsx                           # remove Adventure card
```

### Deleted files

```
components/AdventureMode.tsx
game/scenes/AdventureScene.ts
game/scenes/TacticalBattleScene.ts
game/entities/Hero.ts
game/systems/HeroesAISystem.ts
game/systems/SeededRng.ts                     (verify no other consumer)
game/config/heroesModeConfig.ts
game/types/                                   (verify only adventure code references it)
HEROES_MODE_INTEGRATION.md
```

---

## Phase 0 — Test infrastructure

### Task 0.1: Add Vitest

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install Vitest**

Run: `npm install --save-dev vitest@^1.6.0`
Expected: package.json updated; no peer-dep warnings beyond existing.

- [ ] **Step 2: Add test script to package.json**

Edit `package.json` `scripts` to add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create vitest.config.ts**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['game/**/*.test.ts'],
    globals: false,
  },
});
```

- [ ] **Step 4: Smoke test**

Create `game/world/_smoke.test.ts` temporarily with:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```

Run: `npm test`
Expected: 1 test passes. Then delete the smoke file.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for unit tests"
```

---

## Phase 1 — Adventure Mode removal

### Task 1.1: Verify dependencies before deletion

**Files:**
- Read-only check across repo.

- [ ] **Step 1: Grep for cross-references**

Run each separately and list any hits *outside* the files-to-delete set:

```
grep -rn "SeededRng" --include="*.ts" --include="*.tsx" .
grep -rn "Hero\b" --include="*.ts" --include="*.tsx" .
grep -rn "Heroes" --include="*.ts" --include="*.tsx" .
grep -rn "Adventure" --include="*.ts" --include="*.tsx" .
grep -rn "Tactical" --include="*.ts" --include="*.tsx" .
grep -rn "heroesModeConfig" --include="*.ts" --include="*.tsx" .
grep -rn "from.*game/types" --include="*.ts" --include="*.tsx" .
```

Expected: only matches inside the files-to-delete list. If any external consumer is found, note it and adjust the deletion plan before proceeding.

### Task 1.2: Delete Adventure Mode files

**Files:**
- Delete: all files listed in the "Deleted files" section above.

- [ ] **Step 1: Delete files**

```bash
rm components/AdventureMode.tsx
rm game/scenes/AdventureScene.ts
rm game/scenes/TacticalBattleScene.ts
rm game/entities/Hero.ts
rm game/systems/HeroesAISystem.ts
rm game/systems/SeededRng.ts
rm game/config/heroesModeConfig.ts
rm -r game/types
rm HEROES_MODE_INTEGRATION.md
```

### Task 1.3: Clean App.tsx

**Files:**
- Modify: `App.tsx`

- [ ] **Step 1: Replace App.tsx with single-mode flow**

Read the current file first, then write:

```tsx
import React, { useState, useCallback } from 'react';
import Menu from './components/Menu';
import IslandWars from './components/IslandWars';

type AppState = 'menu' | 'island-wars' | 'game-over';

interface GameResult {
  winner: string;
  reason: string;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('menu');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const handleStartGame = useCallback(() => {
    setGameResult(null);
    setAppState('island-wars');
  }, []);

  const handleIslandWarsEnd = useCallback((winner: 'player' | 'bot', reason: string) => {
    setGameResult({ winner, reason });
    setAppState('game-over');
  }, []);

  const handleBackToMenu = () => {
    setAppState('menu');
    setGameResult(null);
  };

  return (
    <div className="app">
      {appState === 'menu' && <Menu onStartGame={handleStartGame} />}

      {appState === 'island-wars' && (
        <IslandWars onGameEnd={handleIslandWarsEnd} />
      )}

      {appState === 'game-over' && gameResult && (
        <div className="tk-game-over">
          <div className="tk-game-over-box">
            <div className={`tk-go-result ${gameResult.winner === 'player' ? 'tk-go-win' : 'tk-go-loss'}`}>
              {gameResult.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="tk-go-reason">{gameResult.reason}</div>
            <div className="tk-go-buttons">
              <button className="tk-btn tk-btn-large" onClick={handleStartGame}>
                Play Again
              </button>
              <button className="tk-btn tk-btn-large tk-btn-secondary" onClick={handleBackToMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
```

### Task 1.4: Clean Menu.tsx

**Files:**
- Modify: `components/Menu.tsx`

- [ ] **Step 1: Read Menu.tsx and identify the Adventure card**

Open `components/Menu.tsx`. Locate the Adventure Mode card and any prop signature that takes a mode (`'island-wars' | 'adventure'`).

- [ ] **Step 2: Remove the Adventure card and simplify onStartGame signature**

Change `onStartGame` prop to `() => void`. Remove the entire JSX block rendering the "Adventure Mode" / "TURN-BASED · HOMM STYLE" card. The single Island Wars card's button should call `props.onStartGame()` with no argument.

If a `MenuMode` type or similar exists locally, drop it.

### Task 1.5: Verify build and commit

- [ ] **Step 1: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. Fix any reference to a deleted symbol that grep missed in Task 1.1.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds, `dist/` produced.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev`. Open browser, confirm menu loads with one card, clicking it starts Island Wars, game runs as before.

- [ ] **Step 4: Commit**

```bash
git add -u
git add App.tsx components/Menu.tsx
git commit -m "refactor: remove unfinished Adventure Mode"
```

---

## Phase 2 — Tilemap rendering swap

### Task 2.1: Preload tileset assets

**Files:**
- Modify: `game/scenes/PreloadScene.ts`

- [ ] **Step 1: Read PreloadScene.ts and locate the preload() body**

Identify where existing assets are loaded. New loads will sit alongside.

- [ ] **Step 2: Add tileset and deco loads**

Inside `preload()`:

```ts
const base = 'Tiny Swords/Tiny Swords (Update 010)';

// Tilesets — Phaser image keys; will be passed to addTilesetImage() later.
this.load.image('tilemap_flat', `${base}/Terrain/Ground/Tilemap_Flat.png`);
this.load.image('tilemap_elev', `${base}/Terrain/Ground/Tilemap_Elevation.png`);
this.load.image('tilemap_bridge', `${base}/Terrain/Bridge/Bridge_All.png`);

// Deco — load each as a discrete image; key 'deco_NN' where NN = 01..18.
for (let i = 1; i <= 18; i++) {
  const nn = String(i).padStart(2, '0');
  this.load.image(`deco_${nn}`, `${base}/Deco/${nn}.png`);
}

// Foam — animated frames; load directory contents (verify exact file names during run).
// Tiny Swords ships Foam as a series of PNG frames; if names differ, adjust.
for (let i = 1; i <= 8; i++) {
  this.load.image(`foam_${i}`, `${base}/Terrain/Water/Foam/Foam_${i}.png`);
}
```

- [ ] **Step 3: Verify load**

Run: `npm run dev`. Open the dev console. The PreloadScene should not log 404s for the new keys. If `Foam_*.png` paths fail, list the actual `Terrain/Water/Foam/` contents and update the loop accordingly.

- [ ] **Step 4: Commit**

```bash
git add game/scenes/PreloadScene.ts
git commit -m "feat: preload Tiny Swords tilesets and deco frames"
```

### Task 2.2: Cliff bitmask lookup table (pure + tested)

**Files:**
- Create: `game/render/cliffBitmask.ts`
- Test: `game/render/cliffBitmask.test.ts`

- [ ] **Step 1: Write the failing test**

`game/render/cliffBitmask.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { edgeBitmaskToFrame, computeEdgeBitmask } from './cliffBitmask';

describe('computeEdgeBitmask', () => {
  it('returns 0 for a cell whose 4 neighbors are at the same level (interior plateau)', () => {
    const levelAt = (_tx: number, _ty: number) => 1;
    expect(computeEdgeBitmask(5, 5, 1, levelAt)).toBe(0);
  });

  it('sets the N bit when the north neighbor is lower', () => {
    const levelAt = (tx: number, ty: number) => (ty === 4 ? 0 : 1);
    expect(computeEdgeBitmask(5, 5, 1, levelAt)).toBe(1);
  });

  it('sets all 4 bits for an isolated peak', () => {
    const levelAt = (tx: number, ty: number) => (tx === 5 && ty === 5 ? 1 : 0);
    expect(computeEdgeBitmask(5, 5, 1, levelAt)).toBe(15);
  });

  it('treats out-of-bounds neighbors as lower (so map-edge hills get cliff frames)', () => {
    const levelAt = (_tx: number, _ty: number) => 1;
    expect(computeEdgeBitmask(0, 0, 1, levelAt)).toBe(1 | 8); // N + W bits
  });
});

describe('edgeBitmaskToFrame', () => {
  it('returns a non-negative tile index for every mask 0..15', () => {
    for (let mask = 0; mask < 16; mask++) {
      expect(edgeBitmaskToFrame[mask]).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test, watch it fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement cliffBitmask.ts**

`game/render/cliffBitmask.ts`:

```ts
export type LevelAt = (tx: number, ty: number) => number;

/**
 * Bit values: N=1, E=2, S=4, W=8.
 * Out-of-bounds neighbors count as level 0 (so map-edge hills look like cliffs, not seamless plateau).
 */
export function computeEdgeBitmask(
  tx: number,
  ty: number,
  cellLevel: number,
  levelAt: LevelAt,
): number {
  let mask = 0;
  if (levelAt(tx, ty - 1) < cellLevel) mask |= 1;
  if (levelAt(tx + 1, ty) < cellLevel) mask |= 2;
  if (levelAt(tx, ty + 1) < cellLevel) mask |= 4;
  if (levelAt(tx - 1, ty) < cellLevel) mask |= 8;
  return mask;
}

/**
 * Maps each of the 16 cardinal-edge bitmask values to a tile index in
 * Tilemap_Elevation.png. The exact index numbers depend on how Phaser slices
 * the tileset (left-to-right, top-to-bottom, 64×64 frames). The values below
 * assume the standard Tiny Swords elevation layout: row 0 = solid plateau,
 * row 1 = N/E/S/W edges, row 2 = inner corners, row 3 = peaks/mounds.
 *
 * If a different art pack is swapped in, only this table needs updating.
 */
export const edgeBitmaskToFrame: readonly number[] = [
  // Index = bitmask (N=1, E=2, S=4, W=8)
  0,   // 0000 — interior plateau
  1,   // 0001 — N edge
  2,   // 0010 — E edge
  5,   // 0011 — NE corner
  3,   // 0100 — S edge
  16,  // 0101 — N+S strip (rare; pick straight)
  6,   // 0110 — SE corner
  9,   // 0111 — N+E+S (peninsula east-south-north open)
  4,   // 1000 — W edge
  7,   // 1001 — NW corner
  17,  // 1010 — E+W strip (rare)
  10,  // 1011 — N+E+W
  8,   // 1100 — SW corner
  11,  // 1101 — S+W+N
  12,  // 1110 — S+E+W
  13,  // 1111 — isolated peak / small mound
];
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add game/render/cliffBitmask.ts game/render/cliffBitmask.test.ts
git commit -m "feat(render): add cliff edge bitmask lookup"
```

### Task 2.3: TilemapBuilder skeleton (no integration yet)

**Files:**
- Create: `game/render/TilemapBuilder.ts`

- [ ] **Step 1: Implement TilemapBuilder.ts**

```ts
import * as Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS } from '../config/map';
import { computeEdgeBitmask, edgeBitmaskToFrame } from './cliffBitmask';

export interface TerrainCell {
  level: number;
  walkable: boolean;
  buildable: boolean;
  stair: boolean;
  water: boolean;
  bridge: boolean;
  tileKind: 'water' | 'flat' | 'sand' | 'elevated' | 'summit' | 'stair' | 'cave' | 'beach' | 'bridge';
}

export interface TilemapLayers {
  map: Phaser.Tilemaps.Tilemap;
  groundLayer: Phaser.Tilemaps.TilemapLayer;
  cliffLayer:  Phaser.Tilemaps.TilemapLayer;
  pathLayer:   Phaser.Tilemaps.TilemapLayer;
}

const GROUND_TILE_KIND_TO_FRAME: Record<TerrainCell['tileKind'], number> = {
  water:    0,
  beach:    1,
  sand:     1,
  flat:     2,
  elevated: 2,  // top of plateau uses same flat frame; cliff layer adds the edge
  summit:   2,
  stair:    2,  // stair gets its own tile in cliffLayer
  cave:     2,
  bridge:   3,
};

/**
 * Build the three tilemap layers from a terrainGrid.
 * Caller is responsible for setting depths on the returned layers.
 */
export function buildTilemap(
  scene: Phaser.Scene,
  terrainGrid: TerrainCell[][],
): TilemapLayers {
  const map = scene.make.tilemap({
    width: MAP_COLS,
    height: MAP_ROWS,
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
  });

  const flatSet = map.addTilesetImage('flat', 'tilemap_flat', TILE_SIZE, TILE_SIZE);
  const elevSet = map.addTilesetImage('elev', 'tilemap_elev', TILE_SIZE, TILE_SIZE);
  if (!flatSet || !elevSet) throw new Error('Tileset missing — run preload first');

  const groundLayer = map.createBlankLayer('ground', flatSet)!;
  const cliffLayer  = map.createBlankLayer('cliff', elevSet)!;
  const pathLayer   = map.createBlankLayer('path',  flatSet)!;

  groundLayer.setDepth(0);
  cliffLayer.setDepth(5);
  pathLayer.setDepth(10);

  const levelAt = (tx: number, ty: number): number => {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return 0;
    return terrainGrid[ty][tx].level;
  };

  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      const cell = terrainGrid[ty][tx];

      // Ground frame
      groundLayer.putTileAt(GROUND_TILE_KIND_TO_FRAME[cell.tileKind], tx, ty);

      // Cliff frame for level >= 1, only on cells that have a lower neighbor (or stairs)
      if (cell.level >= 1 && !cell.stair) {
        const mask = computeEdgeBitmask(tx, ty, cell.level, levelAt);
        if (mask !== 0) {
          cliffLayer.putTileAt(edgeBitmaskToFrame[mask], tx, ty);
        }
      }

      // Stair tiles get a special frame on cliffLayer (4 directional frames assumed at indices 32-35).
      if (cell.stair) {
        const dir = stairFacing(tx, ty, terrainGrid);
        cliffLayer.putTileAt(32 + dir, tx, ty);
      }
    }
  }

  return { map, groundLayer, cliffLayer, pathLayer };
}

/** Returns 0=N, 1=E, 2=S, 3=W — the side that faces the lower level. */
function stairFacing(tx: number, ty: number, grid: TerrainCell[][]): number {
  const here = grid[ty][tx].level;
  const sample = (dx: number, dy: number): number =>
    (ty + dy < 0 || ty + dy >= MAP_ROWS || tx + dx < 0 || tx + dx >= MAP_COLS)
      ? 0 : grid[ty + dy][tx + dx].level;
  if (sample(0, -1) < here) return 0;
  if (sample(1,  0) < here) return 1;
  if (sample(0,  1) < here) return 2;
  return 3;
}

export function clearTilemap(layers: TilemapLayers): void {
  layers.groundLayer.destroy();
  layers.cliffLayer.destroy();
  layers.pathLayer.destroy();
  layers.map.destroy();
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add game/render/TilemapBuilder.ts
git commit -m "feat(render): TilemapBuilder for ground/cliff/path layers"
```

### Task 2.4: Wire TilemapBuilder into IslandWarsScene; remove old per-tile renderer

**Files:**
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Locate old renderer**

In `IslandWarsScene.ts`, find the block that iterates `terrainGrid` and creates `Image`/`Rectangle` per tile, plus any code that pushes those objects into `terrainVisuals`. Note line numbers.

- [ ] **Step 2: Replace old renderer with TilemapBuilder call**

Add to the top:

```ts
import { buildTilemap, clearTilemap, type TilemapLayers } from '../render/TilemapBuilder';
```

Add a private field:

```ts
private tilemapLayers: TilemapLayers | null = null;
```

Replace the per-tile loop (block identified in Step 1) with:

```ts
this.tilemapLayers = buildTilemap(this, this.terrainGrid);
```

Remove the now-unused `terrainVisuals` array if it has no other consumer. If it does (e.g., scene shutdown clearing), keep the array but don't push tile sprites into it.

- [ ] **Step 3: Hook scene shutdown**

In the scene's existing `shutdown()` (or add one), insert:

```ts
if (this.tilemapLayers) {
  clearTilemap(this.tilemapLayers);
  this.tilemapLayers = null;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Manual visual smoke test**

Run: `npm run dev`. Start a game. Map should render with new Tiny Swords tiles. Cliffs visible around any existing `level >= 1` cells. No double-rendered terrain (look for visual stacking).

- [ ] **Step 6: Commit**

```bash
git add game/scenes/IslandWarsScene.ts
git commit -m "refactor(scene): swap per-tile renderer for Phaser tilemap layers"
```

---

## Phase 3 — Map generation rewrite

### Task 3.1: Add tunables to map.ts

**Files:**
- Modify: `game/config/map.ts`

- [ ] **Step 1: Append new constants**

Read the file first, then append:

```ts
// Hill / decoration tunables added 2026-05-04
export const HILL_SEED_DENSITY       = 1 / 144;   // seeds per tile²
export const HILL_BLOB_MIN           = 6;
export const HILL_BLOB_MAX           = 18;
export const SUMMIT_PROMOTION_CHANCE = 0.30;
export const CASTLE_FLAT_RADIUS      = 8;
export const WAR_CORRIDOR_FLAT_BIAS  = 0.7;
export const GRASS_TUFT_DENSITY      = 0.25;
```

- [ ] **Step 2: Type-check, commit**

```
npx tsc --noEmit
git add game/config/map.ts
git commit -m "feat(config): add hill/deco tunables"
```

### Task 3.2: Hill seeding (pure + tested)

**Files:**
- Create: `game/world/hillSeeding.ts`
- Test: `game/world/hillSeeding.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { placeHillSeeds } from './hillSeeding';

describe('placeHillSeeds', () => {
  const cols = 40, rows = 30;
  const isLand = (_tx: number, _ty: number) => true;

  it('places approximately density × area seeds (within ±50%)', () => {
    const density = 1 / 144; // ≈0.0069
    const seeds = placeHillSeeds({
      cols, rows, density,
      excludeRadius: 0,
      excludeCenters: [],
      isLand,
      rng: mulberry32(42),
    });
    const expected = cols * rows * density; // ~8.3
    expect(seeds.length).toBeGreaterThanOrEqual(expected * 0.5);
    expect(seeds.length).toBeLessThanOrEqual(expected * 1.5);
  });

  it('excludes seeds within excludeRadius of any excludeCenter', () => {
    const seeds = placeHillSeeds({
      cols, rows, density: 1 / 50,
      excludeRadius: 5,
      excludeCenters: [{ tx: 20, ty: 15 }],
      isLand,
      rng: mulberry32(7),
    });
    for (const s of seeds) {
      const dx = s.tx - 20, dy = s.ty - 15;
      expect(Math.hypot(dx, dy)).toBeGreaterThan(5);
    }
  });

  it('returns empty when no land cells', () => {
    const seeds = placeHillSeeds({
      cols, rows, density: 1 / 50,
      excludeRadius: 0, excludeCenters: [],
      isLand: () => false,
      rng: mulberry32(1),
    });
    expect(seeds).toEqual([]);
  });

  it('is deterministic given same seed', () => {
    const opts = {
      cols, rows, density: 1 / 100,
      excludeRadius: 0, excludeCenters: [],
      isLand,
      rng: mulberry32(99),
    };
    const a = placeHillSeeds(opts);
    const b = placeHillSeeds({ ...opts, rng: mulberry32(99) });
    expect(a).toEqual(b);
  });
});

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 2: Run test, watch it fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement hillSeeding.ts**

```ts
export interface HillSeed { tx: number; ty: number; }
export type Rng = () => number;

export interface PlaceHillSeedsOptions {
  cols: number;
  rows: number;
  density: number;                              // expected seeds per tile²
  excludeRadius: number;                        // tiles
  excludeCenters: { tx: number; ty: number }[];
  isLand: (tx: number, ty: number) => boolean;
  rng: Rng;
  /** Min separation between any two seeds, in tiles. Defaults to ⌊√(1/density) × 0.7⌋. */
  minSeparation?: number;
}

/** Poisson-disk-style scatter (rejection sampling). Not cryptographic Poisson disk; close enough. */
export function placeHillSeeds(opts: PlaceHillSeedsOptions): HillSeed[] {
  const target = Math.round(opts.cols * opts.rows * opts.density);
  if (target === 0) return [];

  const minSep = opts.minSeparation ?? Math.max(2, Math.floor(Math.sqrt(1 / opts.density) * 0.7));
  const minSep2 = minSep * minSep;
  const maxAttempts = target * 30;

  const out: HillSeed[] = [];
  let attempts = 0;
  while (out.length < target && attempts < maxAttempts) {
    attempts++;
    const tx = Math.floor(opts.rng() * opts.cols);
    const ty = Math.floor(opts.rng() * opts.rows);
    if (!opts.isLand(tx, ty)) continue;

    let excluded = false;
    for (const c of opts.excludeCenters) {
      const dx = tx - c.tx, dy = ty - c.ty;
      if (dx * dx + dy * dy <= opts.excludeRadius * opts.excludeRadius) {
        excluded = true; break;
      }
    }
    if (excluded) continue;

    let tooClose = false;
    for (const s of out) {
      const dx = tx - s.tx, dy = ty - s.ty;
      if (dx * dx + dy * dy < minSep2) { tooClose = true; break; }
    }
    if (tooClose) continue;

    out.push({ tx, ty });
  }
  return out;
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add game/world/hillSeeding.ts game/world/hillSeeding.test.ts
git commit -m "feat(world): hill seed Poisson scatter"
```

### Task 3.3: Connectivity check (pure + tested)

**Files:**
- Create: `game/world/connectivity.ts`
- Test: `game/world/connectivity.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { reachableFrom, type ReachabilityCell } from './connectivity';

const W = (level: number, stair = false): ReachabilityCell => ({ walkable: true, level, stair });
const X: ReachabilityCell = { walkable: false, level: 0, stair: false };

describe('reachableFrom', () => {
  it('walks through cells of the same level', () => {
    const grid: ReachabilityCell[][] = [
      [W(0), W(0), W(0)],
      [W(0), W(0), W(0)],
    ];
    const r = reachableFrom(grid, 0, 0);
    expect(r.has('2,1')).toBe(true);
  });

  it('does NOT cross a 1-tier cliff without a stair', () => {
    const grid: ReachabilityCell[][] = [
      [W(0), W(1)],
    ];
    const r = reachableFrom(grid, 0, 0);
    expect(r.has('0,0')).toBe(true);
    expect(r.has('1,0')).toBe(false);
  });

  it('crosses a 1-tier cliff via a stair', () => {
    const grid: ReachabilityCell[][] = [
      [W(0), W(0, true), W(1)],
    ];
    const r = reachableFrom(grid, 0, 0);
    expect(r.has('2,0')).toBe(true);
  });

  it('does NOT cross a 2-tier cliff with a single stair', () => {
    const grid: ReachabilityCell[][] = [
      [W(0), W(0, true), W(2)],
    ];
    const r = reachableFrom(grid, 0, 0);
    expect(r.has('2,0')).toBe(false);
  });

  it('respects walkable=false', () => {
    const grid: ReachabilityCell[][] = [[W(0), X, W(0)]];
    const r = reachableFrom(grid, 0, 0);
    expect(r.has('2,0')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement connectivity.ts**

```ts
export interface ReachabilityCell {
  walkable: boolean;
  level: number;
  stair: boolean;
}

/** Set of "tx,ty" keys reachable from (sx, sy) under the cliff/stair traversal rule. */
export function reachableFrom(
  grid: ReachabilityCell[][],
  sx: number, sy: number,
): Set<string> {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const out = new Set<string>();
  if (sy < 0 || sy >= rows || sx < 0 || sx >= cols) return out;
  if (!grid[sy][sx].walkable) return out;

  const queue: [number, number][] = [[sx, sy]];
  out.add(`${sx},${sy}`);
  const N = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const here = grid[y][x];
    for (const [dx, dy] of N) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const key = `${nx},${ny}`;
      if (out.has(key)) continue;
      const neigh = grid[ny][nx];
      if (!neigh.walkable) continue;
      if (!canStep(here, neigh)) continue;
      out.add(key);
      queue.push([nx, ny]);
    }
  }
  return out;
}

function canStep(a: ReachabilityCell, b: ReachabilityCell): boolean {
  if (a.level === b.level) return true;
  if (Math.abs(a.level - b.level) !== 1) return false;
  return a.stair || b.stair;
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add game/world/connectivity.ts game/world/connectivity.test.ts
git commit -m "feat(world): cliff/stair reachability check"
```

### Task 3.4: Terrain generation pipeline (extract + extend)

**Files:**
- Create: `game/world/terrainGen.ts`
- Test: `game/world/terrainGen.test.ts`
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Read existing terrain-gen code in IslandWarsScene**

Identify the function(s) that produce `terrainGrid`. Note input parameters (rng seed, map dims, castle positions) and what they return.

- [ ] **Step 2: Extract pure terrain-gen into terrainGen.ts**

Create `game/world/terrainGen.ts` with this skeleton; copy the existing land-mask + beach logic from IslandWarsScene into the marked spots:

```ts
import {
  MAP_COLS, MAP_ROWS,
  P1_CASTLE_TX, P1_CASTLE_TY, P2_CASTLE_TX, P2_CASTLE_TY,
  HILL_BLOB_MIN, HILL_BLOB_MAX, SUMMIT_PROMOTION_CHANCE,
  CASTLE_FLAT_RADIUS, WAR_CORRIDOR_FLAT_BIAS, HILL_SEED_DENSITY,
} from '../config/map';
import type { TerrainCell } from '../render/TilemapBuilder';
import { placeHillSeeds, type Rng } from './hillSeeding';
import { reachableFrom, type ReachabilityCell } from './connectivity';

export function generateTerrain(rng: Rng): TerrainCell[][] {
  const grid: TerrainCell[][] = makeBlankGrid();

  // ── 1. Land mask ──
  // (Copy existing 3-continent island-shape code from IslandWarsScene here.
  //  Output: set grid[ty][tx].water=true|false. Land cells get level=0,
  //  walkable=true, tileKind='flat'.)

  // ── 2. Beach pass ──
  // (Existing logic; mark beaches as level=0 tileKind='beach'.)

  // ── 3. Hill seeding ──
  const isLand = (tx: number, ty: number) =>
    !grid[ty][tx].water && grid[ty][tx].tileKind !== 'beach';

  const seeds = placeHillSeeds({
    cols: MAP_COLS, rows: MAP_ROWS,
    density: HILL_SEED_DENSITY,
    excludeRadius: CASTLE_FLAT_RADIUS,
    excludeCenters: [
      { tx: P1_CASTLE_TX, ty: P1_CASTLE_TY },
      { tx: P2_CASTLE_TX, ty: P2_CASTLE_TY },
    ],
    isLand,
    rng,
  });

  // ── 4. Hill growth ──
  for (const seed of seeds) {
    if (inWarCorridor(seed.tx, seed.ty) && rng() < WAR_CORRIDOR_FLAT_BIAS) continue;
    const blobSize = HILL_BLOB_MIN + Math.floor(rng() * (HILL_BLOB_MAX - HILL_BLOB_MIN + 1));
    const blob = growBlob(grid, seed, blobSize, rng);
    for (const cell of blob) {
      grid[cell.ty][cell.tx].level = 1;
      grid[cell.ty][cell.tx].tileKind = 'elevated';
    }
  }

  // ── 5. Summit promotion ──
  // Re-iterate hill regions; with chance SUMMIT_PROMOTION_CHANCE promote inner core.
  promoteSummits(grid, rng);

  // ── 6. Stair placement ──
  placeStairs(grid, rng);

  // ── 7. Connectivity assert ──
  ensureCastleToCastleReachability(grid);

  return grid;
}

function makeBlankGrid(): TerrainCell[][] {
  const g: TerrainCell[][] = [];
  for (let ty = 0; ty < MAP_ROWS; ty++) {
    const row: TerrainCell[] = [];
    for (let tx = 0; tx < MAP_COLS; tx++) {
      row.push({
        level: 0, walkable: true, buildable: true, stair: false,
        water: false, bridge: false, tileKind: 'flat',
      });
    }
    g.push(row);
  }
  return g;
}

function inWarCorridor(tx: number, _ty: number): boolean {
  const midX = (P1_CASTLE_TX + P2_CASTLE_TX) / 2;
  const corridorWidth = Math.abs(P2_CASTLE_TX - P1_CASTLE_TX) * 0.4;
  return Math.abs(tx - midX) < corridorWidth;
}

interface BlobCell { tx: number; ty: number; }

function growBlob(grid: TerrainCell[][], seed: BlobCell, target: number, rng: Rng): BlobCell[] {
  const blob: BlobCell[] = [seed];
  const inBlob = new Set<string>([`${seed.tx},${seed.ty}`]);
  const frontier: BlobCell[] = [seed];

  while (blob.length < target && frontier.length > 0) {
    const idx = Math.floor(rng() * frontier.length);
    const cur = frontier[idx];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    const [dx, dy] = dirs[Math.floor(rng() * 4)];
    const nx = cur.tx + dx, ny = cur.ty + dy;
    const key = `${nx},${ny}`;
    if (inBlob.has(key)) {
      frontier.splice(idx, 1);
      continue;
    }
    if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) continue;
    const cell = grid[ny][nx];
    if (cell.water || cell.tileKind === 'beach') continue;
    inBlob.add(key);
    blob.push({ tx: nx, ty: ny });
    frontier.push({ tx: nx, ty: ny });
  }
  return blob;
}

function promoteSummits(grid: TerrainCell[][], rng: Rng): void {
  const visited = new Uint8Array(MAP_COLS * MAP_ROWS);
  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      if (visited[ty * MAP_COLS + tx]) continue;
      if (grid[ty][tx].level !== 1) continue;
      const region = floodRegion(grid, tx, ty, 1, visited);
      if (region.length < 8) continue;
      if (rng() > SUMMIT_PROMOTION_CHANCE) continue;
      const inner = innerErode(region);
      const summitSize = 3 + Math.floor(rng() * 6);
      for (let i = 0; i < Math.min(summitSize, inner.length); i++) {
        const cell = inner[i];
        grid[cell.ty][cell.tx].level = 2;
        grid[cell.ty][cell.tx].tileKind = 'summit';
      }
    }
  }
}

function floodRegion(
  grid: TerrainCell[][], sx: number, sy: number, level: number, visited: Uint8Array,
): BlobCell[] {
  const out: BlobCell[] = [];
  const queue: BlobCell[] = [{ tx: sx, ty: sy }];
  while (queue.length > 0) {
    const c = queue.shift()!;
    const idx = c.ty * MAP_COLS + c.tx;
    if (visited[idx]) continue;
    if (c.tx < 0 || c.ty < 0 || c.tx >= MAP_COLS || c.ty >= MAP_ROWS) continue;
    if (grid[c.ty][c.tx].level !== level) continue;
    visited[idx] = 1;
    out.push(c);
    queue.push({ tx: c.tx + 1, ty: c.ty });
    queue.push({ tx: c.tx - 1, ty: c.ty });
    queue.push({ tx: c.tx, ty: c.ty + 1 });
    queue.push({ tx: c.tx, ty: c.ty - 1 });
  }
  return out;
}

/** Returns region cells that have all 4 cardinal neighbors also in the region. */
function innerErode(region: BlobCell[]): BlobCell[] {
  const set = new Set(region.map(c => `${c.tx},${c.ty}`));
  return region.filter(c =>
    set.has(`${c.tx + 1},${c.ty}`) &&
    set.has(`${c.tx - 1},${c.ty}`) &&
    set.has(`${c.tx},${c.ty + 1}`) &&
    set.has(`${c.tx},${c.ty - 1}`),
  );
}

function placeStairs(grid: TerrainCell[][], rng: Rng): void {
  // For each contiguous level-1 region: place 1 stair per ~10 perimeter tiles, on a perimeter cell.
  const visited = new Uint8Array(MAP_COLS * MAP_ROWS);
  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      if (visited[ty * MAP_COLS + tx]) continue;
      const lvl = grid[ty][tx].level;
      if (lvl < 1) continue;
      const region = floodRegion(grid, tx, ty, lvl, visited);
      const perimeter = region.filter(c => isPerimeter(grid, c.tx, c.ty, lvl));
      const stairCount = Math.max(1, Math.floor(perimeter.length / 10));
      for (let i = 0; i < stairCount && perimeter.length > 0; i++) {
        const idx = Math.floor(rng() * perimeter.length);
        const cell = perimeter.splice(idx, 1)[0];
        grid[cell.ty][cell.tx].stair = true;
        grid[cell.ty][cell.tx].tileKind = 'stair';
      }
    }
  }
}

function isPerimeter(grid: TerrainCell[][], tx: number, ty: number, lvl: number): boolean {
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (const [dx, dy] of dirs) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) return true;
    if (grid[ny][nx].level < lvl) return true;
  }
  return false;
}

function ensureCastleToCastleReachability(grid: TerrainCell[][]): void {
  // Build a ReachabilityCell view from the terrain grid.
  const view: ReachabilityCell[][] = grid.map(row =>
    row.map(c => ({ walkable: c.walkable && !c.water, level: c.level, stair: c.stair })),
  );
  const reach = reachableFrom(view, P1_CASTLE_TX, P1_CASTLE_TY);
  if (!reach.has(`${P2_CASTLE_TX},${P2_CASTLE_TY}`)) {
    // Fallback: knock the highest blocking cell down to level=0 along a straight line.
    // Simple and ugly but guarantees connectivity. Better fix is targeted stair injection.
    flattenStraightLine(grid, P1_CASTLE_TX, P1_CASTLE_TY, P2_CASTLE_TX, P2_CASTLE_TY);
  }
}

function flattenStraightLine(grid: TerrainCell[][], x0: number, y0: number, x1: number, y1: number): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0, y = y0;
  while (true) {
    if (x >= 0 && y >= 0 && x < MAP_COLS && y < MAP_ROWS && !grid[y][x].water) {
      grid[y][x].level = 0;
      grid[y][x].tileKind = 'flat';
      grid[y][x].stair = false;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
}
```

- [ ] **Step 3: Write a test for terrainGen contract**

`game/world/terrainGen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateTerrain } from './terrainGen';
import { reachableFrom } from './connectivity';
import {
  MAP_COLS, MAP_ROWS,
  P1_CASTLE_TX, P1_CASTLE_TY,
  P2_CASTLE_TX, P2_CASTLE_TY,
  CASTLE_FLAT_RADIUS,
} from '../config/map';

function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('generateTerrain', () => {
  for (let seed = 1; seed <= 10; seed++) {
    it(`seed ${seed} — castle plazas are flat`, () => {
      const grid = generateTerrain(mulberry32(seed));
      for (let dy = -CASTLE_FLAT_RADIUS + 1; dy < CASTLE_FLAT_RADIUS; dy++) {
        for (let dx = -CASTLE_FLAT_RADIUS + 1; dx < CASTLE_FLAT_RADIUS; dx++) {
          const tx = P1_CASTLE_TX + dx, ty = P1_CASTLE_TY + dy;
          if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) continue;
          if (grid[ty][tx].water) continue;
          expect(grid[ty][tx].level).toBe(0);
        }
      }
    });

    it(`seed ${seed} — P1 castle reaches P2 castle`, () => {
      const grid = generateTerrain(mulberry32(seed));
      const view = grid.map(row => row.map(c => ({
        walkable: c.walkable && !c.water, level: c.level, stair: c.stair,
      })));
      const reach = reachableFrom(view, P1_CASTLE_TX, P1_CASTLE_TY);
      expect(reach.has(`${P2_CASTLE_TX},${P2_CASTLE_TY}`)).toBe(true);
    });
  }
});
```

- [ ] **Step 4: Iterate until tests pass**

Run: `npm test`. If land-mask isn't producing land at castle positions, the extracted code from IslandWarsScene needs the same forced-land guarantee the original uses for castles. Adjust the extracted island-shape logic until both invariants hold.

- [ ] **Step 5: Wire generateTerrain into IslandWarsScene**

In IslandWarsScene, replace the existing terrain-gen call with:

```ts
import { generateTerrain } from '../world/terrainGen';
// …
const rng = makeRng(this.seed); // reuse existing seed source
this.terrainGrid = generateTerrain(rng);
```

Delete the now-redundant terrain-gen helpers from IslandWarsScene.

- [ ] **Step 6: tsc, dev smoke test**

Run: `npx tsc --noEmit` then `npm run dev`. Map should now show hilly terrain with stairs. Castle plazas remain flat.

- [ ] **Step 7: Commit**

```bash
git add game/world/terrainGen.ts game/world/terrainGen.test.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(world): hilly terrain generation with stairs and connectivity guarantee"
```

---

## Phase 4 — Movement, traversal, combat

### Task 4.1: MovementSystem — canEnterTile + isReachable + A* (pure + tested)

**Files:**
- Create: `game/systems/MovementSystem.ts`
- Test: `game/systems/MovementSystem.test.ts`

- [ ] **Step 1: Write the failing test**

`game/systems/MovementSystem.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MovementSystem } from './MovementSystem';
import type { TerrainCell } from '../render/TilemapBuilder';

function cell(level: number, walkable = true, stair = false): TerrainCell {
  return { level, walkable, buildable: false, stair, water: !walkable, bridge: false, tileKind: 'flat' };
}

const W = cell(0);
const X = cell(0, false);
const H = cell(1);
const S = cell(1, true, true); // stair tile sits at the high-side level by convention

describe('MovementSystem.canEnterTile', () => {
  it('allows same-level moves', () => {
    const grid = [[W, W]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(true);
  });

  it('blocks 1-tier cliff without stair', () => {
    const grid = [[W, H]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(false);
  });

  it('allows 1-tier transition through a stair', () => {
    const grid = [[W, S]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(true);
    expect(m.canEnterTile(1, 0, 0, 0)).toBe(true);
  });

  it('blocks unwalkable target', () => {
    const grid = [[W, X]];
    const m = new MovementSystem(grid);
    expect(m.canEnterTile(0, 0, 1, 0)).toBe(false);
  });
});

describe('MovementSystem.findPath', () => {
  it('returns straight path on flat terrain', () => {
    const grid = [[W, W, W, W]];
    const m = new MovementSystem(grid);
    const path = m.findPath(0, 0, 3, 0);
    expect(path).not.toBeNull();
    expect(path!.length).toBe(4);
    expect(path![3]).toEqual({ tx: 3, ty: 0 });
  });

  it('routes around a cliff via a stair', () => {
    const grid: TerrainCell[][] = [
      [W, H, W],
      [W, S, W],
      [W, H, W],
    ];
    const m = new MovementSystem(grid);
    const path = m.findPath(0, 0, 2, 0);
    expect(path).not.toBeNull();
    expect(path!.some(p => p.tx === 1 && p.ty === 1)).toBe(true);
  });

  it('returns null when unreachable', () => {
    const grid: TerrainCell[][] = [
      [W, H, W],
      [W, H, W],
      [W, H, W],
    ];
    const m = new MovementSystem(grid);
    expect(m.findPath(0, 0, 2, 0)).toBeNull();
  });
});

describe('MovementSystem.isReachable', () => {
  it('matches A* result for reachable case', () => {
    const grid = [[W, W, W]];
    const m = new MovementSystem(grid);
    expect(m.isReachable(0, 0, 2, 0)).toBe(true);
  });

  it('returns false when path is null', () => {
    const grid = [[W, X, W]];
    const m = new MovementSystem(grid);
    expect(m.isReachable(0, 0, 2, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, watch it fail**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement MovementSystem.ts**

```ts
import type { TerrainCell } from '../render/TilemapBuilder';

export interface TilePoint { tx: number; ty: number; }

export class MovementSystem {
  private grid: TerrainCell[][];
  private rows: number;
  private cols: number;

  constructor(grid: TerrainCell[][]) {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = this.rows > 0 ? grid[0].length : 0;
  }

  canEnterTile(fromTx: number, fromTy: number, toTx: number, toTy: number): boolean {
    if (toTx < 0 || toTy < 0 || toTx >= this.cols || toTy >= this.rows) return false;
    const a = this.grid[fromTy]?.[fromTx];
    const b = this.grid[toTy][toTx];
    if (!a || !b) return false;
    if (!b.walkable) return false;
    if (a.level === b.level) return true;
    if (Math.abs(a.level - b.level) !== 1) return false;
    return a.stair || b.stair;
  }

  isReachable(fromTx: number, fromTy: number, toTx: number, toTy: number): boolean {
    return this.findPath(fromTx, fromTy, toTx, toTy) !== null;
  }

  /**
   * 4-directional A* with diagonals. Diagonal moves require both adjacent cardinals
   * to be enterable from `from` (no corner-cutting). Returns path including start
   * and goal, or null if unreachable.
   */
  findPath(fromTx: number, fromTy: number, toTx: number, toTy: number): TilePoint[] | null {
    if (!this.inBounds(fromTx, fromTy) || !this.inBounds(toTx, toTy)) return null;
    if (!this.grid[toTy][toTx].walkable) return null;

    const startKey = key(fromTx, fromTy);
    const goalKey  = key(toTx,   toTy);

    const open = new MinHeap();
    open.push({ key: startKey, tx: fromTx, ty: fromTy, g: 0, f: heuristic(fromTx, fromTy, toTx, toTy) });

    const cameFrom = new Map<string, string>();
    const gScore = new Map<string, number>();
    gScore.set(startKey, 0);

    while (!open.isEmpty()) {
      const cur = open.pop()!;
      if (cur.key === goalKey) return reconstruct(cameFrom, cur.key);

      for (const [dx, dy, cost] of NEIGHBORS) {
        const nx = cur.tx + dx, ny = cur.ty + dy;
        if (!this.canEnterTile(cur.tx, cur.ty, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          // Diagonal: require both cardinals enterable from cur.
          if (!this.canEnterTile(cur.tx, cur.ty, cur.tx + dx, cur.ty)) continue;
          if (!this.canEnterTile(cur.tx, cur.ty, cur.tx, cur.ty + dy)) continue;
        }
        const tentative = cur.g + cost;
        const nKey = key(nx, ny);
        if (tentative >= (gScore.get(nKey) ?? Infinity)) continue;
        gScore.set(nKey, tentative);
        cameFrom.set(nKey, cur.key);
        open.push({ key: nKey, tx: nx, ty: ny, g: tentative, f: tentative + heuristic(nx, ny, toTx, toTy) });
      }
    }
    return null;
  }

  /** Allows the scene to swap in a new terrain grid (e.g., after stair injection). */
  setGrid(grid: TerrainCell[][]): void {
    this.grid = grid;
    this.rows = grid.length;
    this.cols = this.rows > 0 ? grid[0].length : 0;
  }

  private inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.cols && ty < this.rows;
  }
}

const NEIGHBORS: ReadonlyArray<[number, number, number]> = [
  [ 0, -1, 10], [ 1,  0, 10], [ 0,  1, 10], [-1,  0, 10],
  [ 1, -1, 14], [ 1,  1, 14], [-1,  1, 14], [-1, -1, 14],
];

function key(tx: number, ty: number): string { return `${tx},${ty}`; }
function heuristic(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  return 10 * (dx + dy) + (14 - 20) * Math.min(dx, dy); // octile
}

function reconstruct(cameFrom: Map<string, string>, endKey: string): TilePoint[] {
  const out: TilePoint[] = [];
  let cur: string | undefined = endKey;
  while (cur) {
    const [tx, ty] = cur.split(',').map(Number);
    out.push({ tx, ty });
    cur = cameFrom.get(cur);
  }
  return out.reverse();
}

interface HeapNode { key: string; tx: number; ty: number; g: number; f: number; }

class MinHeap {
  private a: HeapNode[] = [];
  isEmpty(): boolean { return this.a.length === 0; }
  push(n: HeapNode): void {
    this.a.push(n);
    let i = this.a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.a[p].f <= this.a[i].f) break;
      [this.a[p], this.a[i]] = [this.a[i], this.a[p]];
      i = p;
    }
  }
  pop(): HeapNode | undefined {
    if (this.a.length === 0) return undefined;
    const top = this.a[0];
    const last = this.a.pop()!;
    if (this.a.length > 0) {
      this.a[0] = last;
      let i = 0;
      const n = this.a.length;
      while (true) {
        const l = 2 * i + 1, r = 2 * i + 2;
        let s = i;
        if (l < n && this.a[l].f < this.a[s].f) s = l;
        if (r < n && this.a[r].f < this.a[s].f) s = r;
        if (s === i) break;
        [this.a[s], this.a[i]] = [this.a[i], this.a[s]];
        i = s;
      }
    }
    return top;
  }
}
```

- [ ] **Step 4: Run test, verify pass**

Run: `npm test`
Expected: PASS, all MovementSystem tests.

- [ ] **Step 5: Commit**

```bash
git add game/systems/MovementSystem.ts game/systems/MovementSystem.test.ts
git commit -m "feat(systems): MovementSystem A* with cliff/stair traversal"
```

### Task 4.2: Wire MovementSystem into IslandWarsScene + Unit

**Files:**
- Modify: `game/scenes/IslandWarsScene.ts`
- Modify: `game/entities/Unit.ts`

- [ ] **Step 1: Construct MovementSystem in scene**

In IslandWarsScene, after `terrainGrid` is built and `tilemapLayers` is created, add:

```ts
import { MovementSystem } from '../systems/MovementSystem';
// …
private movementSystem!: MovementSystem;
// in create() after terrain build:
this.movementSystem = new MovementSystem(this.terrainGrid);
```

- [ ] **Step 2: Inject route planner into Unit**

`Unit.ts` already has a `routePlanner` field. Where units are constructed in IslandWarsScene, attach a planner:

```ts
unit['routePlanner'] = (fx, fy, tx, ty) => {
  const tilePath = this.movementSystem.findPath(
    Math.floor(fx / TILE_SIZE), Math.floor(fy / TILE_SIZE),
    Math.floor(tx / TILE_SIZE), Math.floor(ty / TILE_SIZE),
  );
  if (!tilePath) return [];
  return tilePath.map(p => ({
    x: p.tx * TILE_SIZE + TILE_SIZE / 2,
    y: p.ty * TILE_SIZE + TILE_SIZE / 2,
  }));
};
```

(Use a public setter rather than bracket access if Unit gets one in Step 3.)

- [ ] **Step 3: Add a public setter on Unit**

In `Unit.ts`, add:

```ts
public setRoutePlanner(planner: (fx: number, fy: number, tx: number, ty: number) => { x: number; y: number }[]): void {
  this.routePlanner = planner;
}
```

Use it from the scene instead of bracket-access.

- [ ] **Step 4: Replace direct steering in Unit.update()**

Find the existing movement code in `Unit.ts` that sets velocity directly toward `targetX/targetY`. Replace with: every 250 ms (using existing `chaseRetargetCooldown` or a new `pathRecomputeMs`), if no path or target tile changed, ask the planner. Walk toward the next path waypoint. When within 4 px of a waypoint, advance `pathIndex`. Stop when path consumed or planner returns empty.

Pseudocode:

```ts
this.pathRecomputeMs -= dt;
if (this.path.length === 0 || this.pathRecomputeMs <= 0) {
  this.pathRecomputeMs = 250;
  if (this.routePlanner) {
    this.path = this.routePlanner(this.state.x, this.state.y, this.state.targetX, this.state.targetY);
    this.pathIndex = 0;
  }
}
const waypoint = this.path[this.pathIndex];
if (waypoint) {
  const dx = waypoint.x - this.state.x;
  const dy = waypoint.y - this.state.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) {
    this.pathIndex++;
    if (this.pathIndex >= this.path.length) { this.path = []; }
  } else {
    const speed = cfg.speed; // existing
    this.state.x += (dx / dist) * speed * (dt / 1000);
    this.state.y += (dy / dist) * speed * (dt / 1000);
  }
}
```

Keep the existing combat-attack-target steering (units in attack mode still chase their target via the planner — same call).

- [ ] **Step 5: Type-check, dev smoke test**

Run: `npx tsc --noEmit` then `npm run dev`. Send a unit somewhere on the far side of a hill — it should walk *around* via stairs, not straight through. Two units should not visibly walk through cliffs.

- [ ] **Step 6: Commit**

```bash
git add game/systems/MovementSystem.ts game/entities/Unit.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(units): route via MovementSystem, respect cliff traversal"
```

### Task 4.3: Visual elevation Y-offset

**Files:**
- Modify: `game/entities/Unit.ts`

- [ ] **Step 1: Add helper and apply offset**

In `Unit.ts`, add a private accessor:

```ts
private getElevationOffset(scene: Phaser.Scene): number {
  const tx = Math.floor(this.state.x / TILE_SIZE);
  const ty = Math.floor(this.state.y / TILE_SIZE);
  // Scene exposes a public method getTileLevel; see Step 2.
  const level = (scene as any).getTileLevel?.(tx, ty) ?? 0;
  if (level === 1) return -12;
  if (level === 2) return -22;
  return 0;
}
```

In the existing `update()` where sprite/shadow Y is set:

```ts
const yOffset = this.getElevationOffset(this.scene);
this.sprite.setY(this.state.y + yOffset);
this.shadow.setY(this.state.y + 12);  // shadow stays at ground
this.hpBar.setY(this.state.y + yOffset - 22);
```

- [ ] **Step 2: Add getTileLevel to IslandWarsScene**

```ts
public getTileLevel(tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return 0;
  return this.terrainGrid[ty]?.[tx]?.level ?? 0;
}
```

Replace the `(scene as any)` cast in Unit with a typed import if convenient, otherwise leave as-is (low cost).

- [ ] **Step 3: Dev smoke test**

Send a unit up a stair. Sprite Y should rise by 12 px when it crosses onto an elevated cell, and rise by 10 more on a summit.

- [ ] **Step 4: Commit**

```bash
git add game/entities/Unit.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(units): visual elevation Y-offset for hill/summit"
```

### Task 4.4: Combat LOS + archer hill bonus

**Files:**
- Modify: `game/systems/CombatSystem.ts`

- [ ] **Step 1: Read CombatSystem and locate ranged attack resolution**

Find the spot where archer/tower attacks resolve (range check + damage application). Note the function name(s).

- [ ] **Step 2: Add losBlockedByCliff helper**

Append to CombatSystem (or extract to a small helper):

```ts
import { TILE_SIZE, MAP_COLS, MAP_ROWS } from '../config/map';
import type { TerrainCell } from '../render/TilemapBuilder';

function getLevelAt(grid: TerrainCell[][], wx: number, wy: number): number {
  const tx = Math.floor(wx / TILE_SIZE), ty = Math.floor(wy / TILE_SIZE);
  if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return 0;
  return grid[ty]?.[tx]?.level ?? 0;
}

export function losBlockedByCliff(
  grid: TerrainCell[][],
  fromX: number, fromY: number,
  toX:   number, toY:   number,
): boolean {
  const fromLvl = getLevelAt(grid, fromX, fromY);
  const toLvl   = getLevelAt(grid, toX,   toY);
  const minLvl  = Math.min(fromLvl, toLvl);
  // Bresenham on world-pixel coords, sampling every TILE_SIZE/2 px.
  const dx = toX - fromX, dy = toY - fromY;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (TILE_SIZE / 2)));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const sx = fromX + dx * t, sy = fromY + dy * t;
    if (getLevelAt(grid, sx, sy) > minLvl) return true;
  }
  return false;
}
```

- [ ] **Step 3: Use it in ranged attack resolution**

Wherever a ranged attacker decides to fire (after range check, before damage), add:

```ts
if (losBlockedByCliff(this.terrainGrid, attacker.state.x, attacker.state.y, target.state.x, target.state.y)) {
  return; // shot blocked
}
```

`CombatSystem` will need the terrain grid. Pass it in via constructor (similar to how it likely already takes scene refs), or via a setter called by the scene at create time.

- [ ] **Step 4: Archer hill bonus**

Where archer effective range is computed, add:

```ts
let range = UNIT_CONFIGS[attacker.state.type].attackRange;
if (attacker.state.type === 'archer') {
  const lvl = getLevelAt(this.terrainGrid, attacker.state.x, attacker.state.y);
  if (lvl >= 1) range *= 1.20;
}
```

(Apply analogously if towers should benefit too — out of scope for now.)

- [ ] **Step 5: Type-check, dev smoke test**

Run: `npx tsc --noEmit` then `npm run dev`. Position an archer behind a level-2 summit; verify it can't shoot a target on the other side. Place an archer on a hill; verify it engages from a noticeably longer distance.

- [ ] **Step 6: Commit**

```bash
git add game/systems/CombatSystem.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(combat): cliff LOS blocking and archer hill range bonus"
```

### Task 4.5: AISystem reachability check

**Files:**
- Modify: `game/systems/AISystem.ts`

- [ ] **Step 1: Inject MovementSystem reference**

Add a `setMovementSystem(ms: MovementSystem)` method on AISystem, called by the scene after both are constructed.

- [ ] **Step 2: Filter unreachable targets**

In the bot's target-picking logic, when scoring potential player units/buildings to attack, skip any whose tile is unreachable from the bot unit's tile:

```ts
const fromTx = Math.floor(botUnit.state.x / TILE_SIZE);
const fromTy = Math.floor(botUnit.state.y / TILE_SIZE);
const toTx   = Math.floor(target.state.x / TILE_SIZE);
const toTy   = Math.floor(target.state.y / TILE_SIZE);
if (!this.movementSystem.isReachable(fromTx, fromTy, toTx, toTy)) continue;
```

If AI commands are issued at the army level rather than per-unit, perform the check on the squad leader.

- [ ] **Step 3: Type-check, smoke test**

Run: `npx tsc --noEmit` then `npm run dev`. Bot should not order pawns to march into impassable hills.

- [ ] **Step 4: Commit**

```bash
git add game/systems/AISystem.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(ai): skip unreachable targets via MovementSystem"
```

---

## Phase 5 — Decoration & ambient life

### Task 5.1: AmbientSwaySystem (shared sine driver)

**Files:**
- Create: `game/systems/AmbientSwaySystem.ts`

- [ ] **Step 1: Implement AmbientSwaySystem**

```ts
import * as Phaser from 'phaser';

interface SwayEntry {
  sprite: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  phase: number;
  amplitudeRad: number;
  periodMs: number;
}

interface ScaleEntry {
  sprite: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject;
  phase: number;
  baseScaleY: number;
  amplitude: number;
  periodMs: number;
}

export class AmbientSwaySystem {
  private rotEntries: SwayEntry[] = [];
  private scaleEntries: ScaleEntry[] = [];
  private elapsedMs = 0;

  registerSway(
    sprite: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    amplitudeDeg = 2,
    periodMs = 1800,
  ): void {
    this.rotEntries.push({
      sprite,
      phase: Math.random() * Math.PI * 2,
      amplitudeRad: (amplitudeDeg * Math.PI) / 180,
      periodMs,
    });
  }

  registerScale(
    sprite: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject,
    baseScaleY: number,
    amplitude = 0.04,
    periodMs = 2000,
  ): void {
    this.scaleEntries.push({
      sprite,
      phase: Math.random() * Math.PI * 2,
      baseScaleY,
      amplitude,
      periodMs,
    });
  }

  update(dtMs: number): void {
    this.elapsedMs += dtMs;
    for (const e of this.rotEntries) {
      const w = (2 * Math.PI * this.elapsedMs) / e.periodMs + e.phase;
      (e.sprite as any).rotation = Math.sin(w) * e.amplitudeRad;
    }
    for (const e of this.scaleEntries) {
      const w = (2 * Math.PI * this.elapsedMs) / e.periodMs + e.phase;
      (e.sprite as any).scaleY = e.baseScaleY * (1 - e.amplitude * 0.5 + e.amplitude * 0.5 * Math.sin(w));
    }
  }

  /** Drop entries whose sprite has been destroyed. Call periodically. */
  prune(): void {
    this.rotEntries   = this.rotEntries  .filter(e => (e.sprite as any).active !== false);
    this.scaleEntries = this.scaleEntries.filter(e => (e.sprite as any).active !== false);
  }
}
```

- [ ] **Step 2: Construct in IslandWarsScene; call update each frame**

```ts
import { AmbientSwaySystem } from '../systems/AmbientSwaySystem';
// …
private swaySystem = new AmbientSwaySystem();
// in update(time, delta):
this.swaySystem.update(delta);
```

- [ ] **Step 3: Register existing tree resource nodes**

After resource nodes spawn, iterate `this.p1Resources.concat(this.p2Resources)` and for each tree, call `this.swaySystem.registerSway(tree.sprite, 2, 1800 + Math.random() * 400)`.

- [ ] **Step 4: Smoke test**

Run: `npm run dev`. Trees should subtly sway.

- [ ] **Step 5: Commit**

```bash
git add game/systems/AmbientSwaySystem.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(deco): AmbientSwaySystem; sway existing tree sprites"
```

### Task 5.2: decoSpawner — grass tufts

**Files:**
- Create: `game/render/decoSpawner.ts`
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Implement spawnGrassTufts**

```ts
import * as Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, GRASS_TUFT_DENSITY } from '../config/map';
import type { TerrainCell } from './TilemapBuilder';
import type { AmbientSwaySystem } from '../systems/AmbientSwaySystem';

const GRASS_DECO_KEYS = ['deco_03', 'deco_04', 'deco_07', 'deco_09']; // tufts/bushes — verify

export function spawnGrassTufts(
  scene: Phaser.Scene,
  grid: TerrainCell[][],
  sway: AmbientSwaySystem,
  rng: () => number,
): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = [];
  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      const c = grid[ty][tx];
      if (c.water || c.tileKind === 'beach' || c.stair) continue;
      if (rng() > GRASS_TUFT_DENSITY) continue;
      const key = GRASS_DECO_KEYS[Math.floor(rng() * GRASS_DECO_KEYS.length)];
      const wx = tx * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * TILE_SIZE * 0.6;
      const wy = ty * TILE_SIZE + TILE_SIZE / 2 + (rng() - 0.5) * TILE_SIZE * 0.6;
      const img = scene.add.image(wx, wy, key);
      img.setDepth(25);
      img.setScale(0.6);
      img.setOrigin(0.5, 0.9); // anchor near base for sway pivot
      sway.registerScale(img, 0.6);
      out.push(img);
    }
  }
  return out;
}
```

- [ ] **Step 2: Call from IslandWarsScene after terrain build**

```ts
import { spawnGrassTufts } from '../render/decoSpawner';
// after tilemap built and resources spawned:
spawnGrassTufts(this, this.terrainGrid, this.swaySystem, () => Math.random());
```

(Use the same seeded rng as terrain gen if you want determinism; `Math.random` is fine for first pass.)

- [ ] **Step 3: Verify deco keys exist**

Open the dev console — if `deco_03` etc. fail to render, list `Tiny Swords (Update 010)/Deco/` and pick four files that look like grass tufts. Update the `GRASS_DECO_KEYS` array.

- [ ] **Step 4: Commit**

```bash
git add game/render/decoSpawner.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(deco): scatter grass tufts with subtle sway"
```

### Task 5.3: Animated foam on shorelines

**Files:**
- Modify: `game/render/decoSpawner.ts`
- Modify: `game/scenes/PreloadScene.ts` (animation registration)
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Register foam animation in scene create()**

In IslandWarsScene `create()`, before spawning foam:

```ts
this.anims.create({
  key: 'foam_loop',
  frames: [
    { key: 'foam_1' }, { key: 'foam_2' }, { key: 'foam_3' }, { key: 'foam_4' },
    { key: 'foam_5' }, { key: 'foam_6' }, { key: 'foam_7' }, { key: 'foam_8' },
  ],
  frameRate: 8,
  repeat: -1,
});
```

(Adjust frame count if Tiny Swords ships a different number.)

- [ ] **Step 2: Add spawnFoam in decoSpawner**

```ts
export function spawnFoam(
  scene: Phaser.Scene,
  grid: TerrainCell[][],
): Phaser.GameObjects.Sprite[] {
  const out: Phaser.GameObjects.Sprite[] = [];
  for (let ty = 0; ty < MAP_ROWS; ty++) {
    for (let tx = 0; tx < MAP_COLS; tx++) {
      const c = grid[ty][tx];
      if (!c.water) continue;
      // Foam on water cells adjacent to land.
      let touchesLand = false;
      for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_COLS || ny >= MAP_ROWS) continue;
        if (!grid[ny][nx].water) { touchesLand = true; break; }
      }
      if (!touchesLand) continue;
      const wx = tx * TILE_SIZE + TILE_SIZE / 2;
      const wy = ty * TILE_SIZE + TILE_SIZE / 2;
      const s = scene.add.sprite(wx, wy, 'foam_1');
      s.setDepth(15);
      s.play('foam_loop');
      out.push(s);
    }
  }
  return out;
}
```

- [ ] **Step 3: Call from scene; smoke test**

Add `spawnFoam(this, this.terrainGrid);` after `spawnGrassTufts`. Foam should animate around the shore.

- [ ] **Step 4: Commit**

```bash
git add game/render/decoSpawner.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(deco): animated foam on shorelines"
```

### Task 5.4: WildlifeSystem — sheep/cow/chicken wander + butterflies

**Files:**
- Create: `game/systems/WildlifeSystem.ts`
- Modify: `game/scenes/PreloadScene.ts`
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Verify wildlife sprite paths**

`ls "public/Tiny Swords/Tiny Swords (Update 010)/Factions/" -R` — find sheep / cow / chicken sprite sheets. If absent, fall back to picking 3 deco frames as static "grazing" stand-ins.

- [ ] **Step 2: Preload wildlife sprites**

In PreloadScene, load whatever was found:

```ts
this.load.image('wildlife_sheep',   `${base}/Factions/Knights/Troops/Sheep/Sheep.png`); // adjust to actual path
this.load.image('wildlife_cow',     `${base}/Factions/Knights/Troops/Cow/Cow.png`);
this.load.image('wildlife_chicken', `${base}/Factions/Knights/Troops/Chicken/Chicken.png`);
this.load.image('butterfly',        `${base}/Deco/14.png`); // small bug-like deco frame; verify
```

- [ ] **Step 3: Implement WildlifeSystem**

```ts
import * as Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS, P1_TERRITORY_MAX_X, P2_TERRITORY_MIN_X } from '../config/map';
import type { TerrainCell } from '../render/TilemapBuilder';
import type { MovementSystem } from './MovementSystem';

interface Critter {
  sprite: Phaser.GameObjects.Image;
  tx: number;
  ty: number;
  targetWx: number;
  targetWy: number;
  nextDecisionMs: number;
  speed: number;
}

interface Butterfly {
  sprite: Phaser.GameObjects.Image;
  centerX: number;
  centerY: number;
  radius: number;
  phase: number;
  speed: number;
}

export class WildlifeSystem {
  private critters: Critter[] = [];
  private butterflies: Butterfly[] = [];
  private elapsedMs = 0;

  constructor(
    private scene: Phaser.Scene,
    private grid: TerrainCell[][],
    private movement: MovementSystem,
    private rng: () => number,
  ) {}

  spawnAll(opts: { sheep: number; cow: number; chicken: number; butterflies: number; }): void {
    this.spawnSpecies('wildlife_sheep',   opts.sheep);
    this.spawnSpecies('wildlife_cow',     opts.cow);
    this.spawnSpecies('wildlife_chicken', opts.chicken);
    this.spawnButterflies(opts.butterflies);
  }

  private spawnSpecies(key: string, count: number): void {
    let attempts = 0;
    let placed = 0;
    while (placed < count && attempts < count * 20) {
      attempts++;
      const tx = Math.floor(this.rng() * MAP_COLS);
      const ty = Math.floor(this.rng() * MAP_ROWS);
      const c = this.grid[ty][tx];
      if (c.water || c.level !== 0 || c.stair) continue;
      const wx = tx * TILE_SIZE + TILE_SIZE / 2;
      // Only neutral land — outside both territories.
      if (wx < P1_TERRITORY_MAX_X + TILE_SIZE * 4) continue;
      if (wx > P2_TERRITORY_MIN_X - TILE_SIZE * 4) continue;
      const sprite = this.scene.add.image(wx, ty * TILE_SIZE + TILE_SIZE / 2, key);
      sprite.setDepth(30);
      sprite.setScale(0.7);
      this.critters.push({
        sprite, tx, ty,
        targetWx: sprite.x, targetWy: sprite.y,
        nextDecisionMs: 0,
        speed: 25 + this.rng() * 15, // px/s — 0.3× of typical unit speed
      });
      placed++;
    }
  }

  private spawnButterflies(count: number): void {
    for (let i = 0; i < count; i++) {
      // Pick a random hill cell as a center.
      let tx = 0, ty = 0, ok = false;
      for (let attempt = 0; attempt < 50 && !ok; attempt++) {
        tx = Math.floor(this.rng() * MAP_COLS);
        ty = Math.floor(this.rng() * MAP_ROWS);
        if (this.grid[ty][tx].level >= 1) ok = true;
      }
      if (!ok) continue;
      const sprite = this.scene.add.image(tx * TILE_SIZE, ty * TILE_SIZE, 'butterfly');
      sprite.setDepth(30);
      sprite.setScale(0.4);
      this.butterflies.push({
        sprite,
        centerX: tx * TILE_SIZE,
        centerY: ty * TILE_SIZE,
        radius: 40 + this.rng() * 40,
        phase: this.rng() * Math.PI * 2,
        speed: 0.0008 + this.rng() * 0.0006, // radians/ms
      });
    }
  }

  update(dtMs: number): void {
    this.elapsedMs += dtMs;
    for (const c of this.critters) {
      c.nextDecisionMs -= dtMs;
      if (c.nextDecisionMs <= 0) {
        // Pick a new wander tile within 4 of current.
        for (let attempt = 0; attempt < 8; attempt++) {
          const ntx = c.tx + Math.floor(this.rng() * 9) - 4;
          const nty = c.ty + Math.floor(this.rng() * 9) - 4;
          if (this.movement.isReachable(c.tx, c.ty, ntx, nty)) {
            c.tx = ntx; c.ty = nty;
            c.targetWx = ntx * TILE_SIZE + TILE_SIZE / 2;
            c.targetWy = nty * TILE_SIZE + TILE_SIZE / 2;
            break;
          }
        }
        c.nextDecisionMs = 4000 + this.rng() * 3000;
      }
      const dx = c.targetWx - c.sprite.x;
      const dy = c.targetWy - c.sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1) {
        const step = Math.min(dist, c.speed * (dtMs / 1000));
        c.sprite.x += (dx / dist) * step;
        c.sprite.y += (dy / dist) * step;
      }
    }
    for (const b of this.butterflies) {
      const t = this.elapsedMs * b.speed + b.phase;
      b.sprite.x = b.centerX + Math.cos(t) * b.radius;
      b.sprite.y = b.centerY + Math.sin(t * 2) * (b.radius * 0.5);
    }
  }
}
```

- [ ] **Step 4: Construct in scene; call update**

```ts
import { WildlifeSystem } from '../systems/WildlifeSystem';
// after MovementSystem ready:
this.wildlifeSystem = new WildlifeSystem(this, this.terrainGrid, this.movementSystem, () => Math.random());
this.wildlifeSystem.spawnAll({
  sheep: this.isMobile ? 3 : 8,
  cow: this.isMobile ? 3 : 6,
  chicken: this.isMobile ? 4 : 10,
  butterflies: this.isMobile ? 0 : 6,
});
// in update(time, delta):
this.wildlifeSystem.update(delta);
```

(`this.isMobile` should already exist; if not, derive from the same touch detection used elsewhere.)

- [ ] **Step 5: Commit**

```bash
git add game/systems/WildlifeSystem.ts game/scenes/PreloadScene.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(deco): wandering wildlife and ambient butterflies"
```

### Task 5.5: Resource node clusters

**Files:**
- Modify: `game/render/decoSpawner.ts`
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Add spawnResourceClusters**

```ts
const STUMP_DECO_KEYS = ['deco_05', 'deco_06', 'deco_15']; // verify
const ORE_DECO_KEYS   = ['deco_10', 'deco_12'];            // verify

export function spawnResourceClusters(
  scene: Phaser.Scene,
  trees: { x: number; y: number }[],
  mines: { x: number; y: number }[],
  rng: () => number,
): Phaser.GameObjects.Image[] {
  const out: Phaser.GameObjects.Image[] = [];
  for (const t of trees) {
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const k = STUMP_DECO_KEYS[Math.floor(rng() * STUMP_DECO_KEYS.length)];
      const dx = (rng() - 0.5) * TILE_SIZE * 1.4;
      const dy = (rng() - 0.5) * TILE_SIZE * 1.4;
      const img = scene.add.image(t.x + dx, t.y + dy, k).setDepth(20).setScale(0.5);
      out.push(img);
    }
  }
  for (const m of mines) {
    const n = 1 + Math.floor(rng() * 2);
    for (let i = 0; i < n; i++) {
      const k = ORE_DECO_KEYS[Math.floor(rng() * ORE_DECO_KEYS.length)];
      const dx = (rng() - 0.5) * TILE_SIZE * 1.4;
      const dy = (rng() - 0.5) * TILE_SIZE * 1.4;
      const img = scene.add.image(m.x + dx, m.y + dy, k).setDepth(20).setScale(0.5);
      out.push(img);
    }
  }
  return out;
}
```

- [ ] **Step 2: Call from scene after resource nodes are placed**

```ts
const trees = [...this.p1Resources, ...this.p2Resources]
  .filter(r => r.type === 'tree')
  .map(r => ({ x: r.sprite.x, y: r.sprite.y }));
const mines = [...this.p1Resources, ...this.p2Resources]
  .filter(r => r.type === 'goldmine')
  .map(r => ({ x: r.sprite.x, y: r.sprite.y }));
spawnResourceClusters(this, trees, mines, () => Math.random());
```

(Adjust property names — `r.type`, `r.sprite` — to whatever ResourceNode actually exposes.)

- [ ] **Step 3: Verify deco frame keys**

If the picked frames don't look like stumps/ore, swap them for whichever deco frames do.

- [ ] **Step 4: Commit**

```bash
git add game/render/decoSpawner.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(deco): cluster decoration around tree/mine nodes"
```

### Task 5.6: PathSystem — auto-paths between buildings

**Files:**
- Create: `game/systems/PathSystem.ts`
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Implement PathSystem (auto-paths only for now)**

```ts
import type * as Phaser from 'phaser';
import { TILE_SIZE, MAP_COLS, MAP_ROWS } from '../config/map';
import type { MovementSystem } from './MovementSystem';

const PATH_FRAME_BASE = 100; // tile index in flat tileset where path tiles start; verify

export class PathSystem {
  /** 0 = no path, 1 = auto path. */
  private grid: Uint8Array = new Uint8Array(MAP_COLS * MAP_ROWS);

  constructor(
    private pathLayer: Phaser.Tilemaps.TilemapLayer,
    private movement: MovementSystem,
  ) {}

  drawAutoPathTo(fromTx: number, fromTy: number, toTx: number, toTy: number): void {
    const path = this.movement.findPath(fromTx, fromTy, toTx, toTy);
    if (!path) return;
    for (const p of path) {
      const idx = p.ty * MAP_COLS + p.tx;
      if (this.grid[idx] === 0) this.grid[idx] = 1;
    }
    this.refreshTiles(path);
  }

  paintTile(tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return;
    const idx = ty * MAP_COLS + tx;
    if (this.grid[idx] !== 0) return;
    this.grid[idx] = 2;
    this.refreshTile(tx, ty);
    // Refresh neighbors so their bitmasks reflect the new neighbor.
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) this.refreshTile(tx + dx, ty + dy);
  }

  erasePaintedTile(tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return;
    const idx = ty * MAP_COLS + tx;
    if (this.grid[idx] !== 2) return;
    this.grid[idx] = 0;
    this.pathLayer.removeTileAt(tx, ty);
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) this.refreshTile(tx + dx, ty + dy);
  }

  isPath(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return false;
    return this.grid[ty * MAP_COLS + tx] !== 0;
  }

  isPaintedPath(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return false;
    return this.grid[ty * MAP_COLS + tx] === 2;
  }

  private refreshTiles(cells: { tx: number; ty: number }[]): void {
    for (const c of cells) this.refreshTile(c.tx, c.ty);
  }

  private refreshTile(tx: number, ty: number): void {
    if (tx < 0 || ty < 0 || tx >= MAP_COLS || ty >= MAP_ROWS) return;
    if (!this.isPath(tx, ty)) return;
    const mask = this.bitmask(tx, ty);
    this.pathLayer.putTileAt(PATH_FRAME_BASE + mask, tx, ty);
  }

  private bitmask(tx: number, ty: number): number {
    let m = 0;
    if (this.isPath(tx, ty - 1)) m |= 1;
    if (this.isPath(tx + 1, ty)) m |= 2;
    if (this.isPath(tx, ty + 1)) m |= 4;
    if (this.isPath(tx - 1, ty)) m |= 8;
    return m;
  }
}
```

> **Note:** `PATH_FRAME_BASE` must point at a 16-frame strip in the flat tileset that represents path autotiles. If Tiny Swords doesn't ship one, two fallbacks exist: (a) use four base frames + sprite rotation for the four edge cases, or (b) use a single dirt frame for all 16 mask values (visually flat-looking but functional). Pick the simplest fallback that ships in this task; revisit visually in Phase 7.

- [ ] **Step 2: Construct PathSystem in scene; call drawAutoPathTo for castles + new buildings**

```ts
import { PathSystem } from '../systems/PathSystem';
// …
private pathSystem!: PathSystem;
// after tilemap ready:
this.pathSystem = new PathSystem(this.tilemapLayers!.pathLayer, this.movementSystem);
// In castle setup, draw a short stub:
const px = Math.floor(this.p1SpawnPoint.x / TILE_SIZE);
const py = Math.floor(this.p1SpawnPoint.y / TILE_SIZE);
this.pathSystem.drawAutoPathTo(P1_CASTLE_TX, P1_CASTLE_TY, px + 4, py);
// Same for P2.
```

In the existing building-placed handler (where new buildings are added to `p1Buildings`), call:

```ts
const tx = Math.floor(building.x / TILE_SIZE);
const ty = Math.floor(building.y / TILE_SIZE);
this.pathSystem.drawAutoPathTo(P1_CASTLE_TX, P1_CASTLE_TY, tx, ty);
```

(Same for P2 buildings if you want bot paths visible; optional.)

- [ ] **Step 3: Commit**

```bash
git add game/systems/PathSystem.ts game/scenes/IslandWarsScene.ts
git commit -m "feat(deco): auto-paths between castle and new buildings"
```

---

## Phase 6 — Mobile / perf tuning

### Task 7.1: Frustum culling for sprite layers

**Files:**
- Modify: `game/scenes/IslandWarsScene.ts`

- [ ] **Step 1: Add a culling pass throttled to 250 ms**

Maintain references to all deco/foam/wildlife sprites in arrays exposed by their spawners (return values are already arrays — store them on the scene).

```ts
private deco: Phaser.GameObjects.Image[] = [];
private foam: Phaser.GameObjects.Sprite[] = [];
private cullCooldownMs = 0;

// in update(time, delta):
this.cullCooldownMs -= delta;
if (this.cullCooldownMs <= 0) {
  this.cullCooldownMs = 250;
  this.cullSprites();
}

private cullSprites(): void {
  const cam = this.cameras.main;
  const margin = 256;
  const left = cam.worldView.x - margin;
  const right = cam.worldView.right + margin;
  const top = cam.worldView.y - margin;
  const bottom = cam.worldView.bottom + margin;
  const cull = (s: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform) => {
    const x = (s as any).x as number;
    const y = (s as any).y as number;
    const visible = x >= left && x <= right && y >= top && y <= bottom;
    s.setActive(visible);
    (s as any).setVisible?.(visible);
  };
  for (const s of this.deco) cull(s);
  for (const s of this.foam) cull(s);
}
```

- [ ] **Step 2: Smoke test perf**

Run: `npm run dev`. Pan camera; stale sprites in the offscreen distance should turn invisible. Phaser's built-in tilemap culling handles the tilemap layers automatically.

- [ ] **Step 3: Commit**

```bash
git add game/scenes/IslandWarsScene.ts
git commit -m "perf: frustum-cull deco/foam sprites outside camera bounds"
```

### Task 7.2: Mobile deco density downscale

**Files:**
- Modify: `game/scenes/IslandWarsScene.ts`
- Modify: `game/render/decoSpawner.ts`

- [ ] **Step 1: Allow density override per call**

Add an optional `density` parameter to `spawnGrassTufts`:

```ts
export function spawnGrassTufts(
  scene: Phaser.Scene,
  grid: TerrainCell[][],
  sway: AmbientSwaySystem,
  rng: () => number,
  density: number = GRASS_TUFT_DENSITY,
): Phaser.GameObjects.Image[] { /* use density instead of GRASS_TUFT_DENSITY */ }
```

- [ ] **Step 2: Halve density on mobile**

In scene:

```ts
const density = this.isMobile ? GRASS_TUFT_DENSITY * 0.5 : GRASS_TUFT_DENSITY;
this.deco = spawnGrassTufts(this, this.terrainGrid, this.swaySystem, () => Math.random(), density);
```

- [ ] **Step 3: Halve foam frame rate on mobile**

In the `foam_loop` anim creation, use `frameRate: this.isMobile ? 4 : 8`.

- [ ] **Step 4: Smoke test on mobile (or device emulation in DevTools)**

FPS counter (existing) should hold ≥ 30 with the full map.

- [ ] **Step 5: Commit**

```bash
git add game/render/decoSpawner.ts game/scenes/IslandWarsScene.ts
git commit -m "perf: mobile downscale for grass density and foam fps"
```

### Task 7.3: Final integration sweep

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Full unit test run**

Run: `npm test`
Expected: all pure-logic tests pass.

- [ ] **Step 4: Manual playthrough**

Play one full game from menu → 1v1 → game over. Verify:
- Menu shows single mode (no Adventure card).
- Map shows hilly terrain with stairs and cliffs.
- Units route around cliffs via stairs.
- Archers on hills hit further; behind a summit they can't shoot through.
- Foam animates on shorelines; trees sway; sheep/cows/chickens wander; butterflies drift over hills.
- Dirt paths form between castle and new buildings.
- Paint Path button paints dirt on player territory; right-drag erases painted tiles only.
- Bot AI plays a normal game and reaches the player castle.
- Game-over screen shows correctly.

- [ ] **Step 5: Final commit (only if there were tweaks)**

```bash
git add -u
git commit -m "chore: final integration sweep for tilemap redesign"
```

---

## Self-review checklist (already addressed in this plan)

- [x] Spec coverage: every section of the spec maps to one or more tasks above (Section 1 → Phase 1; Section 2 → Phase 2; Section 3 → Phase 3; Section 4 → Phase 4; Section 5 → Phase 5 + Phase 6; Section 6 perf → Phase 7).
- [x] No "TBD"/"TODO"/"implement later" in any step.
- [x] Type/method names consistent across tasks: `MovementSystem.canEnterTile`, `findPath`, `isReachable`, `setGrid`; `PathSystem.paintTile`, `erasePaintedTile`, `drawAutoPathTo`, `isPath`, `isPaintedPath`; `AmbientSwaySystem.registerSway`, `registerScale`, `update`; `TilemapBuilder.buildTilemap`, `clearTilemap`; `TerrainCell` shape matches IslandWarsScene's existing definition.
- [x] Open assumptions called out: deco frame keys (`deco_NN`) must be verified against actual Tiny Swords contents; wildlife sprite paths likewise; PATH_FRAME_BASE may need fallback strategy. Each is flagged in the relevant task with a concrete fallback.
