import * as Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/ResourceNode';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { AISystem, type Difficulty } from '../systems/AISystem';
import { CommandSystem } from '../systems/CommandSystem';
import { FogSystem } from '../systems/FogSystem';
import { TRAIN_QUEUE_MAX, UNIT_CONFIGS } from '../config/units';
import { BUILDING_CONFIGS, BASE_POP_CAP } from '../config/buildings';
import {
  TILE_SIZE, MAP_COLS, MAP_ROWS,
  P1_CASTLE_TX, P1_CASTLE_TY, P2_CASTLE_TX, P2_CASTLE_TY,
  P1_SPAWN_X, P1_SPAWN_Y, P2_SPAWN_X, P2_SPAWN_Y,
  P1_RESOURCES, P2_RESOURCES,
  GAME_DURATION_SECS,
} from '../config/map';
import type { UnitType, Faction } from '../config/units';
import type { BuildingType } from '../config/buildings';

export interface IslandWarsCallbacks {
  onResourcesUpdate: (gold: number, wood: number) => void;
  onTimerUpdate: (remaining: number) => void;
  onGameEnd: (winner: 'player' | 'bot', reason: string) => void;
  onTrainQueueUpdate: (queue: TrainQueueDisplayItem[]) => void;
  onPopUpdate?: (pop: number, cap: number) => void;
  /** Fires when a player Scout unit discovers an enemy building for the first time. */
  onScoutReport?: (message: string) => void;
}

export interface TrainQueueDisplayItem {
  type: UnitType;
  remainingMs: number;
  active: boolean;
}

export interface ProductionAvailability {
  house: boolean;
  barracks: boolean;
  fort: boolean;
  workshop: boolean;
  pop: number;
  popCap: number;
}

interface TerrainCell {
  level: number;
  walkable: boolean;
  buildable: boolean;
  stair: boolean;
  water: boolean;
  bridge: boolean;
  tileKind: 'water' | 'flat' | 'sand' | 'elevated' | 'summit' | 'stair' | 'cave' | 'beach' | 'bridge';
}

export class IslandWarsScene extends Phaser.Scene {
  // ── Game state ─────────────────────────────────────────────────────────────
  private p1Units: Unit[] = [];
  private p2Units: Unit[] = [];
  private p1Buildings: Building[] = [];
  private p2Buildings: Building[] = [];
  private p1Resources: ResourceNode[] = [];
  private p2Resources: ResourceNode[] = [];

  private combatSystem!: CombatSystem;
  private resourceSystem!: ResourceSystem;
  private aiSystem!: AISystem;
  /** Command bus — all player-issued build/train actions go through here.
   *  Swap LocalNetworkAdapter → WebSocketNetworkAdapter to enable online 1v1. */
  private commandSystem!: CommandSystem;
  private fogSystem: FogSystem | null = null;
  private currentDifficulty: Difficulty = 'normal';
  private p1SpawnPoint = { x: P1_SPAWN_X, y: P1_SPAWN_Y };
  private p2SpawnPoint = { x: P2_SPAWN_X, y: P2_SPAWN_Y };

  private elapsedSecs = 0;
  private gameOver = false;
  private trainQueue: Array<{ type: UnitType; timeRemaining: number; totalTime: number }> = [];
  private buildMode: BuildingType | null = null;
  private buildGhost: Phaser.GameObjects.Image | null = null;
  private buildFootprintGhost: Phaser.GameObjects.Graphics | null = null;
  private occupiedTiles = new Set<string>();
  private terrainGrid: TerrainCell[][] = [];
  private terrainVisuals: Phaser.GameObjects.GameObject[] = [];
  private civilianThinkMs = 0;
  private workerGatherMs = new Map<number, number>();
  private pawnNodeAssignment = new Map<number, ResourceNode>();
  private nodeHarvestMs = new Map<ResourceNode, number>();
  private pawnMoveStartMs = new Map<number, number>();
  private monkPatrolMs = new Map<number, number>();
  private idlePatrolMs = new Map<number, number>();
  private cameraVelocity = new Phaser.Math.Vector2(0, 0);
  private dragInertia = new Phaser.Math.Vector2(0, 0);
  private pinchDistanceLast: number | null = null;
  private pinchMidLastX: number | null = null;
  private pinchMidLastY: number | null = null;
  private lastTapMs = 0;
  private introCameraActive = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private dragTracking = false;
  private combatThrottleMs = 0;
  private pruneThrottleMs = 0;
  private crossSepFrame = false;  // alternates each frame to halve cross-faction O(n²) cost
  private houseGoldMs = 0;

  // ── Scout (Slinger) tracking ────────────────────────────────────────────────
  /** IDs of enemy buildings already reported — prevents duplicate notifications. */
  private p1ScoutedBuildings = new Set<number>();
  /** Waypoint index per slinger unit ID. */
  private p1SlingerWaypointIndex = new Map<number, number>();
  private scoutUpdateMs = 0;
  private hudTimerEmitMs = 0;
  private trainQueueEmitMs = 0;
  private lastHudGold = -1;
  private lastHudWood = -1;
  private lastTimerSecond = -1;
  private lastQueueUiHash = '';
  private minimapTerrainGridCache: string[][] = [];
  private introUnlockEvent: Phaser.Time.TimerEvent | null = null;

  private readonly minZoom = 0.38;
  private readonly maxZoom = 1.4;
  private readonly maxDeltaMs = 50;

  // ── Callbacks to React HUD ─────────────────────────────────────────────────
  private callbacks!: IslandWarsCallbacks;

  constructor() {
    super({ key: 'IslandWarsScene' });
  }

  init(data: { callbacks: IslandWarsCallbacks }) {
    this.callbacks = data.callbacks;
  }

  create() {
    this.elapsedSecs = 0;
    this.gameOver = false;
    this.p1Units = [];
    this.p2Units = [];
    this.p1Buildings = [];
    this.p2Buildings = [];
    this.p1Resources = [];
    this.p2Resources = [];
    this.trainQueue = [];
    this.occupiedTiles = new Set();
    this.terrainGrid = [];
    this.terrainVisuals = [];
    this.buildFootprintGhost = null;
    this.civilianThinkMs = 0;
    this.workerGatherMs = new Map();
    this.pawnNodeAssignment = new Map();
    this.nodeHarvestMs = new Map();
    this.pawnMoveStartMs = new Map();
    this.monkPatrolMs = new Map();
    this.idlePatrolMs = new Map();
    this.p1SpawnPoint = { x: P1_SPAWN_X, y: P1_SPAWN_Y };
    this.p2SpawnPoint = { x: P2_SPAWN_X, y: P2_SPAWN_Y };
    this.introCameraActive = false;
    this.cameraVelocity.set(0, 0);
    this.dragInertia.set(0, 0);
    this.pinchDistanceLast = null;
    this.pinchMidLastX = null;
    this.pinchMidLastY = null;
    this.dragTracking = false;
    this.hudTimerEmitMs = 0;
    this.trainQueueEmitMs = 0;
    this.lastHudGold = -1;
    this.lastHudWood = -1;
    this.lastTimerSecond = -1;
    this.lastQueueUiHash = '';
    this.minimapTerrainGridCache = [];
    this.introUnlockEvent?.remove(false);
    this.introUnlockEvent = null;

    this.p1ScoutedBuildings = new Set();
    this.p1SlingerWaypointIndex = new Map();
    this.scoutUpdateMs = 0;

    this.fogSystem?.destroy();
    this.fogSystem = null;

    this.buildMap();
    this.placeResources();
    this.spawnStartBuildings();
    this.spawnStartUnits();

    this.combatSystem = new CombatSystem(
      this,
      (wx: number, wy: number) => {
        const tx = Math.floor(wx / TILE_SIZE);
        const ty = Math.floor(wy / TILE_SIZE);
        return this.terrainGrid[ty]?.[tx]?.level ?? 1;
      },
      (wx: number, wy: number, radiusTiles: number) => {
        const cx = Math.floor(wx / TILE_SIZE);
        const cy = Math.floor(wy / TILE_SIZE);
        let best: { x: number; y: number } | null = null;
        let bestDist = Infinity;
        for (let dy = -radiusTiles; dy <= radiusTiles; dy++) {
          for (let dx = -radiusTiles; dx <= radiusTiles; dx++) {
            const tx = cx + dx;
            const ty = cy + dy;
            const cell = this.terrainGrid[ty]?.[tx];
            if (!cell || !cell.walkable || cell.level < 2) continue;
            const dist = dx * dx + dy * dy;
            if (dist < bestDist) {
              bestDist = dist;
              best = { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
            }
          }
        }
        return best;
      },
      () => true,
    );
    this.resourceSystem = new ResourceSystem(this.p1Resources, this.p2Resources);

    // Player command bus — handles build + train actions from the HUD.
    // To add online multiplayer: replace `undefined` with a WebSocketNetworkAdapter.
    this.commandSystem = new CommandSystem();
    this.commandSystem
      .register('build', (cmd) => {
        if (cmd.faction !== 'blue') return;
        const type = cmd.buildingType as 'barracks' | 'tower' | 'house' | 'fort' | 'workshop';
        const cfg  = BUILDING_CONFIGS[type];
        if (!this.resourceSystem.canAfford('p1', 0, cfg.woodCost)) return;
        if (cmd.tx !== undefined && cmd.ty !== undefined) {
          const built = this.placeBuilding(type, 'blue', cmd.tx, cmd.ty);
          if (built) this.resourceSystem.spend('p1', 0, cfg.woodCost);
        }
      })
      .register('train', (cmd) => {
        if (cmd.faction !== 'blue') return;
        const type = cmd.unitType;
        const cfg  = UNIT_CONFIGS[type];
        if (!this.resourceSystem.canAfford('p1', cfg.goldCost)) return;
        if (this.getAliveUnitCount('p1') >= this.getPopCap('p1')) return;
        const origin = cmd.x !== undefined ? { x: cmd.x, y: cmd.y! } : this.p1SpawnPoint;
        const spawned = this.spawnUnit(type, 'blue', origin.x, origin.y);
        if (spawned) this.resourceSystem.spend('p1', cfg.goldCost);
      });

    this.aiSystem = new AISystem(
      this.resourceSystem,
      this.p2Units,
      this.p2Buildings,
      (type, faction, x, y) => {
        // AI always plays as 'red' (p2)
        if (this.getAliveUnitCount('p2') >= this.getPopCap('p2')) return undefined as unknown as Unit;
        return this.spawnUnit(type, faction, x, y);
      },
      (type, faction, tx, ty) => this.placeBuilding(type, faction, tx, ty),
      (type) => this.getSpawnOriginForType(type, 'p2'),
      () => this.getPlayerUnitCounts(),
      () => ({ pop: this.getAliveUnitCount('p2'), cap: this.getPopCap('p2') }),
      this.currentDifficulty,
    );
    this.aiSystem.setSpawnPoint(this.p2SpawnPoint.x, this.p2SpawnPoint.y);

    this.fogSystem = new FogSystem(this);
    // Reveal around every P1 building and unit that was just spawned
    const visionByType: Record<string, number> = { archer: 8, slinger: 14, warrior: 5, knight: 5, pawn: 4, pawn_iron: 5, pawn_gold: 5, monk: 4 };
    for (const b of this.p1Buildings) {
      this.fogSystem.revealArea(b.tx + 1, b.ty + 1, 6);
    }
    for (const u of this.p1Units) {
      const tx = Math.floor(u.state.x / TILE_SIZE);
      const ty = Math.floor(u.state.y / TILE_SIZE);
      this.fogSystem.revealArea(tx, ty, visionByType[u.state.type] ?? 5);
    }

    this.setupCamera();
    this.setupInput();
    this.playIntroCameraPan();
  }

  private rebuildMinimapTerrainGridCache() {
    this.minimapTerrainGridCache = this.terrainGrid.map((row) =>
      row.map((cell) => cell?.tileKind ?? 'water'),
    );
  }

  // ── Map building ────────────────────────────────────────────────────────────
  private buildMap() {
    const T = TILE_SIZE;
    const mapW = MAP_COLS * T;
    const mapH = MAP_ROWS * T;
    // ── 1. Initialize grid: all water ─────────────────────────────────────
    this.terrainGrid = Array.from({ length: MAP_ROWS }, () =>
      Array.from({ length: MAP_COLS }, () => this.makeWaterCell()),
    );

    // ── 2. Archipelago — three continents + scattered small islands ────────
    //    Shapes built from Gaussian blobs; organic coastlines via fractal noise.
    //    Left continent (P1), centre island group, right continent (P2).
    const CONTINENTS: Array<{ cx: number; cy: number; rx: number; ry: number; s: number }> = [
      // Left continent
      { cx:  24, cy: 48, rx: 22, ry: 36, s: 1.00 },
      { cx:  16, cy: 13, rx: 12, ry: 11, s: 0.92 }, // NW arm — P1 castle at (20,16)
      { cx:  36, cy: 22, rx:  9, ry:  8, s: 0.76 },
      { cx:  18, cy: 80, rx: 10, ry:  8, s: 0.80 },
      { cx:  38, cy: 70, rx:  9, ry:  7, s: 0.78 },
      // Centre island group
      { cx:  70, cy: 26, rx: 15, ry: 16, s: 0.88 },
      { cx:  78, cy: 58, rx: 16, ry: 16, s: 0.85 },
      { cx:  60, cy: 84, rx:  8, ry:  6, s: 0.72 },
      // Right continent
      { cx: 138, cy: 44, rx: 17, ry: 34, s: 1.00 },
      { cx: 144, cy: 14, rx: 10, ry: 10, s: 0.82 }, // NE arm
      { cx: 128, cy: 74, rx: 13, ry: 12, s: 0.90 }, // SE lobe — P2 castle at (130,72)
      { cx: 150, cy: 72, rx:  8, ry:  8, s: 0.75 },
      // Scattered small islands
      { cx:  52, cy: 12, rx:  6, ry:  4, s: 0.72 },
      { cx: 106, cy: 12, rx:  6, ry:  5, s: 0.70 },
      { cx:  50, cy: 80, rx:  7, ry:  5, s: 0.68 },
      { cx: 110, cy: 82, rx:  6, ry:  5, s: 0.66 },
      { cx:   5, cy: 50, rx:  4, ry:  5, s: 0.62 },
      { cx: 155, cy: 50, rx:  4, ry:  5, s: 0.62 },
      { cx:  94, cy: 42, rx:  6, ry:  5, s: 0.65 },
      // ── Stepping-stone chains to ensure P1↔P2 connectivity ────────────────
      // P1 right → centre (the gap around tx=55–65 is often water)
      { cx:  54, cy: 43, rx:  9, ry:  8, s: 0.76 },
      { cx:  62, cy: 62, rx:  8, ry:  7, s: 0.73 },
      { cx:  58, cy: 22, rx:  7, ry:  6, s: 0.70 },
      // Centre gap fill
      { cx:  84, cy: 38, rx:  8, ry:  7, s: 0.74 },
      { cx:  88, cy: 70, rx:  8, ry:  7, s: 0.73 },
      // Centre → P2 (the gap around tx=95–120 is often water)
      { cx:  97, cy: 50, rx: 10, ry:  9, s: 0.76 },
      { cx: 107, cy: 30, rx:  9, ry:  8, s: 0.75 },
      { cx: 114, cy: 64, rx:  9, ry:  8, s: 0.76 },
      { cx: 118, cy: 46, rx:  9, ry:  9, s: 0.78 },
    ];

    const coastNoise = (tx: number, ty: number) =>
      Math.sin(tx * 0.15 + 1.7) * Math.cos(ty * 0.13 + 0.4) * 0.45 +
      Math.sin(tx * 0.08 + 3.1) * Math.cos(ty * 0.21 + 2.2) * 0.35 +
      Math.cos(tx * 0.27 + 0.9) * Math.sin(ty * 0.11 + 1.5) * 0.20;

    const hillNoise = (tx: number, ty: number) =>
      Math.sin(tx * 0.11 + 1.7) * Math.cos(ty * 0.09 + 0.4) * 0.50 +
      Math.sin(tx * 0.07 + 3.1) * Math.cos(ty * 0.13 + 2.2) * 0.35 +
      Math.cos(tx * 0.17 + 0.9) * Math.sin(ty * 0.08 + 1.5) * 0.15;

    const heightAt = (tx: number, ty: number): number => {
      let maxH = 0;
      for (const c of CONTINENTS) {
        const dx = (tx - c.cx) / c.rx;
        const dy = (ty - c.cy) / c.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 2.8) continue;
        const h = c.s * Math.max(0, 1.0 - d2 / 2.25);
        if (h > maxH) maxH = h;
      }
      return maxH + coastNoise(tx, ty) * 0.10;
    };

    for (let ty = 0; ty < MAP_ROWS; ty++) {
      for (let tx = 0; tx < MAP_COLS; tx++) {
        const h = heightAt(tx, ty);
        if (h < 0.28) continue; // stays ocean
        const cell = this.terrainGrid[ty][tx];
        cell.water = false; cell.walkable = true; cell.bridge = false;
        if (h < 0.42) {
          // Coastal beach strip — walkable but not buildable
          cell.level = 1; cell.tileKind = 'beach'; cell.buildable = false;
        } else {
          cell.level = 1; cell.tileKind = 'flat'; cell.buildable = true;
          if (hillNoise(tx, ty) > 0.36 && h > 0.55) {
            cell.level = 2; cell.tileKind = 'elevated';
          }
        }
      }
    }

    // ── 3. Stairs at elevation transitions ───────────────────────────────
    this.applyWorldStairs();

    // ── 4. Stitch water gaps with bridges to ensure unit connectivity ─────
    this.buildRiverBridges();

    // Cache tileKind grid once for minimap snapshots.
    this.rebuildMinimapTerrainGridCache();

    // ── 7. Water background ───────────────────────────────────────────────
    const waterBg = this.add.tileSprite(mapW * 0.5, mapH * 0.5, mapW, mapH, 'terrain_water');
    waterBg.setTint(0x2f9fa4).setAlpha(0.96).setDepth(0);

    // ── 8. Render tile sprites ────────────────────────────────────────────
    const levelAt = (tx: number, ty: number): number => {
      if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) return 0;
      const c = this.terrainGrid[ty][tx];
      return (!c || c.water) ? 0 : c.level;
    };
    const tfFrame = (tx: number, ty: number, minLv: number, sandOffset: number): number => {
      const L = levelAt(tx - 1, ty) >= minLv; const R = levelAt(tx + 1, ty) >= minLv;
      const U = levelAt(tx, ty - 1) >= minLv; const D = levelAt(tx, ty + 1) >= minLv;
      const col = (!L && !R) ? 1 : (!L) ? 0 : (!R) ? 2 : 1;
      const row = (!U && !D) ? 1 : (!U) ? 0 : (!D) ? 2 : 1;
      return row * 10 + col + sandOffset;
    };
    const cliffEdgeCol = (tx: number, ty: number): number => {
      const L = levelAt(tx - 1, ty) >= 2; const R = levelAt(tx + 1, ty) >= 2;
      return (!L && !R) ? 1 : (!L) ? 0 : (!R) ? 2 : 1;
    };

