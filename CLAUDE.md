# Arena Rush — Claude Code Context

## Project Summary

A real-time strategy game called **Tiny Kingdoms** built with React + TypeScript + Phaser 4.0.0.
Single-player vs AI opponent on a large procedurally shaped archipelago map.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 6 |
| Game engine | Phaser 4.0.0 (Canvas, Arcade physics) |
| Styling | index.css (custom, no Tailwind in game UI) |
| Server | Express + WS (server.js) — for future online play |
| Deploy | Vercel (frontend) + Render (server) |

## Running Locally

```bash
npm run dev          # Vite dev server on :5173
npm run server       # Express WS server
npm run dev:full     # Both together
npm run build        # Production build → dist/
npx tsc --noEmit     # Type-check only
```

## File Structure

```
App.tsx                        # Root router: Menu → IslandWars
index.tsx / index.html         # Vite entry
index.css                      # All game UI styles (dark blue theme, cyan accents)
types.ts                       # Shared TypeScript types

components/
  IslandWars.tsx               # Main React HUD overlay + Phaser game bootstrap
  Menu.tsx                     # Main menu screen
  ArenaBattle.tsx              # Separate arena battle mode (unused in main flow)

game/
  config/
    map.ts                     # TILE_SIZE=64, MAP_COLS=160, MAP_ROWS=96, spawn/resource positions
    units.ts                   # UnitType, UNIT_CONFIGS (warrior/archer/monk/pawn/pawn_iron/pawn_gold/knight/slinger)
    buildings.ts               # BuildingType, BUILDING_CONFIGS (castle/barracks/tower/house/fort/workshop)
  scenes/
    PreloadScene.ts            # Phaser asset preloader
    IslandWarsScene.ts         # Main game scene — map gen, units, buildings, camera, AI, fog, minimap data
    ArenaScene.ts              # Arena battle scene
  entities/
    Unit.ts                    # Unit entity — state machine, movement, combat, sprites
    Building.ts                # Building entity — HP, attack (towers), fog visibility
    ResourceNode.ts            # Tree/goldmine resource node
  systems/
    AISystem.ts                # Bot AI — build orders, unit training, attack waves
    CombatSystem.ts            # Combat resolution — target finding, damage, ranged attacks
    FogSystem.ts               # Fog of war — visGrid, exploredGrid, reveal, minimap grids
    ResourceSystem.ts          # Gold/wood tracking for both factions
    CommandSystem.ts           # Command bus (player actions → game; hook for future multiplayer)

utils/
  api.ts                       # Server API helpers
  sounds.ts                    # Sound utilities

public/
  manifest.json                # PWA manifest
  Tiny Swords/                 # Main sprite assets used in-game
  kenney_*/                    # Additional asset packs (mostly unused)
```

## Game World

- Map: **10240 × 6144 px** (160 × 96 tiles at 64px each)
- Three-continent archipelago with stepping-stone chains ensuring P1↔P2 connectivity
- Camera: zoom range 0.38–1.4, default 0.55; drag + pinch-to-zoom on mobile
- Terrain types: `water | flat | beach | elevated | summit | stair | cave | sand | bridge`
- Tile grid stored as `terrainGrid: TerrainCell[][]` in IslandWarsScene

## Units

| Type | Cost | Notes |
|---|---|---|
| warrior | 25g | Melee, requires Barracks |
| archer | 40g | Ranged 184px, requires Fort |
| monk | 55g | Healer, requires Workshop |
| pawn | 8g | Worker/gatherer, requires House |
| pawn_iron | 22g | Combat pawn, requires Barracks |
| pawn_gold | 38g | Heavy pawn, requires Barracks |
| knight | 48g | Strong melee, requires Barracks |
| slinger | 75g | Scout — auto-explores, reports enemies, max 3 |

## Buildings

| Type | Cost | Notes |
|---|---|---|
| castle | free | Starting building, 1000 HP |
| barracks | 60w | Enables warrior/knight/pawn_iron/pawn_gold/slinger |
| fort | 90w | Enables archer |
| house | 40w | +4 pop cap, +2g every 5s |
| workshop | 65w | Enables monk, +2w every 5s |
| tower | 90w | Ranged auto-attack (180px, 25dmg) |

## HUD (IslandWars.tsx)

- **Top bar**: gold / wood / pop bar left; timer center; game title right
- **Bottom left**: Build panel (barracks/tower/house/fort/workshop buttons)
- **Bottom right**: Train Units panel (all unit types)
- **Top-right corner**: Minimap canvas (160×96px) + admin 🔧 button below it
- **Scout toasts**: Appear centered below top bar when slinger discovers enemy building

### Minimap

- Canvas: 160×96px, position `fixed` top-right
- Renders actual terrain tileKind colors (water/flat/beach etc.)
- Fog overlay: unexplored tiles lightly tinted; explored-but-not-visible lightly shrouded
- NPC movement trails: each unit draws fading lines from previous to current position (orange for P2, cyan for P1)
- Camera viewport: white rectangle
- Data source: `IslandWarsScene.getMinimapData()` polled every 250ms (500ms on mobile)

## Fog of War (FogSystem.ts)

- Two Uint8Array grids (MAP_COLS × MAP_ROWS):
  - `visGrid` — currently visible (reset each 100ms update)
  - `exploredGrid` — ever seen (permanent)
- `revealArea(cx, cy, radiusTiles)` — circular reveal
- Vision radii: slinger=7, archer=8, warrior/knight=5, pawn/monk=4, buildings=4
- Public API: `isTileVisible(wx,wy)`, `isWorldExplored(wx,wy)`, `getExploredGrid()`, `getVisibleGrid()`
- Fog graphics drawn at depth 200 over all game objects

## AI System (AISystem.ts)

- Runs on P2 (red faction)
- Difficulties: `easy | normal | hard`
- Builds houses, barracks, fort, workshop in sequence
- Trains counter-units based on player army composition
- Launches attack waves once army size threshold is met

## CSS Theme

All game UI uses custom CSS classes in `index.css`:
- `tk-panel` — dark panel `rgba(8,14,24,0.97)` with cyan top border
- `tk-btn` — unit/building buttons with icon + label + cost
- `tk-resource-bar` — gold/wood/pop display
- `tk-timer` — center countdown clock
- `.tk-hud-top` / `.tk-hud-bottom` — fixed top/bottom HUD strips

## Commit History (recent)

- `ef0f1aa` — Minimap: make fog overlay subtle so map is not too dark
- `e8a83a5` — Minimap: smaller size and clear explored/visible fog rendering
- `3408c38` — Minimap: draw NPC movement trails over terrain map
- `702778c` — Fix minimap ghost viewport trails by clearing frame each redraw
- `ecaf4b2` — UI: pin minimap to top-right and stack admin controls below
- `28fa7e1` — Perf: reduce mobile minimap CPU load and cache terrain snapshot
- `8021afc` — Minimap: move to top-right corner, render actual game terrain by tileKind

## Known Patterns & Conventions

- React refs are used (not state) for Phaser game instance and scene reference
- Scene data flows out to React via callbacks registered at game start
- All game logic is in `game/` — React only handles HUD rendering
- Mobile detected via `('ontouchstart' in window) || navigator.maxTouchPoints > 0`
- `isMobileDevice` used in Phaser config for render settings (pixelArt, batchSize)
- TypeScript strict mode; run `npx tsc --noEmit` before committing
- All assets preloaded in `PreloadScene.ts` before IslandWarsScene starts
