# Tilemap Redesign + Adventure Mode Removal — Design Spec

**Date:** 2026-05-04
**Project:** Arena Rush / Tiny Kingdoms
**Scope:** Replace the procedural 1v1 map renderer with a layered Phaser Tilemap using Tiny Swords elevation tiles, add cliff-blocked traversal with stair-only level changes, populate the world with ambient decoration and wildlife, support player-painted paths, and remove the unfinished Adventure Mode.

## Goals

1. Make the 1v1 map look and feel like a lush, voluminous, hilly archipelago — closer to the cartoon village reference (image 2) — without replacing existing unit/building art.
2. Give hills tactical meaning: cliffs block movement, stairs are the only level-change points; archers on hills get a small range bonus.
3. Add visible motion: animated foam, swaying trees, wildlife, drifting butterflies.
4. Auto-generated dirt paths between buildings; player can paint additional paths.
5. Remove Adventure Mode entirely and clean up dead code.

## Non-Goals (explicitly deferred to separate specs)

- New unit/building art assets.
- New game modes.
- Multiplayer / online play wiring (will reuse existing `CommandSystem` adapter pattern in a future spec).
- Day/night, weather, season cycles.
- Hero/HoMM mechanics (deleted in this spec).

---

## Section 1 — Adventure Mode Removal

### Files to delete

- `components/AdventureMode.tsx`
- `game/scenes/AdventureScene.ts`
- `game/scenes/TacticalBattleScene.ts`
- `game/entities/Hero.ts`
- `game/systems/HeroesAISystem.ts`
- `game/systems/SeededRng.ts` *(verify: only AdventureScene/HeroesAI consume this)*
- `game/config/heroesModeConfig.ts`
- `game/types/` *(entire dir; verify only adventure code references it)*
- `HEROES_MODE_INTEGRATION.md`

### Files to edit

- **`App.tsx`** — remove `AdventureMode` import; drop `'adventure'` from the `AppState` union; drop the `appState === 'adventure'` render branch; simplify `handleStartGame` to no-arg.
- **`components/Menu.tsx`** — remove the Adventure Mode card (the green "TURN-BASED · HOMM STYLE" card from the screenshot). Single-mode menu now starts directly into Island Wars.
- **`index.css`** — remove styles only referenced by the adventure card if any are isolated.

### Verification

Before committing deletes, grep for: `Adventure`, `Hero`, `Heroes`, `Tactical`, `SeededRng`. Any remaining hits outside the deleted files must be reviewed. `npx tsc --noEmit` and `npm run build` must be clean after the edits.

---

## Section 2 — Rendering Architecture

The scene draws into discrete depth layers, bottom to top:

| Depth | Layer | Type | Contents |
|---|---|---|---|
| 0 | `groundLayer` | Phaser Tilemap layer | Water, beach, flat grass, elevated grass, summit grass — base ground tile per cell |
| 5 | `cliffLayer` | Phaser Tilemap layer | Cliff edges & stair tiles auto-picked from `Tilemap_Elevation.png` via 4-bit edge bitmask |
| 10 | `pathLayer` | Phaser Tilemap layer | Dirt paths (auto-drawn between buildings + optional player-painted) |
| 15 | `foamLayer` | Sprite group | Animated shoreline foam (Tiny Swords `Foam/`) — frame-cycled |
| 20 | `decoStaticLayer` | Sprite group | Stones, stumps, fallen logs (no animation) |
| 25 | `decoAnimLayer` | Sprite group | Grass tufts, deco bushes, flowers — driven by `AmbientSwaySystem` |
| 30 | `wildlifeLayer` | Sprite group | Sheep, cows, chickens, butterflies — wander AI |
| 100+ | (existing) | unchanged | Resource nodes, buildings, units, projectiles |
| 200 | (existing) | unchanged | Fog of war (`FogSystem`) |
| 500+ | (existing) | unchanged | Build ghost, UI overlays |

### Asset slicing