    for (let ty = 0; ty < MAP_ROWS; ty++) {
      for (let tx = 0; tx < MAP_COLS; tx++) {
        const cell = this.terrainGrid[ty][tx];
        if (!cell || cell.water) continue;
        const l = cell.level;
        const isBeach = cell.tileKind === 'beach';
        const isStair = cell.stair;
        const isBridge = cell.bridge;
        const isElev = l >= 2;
        const px = tx * T + T * 0.5;
        const py = ty * T + T * 0.5;
        const depth = isElev ? 2.5 : 1.5;
        const lift  = isElev ? 22 : 0;
        const drawY = py - lift;

        // Bridge tiles — render as wooden planks using the beach/sand tint + darker stripe
        if (isBridge) {
          const plank = this.add.image(px, py, 'tf', 12); // centre grass frame reused as plank base
          plank.setTint(0x9e6830).setDepth(1.7);
          this.terrainVisuals.push(plank);
          // Plank lines (thin horizontal stripes)
          const stripe = this.add.rectangle(px, py, T, 3, 0x6b4218, 0.55);
          stripe.setDepth(1.75);
          this.terrainVisuals.push(stripe);
          const stripe2 = this.add.rectangle(px, py - T * 0.35, T, 2, 0x6b4218, 0.35);
          stripe2.setDepth(1.75);
          this.terrainVisuals.push(stripe2);
          const stripe3 = this.add.rectangle(px, py + T * 0.35, T, 2, 0x6b4218, 0.35);
          stripe3.setDepth(1.75);
          this.terrainVisuals.push(stripe3);
          continue;
        }

        const frame = tfFrame(tx, ty, l, 0);
        const surf  = this.add.image(px, drawY, 'tf', frame);
        surf.setDepth(depth);
        if (isElev) surf.setTint(0xd4eba8);
        if (isBeach) surf.setTint(0xe8c872);
        this.terrainVisuals.push(surf);

        if (isElev) {
          if (levelAt(tx, ty - 1) < 2) {
            const rim = this.add.rectangle(px, drawY - T * 0.5 + 2, T, 3, 0xffffff, 0.22);
            rim.setDepth(depth + 0.16); this.terrainVisuals.push(rim);
          }
          if (levelAt(tx, ty + 1) < 2) {
            const shadow = this.add.rectangle(px, drawY + T * 0.5 - 2, T, 4, 0x000000, 0.16);
            shadow.setDepth(depth + 0.16); this.terrainVisuals.push(shadow);
          }
        }

        if (levelAt(tx, ty + 1) < l && ty + 1 < MAP_ROWS) {
          const cc    = cliffEdgeCol(tx, ty);
          const faceY = ty * T + T - lift;
          if (isStair) {
            const step = this.add.image(px, faceY, 'te', 20 + cc);
            step.setOrigin(0.5, 0); step.setDepth(depth + 0.14); this.terrainVisuals.push(step);
            const sh = this.add.image(px, faceY + T * 0.85, 'ts', 0);
            sh.setAlpha(0.20); sh.setDepth(depth + 0.09); this.terrainVisuals.push(sh);
          } else {
            const cap = this.add.image(px, faceY, 'te', cc);
            cap.setOrigin(0.5, 0); cap.setDepth(depth + 0.14); this.terrainVisuals.push(cap);
            const body = this.add.image(px, faceY + T, 'te', 4 + cc);
            body.setOrigin(0.5, 0); body.setDepth(depth + 0.13); this.terrainVisuals.push(body);
            const sh = this.add.image(px, faceY + T * 1.9, 'ts', 0);
            sh.setAlpha(0.30); sh.setDepth(depth + 0.09); this.terrainVisuals.push(sh);
          }
        }
      }
    }

    // ── 9. Decorate the world ─────────────────────────────────────────────
    this.decorateWorld();