- Load `Tilemap_Flat.png` and `Tilemap_Elevation.png` as Phaser **tilesets** at 64×64 (matches `TILE_SIZE`).
- Load `Bridge_All.png` as a tileset for stair/bridge frames.
- Load each of the 18 `Deco/*.png` as discrete sprite frames (or pack into one atlas during preload).
- Load `Terrain/Water/Foam/` as an animated atlas (frame loop at 8 fps).

### Tilemap construction

```ts
const map = scene.make.tilemap({ width: MAP_COLS, height: MAP_ROWS, tileWidth: 64, tileHeight: 64 });
const flatSet = map.addTilesetImage('flat', 'tilemap_flat');
const elevSet = map.addTilesetImage('elev', 'tilemap_elev');
const groundLayer = map.createBlankLayer('ground', flatSet);
const cliffLayer  = map.createBlankLayer('cliff', elevSet);
const pathLayer   = map.createBlankLayer('path',  flatSet);
```

Then iterate `terrainGrid` and call `putTileAt(frameIndex, tx, ty)` per cell.

### Why this layered split

- Tilemap layers batch into one draw call each, eliminating thousands of per-tile sprites the current renderer creates.
- Animated objects stay sprite-based so existing tween/animation machinery just works.
- Existing fog/unit/building depths are untouched, so combat code needs zero changes.

---

## Section 3 — Map Generation (4 tiers, hilly archipelago)

The current archipelago topology, P1/P2 castle positions, P1↔P2 stepping-stone connectivity, and resource node locations are **preserved**. Only the terrain *under and around* them changes.

### Generation pipeline (replaces the single-pass terrain build in `IslandWarsScene`)

1. **Land mask pass** — keep current 3-continent island-shape generation. Output: water vs. land per cell.
2. **Beach pass** — every land cell adjacent to water becomes `level=0` `tileKind='beach'`.
3. **Hill seeding** — Poisson-disk-distribute hill seeds across non-beach land at `HILL_SEED_DENSITY` (≈1 seed per 12×12 area). Seeds are excluded:
   - Within `CASTLE_FLAT_RADIUS` of either castle.
   - Within the central battlefield corridor at probability `WAR_CORRIDOR_FLAT_BIAS` (so the war zone stays mostly flat for combat clarity).
4. **Hill growth** — each seed grows a `level=1` (`elevated`) blob of `HILL_BLOB_MIN..HILL_BLOB_MAX` cells via a smoothed random walk. Convex-edge filter removes 1-cell slivers.
5. **Summit promotion** — with probability `SUMMIT_PROMOTION_CHANCE` (≈0.30), a large hill blob receives a `level=2` (`summit`) sub-blob of 3–8 cells in its center.
6. **Stair placement** — for every contiguous `elevated` region, place 1 stair per ~10 perimeter tiles, biased to the side facing the nearest castle-to-castle path. Same for `summit` regions: at least one stair from summit→elevated.
7. **Connectivity assert** — flood-fill from each castle on `walkable && !blockedByCliff` cells. If any pawn-reachable resource is unreachable, add an extra stair on the shortest cliff blocking the path.
8. **Path seeding** — short dirt-path stubs (3–5 tiles) drawn outward from each castle entrance into flat land. The auto-path system extends these as buildings are placed.

### `TerrainCell` shape

Stays as it is today (`level`, `walkable`, `buildable`, `stair`, `water`, `bridge`, `tileKind`). No migration needed for downstream systems.

### Buildable rules

Only `level ∈ {0, 1, 2}` flat (non-edge, non-stair) cells are `buildable`. Cliff-edge cells are walkable on the high side only.

### New tunables in `game/config/map.ts`

```ts
export const HILL_SEED_DENSITY      = 1 / 144;   // seeds per tile²
export const HILL_BLOB_MIN          = 6;
export const HILL_BLOB_MAX          = 18;
export const SUMMIT_PROMOTION_CHANCE = 0.30;
export const CASTLE_FLAT_RADIUS     = 8;
export const WAR_CORRIDOR_FLAT_BIAS = 0.7;
export const GRASS_TUFT_DENSITY     = 0.25;     // deco per grass tile
```

---

## Section 4 — Cliff Auto-Tiling & Traversal

### Auto-tiling: 4-bit edge bitmask

For each cell at `level >= 1`, examine its 4 cardinal neighbors. Each neighbor at a *lower* level contributes a bit:

```
N=1, E=2, S=4, W=8  →  16 possible edge tiles
```

A static lookup table `EDGE_BITMASK_TO_FRAME[16]` (in `game/render/cliffBitmask.ts`) maps each combination to the right tile-index in the elevation tileset. `mask=0` (interior plateau) gets the plain top-of-plateau frame; `mask=15` (isolated peak) gets the small-mound frame.

Stair frames are a separate 4-frame set (N/E/S/W facing) chosen from the side the stair was placed on in Section 3, step 6.

### Traversal rule (option B — cliffs block, stairs only)

A move from cell **A** to neighbor **B** is allowed iff:

- **B** is `walkable`, **AND**
- `A.level === B.level`, **OR**
- One of A or B is a `stair` cell **AND** `|A.level - B.level| === 1`.

No cliff climbing, no jumping. Stairs are bidirectional 1-tier transitions.

### `MovementSystem` (new, ~80 LOC)

```ts
class MovementSystem {
  canEnterTile(fromTx, fromTy, toTx, toTy): boolean
  findPath(fromTx, fromTy, toTx, toTy): TilePoint[] | null   // A* on tile grid
  isReachable(fromTx, fromTy, toTx, toTy): boolean
}
```

A* uses the rule above as its neighbor-validity check. Diagonal moves allowed only when both adjacent cardinals are also enterable (no corner-cutting through cliff diagonals). Path waypoints are tile centers.

### `Unit.ts` changes (minimal)

- Replace direct vector steering toward target with: every ~250 ms, if no current path or target moved >1 tile, re-pathfind via `MovementSystem`. Then steer toward the next waypoint center using the existing velocity code.
- When entering a stair tile, snap the sprite's render-Y offset to the new level (no jump cut; the offset is applied during render only).

### Visual elevation offset

Per-level Y render offset:

| Level | Offset |
|---|---|
| 0 | 0 px |
| 1 | -12 px |
| 2 | -22 px |

Building footprint Y-sort uses the offset value in its sort key. Physics positions stay at the tile-center coordinates.

### Combat impact

- **`CombatSystem`** — add `losBlockedByCliff(fromTx, fromTy, toTx, toTy)`. Implementation: Bresenham line-sample the levels of the cells between attacker and target; the shot is blocked iff any sampled cell's `level > min(attackerLevel, targetLevel)`. Consequence: same-level shots are clear unless a higher cliff intervenes; downhill shots from a hill to the plain are always clear; uphill shots from the plain to a hill are clear *unless* a different higher hill (or summit) sits between them.
- **Archer hill bonus** — units of type `archer` standing on level ≥ 1 get +20% range. Computed at attack-resolve time, no state.

### AI impact

`AISystem` doesn't need pathfinding logic itself (it issues commands), but its target-picking should prefer reachable enemies. It calls `MovementSystem.isReachable(...)` when scoring potential targets.

---

## Section 5 — Decoration & Ambient Life

### (1) Animated water foam

For each water cell adjacent to land (has a `beach` neighbor), spawn one `Sprite` from the Tiny Swords `Foam/` atlas with a 6-frame loop at 8 fps. Foam tiles are deterministic per shoreline cell (no respawn). Total ~400–800 foam sprites on a typical map. Depth 15.

### (2) Swaying trees & grass tufts

- **Trees** (existing `ResourceNode` tree sprites + new pure-deco trees): each tree sprite stays in its current layer (resource-node trees at depth 100+, deco trees at `decoAnimLayer`); both are *registered* with `AmbientSwaySystem`, which rotates them `±2°` over 1.6–2.2 s with a random phase per tree. Pivot offset to base of trunk so the trunk does not wander.
- **Grass tufts**: scatter at `GRASS_TUFT_DENSITY` across grass cells, picked from `Deco/` frames (small bushes/tufts). Vertical-scale tween `1.0 → 0.96 → 1.0` over 2 s. No collision.
- **Implementation note:** rather than 1,500 individual tweens, a single `AmbientSwaySystem` updates rotation/scale via shared sine-wave phase, applied each frame to a list of registered sprites. Cuts cost to ~2 callbacks/frame regardless of count.