    // Kingdom labels near spawn castles
    this.add.text(P1_CASTLE_TX * T + T * 2, (P1_CASTLE_TY - 4) * T, 'YOUR KINGDOM',
      { fontFamily: 'serif', fontSize: '18px', color: '#ffffff', stroke: '#222', strokeThickness: 4 },
    ).setOrigin(0.5).setDepth(30);
    this.add.text(P2_CASTLE_TX * T + T * 2, (P2_CASTLE_TY - 4) * T, 'ENEMY KINGDOM',
      { fontFamily: 'serif', fontSize: '18px', color: '#ff8888', stroke: '#222', strokeThickness: 4 },
    ).setOrigin(0.5).setDepth(30);
  }

  /** Place stair openings at all level-1↔level-2 transitions across the world map. */
  private applyWorldStairs() {
    const markPair = (fx: number, fy: number, ex: number, ey: number) => {
      const fc = this.terrainGrid[fy]?.[fx]; const ec = this.terrainGrid[ey]?.[ex];
      if (!fc || !ec || fc.water || ec.water) return;
      fc.stair = true; fc.tileKind = 'stair'; fc.walkable = true; fc.buildable = false;
      ec.stair = true; ec.tileKind = 'stair'; ec.walkable = true; ec.buildable = false;
    };
    let count = 0;
    for (let ty = 2; ty < MAP_ROWS - 2; ty++) {
      for (let tx = 2; tx < MAP_COLS - 2; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2) continue;
        type Dir = [number, number, number, number];
        const transitions: Dir[] = [];
        if ((this.terrainGrid[ty]?.[tx - 1]?.level ?? 0) < 2) transitions.push([tx - 1, ty, tx, ty]);
        if ((this.terrainGrid[ty]?.[tx + 1]?.level ?? 0) < 2) transitions.push([tx + 1, ty, tx, ty]);
        if ((this.terrainGrid[ty - 1]?.[tx]?.level ?? 0) < 2) transitions.push([tx, ty - 1, tx, ty]);
        if ((this.terrainGrid[ty + 1]?.[tx]?.level ?? 0) < 2) transitions.push([tx, ty + 1, tx, ty]);
        if (transitions.length === 0) continue;
        count++;
        if (count % 8 !== 0) continue;
        for (const [fx, fy, ex, ey] of transitions) {
          markPair(fx, fy, ex, ey);
          if (fx !== ex) { markPair(fx, fy - 1, ex, ey - 1); markPair(fx, fy + 1, ex, ey + 1); }
          else           { markPair(fx - 1, fy, ex - 1, ey); markPair(fx + 1, fy, ex + 1, ey); }
        }
      }
    }
  }

  /**
   * Place a small number of curated bridges at strategic crossing points.
   * Instead of auto-scanning every gap (which creates hundreds of plank tiles),
   * we define explicit "crossing corridors" — 3-wide passages cut through water
   * at the narrowest points between the major land masses.
   */
  private buildRiverBridges() {
    // Each entry defines the CENTER tile of a bridge and its orientation.
    // The bridge will be 3 tiles wide perpendicular to the crossing direction.
    // 'h' = crossing horizontally (water runs top-to-bottom, bridge goes left-right)
    // 'v' = crossing vertically   (water runs left-to-right, bridge goes top-bottom)
    const CROSSINGS: Array<{ cx: number; cy: number; dir: 'h' | 'v'; maxGap: number }> = [
      // P1 east coast → centre islands (around tx≈54)
      { cx: 54, cy: 30, dir: 'h', maxGap: 8 },
      { cx: 54, cy: 55, dir: 'h', maxGap: 8 },
      // Centre → P2 west coast (around tx≈118)
      { cx: 118, cy: 28, dir: 'h', maxGap: 8 },
      { cx: 118, cy: 62, dir: 'h', maxGap: 8 },
      // Vertical crossings — centre-north gap
      { cx: 80, cy: 14, dir: 'v', maxGap: 8 },
      // Vertical crossings — centre-south gap
      { cx: 80, cy: 78, dir: 'v', maxGap: 8 },
    ];

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    for (const { cx, cy, dir, maxGap } of CROSSINGS) {
      if (dir === 'h') {
        // Walk left from cx until land, then right until land; bridge the water in-between
        let x0 = cx;
        while (x0 > 1 && this.terrainGrid[cy]?.[x0]?.water) x0--;
        let x1 = cx;
        while (x1 < MAP_COLS - 2 && this.terrainGrid[cy]?.[x1]?.water) x1++;
        const gap = x1 - x0 - 1;
        if (gap < 1 || gap > maxGap) continue;
        for (let bx = x0 + 1; bx < x1; bx++) {
          for (let dy = -1; dy <= 1; dy++) {
            const by = clamp(cy + dy, 1, MAP_ROWS - 2);
            this.markBridgeTile(bx, by);
          }
        }
      } else {
        // Vertical
        let y0 = cy;
        while (y0 > 1 && this.terrainGrid[y0]?.[cx]?.water) y0--;
        let y1 = cy;
        while (y1 < MAP_ROWS - 2 && this.terrainGrid[y1]?.[cx]?.water) y1++;
        const gap = y1 - y0 - 1;
        if (gap < 1 || gap > maxGap) continue;
        for (let by = y0 + 1; by < y1; by++) {
          for (let dx = -1; dx <= 1; dx++) {
            const bx = clamp(cx + dx, 1, MAP_COLS - 2);
            this.markBridgeTile(bx, by);
          }
        }
      }
    }
  }

  private markBridgeTile(tx: number, ty: number) {
    const cell = this.terrainGrid[ty]?.[tx];
    if (!cell) return;
    cell.water     = false;
    cell.walkable  = true;
    cell.buildable = false;
    cell.stair     = false;
    cell.bridge    = true;
    cell.level     = 1;
    cell.tileKind  = 'bridge';
  }

  /** Decorate the whole world with trees (dense forest patches), mushrooms, and water rocks. */
  private decorateWorld() {
    const T = TILE_SIZE;
    const rng = (seed: number) => { const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

    // Forest-density noise — creates distinct forest blobs vs open clearings
    const forestDensity = (tx: number, ty: number) =>
      Math.sin(tx * 0.22 + 2.1) * Math.cos(ty * 0.18 + 0.7) * 0.5 +
      Math.sin(tx * 0.31 + 4.2) * Math.cos(ty * 0.27 + 1.3) * 0.5;

    // Trees
    for (let ty = 3; ty < MAP_ROWS - 3; ty++) {
      for (let tx = 3; tx < MAP_COLS - 3; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.stair || cell.bridge) continue;
        const kind = cell.tileKind;
        if (kind !== 'flat' && kind !== 'elevated' && kind !== 'beach') continue;
        const inForest = forestDensity(tx, ty) > 0.05;
        let prob: number;
        if (kind === 'beach')         prob = 0.07;         // more coastal palms
        else if (kind === 'elevated') prob = inForest ? 0.52 : 0.18; // denser highland forests
        else                          prob = inForest ? 0.35 : 0.08; // more lowland trees
        const tileSeed = (tx + 1) * 1009 + (ty + 1) * 37;
        if (rng(tileSeed) >= prob) continue;
        let nearStair = false;
        outer: for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (this.terrainGrid[ty + dy]?.[tx + dx]?.stair) { nearStair = true; break outer; }
          }
        }
        if (nearStair) continue;
        const isElev = cell.level >= 2;
        const lift   = isElev ? 22 : 0;
        const px     = tx * T + T * 0.5 + (rng(tileSeed * 3) - 0.5) * 14;
        const py     = ty * T + T - lift;
        const frameIdx = Math.floor(rng(tileSeed * 7) * 6);
        const scale    = 0.38 + rng(tileSeed * 11) * 0.20;
        const tree = this.add.image(px, py, 'tree_sheet', frameIdx);
        tree.setScale(scale).setOrigin(0.5, 1.0).setDepth(2.0 + ty * 0.01 + (isElev ? 1.0 : 0.5));
      }
    }

    // Mushrooms / deco on elevated tiles
    const decoKeys = ['deco_01', 'deco_02', 'deco_03'] as const;
    for (let ty = 6; ty < MAP_ROWS - 6; ty++) {
      for (let tx = 6; tx < MAP_COLS - 6; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2 || cell.stair || cell.bridge) continue;
        const tileSeed = (tx + 1) * 997 + (ty + 1) * 53;
        if (rng(tileSeed) >= 0.09) continue; // was 0.05 — denser deco
        const px  = tx * T + T * 0.5 + (rng(tileSeed * 3) - 0.5) * 22;
        const py  = ty * T + T * 0.5 - 22 + (rng(tileSeed * 5) - 0.5) * 10;
        const dKey = decoKeys[Math.floor(rng(tileSeed * 7) * 3)];
        this.add.image(px, py, dKey).setScale(0.5 + rng(tileSeed * 11) * 0.35).setDepth(2.6 + ty * 0.001);
      }
    }

    // Rocks near all water edges (perimeter + lakes)
    for (let ty = 2; ty < MAP_ROWS - 2; ty++) {
      for (let tx = 2; tx < MAP_COLS - 2; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell?.water) continue;
        let nearLand = false;
        outer2: for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const n = this.terrainGrid[ty + dy]?.[tx + dx];
            if (n && !n.water) { nearLand = true; break outer2; }
          }
        }
        if (!nearLand) continue;
        const tileSeed = (tx + 1) * 1013 + (ty + 1) * 59;
        if (rng(tileSeed) >= 0.04) continue;
        const px   = tx * T + T * 0.5 + (rng(tileSeed * 3) - 0.5) * 18;
        const py   = ty * T + T * 0.5 + (rng(tileSeed * 5) - 0.5) * 10;
        const big  = rng(tileSeed * 7) > 0.4;
        const rock = this.add.image(px, py, big ? 'rock_pile' : 'rock_small', 0);
        rock.setScale(big ? 0.40 : 0.36).setAlpha(0.75 + rng(tileSeed * 9) * 0.25).setDepth(0.8);
        this.tweens.add({ targets: rock, y: rock.y + 3, duration: 1800 + Math.floor(rng(tileSeed * 13) * 1200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.floor(rng(tileSeed * 17) * 2000) });
      }
    }
  }

  private isInBounds(tx: number, ty: number) {
    return tx >= 0 && tx < MAP_COLS && ty >= 0 && ty < MAP_ROWS;
  }

  private getTerrainCell(tx: number, ty: number): TerrainCell | null {
    if (!this.isInBounds(tx, ty)) return null;
    return this.terrainGrid[ty][tx];
  }

  private worldToTile(wx: number, wy: number) {
    return { tx: Phaser.Math.Clamp(Math.floor(wx / TILE_SIZE), 0, MAP_COLS - 1), ty: Phaser.Math.Clamp(Math.floor(wy / TILE_SIZE), 0, MAP_ROWS - 1) };
  }

  private tileToWorld(tx: number, ty: number) {
    return { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
  }

  private findNearestWalkableTile(tx: number, ty: number) {
    if (this.getTerrainCell(tx, ty)?.walkable) return { tx, ty };
    const queue: Array<{ tx: number; ty: number }> = [{ tx, ty }];
    const visited = new Set<string>([`${tx},${ty}`]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = current.tx + dx;
        const ny = current.ty + dy;
        const key = `${nx},${ny}`;
        if (!this.isInBounds(nx, ny) || visited.has(key)) continue;
        visited.add(key);
        const cell = this.getTerrainCell(nx, ny);
        if (!cell) continue;
        if (cell.walkable) return { tx: nx, ty: ny };
        queue.push({ tx: nx, ty: ny });
      }
    }
    return { tx, ty };
  }

  private canTraverse(from: TerrainCell, to: TerrainCell) {
    if (!to.walkable) return false;
    const levelDiff = Math.abs(from.level - to.level);
    // Allow any adjacent walkable cell within ±1 level — stair tiles are visual hints only
    return levelDiff <= 1;
  }

  private findPath(fromX: number, fromY: number, toX: number, toY: number) {
    const startWorld = this.worldToTile(fromX, fromY);
    const targetWorld = this.worldToTile(toX, toY);
    const startTile = this.findNearestWalkableTile(startWorld.tx, startWorld.ty);
    const targetTile = this.findNearestWalkableTile(targetWorld.tx, targetWorld.ty);
    const queue: Array<{ tx: number; ty: number }> = [startTile];
    const parents = new Map<string, string>();
    const startKey = `${startTile.tx},${startTile.ty}`;
    const targetKey = `${targetTile.tx},${targetTile.ty}`;
    const visited = new Set<string>([startKey]);
    let bestKey = startKey;
    let bestDistSq = (startTile.tx - targetTile.tx) ** 2 + (startTile.ty - targetTile.ty) ** 2;

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentKey = `${current.tx},${current.ty}`;
      const distSq = (current.tx - targetTile.tx) ** 2 + (current.ty - targetTile.ty) ** 2;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestKey = currentKey;
      }

      if (current.tx === targetTile.tx && current.ty === targetTile.ty) {
        bestKey = currentKey;
        break;
      }

      const currentCell = this.getTerrainCell(current.tx, current.ty);
      if (!currentCell) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = current.tx + dx;
        const ny = current.ty + dy;
        const key = `${nx},${ny}`;
        if (!this.isInBounds(nx, ny) || visited.has(key)) continue;
        const nextCell = this.getTerrainCell(nx, ny);
        if (!nextCell || !this.canTraverse(currentCell, nextCell)) continue;
        visited.add(key);
        parents.set(key, currentKey);
        queue.push({ tx: nx, ty: ny });
      }
    }

    const endKey = visited.has(targetKey) ? targetKey : bestKey;

    const tiles: Array<{ tx: number; ty: number }> = [];
    let cursor: string | undefined = endKey;
    while (cursor) {
      const [txStr, tyStr] = cursor.split(',');
      tiles.push({ tx: Number(txStr), ty: Number(tyStr) });
      cursor = parents.get(cursor);
    }

    if (tiles.length === 0) {
      tiles.push(startTile);
    }

    tiles.reverse();
    return tiles.map((tile) => this.tileToWorld(tile.tx, tile.ty));
  }

  private makeWaterCell(): TerrainCell {
    return {
      level: 0,
      walkable: false,
      buildable: false,
      stair: false,
      water: true,
      bridge: false,
      tileKind: 'water',
    };
  }

  private placeResources() {
    const p1Used = new Set<string>();
    const p2Used = new Set<string>();
    const p1MinX = 8;
    const p1MaxX = Math.floor(MAP_COLS / 2) - 5;
    const p2MinX = Math.floor(MAP_COLS / 2) + 5;
    const p2MaxX = MAP_COLS - 9;

    for (const r of P1_RESOURCES) {
      const tile = this.pickRandomResourceTile(r.tx, r.ty, p1MinX, p1MaxX, p1Used);
      p1Used.add(`${tile.tx},${tile.ty}`);
      const node = new ResourceNode(this, tile.tx, tile.ty, r.type);
      this.p1Resources.push(node);
    }

    for (const r of P2_RESOURCES) {
      const tile = this.pickRandomResourceTile(r.tx, r.ty, p2MinX, p2MaxX, p2Used);
      p2Used.add(`${tile.tx},${tile.ty}`);
      const node = new ResourceNode(this, tile.tx, tile.ty, r.type);
      this.p2Resources.push(node);
    }
  }

  private isValidResourceTile(tx: number, ty: number, minX: number, maxX: number, minY: number, maxY: number, used: Set<string>) {
    if (tx < minX || tx > maxX || ty < minY || ty > maxY) return false;
    if (used.has(`${tx},${ty}`)) return false;
    if (this.occupiedTiles.has(`${tx},${ty}`)) return false;

    const cell = this.getTerrainCell(tx, ty);
    if (!cell || cell.water || !cell.walkable || cell.stair) return false;
    return true;
  }

  private pickRandomResourceTile(baseTx: number, baseTy: number, minX: number, maxX: number, used: Set<string>) {
    const minY = 8;
    const maxY = MAP_ROWS - 9;
    const safeMinX = Phaser.Math.Clamp(Math.min(minX, maxX), 0, MAP_COLS - 1);
    const safeMaxX = Phaser.Math.Clamp(Math.max(minX, maxX), 0, MAP_COLS - 1);
    const safeMinY = Phaser.Math.Clamp(Math.min(minY, maxY), 0, MAP_ROWS - 1);
    const safeMaxY = Phaser.Math.Clamp(Math.max(minY, maxY), 0, MAP_ROWS - 1);
    const baseClampedTx = Phaser.Math.Clamp(baseTx, safeMinX, safeMaxX);
    const baseClampedTy = Phaser.Math.Clamp(baseTy, safeMinY, safeMaxY);

    for (let i = 0; i < 48; i++) {
      const tx = Phaser.Math.Clamp(baseClampedTx + Phaser.Math.Between(-8, 8), safeMinX, safeMaxX);
      const ty = Phaser.Math.Clamp(baseClampedTy + Phaser.Math.Between(-10, 10), safeMinY, safeMaxY);
      if (this.isValidResourceTile(tx, ty, safeMinX, safeMaxX, safeMinY, safeMaxY, used)) {
        return { tx, ty };
      }
    }

    const maxRadius = Math.max(safeMaxX - safeMinX, safeMaxY - safeMinY);
    for (let r = 0; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = Phaser.Math.Clamp(baseClampedTx + dx, safeMinX, safeMaxX);
          const ty = Phaser.Math.Clamp(baseClampedTy + dy, safeMinY, safeMaxY);
          if (this.isValidResourceTile(tx, ty, safeMinX, safeMaxX, safeMinY, safeMaxY, used)) {
            return { tx, ty };
          }
        }
      }
    }

    for (let ty = safeMinY; ty <= safeMaxY; ty++) {
      for (let tx = safeMinX; tx <= safeMaxX; tx++) {
        if (this.isValidResourceTile(tx, ty, safeMinX, safeMaxX, safeMinY, safeMaxY, used)) {
          return { tx, ty };
        }
      }
    }

    for (let ty = safeMinY; ty <= safeMaxY; ty++) {
      for (let tx = safeMinX; tx <= safeMaxX; tx++) {
        if (!used.has(`${tx},${ty}`)) {
          return { tx, ty };
        }
      }
    }

    return { tx: baseClampedTx, ty: baseClampedTy };
  }

  private getSpawnOriginForType(type: UnitType, side: 'p1' | 'p2'): { x: number; y: number } {
    const buildings = side === 'p1' ? this.p1Buildings : this.p2Buildings;
    const fallback = side === 'p1' ? this.p1SpawnPoint : this.p2SpawnPoint;
    const requiredBuilding = this.getRequiredBuildingForUnit(type);
    if (requiredBuilding) {
      const producer = buildings.find((b) => b.type === requiredBuilding && !b.isDestroyed);
      if (producer) {
        return {
          x: (producer.tx + BUILDING_CONFIGS[producer.type].width * 0.5) * TILE_SIZE,
          y: (producer.ty + BUILDING_CONFIGS[producer.type].height) * TILE_SIZE,
        };
      }
    }
    return fallback;
  }

  private getRequiredBuildingForUnit(type: UnitType): BuildingType | null {
    if (type === 'pawn') return 'house';
    if (type === 'pawn_iron' || type === 'pawn_gold') return 'barracks';
    if (type === 'archer') return 'fort';
    if (type === 'monk') return 'workshop';
    if (type === 'warrior' || type === 'knight' || type === 'slinger') return 'barracks';
    return null;
  }

  public getProductionAvailability(): ProductionAvailability {
    return {
      house:    this.p1Buildings.some((b) => b.type === 'house'     && !b.isDestroyed),
      barracks: this.p1Buildings.some((b) => b.type === 'barracks'  && !b.isDestroyed),
      fort:     this.p1Buildings.some((b) => b.type === 'fort'      && !b.isDestroyed),
      workshop: this.p1Buildings.some((b) => b.type === 'workshop'  && !b.isDestroyed),
      pop:    this.getAliveUnitCount('p1'),
      popCap: this.getPopCap('p1'),
    };
  }

  /** Count alive non-pawn combat units + pawns for population. */
  private getAliveUnitCount(faction: 'p1' | 'p2'): number {
    const units = faction === 'p1' ? this.p1Units : this.p2Units;
    // queued units count against pop too (reserved seats)
    const queued = faction === 'p1' ? this.trainQueue.length : 0;
    return units.filter(u => u.isAlive()).length + queued;
  }

  /** Sum BASE_POP_CAP + popCap from all standing buildings for a faction. */
  private getPopCap(faction: 'p1' | 'p2'): number {
    const buildings = faction === 'p1' ? this.p1Buildings : this.p2Buildings;
    const fromBuildings = buildings
      .filter(b => !b.isDestroyed)
      .reduce((sum, b) => sum + (BUILDING_CONFIGS[b.type].popCap ?? 0), 0);
    return BASE_POP_CAP + fromBuildings;
  }

  /** Returns the number of alive + queued player Scout (slinger) units — used by HUD to show limit. */
  public getPlayerSlingerCount(): number {
    const alive  = this.p1Units.filter(u => u.isAlive() && u.state.type === 'slinger').length;
    const queued = this.trainQueue.filter(q => q.type === 'slinger').length;
    return alive + queued;
  }

  /** Returns terrain grid for minimap rendering — array of tileKind strings. */
  public getMinimapTerrainGrid(): string[][] {
    return this.minimapTerrainGridCache;
  }

  /** Returns lightweight snapshot for the React minimap canvas. */
  public getMinimapData(): {
    p1Units: Array<{ id: number; x: number; y: number }>;
    p2Units: Array<{ id: number; x: number; y: number }>;
    p1Buildings: Array<{ x: number; y: number; type: string }>;
    p2Buildings: Array<{ x: number; y: number; type: string }>;
    terrainGrid: string[][];
    exploredGrid: Uint8Array | null;
    fogEnabled: boolean;
    camScrollX: number;
    camScrollY: number;
    camViewW: number;
    camViewH: number;
    camZoom: number;
  } {
    const cam = this.cameras.main;
    const fog = this.fogSystem;
    const fogEnabled = fog?.isEnabled() ?? false;

    // An enemy entity is visible on the minimap only if the player has explored that area
    const isExplored = (wx: number, wy: number) =>
      !fogEnabled || (fog?.isWorldExplored(wx, wy) ?? true);

    return {
      p1Units:     this.p1Units.filter(u => u.isAlive()).map(u => ({ id: u.state.id, x: u.state.x, y: u.state.y })),
      p2Units:     this.p2Units.filter(u => u.isAlive() && isExplored(u.state.x, u.state.y)).map(u => ({ id: u.state.id, x: u.state.x, y: u.state.y })),
      p1Buildings: this.p1Buildings.filter(b => !b.isDestroyed).map(b => ({ x: b.wx, y: b.wy, type: b.type })),
      p2Buildings: this.p2Buildings.filter(b => !b.isDestroyed && isExplored(b.wx, b.wy)).map(b => ({ x: b.wx, y: b.wy, type: b.type })),
      terrainGrid: this.getMinimapTerrainGrid(),
      exploredGrid: fog?.getExploredGrid() ?? null,
      fogEnabled,
      camScrollX: cam.scrollX,
      camScrollY: cam.scrollY,
      camViewW:   cam.width  / cam.zoom,
      camViewH:   cam.height / cam.zoom,
      camZoom:    cam.zoom,
    };
  }

  /** Returns a count of alive player (P1) units by type — used by the AI for counter-build logic. */
  public getPlayerUnitCounts(): Partial<Record<UnitType, number>> {
    const counts: Partial<Record<UnitType, number>> = {};
    for (const u of this.p1Units) {
      if (!u.isAlive()) continue;
      counts[u.state.type] = (counts[u.state.type] ?? 0) + 1;
    }
    return counts;
  }

  /** Changes the AI opponent difficulty at any time before or during the game. */
  public setDifficulty(d: Difficulty) {
    this.currentDifficulty = d;
    if (this.aiSystem) this.aiSystem.setDifficulty(d);
  }

  // ── Admin / debug methods ───────────────────────────────────────────────
  public adminAddResources(gold: number, wood: number) {
    this.resourceSystem.addResources('p1', gold, wood);
  }

  public adminSetZoom(zoom: number) {
    this.cameras.main.setZoom(Phaser.Math.Clamp(zoom, 0.05, 4.0));
  }

  public adminSpawnUnit(type: UnitType, faction: Faction) {
    const castleTx = faction === 'blue' ? P1_CASTLE_TX : P2_CASTLE_TX;
    const castleTy = faction === 'blue' ? P1_CASTLE_TY : P2_CASTLE_TY;
    const { x, y } = this.tileToWorld(castleTx, castleTy);
    this.spawnUnit(type, faction, x + Phaser.Math.Between(-96, 96), y + Phaser.Math.Between(32, 128));
  }

  public adminPlaceBuilding(type: BuildingType, faction: Faction) {
    const castleTx = faction === 'blue' ? P1_CASTLE_TX : P2_CASTLE_TX;
    const castleTy = faction === 'blue' ? P1_CASTLE_TY : P2_CASTLE_TY;
    for (let r = 2; r <= 14; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (this.placeBuilding(type, faction, castleTx + dx, castleTy + dy)) return;
        }
      }
    }
  }

  public adminTeleportCamera(faction: 'blue' | 'red') {
    const tx = faction === 'blue' ? P1_CASTLE_TX : P2_CASTLE_TX;
    const ty = faction === 'blue' ? P1_CASTLE_TY : P2_CASTLE_TY;
    const { x, y } = this.tileToWorld(tx, ty);
    this.cameras.main.centerOn(x, y);
  }

  public adminToggleFog() {
    if (this.fogSystem) {
      this.fogSystem.setEnabled(!this.fogSystem.isEnabled());
    }
  }

  public adminIsFogEnabled(): boolean {
    return this.fogSystem ? this.fogSystem.isEnabled() : true;
  }

  private spawnStartBuildings() {
    const p1Spot = this.pickRandomCastleSpot('blue');
    const p2Spot = this.pickRandomCastleSpot('red');

    const p1Castle = this.placeBuilding('castle', 'blue', p1Spot.tx, p1Spot.ty)
      ?? this.placeBuilding('castle', 'blue', P1_CASTLE_TX, P1_CASTLE_TY);
    const p2Castle = this.placeBuilding('castle', 'red', p2Spot.tx, p2Spot.ty)
      ?? this.placeBuilding('castle', 'red', P2_CASTLE_TX, P2_CASTLE_TY);

    if (p1Castle) {
      this.p1SpawnPoint = {
        x: (p1Castle.tx + BUILDING_CONFIGS.castle.width * 0.5) * TILE_SIZE,
        y: (p1Castle.ty + BUILDING_CONFIGS.castle.height) * TILE_SIZE,
      };
      // Place 2 starting houses near the castle
      const houseOffsets = [{ dx: -3, dy: 4 }, { dx: 5, dy: 4 }, { dx: -3, dy: -3 }, { dx: 5, dy: -3 }];
      let housesPlaced = 0;
      for (const off of houseOffsets) {
        if (housesPlaced >= 2) break;
        if (this.placeBuilding('house', 'blue', p1Castle.tx + off.dx, p1Castle.ty + off.dy)) housesPlaced++;
      }
      this.placeBuilding('workshop', 'blue', p1Castle.tx - 6, p1Castle.ty + 1);
      this.placeBuilding('fort', 'blue', p1Castle.tx + 7, p1Castle.ty + 1);
      const barracksOffsets = [{ dx: -8, dy: 5 }, { dx: 8, dy: 5 }, { dx: -8, dy: -4 }, { dx: 8, dy: -4 }];
      for (const off of barracksOffsets) {
        if (this.placeBuilding('barracks', 'blue', p1Castle.tx + off.dx, p1Castle.ty + off.dy)) break;
      }
    }
    if (p2Castle) {
      this.p2SpawnPoint = {
        x: (p2Castle.tx + BUILDING_CONFIGS.castle.width * 0.5) * TILE_SIZE,
        y: (p2Castle.ty + BUILDING_CONFIGS.castle.height) * TILE_SIZE,
      };
      // Place 2 starting houses near the castle
      const houseOffsets = [{ dx: -3, dy: 4 }, { dx: 5, dy: 4 }, { dx: -3, dy: -3 }, { dx: 5, dy: -3 }];
      let housesPlaced = 0;
      for (const off of houseOffsets) {
        if (housesPlaced >= 2) break;
        if (this.placeBuilding('house', 'red', p2Castle.tx + off.dx, p2Castle.ty + off.dy)) housesPlaced++;
      }
      this.placeBuilding('workshop', 'red', p2Castle.tx - 6, p2Castle.ty + 1);
      this.placeBuilding('fort', 'red', p2Castle.tx + 7, p2Castle.ty + 1);
      const barracksOffsets = [{ dx: -8, dy: 5 }, { dx: 8, dy: 5 }, { dx: -8, dy: -4 }, { dx: 8, dy: -4 }];
      for (const off of barracksOffsets) {
        if (this.placeBuilding('barracks', 'red', p2Castle.tx + off.dx, p2Castle.ty + off.dy)) break;
      }
    }
  }

  private pickRandomCastleSpot(faction: Faction) {
    const cfg = BUILDING_CONFIGS.castle;
    const islandMinX = faction === 'blue' ? 12 : 110;
    const islandMaxX = faction === 'blue' ? 50 - cfg.width : 148 - cfg.width;
    const minY = 10;
    const maxY = MAP_ROWS - cfg.height - 10;
    const defaultSpot = faction === 'blue'
      ? { tx: P1_CASTLE_TX, ty: P1_CASTLE_TY }
      : { tx: P2_CASTLE_TX, ty: P2_CASTLE_TY };

    if (islandMinX > islandMaxX || minY > maxY) {
      return defaultSpot;
    }

    const randInt = (min: number, max: number) => Phaser.Math.Between(Math.min(min, max), Math.max(min, max));
    const focusRangeX = Math.max(4, Math.floor((islandMaxX - islandMinX + 1) * 0.22));
    const focusRangeY = Math.max(10, Math.floor((maxY - minY + 1) * 0.2));
    const focusMinX = Phaser.Math.Clamp(defaultSpot.tx - focusRangeX, islandMinX, islandMaxX);
    const focusMaxX = Phaser.Math.Clamp(defaultSpot.tx + focusRangeX, islandMinX, islandMaxX);
    const focusMinY = Phaser.Math.Clamp(defaultSpot.ty - focusRangeY, minY, maxY);
    const focusMaxY = Phaser.Math.Clamp(defaultSpot.ty + focusRangeY, minY, maxY);

    // Prefer castle spots closer to the center-facing side of each island.
    for (let i = 0; i < 140; i++) {
      const tx = randInt(focusMinX, focusMaxX);
      const ty = randInt(focusMinY, focusMaxY);
      if (this.canPlaceBuildingAt('castle', tx, ty, faction)) {
        return { tx, ty };
      }
    }

    for (let i = 0; i < 80; i++) {
      const tx = randInt(islandMinX, islandMaxX);
      const ty = randInt(minY, maxY);
      if (this.canPlaceBuildingAt('castle', tx, ty, faction)) {
        return { tx, ty };
      }
    }

    const centerTx = Phaser.Math.Clamp(defaultSpot.tx, islandMinX, islandMaxX);
    const centerTy = Phaser.Math.Clamp(defaultSpot.ty, minY, maxY);
    const maxRadius = Math.max(islandMaxX - islandMinX, maxY - minY);
    for (let r = 0; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const tx = Phaser.Math.Clamp(centerTx + dx, islandMinX, islandMaxX);
          const ty = Phaser.Math.Clamp(centerTy + dy, minY, maxY);
          if (this.canPlaceBuildingAt('castle', tx, ty, faction)) {
            return { tx, ty };
          }
        }
      }
    }

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = islandMinX; tx <= islandMaxX; tx++) {
        if (this.canPlaceBuildingAt('castle', tx, ty, faction)) {
          return { tx, ty };
        }
      }
    }

    return defaultSpot;
  }

  private spawnStartUnits() {
    const p1PawnOrigin = this.getSpawnOriginForType('pawn', 'p1');
    const p1WarriorOrigin = this.getSpawnOriginForType('warrior', 'p1');
    const p1KnightOrigin = this.getSpawnOriginForType('knight', 'p1');
    const p1SlingerOrigin = this.getSpawnOriginForType('slinger', 'p1');

    // P1 starts with a mixed roster
    this.spawnUnit('pawn', 'blue', p1PawnOrigin.x - 24, p1PawnOrigin.y + 8);
    this.spawnUnit('pawn', 'blue', p1PawnOrigin.x + 24, p1PawnOrigin.y + 8);
    this.spawnUnit('warrior', 'blue', p1WarriorOrigin.x - 16, p1WarriorOrigin.y + 12);
    this.spawnUnit('knight', 'blue', p1KnightOrigin.x - 40, p1KnightOrigin.y + 28);
    this.spawnUnit('slinger', 'blue', p1SlingerOrigin.x + 40, p1SlingerOrigin.y + 28);

    const p2PawnOrigin = this.getSpawnOriginForType('pawn', 'p2');
    const p2WarriorOrigin = this.getSpawnOriginForType('warrior', 'p2');
    const p2KnightOrigin = this.getSpawnOriginForType('knight', 'p2');
    const p2SlingerOrigin = this.getSpawnOriginForType('slinger', 'p2');

    // P2 starts with a mixed roster
    this.spawnUnit('pawn', 'red', p2PawnOrigin.x - 24, p2PawnOrigin.y + 8);
    this.spawnUnit('pawn', 'red', p2PawnOrigin.x + 24, p2PawnOrigin.y + 8);
    this.spawnUnit('warrior', 'red', p2WarriorOrigin.x - 16, p2WarriorOrigin.y + 12);
    this.spawnUnit('knight', 'red', p2KnightOrigin.x - 40, p2KnightOrigin.y + 28);
    this.spawnUnit('slinger', 'red', p2SlingerOrigin.x + 40, p2SlingerOrigin.y + 28);
  }

  // ── Unit / Building factories ────────────────────────────────────────────────
  spawnUnit(type: UnitType, faction: Faction, x: number, y: number): Unit {
    const spawnPos = this.findSafeSpawnPoint(faction, x, y);
    const unit = new Unit(this, spawnPos.x, spawnPos.y, type, faction);
    unit.setRoutePlanner((fromX, fromY, toX, toY) => this.findPath(fromX, fromY, toX, toY));
    const rKey: 'p1' | 'p2' = faction === 'blue' ? 'p1' : 'p2';
    unit.onKill = () => this.resourceSystem.addResources(rKey, 15, 0);
    if (faction === 'blue') {
      this.p1Units.push(unit);
    } else {
      this.p2Units.push(unit);
    }
    return unit;
  }

  private findSafeSpawnPoint(_faction: Faction, desiredX: number, desiredY: number) {
    const minX = 5;
    const maxX = MAP_COLS - 6;
    const minY = 2;
    const maxY = MAP_ROWS - 3;

    const desiredTile = this.worldToTile(desiredX, desiredY);
    const baseTx = Phaser.Math.Clamp(desiredTile.tx, minX, maxX);
    const baseTy = Phaser.Math.Clamp(desiredTile.ty, minY, maxY);

    const isSafe = (tx: number, ty: number) => {
      if (tx < minX || tx > maxX || ty < minY || ty > maxY) return false;
      if (this.occupiedTiles.has(`${tx},${ty}`)) return false;
      const cell = this.getTerrainCell(tx, ty);
      return !!cell && cell.walkable && !cell.water;
    };

    for (let i = 0; i < 32; i++) {
      const tx = Phaser.Math.Clamp(baseTx + Phaser.Math.Between(-3, 3), minX, maxX);
      const ty = Phaser.Math.Clamp(baseTy + Phaser.Math.Between(-3, 3), minY, maxY);
      if (!isSafe(tx, ty)) continue;
      const world = this.tileToWorld(tx, ty);
      return {
        x: world.x + Phaser.Math.Between(-10, 10),
        y: world.y + Phaser.Math.Between(-10, 10),
      };
    }

    if (isSafe(baseTx, baseTy)) {
      return this.tileToWorld(baseTx, baseTy);
    }

    const near = this.findNearestWalkableTile(baseTx, baseTy);
    const nearTx = Phaser.Math.Clamp(near.tx, minX, maxX);
    const nearTy = Phaser.Math.Clamp(near.ty, minY, maxY);
    if (isSafe(nearTx, nearTy)) {
      return this.tileToWorld(nearTx, nearTy);
    }

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (isSafe(tx, ty)) {
          return this.tileToWorld(tx, ty);
        }
      }
    }

    return this.tileToWorld(baseTx, baseTy);
  }

  placeBuilding(type: BuildingType, faction: Faction, tx: number, ty: number): Building | null {
    const cfg = BUILDING_CONFIGS[type];
    if (!this.canPlaceBuildingAt(type, tx, ty, faction)) return null;
    for (let dtx = 0; dtx < cfg.width; dtx++) {
      for (let dty = 0; dty < cfg.height; dty++) {
        this.occupiedTiles.add(`${tx + dtx},${ty + dty}`);
      }
    }

    const building = new Building(this, tx, ty, type, faction);
    if (faction === 'blue') {
      this.p1Buildings.push(building);
    } else {
      this.p2Buildings.push(building);
    }
    return building;
  }

  // ── Train queue ─────────────────────────────────────────────────────────────
  private isProductionLocked() {
    return this.gameOver;
  }

  private clearAndRefundPlayerTrainQueue() {
    if (this.trainQueue.length === 0) {
      this.emitTrainQueueUpdate();
      return;
    }

    let refundGold = 0;
    for (const queued of this.trainQueue) {
      refundGold += UNIT_CONFIGS[queued.type].goldCost;
    }

    this.trainQueue = [];
    if (refundGold > 0) {
      this.resourceSystem.addResources('p1', refundGold, 0);
      this.emitResourcesIfChanged(true);
    }

    this.emitTrainQueueUpdate(true);
  }

  enqueueUnit(type: UnitType) {
    if (this.isProductionLocked()) return;
    if (this.trainQueue.length >= TRAIN_QUEUE_MAX) return;
    // Population cap check — queued units count as reserved pop
    if (this.getAliveUnitCount('p1') >= this.getPopCap('p1')) return;
    // Slinger (Scout) is expensive and limited to 3 per game
    if (type === 'slinger') {
      const alive  = this.p1Units.filter(u => u.isAlive() && u.state.type === 'slinger').length;
      const queued = this.trainQueue.filter(q => q.type === 'slinger').length;
      if (alive + queued >= 3) return;
    }
    const requiredBuilding = this.getRequiredBuildingForUnit(type);
    if (requiredBuilding) {
      const hasProducer = this.p1Buildings.some((b) => b.type === requiredBuilding && !b.isDestroyed);
      if (!hasProducer) return;
    }
    const cfg = UNIT_CONFIGS[type];
    if (!this.resourceSystem.spend('p1', cfg.goldCost)) return;

    this.trainQueue.push({
      type,
      timeRemaining: cfg.trainTime,
      totalTime: cfg.trainTime,
    });
    this.emitTrainQueueUpdate(true);
  }

  private emitTrainQueueUpdate(force = false) {
    let cumulativeRemaining = 0;
    const snapshot: TrainQueueDisplayItem[] = this.trainQueue.map((item, index) => {
      cumulativeRemaining += index === 0 ? item.timeRemaining : item.totalTime;
      return {
        type: item.type,
        remainingMs: Math.max(0, cumulativeRemaining),
        active: index === 0,
      };
    });

    const hash = snapshot.map((item) => `${item.type}:${Math.floor(item.remainingMs / 100)}:${item.active ? 1 : 0}`).join('|');
    if (!force && hash === this.lastQueueUiHash) return;
    this.lastQueueUiHash = hash;
    this.callbacks.onTrainQueueUpdate(snapshot);
  }

  cancelQueuedUnit(index: number) {
    if (this.isProductionLocked()) return;
    if (index < 0 || index >= this.trainQueue.length) return;

    const [removed] = this.trainQueue.splice(index, 1);
    if (!removed) return;

    const cfg = UNIT_CONFIGS[removed.type];
    this.resourceSystem.addResources('p1', cfg.goldCost, 0);
    this.emitResourcesIfChanged(true);
    this.emitTrainQueueUpdate(true);
  }

  private emitResourcesIfChanged(force = false) {
    const gold = Math.floor(this.resourceSystem.p1.gold);
    const wood = Math.floor(this.resourceSystem.p1.wood);
    if (!force && gold === this.lastHudGold && wood === this.lastHudWood) return;
    this.lastHudGold = gold;
    this.lastHudWood = wood;
    this.callbacks.onResourcesUpdate(gold, wood);
  }

  private emitTimerIfNeeded(remaining: number, deltaMs: number, force = false) {
    this.hudTimerEmitMs += deltaMs;
    const wholeSecond = Math.max(0, Math.ceil(remaining));
    if (!force && this.hudTimerEmitMs < 120 && wholeSecond === this.lastTimerSecond) return;

    this.hudTimerEmitMs = 0;
    this.lastTimerSecond = wholeSecond;
    this.callbacks.onTimerUpdate(Math.max(0, remaining));
  }

  enterBuildMode(type: BuildingType) {
    if (this.isProductionLocked()) return;
    this.buildMode = type;
    this.input.setDefaultCursor('crosshair');
  }

  cancelBuildMode() {
    this.buildMode = null;
    this.buildGhost?.destroy();
    this.buildGhost = null;
    this.buildFootprintGhost?.destroy();
    this.buildFootprintGhost = null;
    this.input.setDefaultCursor('default');
  }

  private isPointerFromGameCanvas(ptr: Phaser.Input.Pointer) {
    const target = ptr.event?.target;
    if (!(target instanceof Node)) return true;
    return this.game.canvas.contains(target);
  }

  private isPointerDownFromGameCanvas(ptr: Phaser.Input.Pointer) {
    const downElement = ptr.downElement;
    if (!(downElement instanceof Node)) return true;
    return this.game.canvas.contains(downElement);
  }

  // ── Camera setup ────────────────────────────────────────────────────────────
  private setupCamera() {
    const cam = this.cameras.main;
    const worldW = MAP_COLS * TILE_SIZE;
    const worldH = MAP_ROWS * TILE_SIZE;
    const fitZoom = Math.min(cam.width / worldW, cam.height / worldH);
    const overviewZoom = Phaser.Math.Clamp(fitZoom * 0.95, this.minZoom, this.maxZoom);

    cam.setBounds(0, 0, worldW, worldH);
    // Start from a full-map overview, then intro pan moves to the player's castle.
    cam.centerOn(worldW * 0.5, worldH * 0.5);
    cam.setZoom(overviewZoom);
  }

  private playIntroCameraPan() {
    const cam = this.cameras.main;
    const castleFocus = this.getPlayerCastleFocusPoint();
    const isTouchDevice = this.sys.game.device.input.touch;
    const introZoom = isTouchDevice ? 0.55 : 0.55;
    const introDuration = isTouchDevice ? 1850 : 2300;
    const introDelay = 140;
    this.introCameraActive = true;
    this.input.enabled = false;
    this.introUnlockEvent?.remove(false);
    this.introUnlockEvent = this.time.delayedCall(introDelay + introDuration + 40, () => {
      this.introCameraActive = false;
      this.input.enabled = true;
      this.introUnlockEvent = null;
    });
    this.time.delayedCall(introDelay, () => {
      cam.pan(castleFocus.x, castleFocus.y, introDuration, 'Sine.easeInOut', true, (_camera, progress) => {
        if (progress >= 1) {
          this.introCameraActive = false;
          this.input.enabled = true;
          this.introUnlockEvent?.remove(false);
          this.introUnlockEvent = null;
        }
      });
      cam.zoomTo(introZoom, introDuration, 'Sine.easeInOut', true);
    });
  }

  private getPlayerCastleFocusPoint() {
    const worldW = MAP_COLS * TILE_SIZE;
    const worldH = MAP_ROWS * TILE_SIZE;
    const castle = this.p1Buildings.find((b) => b.type === 'castle' && !b.isDestroyed);
    const rawX = castle ? castle.wx : this.p1SpawnPoint.x;
    const rawY = castle ? castle.wy + TILE_SIZE * 0.35 : this.p1SpawnPoint.y - TILE_SIZE * 0.4;

    return {
      x: Phaser.Math.Clamp(rawX, TILE_SIZE, worldW - TILE_SIZE),
      y: Phaser.Math.Clamp(rawY, TILE_SIZE, worldH - TILE_SIZE),
    };
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  private setupInput() {
    const cam = this.cameras.main;
    this.input.addPointer(2);
    const keyboard = this.input.keyboard;

    // WASD / arrow key camera pan
    keyboard?.on('keydown-A', () => { this.registry.set('panLeft', true); });
    keyboard?.on('keyup-A',   () => { this.registry.set('panLeft', false); });
    keyboard?.on('keydown-LEFT', () => { this.registry.set('panLeft', true); });
    keyboard?.on('keyup-LEFT',   () => { this.registry.set('panLeft', false); });
    keyboard?.on('keydown-D', () => { this.registry.set('panRight', true); });
    keyboard?.on('keyup-D',   () => { this.registry.set('panRight', false); });
    keyboard?.on('keydown-RIGHT', () => { this.registry.set('panRight', true); });
    keyboard?.on('keyup-RIGHT',   () => { this.registry.set('panRight', false); });
    keyboard?.on('keydown-W', () => { this.registry.set('panUp', true); });
    keyboard?.on('keyup-W',   () => { this.registry.set('panUp', false); });
    keyboard?.on('keydown-UP', () => { this.registry.set('panUp', true); });
    keyboard?.on('keyup-UP',   () => { this.registry.set('panUp', false); });
    keyboard?.on('keydown-S', () => { this.registry.set('panDown', true); });
    keyboard?.on('keyup-S',   () => { this.registry.set('panDown', false); });
    keyboard?.on('keydown-DOWN', () => { this.registry.set('panDown', true); });
    keyboard?.on('keyup-DOWN',   () => { this.registry.set('panDown', false); });

    // Escape cancels build mode
    keyboard?.on('keydown-ESC', () => this.cancelBuildMode());

    // Mouse click for building placement and unit commands
    const isTouchDevice = this.sys.game.device.input.touch;
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.introCameraActive) return;
      if (!this.isPointerFromGameCanvas(ptr)) return;

      if (isTouchDevice && !this.buildMode) {
        const now = this.time.now;
        if (now - this.lastTapMs < 280) {
          this.resetCameraView();
        }
        this.lastTapMs = now;
      }

      if (this.buildMode && ptr.rightButtonDown()) {
        this.cancelBuildMode();
        return;
      }

      const wx = ptr.worldX;
      const wy = ptr.worldY;

      if (this.buildMode) {
        if (this.isProductionLocked()) {
          this.cancelBuildMode();
          return;
        }

        let placed = false;
        const tx = Math.floor(wx / TILE_SIZE);
        const ty = Math.floor(wy / TILE_SIZE);
        // Must be within safe map bounds
        if (tx >= 5 && tx <= MAP_COLS - 6 && ty >= 5 && ty <= MAP_ROWS - 6) {
          const cfg = BUILDING_CONFIGS[this.buildMode];
          if (this.resourceSystem.canAfford('p1', 0, cfg.woodCost)) {
            const built = this.placeBuilding(this.buildMode, 'blue', tx, ty);
            if (built) {
              this.resourceSystem.spend('p1', 0, cfg.woodCost);
              placed = true;
            }
          }
        }

        // Keep build mode active for continuous placement while affordable.
        if (placed) {
          const activeType = this.buildMode;
          if (!activeType || !this.resourceSystem.canAfford('p1', 0, BUILDING_CONFIGS[activeType].woodCost)) {
            this.cancelBuildMode();
          }
        }

        return;
      }
    });

    // Mouse move for build ghost
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.isPointerFromGameCanvas(ptr)) return;

      if (!this.buildMode) {
        this.buildGhost?.destroy();
        this.buildGhost = null;
        this.buildFootprintGhost?.destroy();
        this.buildFootprintGhost = null;
        return;
      }
      const tx = Math.floor(ptr.worldX / TILE_SIZE);
      const ty = Math.floor(ptr.worldY / TILE_SIZE);
      const cfg = BUILDING_CONFIGS[this.buildMode];
      const wx = (tx + cfg.width / 2) * TILE_SIZE;
      const wy = (ty + cfg.height / 2) * TILE_SIZE;
      const fac = 'blue';
      const key = `building_${this.buildMode.charAt(0).toUpperCase() + this.buildMode.slice(1)}_Blue`;

      if (!this.buildGhost) {
        this.buildGhost = this.add.image(wx, wy, key);
        this.buildGhost.setDepth(99);
        this.buildGhost.setScale(0.5);
        this.buildGhost.setAlpha(0.6);
      } else {
        this.buildGhost.setPosition(wx, wy);
        this.buildGhost.setTexture(this.textures.exists(key) ? key : 'ui_btn_blue');
      }

      const canPlace = this.canPlaceBuildingAt(this.buildMode, tx, ty, 'blue');
      this.buildGhost.setTint(canPlace ? 0x88ff88 : 0xff4444);

      if (!this.buildFootprintGhost) {
        this.buildFootprintGhost = this.add.graphics();
        this.buildFootprintGhost.setDepth(98);
      }
      this.drawBuildFootprint(tx, ty, cfg.width, cfg.height, canPlace);
    });

    // Scroll to zoom
    this.input.on('wheel', (_ptr: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      if (!this.isPointerFromGameCanvas(_ptr)) return;
      const before = cam.getWorldPoint(_ptr.x, _ptr.y);
      const newZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, this.minZoom, this.maxZoom);
      cam.setZoom(newZoom);
      const after = cam.getWorldPoint(_ptr.x, _ptr.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    keyboard?.on('keydown-EQUALS', () => this.zoomCameraBy(0.08));
    keyboard?.on('keydown-NUMPAD_ADD', () => this.zoomCameraBy(0.08));
    keyboard?.on('keydown-MINUS', () => this.zoomCameraBy(-0.08));
    keyboard?.on('keydown-NUMPAD_SUBTRACT', () => this.zoomCameraBy(-0.08));
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  update(time: number, delta: number) {
    if (this.gameOver) return;

    const stableDelta = Phaser.Math.Clamp(delta, 0, this.maxDeltaMs);
    const dt = stableDelta / 1000;
    this.elapsedSecs += dt;

    // Camera pan
    this.handleCameraPan(stableDelta);

    // Fog of war
    this.fogSystem?.update(stableDelta, this.p1Units, this.p1Buildings, this.cameras.main);

    // Hide enemy units/buildings that are inside fog; reveal them when visible
    if (this.fogSystem) {
      for (const u of this.p2Units) {
        const vis = this.fogSystem.isTileVisible(u.state.x, u.state.y);
        u.sprite.setVisible(vis);
        u.shadow.setVisible(vis);
        u.hpBar.setVisible(vis);
      }
      for (const b of this.p2Buildings) {
        if (b.isDestroyed) continue;
        const vis = this.fogSystem.isTileVisible(b.wx, b.wy);
        b.sprite.setVisible(vis);
        b.hpBar.setVisible(vis);
      }
    }

    // Game timer
    const remaining = GAME_DURATION_SECS - this.elapsedSecs;

    // Resources
    this.resourceSystem.update(stableDelta);
    this.emitResourcesIfChanged();

    // Timer callback
    this.emitTimerIfNeeded(remaining, stableDelta);

    // Civilian unit behavior (workers and monks)
    this.updateCivilianJobs(stableDelta);

    // Scout (slinger) auto-explore and enemy discovery reports
    this.updatePlayerScouts(stableDelta);

    // Train queue
    if (this.trainQueue.length > 0) {
      const first = this.trainQueue[0];
      first.timeRemaining -= stableDelta;
      if (first.timeRemaining <= 0) {
        this.trainQueue.shift();
        const spawnOrigin = this.getSpawnOriginForType(first.type, 'p1');
        this.spawnUnit(first.type, 'blue', spawnOrigin.x, spawnOrigin.y);
        this.trainQueueEmitMs = 0;
        this.emitTrainQueueUpdate(true);
      } else {
        this.trainQueueEmitMs += stableDelta;
        if (this.trainQueueEmitMs >= 150) {
          this.trainQueueEmitMs = 0;
          this.emitTrainQueueUpdate();
        }
      }
    } else {
      this.trainQueueEmitMs = 0;
    }

    // House/workshop passive economy income
    this.houseGoldMs += stableDelta;
    if (this.houseGoldMs >= 5000) {
      this.houseGoldMs = 0;
      const p1Houses = this.p1Buildings.filter(b => b.type === 'house' && !b.isDestroyed).length;
      const p2Houses = this.p2Buildings.filter(b => b.type === 'house' && !b.isDestroyed).length;
      const p1Workshops = this.p1Buildings.filter(b => b.type === 'workshop' && !b.isDestroyed).length;
      const p2Workshops = this.p2Buildings.filter(b => b.type === 'workshop' && !b.isDestroyed).length;
      if (p1Houses > 0) this.resourceSystem.addResources('p1', p1Houses * 2, 0);
      if (p2Houses > 0) this.resourceSystem.addResources('p2', p2Houses * 2, 0);
      if (p1Workshops > 0) this.resourceSystem.addResources('p1', 0, p1Workshops * 2);
      if (p2Workshops > 0) this.resourceSystem.addResources('p2', 0, p2Workshops * 2);
      this.emitResourcesIfChanged();
    }
    // Bot AI
    this.aiSystem.update(stableDelta);
    // Flush any player commands queued by the HUD (future multiplayer hook)
    this.commandSystem.flush();

    // Core frame simulation
    for (const u of this.p1Units) u.update(stableDelta);
    for (const u of this.p2Units) u.update(stableDelta);
    this.separateUnits(stableDelta);
    for (const b of this.p1Buildings) b.update(stableDelta, this.p2Units);
    for (const b of this.p2Buildings) b.update(stableDelta, this.p1Units);
    // Throttled combat decisions (80 ms)
    this.combatThrottleMs += stableDelta;
    if (this.combatThrottleMs >= 80) {
      this.combatThrottleMs = 0;
      this.combatSystem.update(this.p1Units, this.p2Units, this.p1Buildings, this.p2Buildings);
    }

    // Throttled dead-unit pruning (250 ms)
    this.pruneThrottleMs += stableDelta;
    if (this.pruneThrottleMs >= 250) {
      this.pruneThrottleMs = 0;
      this.pruneDeadUnits();
    }

    // Win condition
    this.checkWinCondition(remaining);
  }

  private handleCameraPan(delta: number) {
    const cam = this.cameras.main;
    const ptr = this.input.activePointer;
    const dt = delta / 1000;
    const isTouchDevice = this.sys.game.device.input.touch;
    const speedX = 760 / cam.zoom;
    const speedY = 520 / cam.zoom;
    const smoothing = Phaser.Math.Clamp(dt * 12, 0.1, 0.28);

    let targetVX =
      (this.registry.get('panRight') ? speedX : 0) -
      (this.registry.get('panLeft') ? speedX : 0);
    let targetVY =
      (this.registry.get('panDown') ? speedY : 0) -
      (this.registry.get('panUp') ? speedY : 0);

    if (this.introCameraActive) {
      this.pinchDistanceLast = null;
      this.pinchMidLastX = null;
      this.pinchMidLastY = null;
      this.dragTracking = false;
      this.dragInertia.set(0, 0);
      return;
    }

    const pointer1 = this.input.pointer1;
    const pointer2 = this.input.pointer2;
    const mousePtr = this.input.mousePointer;
    const p1Down = pointer1.isDown && this.isPointerDownFromGameCanvas(pointer1);
    const p2Down = pointer2.isDown && this.isPointerDownFromGameCanvas(pointer2);
    // On desktop the mouse pointer is separate from pointer1 (which is a touch slot).
    // Use mousePtr for drag so left/middle/right click all work as pan on PC.
    const dragPtr = isTouchDevice ? pointer1 : mousePtr;
    const dragDown = dragPtr.isDown && this.isPointerDownFromGameCanvas(dragPtr);

    // Edge pan removed — camera moves only via drag/keyboard on desktop.

    this.cameraVelocity.x = Phaser.Math.Linear(this.cameraVelocity.x, targetVX, smoothing);
    this.cameraVelocity.y = Phaser.Math.Linear(this.cameraVelocity.y, targetVY, smoothing);

    if (p1Down && p2Down) {
      // ── Two-finger pinch-to-zoom + pan ───────────────────────────────
      this.dragTracking = false;
      this.dragInertia.set(0, 0);

      const distance = Phaser.Math.Distance.Between(pointer1.x, pointer1.y, pointer2.x, pointer2.y);
      if (this.pinchDistanceLast !== null) {
        const zoomDelta = (distance - this.pinchDistanceLast) * 0.004;
        const targetZoom = Phaser.Math.Clamp(cam.zoom + zoomDelta, this.minZoom, this.maxZoom);
        cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, 0.9));
      }
      this.pinchDistanceLast = distance;

      const midX = (pointer1.x + pointer2.x) * 0.5;
      const midY = (pointer1.y + pointer2.y) * 0.5;
      if (this.pinchMidLastX !== null && this.pinchMidLastY !== null) {
        const midDx = midX - this.pinchMidLastX;
        const midDy = midY - this.pinchMidLastY;
        cam.scrollX -= midDx / cam.zoom;
        cam.scrollY -= midDy / cam.zoom;
      }
      this.pinchMidLastX = midX;
      this.pinchMidLastY = midY;
    } else {
      this.pinchDistanceLast = null;
      this.pinchMidLastX = null;
      this.pinchMidLastY = null;

      if (!this.buildMode && dragDown) {
        if (this.dragTracking) {
          const rawDx = dragPtr.x - this.dragLastX;
          const rawDy = dragPtr.y - this.dragLastY;
          // Direct scroll — feels like grabbing the map
          cam.scrollX -= rawDx / cam.zoom;
          cam.scrollY -= rawDy / cam.zoom;
          // Record velocity for momentum after release (pixels/sec in world space)
          const velX = (-rawDx / cam.zoom) / Math.max(dt, 0.008);
          const velY = (-rawDy / cam.zoom) / Math.max(dt, 0.008);
          this.dragInertia.x = Phaser.Math.Linear(this.dragInertia.x, velX, 0.55);
          this.dragInertia.y = Phaser.Math.Linear(this.dragInertia.y, velY, 0.55);
        } else {
          this.dragInertia.set(0, 0);
        }
        this.dragLastX = dragPtr.x;
        this.dragLastY = dragPtr.y;
        this.dragTracking = true;
      } else {
        this.dragTracking = false;
        // Momentum decay — friction-based (feels like sliding on glass)
        const friction = isTouchDevice ? 0.88 : 0.78;
        this.dragInertia.x *= friction;
        this.dragInertia.y *= friction;
        if (Math.abs(this.dragInertia.x) < 2 && Math.abs(this.dragInertia.y) < 2) {
          this.dragInertia.set(0, 0);
        } else {
          cam.scrollX += this.dragInertia.x * dt;
          cam.scrollY += this.dragInertia.y * dt;
        }
      }
    }

    // Keyboard / edge velocity (desktop only path)
    cam.scrollX += this.cameraVelocity.x * dt;
    cam.scrollY += this.cameraVelocity.y * dt;

  }

  public moveCameraBy(deltaX: number, deltaY: number) {
    const cam = this.cameras.main;
    cam.scrollX += deltaX / cam.zoom;
    cam.scrollY += deltaY / cam.zoom;
  }

  public zoomCameraBy(step: number) {
    const cam = this.cameras.main;
    cam.setZoom(Phaser.Math.Clamp(cam.zoom + step, this.minZoom, this.maxZoom));
  }

  public resetCameraView() {
    const cam = this.cameras.main;
    const isTouchDevice = this.sys.game.device.input.touch;
    const castleFocus = this.getPlayerCastleFocusPoint();
    const gameplayZoom = isTouchDevice ? 0.55 : 0.55;
    this.pinchDistanceLast = null;
    this.pinchMidLastX = null;
    this.pinchMidLastY = null;
    this.dragInertia.set(0, 0);
    this.dragTracking = false;
    cam.centerOn(castleFocus.x, castleFocus.y);
    cam.setZoom(gameplayZoom);
  }

  private updateCivilianJobs(delta: number) {
    this.civilianThinkMs += delta;
    if (this.civilianThinkMs < 140) return;
    this.civilianThinkMs = 0;

    this.updatePawnWorkers(this.p1Units, this.p1Resources, 'p1');
    this.updatePawnWorkers(this.p2Units, this.p2Resources, 'p2');
    this.updateBattleSupport(this.p1Units, this.p2Units, 'blue');
    this.updateBattleSupport(this.p2Units, this.p1Units, 'red');
    this.updateMonkSupport(this.p1Units, 5, MAP_COLS - 6);
    this.updateMonkSupport(this.p2Units, 5, MAP_COLS - 6);
    this.updateGuardPatrols(this.p1Units, this.p1Buildings, 5, MAP_COLS - 6);
    this.updateGuardPatrols(this.p2Units, this.p2Buildings, 5, MAP_COLS - 6);
  }

  private updateBattleSupport(units: Unit[], enemies: Unit[], faction: Faction) {
    for (const unit of units) {
      if (!unit.isAlive()) continue;
      // Only re-path units that have finished their current movement
      if (unit.state.state !== 'idle') continue;

      if (unit.state.type === 'monk') {
        const injured = this.findMostInjuredAlly(unit, units);
        if (injured) {
          const offsetX = faction === 'blue' ? -TILE_SIZE * 0.7 : TILE_SIZE * 0.7;
          unit.moveTo(injured.state.x + offsetX, injured.state.y);
        }
        continue;
      }

      if (unit.state.type === 'archer' || unit.state.type === 'slinger') {
        const nearestEnemy = this.findNearestEnemyUnit(unit, enemies);
        if (nearestEnemy) {
          const dx = nearestEnemy.state.x - unit.state.x;
          const dy = nearestEnemy.state.y - unit.state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const preferredRange = UNIT_CONFIGS[unit.state.type].range * 0.82;
          if (dist > preferredRange) {
            const nx = dist > 0 ? dx / dist : 0;
            const ny = dist > 0 ? dy / dist : 0;
            const targetX = nearestEnemy.state.x - nx * preferredRange;
            const targetY = nearestEnemy.state.y - ny * preferredRange;
            unit.moveTo(targetX, targetY);
          }
        }
      }
    }
  }

  private findNearestEnemyUnit(unit: Unit, enemies: Unit[]) {
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const enemy of enemies) {
      if (!enemy.isAlive()) continue;
      const dx = enemy.state.x - unit.state.x;
      const dy = enemy.state.y - unit.state.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDist) {
        bestDist = distSq;
        best = enemy;
      }
    }
    return best;
  }

  private updatePawnWorkers(units: Unit[], nodes: ResourceNode[], faction: 'p1' | 'p2') {
    const now = this.time.now;
    const res = faction === 'p1' ? this.resourceSystem.p1 : this.resourceSystem.p2;

    // 1 pawn per tree so each works a different one; 2 per mine
    const MAX_PER_TREE       = 1;
    const MAX_PER_MINE       = 2;
    const TREE_NODE_COOLDOWN = 1800; // ms between chops
    const MINE_NODE_COOLDOWN = 2500;
    const PAWN_ANIM_COOLDOWN = 900;  // ms between swing animations
    const STUCK_MS           = 4500; // abort a pawn that's been moving too long

    // Faction-local ID set so crowd counts don't bleed across factions
    const factionIds = new Set(units.map(u => u.state.id));

    for (const u of units) {
      if (!u.isAlive() || u.state.type !== 'pawn') continue;
      if (u.state.state === 'dead') continue;

      // ── Resolve current node assignment ──────────────────────────────
      let assigned = this.pawnNodeAssignment.get(u.state.id) ?? null;

      // Drop assignment if node was depleted
      if (assigned && !assigned.active) {
        this.pawnNodeAssignment.delete(u.state.id);
        this.pawnMoveStartMs.delete(u.state.id);
        assigned = null;
      }

      // Stuck detection: pawn has been walking toward gather point too long
      if (assigned && u.state.state === 'moving') {
        const moveStart = this.pawnMoveStartMs.get(u.state.id);
        if (moveStart === undefined) {
          this.pawnMoveStartMs.set(u.state.id, now);
        } else if (now - moveStart > STUCK_MS) {
          // Release and let pawn idle-reassign next tick
          this.pawnNodeAssignment.delete(u.state.id);
          this.pawnMoveStartMs.delete(u.state.id);
          u.setPath([]);
          u.state.state = 'idle';
          assigned = null;
        }
      }

      // Assign a new node when idle
      if (!assigned && u.state.state === 'idle') {
        const preferredType: 'tree' | 'goldmine' = res.wood <= res.gold ? 'tree' : 'goldmine';

        // Count only same-faction assignments to avoid cross-faction interference
        const crowd = new Map<ResourceNode, number>();
        for (const [id, n] of this.pawnNodeAssignment) {
          if (factionIds.has(id)) crowd.set(n, (crowd.get(n) ?? 0) + 1);
        }

        if (preferredType === 'tree' || res.wood < res.gold) {
          assigned =
            this.findLeastCrowdedNode(u, nodes, 'tree', crowd, MAX_PER_TREE) ??
            this.findLeastCrowdedNode(u, nodes, 'goldmine', crowd, MAX_PER_MINE);
        } else {
          assigned =
            this.findLeastCrowdedNode(u, nodes, 'goldmine', crowd, MAX_PER_MINE) ??
            this.findLeastCrowdedNode(u, nodes, 'tree', crowd, MAX_PER_TREE);
        }

        if (assigned) {
          this.pawnNodeAssignment.set(u.state.id, assigned);
          this.pawnMoveStartMs.set(u.state.id, now);
        }
      }

      if (!assigned) continue;

      // ── Walk toward the node center (the tile itself is always walkable) ──
      // Using the node's own world position guarantees BFS never fails on
      // an adjacent tile that might be blocked. Harvest triggers once the
      // pawn is within ~1 tile of the node center.
      const gatherX = assigned.wx;
      const gatherY = assigned.wy;

      const dx = gatherX - u.state.x;
      const dy = gatherY - u.state.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > TILE_SIZE * 1.1) {
        // Only issue moveTo when idle — never interrupt an in-progress walk
        if (u.state.state === 'idle') {
          u.moveTo(gatherX, gatherY);
          this.pawnMoveStartMs.set(u.state.id, now);
        }
        continue;
      }

      // Arrived — clear stuck clock
      this.pawnMoveStartMs.delete(u.state.id);

      // ── Personal animation cooldown (pawn keeps swinging) ─────────────
      const lastPawnSwing = this.workerGatherMs.get(u.state.id) ?? 0;
      if (now - lastPawnSwing < PAWN_ANIM_COOLDOWN) continue;
      this.workerGatherMs.set(u.state.id, now);
      u.playAnim('attack');

      // ── Node extraction cooldown (actual resource gain) ────────────────
      const nodeCooldown = assigned.type === 'tree' ? TREE_NODE_COOLDOWN : MINE_NODE_COOLDOWN;
      const lastNodeHit  = this.nodeHarvestMs.get(assigned) ?? 0;
      if (now - lastNodeHit < nodeCooldown) continue;

      // ── Harvest! ──────────────────────────────────────────────────────
      this.nodeHarvestMs.set(assigned, now);
      const depleted = assigned.harvest();

      if (assigned.type === 'tree') {
        this.resourceSystem.addResources(faction, 0, 8);
        this.spawnResourceText(u.state.x, u.state.y - 28, '+8 wood', '#8bff99');
        if (depleted) {
          this.spawnResourceText(assigned.wx, assigned.wy - 48, 'Tree cleared!', '#dfffe0');
          this.nodeHarvestMs.delete(assigned);
          for (const [pid, n] of this.pawnNodeAssignment) {
            if (n === assigned) {
              this.pawnNodeAssignment.delete(pid);
              this.pawnMoveStartMs.delete(pid);
            }
          }
        }
      } else {
        this.resourceSystem.addResources(faction, 10, 0);
        this.spawnResourceText(u.state.x, u.state.y - 28, '+10 gold', '#ffd166');
        if (depleted) {
          this.spawnResourceText(assigned.wx, assigned.wy - 48, 'Mine exhausted!', '#ffe066');
          this.nodeHarvestMs.delete(assigned);
          for (const [pid, n] of this.pawnNodeAssignment) {
            if (n === assigned) {
              this.pawnNodeAssignment.delete(pid);
              this.pawnMoveStartMs.delete(pid);
            }
          }
        }
      }
    }
  }

  /**
   * Returns the active node of the given type that already has the MOST pawns assigned,
   * so all pawns converge on the same node before starting a new one.
   * Falls back to any available node when none are currently worked.
   */
  private findMostActiveNode(
    nodes: ResourceNode[],
    type: 'tree' | 'goldmine',
    crowding: Map<ResourceNode, number>,
    maxCrowd: number,
  ): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestCount = -1;
    for (const n of nodes) {
      if (!n.active || n.type !== type) continue;
      const cnt = crowding.get(n) ?? 0;
      if (cnt >= maxCrowd) continue;
      if (cnt > bestCount) { bestCount = cnt; best = n; }
    }
    return best;
  }

  /**
   * Returns the active node of the given type that has fewest pawns and is closest.
   * Hard-skips nodes already at or above `maxCrowd`.
   */
  private findLeastCrowdedNode(
    unit: Unit,
    nodes: ResourceNode[],
    preferred: 'tree' | 'goldmine' | undefined,
    crowding: Map<ResourceNode, number>,
    maxCrowd = Infinity,
  ): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestScore = Infinity;
    for (const n of nodes) {
      if (!n.active) continue;
      if (preferred !== undefined && n.type !== preferred) continue;
      const crowd = crowding.get(n) ?? 0;
      if (crowd >= maxCrowd) continue;          // node is full — skip
      const ddx = n.wx - unit.state.x;
      const ddy = n.wy - unit.state.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      const score = dist + crowd * 300;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  private updateGuardPatrols(units: Unit[], buildings: Building[], minTx: number, maxTx: number) {
    const now = this.time.now;
    const livingBuildings = buildings.filter((building) => !building.isDestroyed);
    const castle = livingBuildings.find((building) => building.type === 'castle') ?? livingBuildings[0] ?? null;

    for (const unit of units) {
      if (!unit.isAlive()) continue;
      if (unit.state.type === 'pawn' || unit.state.type === 'monk') continue;
      if (unit.state.state !== 'idle') continue;

      const lastPatrol = this.idlePatrolMs.get(unit.state.id) ?? 0;
      const patrolInterval = unit.state.type === 'archer' ? 6200 : 5200;
      if (now - lastPatrol < patrolInterval) continue;

      const guardBaseX = castle ? castle.wx : (minTx + maxTx + 1) * 0.5 * TILE_SIZE;
      const guardBaseY = castle ? castle.wy : MAP_ROWS * 0.5 * TILE_SIZE;
      const forwardBias = unit.state.faction === 'blue' ? 1 : -1;
      const roamTiles = unit.state.type === 'archer' ? 3 : 4;
      const tx = Phaser.Math.Clamp(
        Math.floor(guardBaseX / TILE_SIZE) + Phaser.Math.Between(-roamTiles, roamTiles) + forwardBias,
        minTx,
        maxTx,
      );
      const ty = Phaser.Math.Clamp(
        Math.floor(guardBaseY / TILE_SIZE) + Phaser.Math.Between(-3, 3),
        2,
        MAP_ROWS - 3,
      );
      const destination = this.findNearestWalkableTile(tx, ty);
      const world = this.tileToWorld(destination.tx, destination.ty);
      const guardTarget = this.findSpacedCivilianTarget(units, unit, world.x, world.y, 20, TILE_SIZE * 1.35);
      if (!guardTarget) continue;
      if (Phaser.Math.Distance.Between(unit.state.x, unit.state.y, guardTarget.x, guardTarget.y) < TILE_SIZE * 1.35) continue;

      this.idlePatrolMs.set(unit.state.id, now);
      unit.moveTo(guardTarget.x, guardTarget.y);
    }
  }

  /**
   * Auto-explore behavior for player Scout (slinger) units:
   * - When idle, move toward the next pre-planned waypoint in enemy territory
   * - Check for enemy buildings within scout range; fire onScoutReport the first time one is found
   * Scouts spread across 3 paths (north/center/south) depending on unit slot.
   */
  private updatePlayerScouts(delta: number) {
    this.scoutUpdateMs += delta;
    if (this.scoutUpdateMs < 450) return;
    this.scoutUpdateMs = 0;

    const scouts = this.p1Units.filter(u => u.isAlive() && u.state.type === 'slinger');
    if (scouts.length === 0) return;

    // Three exploration lanes across the map, progressing toward enemy territory (right side for P1)
    const mapW = MAP_COLS * TILE_SIZE;
    const mapH = MAP_ROWS * TILE_SIZE;
    const LANES = [
      [ // north lane
        { x: mapW * 0.40, y: mapH * 0.18 },
        { x: mapW * 0.62, y: mapH * 0.14 },
        { x: mapW * 0.80, y: mapH * 0.20 },
        { x: mapW * 0.88, y: mapH * 0.28 },
      ],
      [ // centre lane
        { x: mapW * 0.40, y: mapH * 0.50 },
        { x: mapW * 0.62, y: mapH * 0.50 },
        { x: mapW * 0.80, y: mapH * 0.50 },
        { x: mapW * 0.88, y: mapH * 0.52 },
      ],
      [ // south lane
        { x: mapW * 0.40, y: mapH * 0.78 },
        { x: mapW * 0.62, y: mapH * 0.82 },
        { x: mapW * 0.80, y: mapH * 0.76 },
        { x: mapW * 0.88, y: mapH * 0.72 },
      ],
    ];

    const SCOUT_RANGE = 12 * TILE_SIZE; // 768 px — generous vision range

    scouts.forEach((scout, i) => {
      const lane = LANES[i % LANES.length];
      // Advance waypoint when the scout is close to the current one
      if (scout.state.state === 'idle') {
        const wpIdx = this.p1SlingerWaypointIndex.get(scout.state.id) ?? 0;
        const wp = lane[wpIdx];
        const dist = Phaser.Math.Distance.Between(scout.state.x, scout.state.y, wp.x, wp.y);
        if (dist < TILE_SIZE * 4) {
          // Move to next waypoint; loop at the last one
          const next = Math.min(wpIdx + 1, lane.length - 1);
          this.p1SlingerWaypointIndex.set(scout.state.id, next);
        } else {
          scout.moveTo(wp.x, wp.y);
        }
      }

      // Scan for undiscovered enemy buildings within scout range
      for (const building of this.p2Buildings) {
        if (building.isDestroyed) continue;
        if (this.p1ScoutedBuildings.has(building.id)) continue;
        const d = Phaser.Math.Distance.Between(scout.state.x, scout.state.y, building.wx, building.wy);
        if (d <= SCOUT_RANGE) {
          this.p1ScoutedBuildings.add(building.id);
          const typeName = building.type.charAt(0).toUpperCase() + building.type.slice(1);
          this.callbacks.onScoutReport?.(`Scout found enemy ${typeName}!`);
        }
      }
    });
  }

  private updateMonkSupport(units: Unit[], minTx: number, maxTx: number) {    const now = this.time.now;
    for (const monk of units) {
      if (!monk.isAlive() || monk.state.type !== 'monk') continue;
      if (monk.state.state === 'attacking' || monk.state.state === 'dead') continue;

      const injured = this.findMostInjuredAlly(monk, units);
      if (injured) {
        const dx = injured.state.x - monk.state.x;
        const dy = injured.state.y - monk.state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > UNIT_CONFIGS.monk.range * 0.8) {
          const escortSlot = monk.state.id % 6;
          const escortAngle = (Math.PI * 2 * escortSlot) / 6;
          const escortRadius = 48;
          monk.moveTo(
            injured.state.x + Math.cos(escortAngle) * escortRadius,
            injured.state.y + Math.sin(escortAngle) * escortRadius,
          );
        }
        continue;
      }

      // No one to heal: light patrol so monks don't look frozen
      const lastPatrol = this.monkPatrolMs.get(monk.state.id) ?? 0;
      if (now - lastPatrol < 6800) continue;

      const tx = Phaser.Math.Between(minTx, maxTx);
      const ty = Phaser.Math.Between(2, MAP_ROWS - 3);
      const wx = (tx + 0.5) * TILE_SIZE;
      const wy = (ty + 0.5) * TILE_SIZE;
      const monkTarget = this.findSpacedCivilianTarget(units, monk, wx, wy, 18, TILE_SIZE * 1.45);
      if (!monkTarget) continue;
      if (Phaser.Math.Distance.Between(monk.state.x, monk.state.y, monkTarget.x, monkTarget.y) < TILE_SIZE * 1.35) continue;

      this.monkPatrolMs.set(monk.state.id, now);
      monk.moveTo(monkTarget.x, monkTarget.y);
    }
  }

  private findSpacedCivilianTarget(
    units: Unit[],
    unit: Unit,
    centerX: number,
    centerY: number,
    jitterRadius: number,
    minSpacing: number,
  ) {
    const minSpacingSq = minSpacing * minSpacing;
    for (let i = 0; i < 6; i++) {
      const candidateX = centerX + Phaser.Math.Between(-jitterRadius, jitterRadius);
      const candidateY = centerY + Phaser.Math.Between(-jitterRadius, jitterRadius);
      let crowded = false;
      for (const other of units) {
        if (!other.isAlive() || other.state.id === unit.state.id) continue;
        const dx = other.state.x - candidateX;
        const dy = other.state.y - candidateY;
        if (dx * dx + dy * dy < minSpacingSq) {
          crowded = true;
          break;
        }
      }
      if (!crowded) {
        return { x: candidateX, y: candidateY };
      }
    }
    return null;
  }

  private findNearestNode(unit: Unit, nodes: ResourceNode[], preferred?: 'tree' | 'goldmine'): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestDist = Infinity;
    for (const n of nodes) {
      if (!n.active) continue;
      if (preferred && n.type !== preferred) continue;
      const dx = n.wx - unit.state.x;
      const dy = n.wy - unit.state.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        bestDist = d2;
        best = n;
      }
    }
    return best;
  }

  private findMostInjuredAlly(source: Unit, allies: Unit[]): Unit | null {
    let best: Unit | null = null;
    let bestScore = 0;
    for (const ally of allies) {
      if (!ally.isAlive() || ally === source) continue;
      const missingHp = ally.state.maxHp - ally.state.hp;
      if (missingHp <= 0) continue;
      const dx = ally.state.x - source.state.x;
      const dy = ally.state.y - source.state.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      // prioritize allies missing more hp and reasonably close
      const score = missingHp - dist * 0.08;
      if (score > bestScore) {
        bestScore = score;
        best = ally;
      }
    }
    return best;
  }

  private hasResourceNodeAtTile(tx: number, ty: number) {
    for (const resource of this.p1Resources) {
      if (resource.active && resource.tx === tx && resource.ty === ty) return true;
    }
    for (const resource of this.p2Resources) {
      if (resource.active && resource.tx === tx && resource.ty === ty) return true;
    }
    return false;
  }

  private canPlaceBuildingAt(type: BuildingType, tx: number, ty: number, faction: Faction): boolean {
    const cfg = BUILDING_CONFIGS[type];
    // P1 can build in the left half of the map, P2 in the right half.
    const halfCol = Math.floor(MAP_COLS / 2);
    const islandMinX = faction === 'blue' ? 5 : halfCol;
    const islandMaxX = faction === 'blue' ? halfCol - cfg.width : MAP_COLS - 5 - cfg.width;

    if (tx < islandMinX || ty < 1) return false;
    if (tx + cfg.width - 1 > islandMaxX || ty + cfg.height - 1 > MAP_ROWS - 2) return false;

    for (let dtx = 0; dtx < cfg.width; dtx++) {
      for (let dty = 0; dty < cfg.height; dty++) {
        const tileX = tx + dtx;
        const tileY = ty + dty;
        const cell = this.getTerrainCell(tileX, tileY);
        if (!cell || !cell.buildable || cell.stair) return false;
        if (this.hasResourceNodeAtTile(tileX, tileY)) return false;
        if (this.occupiedTiles.has(`${tileX},${tileY}`)) return false;
      }
    }

    return true;
  }

  private drawBuildFootprint(tx: number, ty: number, width: number, height: number, canPlace: boolean) {
    if (!this.buildFootprintGhost) return;

    const g = this.buildFootprintGhost;
    const goodFill = 0x5cff87;
    const badFill = 0xff4d4d;
    const goodLine = 0xb8ffd1;
    const badLine = 0xffc2c2;
    // Use the same half-map bounds as canPlaceBuildingAt for P1 (player always blue).
    const halfCol = Math.floor(MAP_COLS / 2);
    const islandMinX = 5;
    const islandMaxX = halfCol - 1;

    g.clear();
    for (let dtx = 0; dtx < width; dtx++) {
      for (let dty = 0; dty < height; dty++) {
        const tileX = tx + dtx;
        const tileY = ty + dty;
        const outOfBounds = tileX < islandMinX || tileX > islandMaxX || tileY < 5 || tileY > MAP_ROWS - 5;
        const cell = this.getTerrainCell(tileX, tileY);
        const terrainBlocked = !cell || !cell.buildable || cell.stair;
        const blocked = outOfBounds || terrainBlocked || this.occupiedTiles.has(`${tileX},${tileY}`);
        const fillColor = !blocked ? goodFill : badFill;
        const lineColor = !blocked ? goodLine : badLine;
        const alpha = canPlace ? 0.20 : blocked ? 0.28 : 0.14;

        g.fillStyle(fillColor, alpha);
        g.lineStyle(2, lineColor, 0.8);
        g.fillRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        g.strokeRect(tileX * TILE_SIZE + 1, tileY * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }
    }
  }

  private spawnResourceText(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'serif',
      fontSize: '13px',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    t.setOrigin(0.5, 1);
    t.setDepth(48);
    this.tweens.add({
      targets: t,
      y: y - 22,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  private separateUnits(delta: number) {
    const dt = delta / 1000;
    const RADIUS   = 40;    // px — personal space bubble (increased from 30)
    const STRENGTH = 320;   // px/sec push force at full overlap

    const pushPair = (a: import('../entities/Unit').Unit, b: import('../entities/Unit').Unit, strength: number) => {
      const dx = b.state.x - a.state.x;
      const dy = b.state.y - a.state.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= RADIUS * RADIUS || distSq < 0.01) return;
      const dist  = Math.sqrt(distSq);
      const push  = ((RADIUS - dist) / RADIUS) * strength * dt;
      const nx = dx / dist;
      const ny = dy / dist;
      const scaleA = a.state.state === 'attacking' ? 0.25 : 1.0;
      const scaleB = b.state.state === 'attacking' ? 0.25 : 1.0;
      a.state.x -= nx * push * scaleA;
      a.state.y -= ny * push * scaleA;
      b.state.x += nx * push * scaleB;
      b.state.y += ny * push * scaleB;
    };

    // Same-faction separation (every frame)
    const separateGroup = (group: import('../entities/Unit').Unit[]) => {
      for (let i = 0; i < group.length; i++) {
        if (!group[i].isAlive()) continue;
        for (let j = i + 1; j < group.length; j++) {
          if (!group[j].isAlive()) continue;
          pushPair(group[i], group[j], STRENGTH);
        }
      }
    };

    separateGroup(this.p1Units);
    separateGroup(this.p2Units);

    // Cross-faction separation — only run every other frame to save CPU.
    // Guard: skip pairs farther than 200 px apart (eliminates most O(n²) cost).
    this.crossSepFrame = !this.crossSepFrame;
    if (!this.crossSepFrame) return;
    const CROSS_RADIUS_SQ = 200 * 200;
    for (const a of this.p1Units) {
      if (!a.isAlive()) continue;
      for (const b of this.p2Units) {
        if (!b.isAlive()) continue;
        const cdx = b.state.x - a.state.x;
        const cdy = b.state.y - a.state.y;
        if (cdx * cdx + cdy * cdy > CROSS_RADIUS_SQ) continue;
        pushPair(a, b, STRENGTH * 0.5);
      }
    }
  }

  private pruneDeadUnits() {
    this.p1Units = this.p1Units.filter(u => u.isAlive());
    this.p2Units = this.p2Units.filter(u => u.isAlive());
  }

  private checkWinCondition(remaining: number) {
    const p1Castle = this.p1Buildings.find(b => b.type === 'castle');
    const p2Castle = this.p2Buildings.find(b => b.type === 'castle');

    if (p2Castle?.isDestroyed) {
      this.endGame('player', 'Castle destroyed!');
      return;
    }
    if (p1Castle?.isDestroyed) {
      this.endGame('bot', 'Your castle was destroyed!');
      return;
    }

    if (remaining <= 0) {
      const p1Pct = p1Castle ? p1Castle.hp / p1Castle.maxHp : 0;
      const p2Pct = p2Castle ? p2Castle.hp / p2Castle.maxHp : 0;
      if (p1Pct > p2Pct) {
        this.endGame('player', 'Higher castle HP!');
      } else if (p2Pct > p1Pct) {
        this.endGame('bot', 'Enemy castle survived better.');
      } else {
        this.endGame('player', 'Draw — Player wins the tie!');
      }
    }
  }

  private endGame(winner: 'player' | 'bot', reason: string) {
    if (this.gameOver) return;
    this.gameOver = true;
    this.cameras.main.shake(800, 0.015);
    this.time.delayedCall(1200, () => {
      this.callbacks.onGameEnd(winner, reason);
    });
  }

  shutdown() {
    this.introUnlockEvent?.remove(false);
    this.introUnlockEvent = null;
    this.introCameraActive = false;
    this.input.enabled = true;
    this.cancelBuildMode();
  }
}