### (3) Wandering wildlife (`WildlifeSystem`, ~120 LOC)

- **Sheep, cows, chickens** — spawn 6–10 of each at scene start in neutral grass areas (not in player territories, not on hills). Wander state: every 4–7 s pick a random walkable tile within 4 of current position, walk there at 0.3× unit speed, idle.
- **Sprite source** — Tiny Swords `Factions/` (verify path during implementation). If sheep/cow/chicken sprites are not present, fall back to 2–3 `Deco/` frames as static "grazing animals" placeholder.
- **Butterflies / birds** — 3–6 ambient particles drifting in slow figure-eight loops over hills. Cosmetic, depth 30, no AI state.
- **Combat-safe** — wildlife has no faction, no HP, no targetability. Pathfinder gives wildlife tiles +5 cost (soft obstacle, doesn't block).

### (4) Resource node detail

Replace single-sprite resource nodes with **clusters**:

- **Tree node** = main trunk sprite (gatherable, current behavior) + 1–3 stump/log/bush deco sprites scattered within 1 tile, drawn at `decoStaticLayer`. Reads as a "small grove" instead of a lone tree.
- **Gold mine node** = main mine entrance sprite + 1–2 ore-cart or rock-pile deco sprites adjacent.

Cluster deco is purely visual; gather logic still targets the central node.

### (5) Dirt paths between buildings (`PathSystem`, ~60 LOC)

#### Auto-paths

- When a building is placed (or at scene start for castles), run A* from the new building's entrance tile to the nearest existing path tile or the friendly castle, on same-level tiles only. Mark every tile along the route as a path tile in `pathLayer`.
- Path tiles use a 16-bitmask auto-tile (cardinal neighbors only) from a path tileset slice. If the tileset lacks a clean 16-frame strip, fall back to 4 base frames + sprite rotation.
- Paths never cross water and never cross stair tiles (paths visually go over but the stair frame wins on render).

#### Player-painted paths

- A new HUD "Paint Path" toggle button (in the build panel, next to existing build toggles).
- While active: left-click-drag paints path tiles; right-click-drag erases them.
- Painting is restricted to player-territory cells (left of `P1_TERRITORY_MAX_X`) and to walkable, non-water, non-stair, same-level cells. Diagonal paints are decomposed into two cardinals.
- Erase only removes player-painted tiles, not auto-paths between buildings (auto-path tiles are tagged `auto: true` in a parallel `pathOriginGrid: Uint8Array`).
- Toggling Paint Path off resumes normal click selection.
- Painted paths give a small movement-speed bonus (+15%) to friendly units traversing them — minor, optional, gated behind a `PATH_SPEED_BONUS` constant we can tune to 0 if it confuses gameplay.

### Ambient sound

If an outdoor ambience track is on hand, loop it at low volume. Otherwise defer.

---

## Section 6 — Performance, File Map, Rollout

### Performance budget

| Layer | Count | Cost notes |
|---|---|---|
| `groundLayer` (Tilemap) | 15,360 cells | 1 batched draw call — net win vs. current per-tile sprites |
| `cliffLayer` (Tilemap) | ~1,500 cells | 1 batched draw call |
| `pathLayer` (Tilemap) | ~200 cells | 1 batched draw call |
| `foamLayer` | ~500 sprites @ 8 fps | shared atlas, batched |
| `decoStaticLayer` | ~3,500 sprites | static images, batched, frustum-culled |
| `decoAnimLayer` | ~1,500 swaying sprites | shared sine-wave driver, NOT 1,500 tweens |
| `wildlifeLayer` | ~30 wildlife + 6 ambient particles | trivial |

### Mitigations

- **Sway driver:** one `AmbientSwaySystem` updates all registered sprites per frame with a shared sine phase; per-sprite cost is one `setRotation`/`setScale` call.
- **Mobile downscale:** when `isMobileDevice`, halve `GRASS_TUFT_DENSITY`, drop foam to 4 fps, halve wildlife counts, disable ambient butterflies.
- **Frustum culling:** Phaser auto-culls Tilemap layers; sprite layers add `setActive(false).setVisible(false)` for sprites outside camera bounds + 256 px margin, refreshed on camera move (throttled to 250 ms).

### Type-check / build gates

Both `npx tsc --noEmit` and `npm run build` must pass clean before merge. No new runtime dependencies are added.

### File map — new files

```
game/systems/MovementSystem.ts        # A* + canEnterTile + isReachable
game/systems/PathSystem.ts            # auto + player-painted dirt paths
game/systems/WildlifeSystem.ts        # sheep/cow/chicken/butterfly spawn + wander
game/systems/AmbientSwaySystem.ts     # shared sine-wave sway driver
game/render/TilemapBuilder.ts         # build groundLayer/cliffLayer/pathLayer from terrainGrid
game/render/cliffBitmask.ts           # EDGE_BITMASK_TO_FRAME table + helpers
game/render/decoSpawner.ts            # spawns grass tufts, cluster deco, foam
```

### File map — modified files

```
game/scenes/IslandWarsScene.ts        # remove old terrain rendering; wire in TilemapBuilder + new systems
game/entities/Unit.ts                 # route movement through MovementSystem; add elevation y-offset
game/systems/CombatSystem.ts          # add losBlockedByCliff check; archer hill range bonus
game/systems/AISystem.ts              # use MovementSystem.isReachable when picking targets
game/scenes/PreloadScene.ts           # load tilesets + foam atlas + wildlife + extra deco
game/config/map.ts                    # add tunables
components/IslandWars.tsx             # add "Paint Path" toggle button to build panel HUD
App.tsx                               # remove Adventure routing
components/Menu.tsx                   # remove Adventure card
```

### File map — deleted files

```
components/AdventureMode.tsx
game/scenes/AdventureScene.ts
game/scenes/TacticalBattleScene.ts
game/entities/Hero.ts
game/systems/HeroesAISystem.ts
game/systems/SeededRng.ts             (verify no other consumer)
game/config/heroesModeConfig.ts
game/types/                           (verify no other consumer)
HEROES_MODE_INTEGRATION.md
```

### Rollout order (phased commits on a single branch)

1. **Adventure Mode removal** — small, safe, mergeable on its own.
2. **Tilemap rendering swap** — visual-only, easy to revert.
3. **Map generation rewrite** — hills, stairs, connectivity. Gates on (2).
4. **MovementSystem + cliff traversal + combat LOS** — gameplay change, needs testing.
5. **Decoration & ambient life** — foam, sway, wildlife, auto-paths. Pure polish, additive.
6. **Player-painted paths** — HUD toggle + grid storage + render hookup.
7. **Mobile/perf tuning pass** — measure on a real mobile device, adjust constants.

### Testing & verification per phase

- **Phase 1:** menu shows single mode; clicking Play launches Island Wars; tsc + build clean.
- **Phase 2:** game still plays identically; no perf regression in dev FPS counter.
- **Phase 3:** scout can reach every resource on every seed across 20 random seeds.
- **Phase 4:** units cannot walk up cliffs; stair tiles are the only level-change points; archers on hills hit further.
- **Phase 5:** foam visible only on shorelines; wildlife stays in neutral areas; auto-paths form between castle and any new building.
- **Phase 6:** paint mode paints/erases as specified; can't paint on water/stairs/cliffs/enemy territory.
- **Phase 7:** mobile FPS holds ≥ 30 on a mid-tier device with the full map populated.

---

## Open questions / risks

- **Tiny Swords sheep/cow/chicken sprites** — exact paths inside the asset pack must be confirmed during implementation. If absent, wildlife falls back to deco-frame placeholders.
- **Path tileset frame coverage** — `Deco/` may not provide a clean 16-frame path strip. Fallback is 4 base frames + sprite rotation. Decide during Phase 5.
- **Existing sprite count** — current per-tile-sprite renderer must be fully removed (not double-rendered) when tilemap is introduced. Phase 2 must include a clean removal of the old renderer.
