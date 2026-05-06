import * as Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/ResourceNode';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { AISystem, type Difficulty } from '../systems/AISystem';
import { CommandSystem } from '../systems/CommandSystem';
import { FogSystem } from '../systems/FogSystem';
import { AmbientSwaySystem } from '../systems/AmbientSwaySystem';
import { WildlifeSystem } from '../systems/WildlifeSystem';
import { spawnGrassTufts, spawnFoam, spawnResourceClusters } from '../render/decoSpawner';
import { TRAIN_QUEUE_MAX, UNIT_CONFIGS } from '../config/units';
import { BUILDING_CONFIGS, BASE_POP_CAP } from '../config/buildings';
import {
  TILE_SIZE, MAP_COLS, MAP_ROWS,
  P1_CASTLE_TX, P1_CASTLE_TY, P2_CASTLE_TX, P2_CASTLE_TY,
  P1_SPAWN_X, P1_SPAWN_Y, P2_SPAWN_X, P2_SPAWN_Y,
  P1_RESOURCES, P2_RESOURCES,
  GAME_DURATION_SECS,
  PREP_DURATION_SECS,
  STAGE_ECONOMY_DURATION_SECS,
  STAGE_PREPARE_DURATION_SECS,
  MINE_GOLD_BONUS,
  TREE_WOOD_BONUS,
  P1_TERRITORY_MAX_X, P2_TERRITORY_MIN_X,
  P1_STAGING_MAX_X, P2_STAGING_MIN_X,
  type MatchStageId,
} from '../config/map';
import type { UnitType, Faction } from '../config/units';
import type { BuildingType } from '../config/buildings';
import {
  initAudio,
  playBuildingPlace,
  playUnitTrained,
  playVictoryFanfare,
  playDefeatSound,
} from '../../utils/sounds';

export interface IslandWarsCallbacks {
  onResourcesUpdate: (gold: number, wood: number) => void;
  onTimerUpdate: (remaining: number) => void;
  onGameEnd: (winner: 'player' | 'bot', reason: string) => void;
  onTrainQueueUpdate: (queue: TrainQueueDisplayItem[]) => void;
  onPopUpdate?: (pop: number, cap: number) => void;
  /** Fires when a player Scout unit discovers an enemy building for the first time. */
  onScoutReport?: (message: string) => void;
  /** Fires once when the prep phase ends and combat begins. */
  onWarBegin?: () => void;
  /** Fires when player selects or deselects a unit. */
  onSelectedUnitUpdate?: (unit: SelectedUnitInfo | null) => void;
}

export interface TrainQueueDisplayItem {
  type: UnitType;
  remainingMs: number;
  active: boolean;
}

export interface SelectedUnitInfo {
  id: number;
  type: UnitType;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  state: string;
  targetX: number;
  targetY: number;
  level: number;
}

export interface ProductionAvailability {
  house: boolean;
  barracks: boolean;
  fort: boolean;
  workshop: boolean;
  pop: number;
  popCap: number;
}

const UNIT_CAP_PER_PRODUCER: Partial<Record<UnitType, number>> = {
  warrior: 25,
  archer: 20,
  monk: 10,
};

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
  /** Neutral harvestable trees covering ~60% of the land — accessible by both factions. */
  private forestNodes: ResourceNode[] = [];

  private combatSystem!: CombatSystem;
  private resourceSystem!: ResourceSystem;
  private aiSystem!: AISystem;
  /** Command bus — all player-issued build/train actions go through here.
   *  Swap LocalNetworkAdapter → WebSocketNetworkAdapter to enable online 1v1. */
  private commandSystem!: CommandSystem;
  private fogSystem: FogSystem | null = null;
  private swaySystem = new AmbientSwaySystem();
  private readonly isMobileDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  private swayFrameCount = 0;

  // ── Unit Selection & Upgrades ─────────────────────────────────────────────
  private selectedUnitId: number | null = null;
  private unitLevels = new Map<number, number>(); // unitId -> level
  private decoSprites: Phaser.GameObjects.Image[] = [];
  private foamSprites: Phaser.GameObjects.Sprite[] = [];
  private cullCooldownMs = 0;
  private wildlifeSystem: WildlifeSystem | null = null;
  private currentDifficulty: Difficulty = 'normal';
  private p1SpawnPoint = { x: P1_SPAWN_X, y: P1_SPAWN_Y };
  private p2SpawnPoint = { x: P2_SPAWN_X, y: P2_SPAWN_Y };

  private elapsedSecs = 0;
  private warBeginNotified = false;
  private gameOver = false;
  private trainQueue: Array<{ type: UnitType; timeRemaining: number; totalTime: number }> = [];
  private buildMode: BuildingType | null = null;
  private buildGhost: Phaser.GameObjects.Image | null = null;
  private buildFootprintGhost: Phaser.GameObjects.Graphics | null = null;
  private territoryClampOverlay: Phaser.GameObjects.Graphics | null = null;
  private buildGridOverlay: Phaser.GameObjects.Graphics | null = null;
  private lastTerritoryOverlayStage: MatchStageId | null = null;
  private occupiedTiles = new Set<string>();
  private terrainGrid: TerrainCell[][] = [];
  private terrainVisuals: Phaser.GameObjects.GameObject[] = [];
  private p1CastlePreloc: { tx: number; ty: number } = { tx: P1_CASTLE_TX, ty: P1_CASTLE_TY };
  private p2CastlePreloc: { tx: number; ty: number } = { tx: P2_CASTLE_TX, ty: P2_CASTLE_TY };
  private civilianThinkMs = 0;
  private workerGatherMs = new Map<number, number>();
  private pawnNodeAssignment = new Map<number, ResourceNode>();
  private nodeHarvestMs = new Map<ResourceNode, number>();
  private pawnMoveStartMs = new Map<number, number>();
  private monkPatrolMs = new Map<number, number>();
  private idlePatrolMs = new Map<number, number>();
  private unitBuildingOverlapMs = new Map<number, number>();
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
  /** Player-manual scout IDs: if present, auto-explore must not override move orders. */
  private p1ManualScoutControl = new Set<number>();
  private scoutUpdateMs = 0;
  private hudTimerEmitMs = 0;
  private trainQueueEmitMs = 0;
  private spawnOriginRoundRobin = new Map<string, number>();
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
    initAudio();
    this.elapsedSecs = 0;
    this.warBeginNotified = false;
    this.gameOver = false;
    this.p1Units = [];
    this.p2Units = [];
    this.p1Buildings = [];
    this.p2Buildings = [];
    this.p1Resources = [];
    this.p2Resources = [];
    this.forestNodes = [];
    this.trainQueue = [];
    this.occupiedTiles = new Set();
    this.terrainGrid = [];
    this.terrainVisuals = [];
    this.buildFootprintGhost = null;
    this.territoryClampOverlay = null;
    this.buildGridOverlay = null;
    this.lastTerritoryOverlayStage = null;
    this.civilianThinkMs = 0;
    this.workerGatherMs = new Map();
    this.pawnNodeAssignment = new Map();
    this.nodeHarvestMs = new Map();
    this.pawnMoveStartMs = new Map();
    this.monkPatrolMs = new Map();
    this.idlePatrolMs = new Map();
    this.unitBuildingOverlapMs = new Map();
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
    this.spawnOriginRoundRobin = new Map();
    this.lastHudGold = -1;
    this.lastHudWood = -1;
    this.lastTimerSecond = -1;
    this.lastQueueUiHash = '';
    this.minimapTerrainGridCache = [];
    this.introUnlockEvent?.remove(false);
    this.introUnlockEvent = null;

    this.p1ScoutedBuildings = new Set();
    this.p1SlingerWaypointIndex = new Map();
    this.p1ManualScoutControl = new Set();
    this.scoutUpdateMs = 0;

    this.fogSystem?.destroy();
    this.fogSystem = null;

    this.buildMap();
    // Reserve start-building footprints first so resource/forest spawning cannot overlap them.
    this.spawnStartBuildings();
    this.placeResources();
    this.spawnForests();
    this.pruneResourcesOnOccupiedTiles();
    // Register tree sprites for ambient sway. (Goldmines stay still.)
    this.swaySystem.clear();
    // Faction resource trees — all registered (small count).
    for (const r of [...this.p1Resources, ...this.p2Resources]) {
      if (r.type === 'tree') {
        this.swaySystem.registerSway(r.sprite, 1.5, 1700 + Math.random() * 500);
      }
    }
    // Forest trees — only every 8th to avoid iterating thousands of entries per frame.
    for (let i = 0; i < this.forestNodes.length; i += 8) {
      this.swaySystem.registerSway(this.forestNodes[i].sprite, 1.0, 2000 + Math.random() * 600);
    }
    // Scatter grass tufts (lower density on mobile).
    const tuftDensity = this.isMobileDevice ? 0.08 : 0.25;
    // On mobile skip sway registration for grass tufts entirely — saves iterating
    // potentially thousands of scale entries per frame.
    this.decoSprites = spawnGrassTufts(
      this, this.terrainGrid, this.isMobileDevice ? null : this.swaySystem, () => Math.random(), tuftDensity,
    );

    // Animated foam on shorelines.
    if (!this.anims.exists('foam_loop') && this.textures.exists('foam')) {
      const fram = this.textures.get('foam').frameTotal - 1; // -1 for __BASE
      const safeEnd = Math.max(0, Math.min(7, fram - 1));
      this.anims.create({
        key: 'foam_loop',
        frames: this.anims.generateFrameNumbers('foam', { start: 0, end: safeEnd }),
        frameRate: this.isMobileDevice ? 4 : 8,
        repeat: -1,
      });
    }
    this.foamSprites = spawnFoam(this, this.terrainGrid);

    // Cluster deco around tree and gold-mine resource nodes.
    const treePts = [...this.p1Resources, ...this.p2Resources]
      .filter(r => r.type === 'tree')
      .map(r => ({ x: r.sprite.x, y: r.sprite.y }));
    const minePts = [...this.p1Resources, ...this.p2Resources]
      .filter(r => r.type === 'goldmine')
      .map(r => ({ x: r.sprite.x, y: r.sprite.y }));
    this.decoSprites.push(
      ...spawnResourceClusters(this, treePts, minePts, () => Math.random()),
    );

    // Wandering sheep in the neutral corridor — pure decoration.
    this.wildlifeSystem = new WildlifeSystem(this, this.terrainGrid, () => Math.random());
    this.wildlifeSystem.spawn(this.isMobileDevice ? 40 : 60);

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
      () => this.isWarActive(),
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
          if (built) {
            this.resourceSystem.spend('p1', 0, cfg.woodCost);
            playBuildingPlace();
          }
        }
      })
      .register('train', (cmd) => {
        if (cmd.faction !== 'blue') return;
        const type = cmd.unitType;
        const cfg  = UNIT_CONFIGS[type];
        if (!this.canTrainUnitByProducerCap(type, 'p1', true)) return;
        if (!this.resourceSystem.canAfford('p1', cfg.goldCost)) return;
        if (this.getAliveUnitCount('p1') >= this.getPopCap('p1')) return;
        const origin = cmd.x !== undefined ? { x: cmd.x, y: cmd.y! } : this.p1SpawnPoint;
        const spawned = this.spawnUnit(type, 'blue', origin.x, origin.y, true);
        if (spawned) this.resourceSystem.spend('p1', cfg.goldCost);
      })
      .register('move', (cmd) => {
        if (cmd.faction !== 'blue') return;
        const unit = this.p1Units.find(u => u.state.id === cmd.unitId && u.isAlive());
        if (unit) {
          unit.moveTo(cmd.x, cmd.y);
          // Manual scout commands should always take precedence over auto-explore.
          if (unit.state.type === 'slinger') {
            this.p1ManualScoutControl.add(unit.state.id);
          }
        }
      });

    this.aiSystem = new AISystem(
      this.resourceSystem,
      this.p2Units,
      this.p2Buildings,
      (type, faction, x, y) => {
        // AI always plays as 'red' (p2)
        if (!this.canTrainUnitByProducerCap(type, 'p2', false)) return undefined as unknown as Unit;
        if (this.getAliveUnitCount('p2') >= this.getPopCap('p2')) return undefined as unknown as Unit;
        return this.spawnUnit(type, faction, x, y, true);
      },
      (type, faction, tx, ty) => this.placeBuilding(type, faction, tx, ty),
      (type) => this.getSpawnOriginForType(type, 'p2'),
      () => this.getPlayerUnitCounts(),
      () => ({ pop: this.getAliveUnitCount('p2'), cap: this.getPopCap('p2') }),
      this.currentDifficulty,
      undefined,
      () => this.isWarActive(),
      () => this.getMatchStage(),
    );
    this.aiSystem.setSpawnPoint(this.p2SpawnPoint.x, this.p2SpawnPoint.y);

    this.fogSystem = new FogSystem(this);
    // Reveal around every P1 building and unit that was just spawned
    const visionByType: Record<string, number> = { archer: 8, slinger: 14, warrior: 5, pawn: 4, monk: 4 };
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

    // 4-tier elevation: beach(L1) → flat(L1) → hill(L2) → mountain(L3) → summit(L4)
    // Higher tiers grant scaled vision/damage and are visually layered with shadows.
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      for (let tx = 0; tx < MAP_COLS; tx++) {
        const h = heightAt(tx, ty);
        if (h < 0.28) continue; // stays ocean
        const cell = this.terrainGrid[ty][tx];
        cell.water = false; cell.walkable = true; cell.bridge = false;
        const hill = hillNoise(tx, ty);
        if (h < 0.42) {
          cell.level = 1; cell.tileKind = 'beach'; cell.buildable = false;
        } else if (hill > 0.76 && h > 0.90) {
          cell.level = 7; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.70 && h > 0.84) {
          cell.level = 6; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.62 && h > 0.78) {
          cell.level = 5; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.54 && h > 0.70) {
          cell.level = 4; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.50 && h > 0.68) {
          cell.level = 3; cell.tileKind = 'elevated'; cell.buildable = false;
        } else if (hill > 0.34 && h > 0.55) {
          cell.level = 2; cell.tileKind = 'elevated'; cell.buildable = false;
        } else {
          cell.level = 1; cell.tileKind = 'flat'; cell.buildable = true;
        }
      }
    }

    // ── 3. Stairs at elevation transitions ───────────────────────────────
    // Pre-flatten castle compound areas so buildings always land on flat ground.
    const p1Default = { tx: P1_CASTLE_TX, ty: P1_CASTLE_TY };
    const p2Default = { tx: P2_CASTLE_TX, ty: P2_CASTLE_TY };
    this.p1CastlePreloc = this.pickAndFlattenCastleArea('blue', p1Default);
    this.p2CastlePreloc = this.pickAndFlattenCastleArea('red',  p2Default);

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

    const liftFor = (lv: number): number => {
      if (lv >= 7) return 200;
      if (lv >= 6) return 162;
      if (lv >= 5) return 126;
      if (lv >= 4) return 92;
      if (lv >= 3) return 60;
      if (lv >= 2) return 30;
      return 0;
    };
    const tintFor = (lv: number, isBeach: boolean): number | null => {
      if (isBeach) return 0xe8c872;
      if (lv >= 7) return 0xf8fbff;
      if (lv >= 6) return 0xd8eaf5;
      if (lv >= 5) return 0xffffff;
      if (lv >= 4) return 0xe9efe0;
      if (lv >= 3) return 0xb6c8a6;
      if (lv >= 2) return 0xd4eba8;
      return null;
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
        const depth = 1.5 + l * 0.5;
        const lift  = liftFor(l);
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

        // Fill the original footprint under lifted terrain to hide water seams.
        if (isElev) {
          const base = this.add.image(px, py, 'tf', frame);
          const baseTint = tintFor(l, isBeach);
          if (baseTint !== null) base.setTint(baseTint);
          base.setDepth(depth - 0.22);
          this.terrainVisuals.push(base);
        }

        const surf  = this.add.image(px, drawY, 'tf', frame);
        surf.setDepth(depth);
        const tint = tintFor(l, isBeach);
        if (tint !== null) surf.setTint(tint);
        this.terrainVisuals.push(surf);

        if (isStair) {
          const stepTop = this.add.rectangle(px, drawY + T * 0.05, T * 0.62, T * 0.34, 0xc8ac77, 0.72);
          stepTop.setDepth(depth + 0.18);
          this.terrainVisuals.push(stepTop);
          const stepLine = this.add.rectangle(px, drawY + T * 0.18, T * 0.56, 2, 0x6e5533, 0.55);
          stepLine.setDepth(depth + 0.19);
          this.terrainVisuals.push(stepLine);
        }

        if (isElev) {
          if (levelAt(tx, ty - 1) < l) {
            const rim = this.add.rectangle(px, drawY - T * 0.5 + 2, T, 3, 0xffffff, 0.22);
            rim.setDepth(depth + 0.16); this.terrainVisuals.push(rim);
          }
          if (levelAt(tx, ty + 1) < l) {
            const shadow = this.add.rectangle(px, drawY + T * 0.5 - 2, T, 4, 0x000000, 0.18);
            shadow.setDepth(depth + 0.16); this.terrainVisuals.push(shadow);
          }
        }

        // Cliff face: render one stack per tier of elevation drop south
        const southLv = levelAt(tx, ty + 1);
        if (southLv < l && ty + 1 < MAP_ROWS) {
          const cc    = cliffEdgeCol(tx, ty);
          const tiersToDrop = l - Math.max(southLv, 1);
          for (let tier = 0; tier < tiersToDrop; tier++) {
            // Each tier is one cliff-face block stacked from the surface downward
            const tierTop = py - lift + (lift - liftFor(l - tier - 1));
            const faceY = tierTop + T * 0.5; // top of this cliff segment
            if (isStair && tier === 0) {
              const step = this.add.image(px, faceY, 'te', 20 + cc);
              step.setOrigin(0.5, 0); step.setDepth(depth + 0.14 - tier * 0.01); this.terrainVisuals.push(step);
              const sh = this.add.image(px, faceY + T * 0.85, 'ts', 0);
              sh.setAlpha(0.20); sh.setDepth(depth + 0.09 - tier * 0.01); this.terrainVisuals.push(sh);
            } else {
              const cap = this.add.image(px, faceY, 'te', cc);
              cap.setOrigin(0.5, 0); cap.setDepth(depth + 0.14 - tier * 0.01); this.terrainVisuals.push(cap);
              const body = this.add.image(px, faceY + T, 'te', 4 + cc);
              body.setOrigin(0.5, 0); body.setDepth(depth + 0.13 - tier * 0.01); this.terrainVisuals.push(body);
              if (tier === tiersToDrop - 1) {
                const sh = this.add.image(px, faceY + T * 1.9, 'ts', 0);
                sh.setAlpha(0.30); sh.setDepth(depth + 0.09); this.terrainVisuals.push(sh);
              }
            }
          }
        }

        // Mountain peak cap — small white snow tip at summit centres
        if (l === 4 && hillNoise(tx, ty) > 0.78) {
          const cap = this.add.ellipse(px, drawY - 4, T * 0.55, T * 0.22, 0xffffff, 0.7);
          cap.setDepth(depth + 0.2); this.terrainVisuals.push(cap);
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

  private applyWorldStairs() {
    const markStair = (tx: number, ty: number) => {
      const cell = this.terrainGrid[ty]?.[tx];
      if (!cell || cell.water) return;
      cell.stair = true; cell.tileKind = 'stair'; cell.walkable = true; cell.buildable = false;
    };
    for (let ty = 1; ty < MAP_ROWS - 1; ty++) {
      for (let tx = 1; tx < MAP_COLS - 1; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2) continue;
        const south = this.terrainGrid[ty + 1]?.[tx];
        if (!south || south.water || south.level >= cell.level) continue;
        for (let dx = -1; dx <= 1; dx++) {
          markStair(tx + dx, ty);
          markStair(tx + dx, ty + 1);
          let sy = ty + 2;
          while (sy < MAP_ROWS) {
            const bw = this.terrainGrid[sy]?.[tx + dx];
            const ab = this.terrainGrid[sy - 1]?.[tx + dx];
            if (!bw || bw.water || !ab || ab.level <= bw.level) break;
            markStair(tx + dx, sy);
            sy++;
          }
        }
      }
    }
    for (let ty = 1; ty < MAP_ROWS - 1; ty++) {
      for (let tx = 1; tx < MAP_COLS - 1; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2) continue;
        const east = this.terrainGrid[ty]?.[tx + 1];
        if (!east || east.water || east.level >= cell.level) continue;
        for (let dy = -1; dy <= 1; dy++) {
          markStair(tx, ty + dy);
          markStair(tx + 1, ty + dy);
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

    // Decorative world trees are disabled on purpose.
    // All trees visible on the map should be harvestable resource nodes.

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

  private isBuildingTileOccupied(tx: number, ty: number) {
    return this.occupiedTiles.has(`${tx},${ty}`);
  }

  private worldToTile(wx: number, wy: number) {
    return { tx: Phaser.Math.Clamp(Math.floor(wx / TILE_SIZE), 0, MAP_COLS - 1), ty: Phaser.Math.Clamp(Math.floor(wy / TILE_SIZE), 0, MAP_ROWS - 1) };
  }

  private tileToWorld(tx: number, ty: number) {
    return { x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE };
  }

  private getUnitAtPosition(wx: number, wy: number): Unit | undefined {
    // Check P1 units first (player can select theirs)
    for (const u of this.p1Units) {
      if (!u.isAlive()) continue;
      const dx = u.state.x - wx;
      const dy = u.state.y - wy;
      if (dx * dx + dy * dy <= 900) return u; // 30px radius
    }
    // Also check P2 units for completeness (but won't select)
    for (const u of this.p2Units) {
      if (!u.isAlive()) continue;
      const dx = u.state.x - wx;
      const dy = u.state.y - wy;
      if (dx * dx + dy * dy <= 900) return u;
    }
    return undefined;
  }

  /** Briefly show a green ring at (wx, wy) to confirm a move-order tap. */
  private spawnMoveMarker(wx: number, wy: number) {
    const g = this.add.graphics();
    g.lineStyle(2, 0x00ff88, 0.9);
    g.strokeCircle(wx, wy, 12);
    g.setDepth(300);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 500,
      ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  private findNearestWalkableTile(tx: number, ty: number) {
    if (this.getTerrainCell(tx, ty)?.walkable && !this.isBuildingTileOccupied(tx, ty)) return { tx, ty };
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
        if (cell.walkable && !this.isBuildingTileOccupied(nx, ny)) return { tx: nx, ty: ny };
        queue.push({ tx: nx, ty: ny });
      }
    }
    return { tx, ty };
  }

  private canTraverse(from: TerrainCell, to: TerrainCell) {
    if (!to.walkable) return false;
    if (from.level === to.level) return true;
    // Cross-level movement only allowed through stair-marked tiles.
    return from.stair || to.stair;
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
        if (this.isBuildingTileOccupied(nx, ny)) continue;
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

  /**
   * Blanket the map with harvestable forest trees — roughly 60% of all walkable
   * flat/beach/sand tiles become trees. Both factions can harvest them.
   * Castle safe-zones and already-occupied tiles are left clear.
   */
  private spawnForests() {
    const keepBuffer = 10;
    const cW = BUILDING_CONFIGS.castle.width;
    const cH = BUILDING_CONFIGS.castle.height;
    const inCastleKeep = (tx: number, ty: number) => {
      const inP1 = tx >= this.p1CastlePreloc.tx - keepBuffer &&
                   tx <= this.p1CastlePreloc.tx + cW - 1 + keepBuffer &&
                   ty >= this.p1CastlePreloc.ty - keepBuffer &&
                   ty <= this.p1CastlePreloc.ty + cH - 1 + keepBuffer;
      const inP2 = tx >= this.p2CastlePreloc.tx - keepBuffer &&
                   tx <= this.p2CastlePreloc.tx + cW - 1 + keepBuffer &&
                   ty >= this.p2CastlePreloc.ty - keepBuffer &&
                   ty <= this.p2CastlePreloc.ty + cH - 1 + keepBuffer;
      return inP1 || inP2;
    };

    // Deterministic seeded RNG so forests look the same each run.
    const rng = (seed: number) => {
      const s = Math.sin(seed * 6271.1 + 91.7) * 43758.5453;
      return s - Math.floor(s);
    };

    const usedTiles = new Set<string>();
    const mineKeepTiles = new Set<string>();
    // Prime usedTiles with already-placed faction resources.
    for (const r of [...this.p1Resources, ...this.p2Resources]) {
      usedTiles.add(`${r.tx},${r.ty}`);
      if (r.type === 'goldmine') {
        // Gold mine sprite is visually wide; reserve a local buffer so forest trees
        // do not appear on top of or clipped into mine art.
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = r.tx + dx;
            const ny = r.ty + dy;
            if (!this.isInBounds(nx, ny)) continue;
            mineKeepTiles.add(`${nx},${ny}`);
          }
        }
      }
    }

    const FOREST_CHANCE = 0.62; // probability per eligible tile

    for (let ty = 4; ty < MAP_ROWS - 4; ty++) {
      for (let tx = 4; tx < MAP_COLS - 4; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell) continue;
        // Only flat land tiles — not water, not stair, not bridge, must be walkable.
        if (cell.water || !cell.walkable || cell.stair || cell.bridge) continue;
        if (cell.tileKind === 'elevated' || cell.tileKind === 'summit') continue;
        if (inCastleKeep(tx, ty)) continue;
        if (this.occupiedTiles.has(`${tx},${ty}`)) continue;
        if (usedTiles.has(`${tx},${ty}`)) continue;
        if (mineKeepTiles.has(`${tx},${ty}`)) continue;

        const seed = (tx + 7) * 7919 + (ty + 3) * 4657;
        if (rng(seed) > FOREST_CHANCE) continue;

        usedTiles.add(`${tx},${ty}`);
        const node = new ResourceNode(this, tx, ty, 'tree');
        this.forestNodes.push(node);
      }
    }
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

    // Keep a clean area around both castles so spawns never overlap trees/resources.
    const keepBuffer = 7;
    const cW = BUILDING_CONFIGS.castle.width;
    const cH = BUILDING_CONFIGS.castle.height;
    const inKeep = (cx: number, cy: number) =>
      tx >= cx - keepBuffer &&
      tx <= cx + cW - 1 + keepBuffer &&
      ty >= cy - keepBuffer &&
      ty <= cy + cH - 1 + keepBuffer;
    if (inKeep(this.p1CastlePreloc.tx, this.p1CastlePreloc.ty)) return false;
    if (inKeep(this.p2CastlePreloc.tx, this.p2CastlePreloc.ty)) return false;

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
      const producers = buildings.filter((b) => b.type === requiredBuilding && !b.isDestroyed);
      if (producers.length > 0) {
        const key = `${side}:${type}`;
        const seq = this.spawnOriginRoundRobin.get(key) ?? 0;
        const producer = producers[seq % producers.length];
        this.spawnOriginRoundRobin.set(key, seq + 1);

        if (type === 'warrior' || type === 'archer' || type === 'monk') {
          return this.getProducerFormationPoint(producer, type, side, seq);
        }

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
    if (type === 'archer') return 'fort';
    if (type === 'monk') return 'workshop';
    if (type === 'warrior' || type === 'slinger') return 'barracks';
    return null;
  }

  private getProducerFormationPoint(producer: Building, type: UnitType, side: 'p1' | 'p2', seq: number): { x: number; y: number } {
    const cfg = BUILDING_CONFIGS[producer.type];
    const centerX = (producer.tx + cfg.width * 0.5) * TILE_SIZE;
    const centerY = (producer.ty + cfg.height) * TILE_SIZE;
    const forward = side === 'p1' ? 1 : -1;

    let cols = 5;
    let rows = 5;
    let maxPerProducer = 25;
    if (type === 'archer') { rows = 4; maxPerProducer = 20; }
    if (type === 'monk') { rows = 2; maxPerProducer = 10; }

    const slot = seq % Math.max(1, maxPerProducer);
    const row = Math.floor(slot / cols) % rows;
    const col = slot % cols;

    const x = centerX + forward * TILE_SIZE * 1.4 + (col - (cols - 1) * 0.5) * TILE_SIZE * 0.6;
    const y = centerY + TILE_SIZE * 0.6 + row * TILE_SIZE * 0.6;
    return { x, y };
  }

  private canTrainUnitByProducerCap(type: UnitType, side: 'p1' | 'p2', includeQueue: boolean): boolean {
    const perProducer = UNIT_CAP_PER_PRODUCER[type];
    if (!perProducer) return true;

    const requiredBuilding = this.getRequiredBuildingForUnit(type);
    if (!requiredBuilding) return true;

    const buildings = side === 'p1' ? this.p1Buildings : this.p2Buildings;
    const producers = buildings.filter((b) => b.type === requiredBuilding && !b.isDestroyed).length;
    if (producers <= 0) return false;

    const units = side === 'p1' ? this.p1Units : this.p2Units;
    const aliveCount = units.filter((u) => u.isAlive() && u.state.type === type).length;
    const queuedCount = includeQueue && side === 'p1'
      ? this.trainQueue.filter((q) => q.type === type).length
      : 0;

    return aliveCount + queuedCount < producers * perProducer;
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
    visibleGrid: Uint8Array | null;
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
      visibleGrid: fog?.getVisibleGrid() ?? null,
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

  /** Get info on the currently selected unit, or null if none selected. */
  public getSelectedUnitInfo(): SelectedUnitInfo | null {
    if (!this.selectedUnitId) return null;
    const unit = this.p1Units.find(u => u.state.id === this.selectedUnitId && u.isAlive());
    if (!unit) return null;
    return {
      id: unit.state.id,
      type: unit.state.type,
      hp: unit.state.hp,
      maxHp: unit.state.maxHp,
      x: unit.state.x,
      y: unit.state.y,
      state: unit.state.state,
      targetX: unit.state.targetX,
      targetY: unit.state.targetY,
      level: this.unitLevels.get(unit.state.id) ?? 1,
    };
  }

  /** Select a player unit by ID and emit the selection state. */
  public selectUnit(unitId: number) {
    const unit = this.p1Units.find(u => u.state.id === unitId && u.isAlive());
    if (!unit) return;
    this.selectedUnitId = unitId;
    this.callbacks.onSelectedUnitUpdate?.(this.getSelectedUnitInfo());
  }

  /** Deselect the current unit. */
  public clearSelection() {
    this.selectedUnitId = null;
    this.callbacks.onSelectedUnitUpdate?.(null);
  }

  /** Upgrade a selected unit's stat (hp or damage). Costs 50 gold. */
  public upgradeUnit(stat: 'hp' | 'damage') {
    if (!this.selectedUnitId) return;
    const unit = this.p1Units.find(u => u.state.id === this.selectedUnitId && u.isAlive());
    if (!unit) return;

    const gold = this.resourceSystem.p1.gold;
    if (gold < 50) return; // not enough gold

    this.resourceSystem.addResources('p1', -50, 0);

    const level = (this.unitLevels.get(unit.state.id) ?? 1) + 1;
    this.unitLevels.set(unit.state.id, level);

    if (stat === 'hp') {
      const cfg = UNIT_CONFIGS[unit.state.type];
      const newMaxHp = cfg.hp * (1 + (level - 1) * 0.2);
      unit.state.maxHp = newMaxHp;
      unit.state.hp = newMaxHp; // heal to full on upgrade
    }
    // Damage upgrades are handled by AI system checking unit level on damage calc

    this.callbacks.onSelectedUnitUpdate?.(this.getSelectedUnitInfo());
    this.emitResourcesIfChanged();
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
    const p1Spot = this.p1CastlePreloc;
    const p2Spot = this.p2CastlePreloc;
    const p1Castle = this.placeBuilding('castle', 'blue', p1Spot.tx, p1Spot.ty)
      ?? this.placeBuilding('castle', 'blue', P1_CASTLE_TX, P1_CASTLE_TY);
    const p2Castle = this.placeBuilding('castle', 'red', p2Spot.tx, p2Spot.ty)
      ?? this.placeBuilding('castle', 'red', P2_CASTLE_TX, P2_CASTLE_TY);
    if (p1Castle) {
      this.p1SpawnPoint = { x: (p1Castle.tx + BUILDING_CONFIGS.castle.width * 0.5) * TILE_SIZE, y: (p1Castle.ty + BUILDING_CONFIGS.castle.height) * TILE_SIZE };
      this.buildFortressCompound('blue', p1Castle.tx, p1Castle.ty);
    }
    if (p2Castle) {
      this.p2SpawnPoint = { x: (p2Castle.tx + BUILDING_CONFIGS.castle.width * 0.5) * TILE_SIZE, y: (p2Castle.ty + BUILDING_CONFIGS.castle.height) * TILE_SIZE };
      this.buildFortressCompound('red', p2Castle.tx, p2Castle.ty);
    }
  }

  private buildFortressCompound(faction: Faction, cTx: number, cTy: number) {
    const cW = BUILDING_CONFIGS.castle.width;
    const cH = BUILDING_CONFIGS.castle.height;

    // Castle + 4 corner towers only (no walls, no extra buildings).
    this.placeBuilding('tower', faction, cTx - 1, cTy - 1);
    this.placeBuilding('tower', faction, cTx + cW, cTy - 1);
    this.placeBuilding('tower', faction, cTx - 1, cTy + cH);
    this.placeBuilding('tower', faction, cTx + cW, cTy + cH);
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

  private pickAndFlattenCastleArea(faction: Faction, _defaultSpot: { tx: number; ty: number }): { tx: number; ty: number } {
    const spot = this.pickRandomCastleSpot(faction);
    for (let dty = -7; dty < 11; dty++) {
      for (let dtx = -7; dtx < 11; dtx++) {
        const cx = spot.tx + dtx; const cy = spot.ty + dty;
        if (cx < 1 || cy < 1 || cx >= MAP_COLS - 1 || cy >= MAP_ROWS - 1) continue;
        const cell = this.terrainGrid[cy]?.[cx];
        if (!cell || cell.water || cell.bridge) continue;
        cell.level = 1; cell.tileKind = 'flat'; cell.walkable = true; cell.buildable = true; cell.stair = false;
      }
    }
    return spot;
  }

  private spawnStartUnits() {
    const p1PawnOrigin = this.getSpawnOriginForType('pawn', 'p1');
    const p1WarriorOrigin = this.getSpawnOriginForType('warrior', 'p1');
    const p1SlingerOrigin = this.getSpawnOriginForType('slinger', 'p1');

    // P1 starts with a mixed roster
    this.spawnUnit('pawn', 'blue', p1PawnOrigin.x - 24, p1PawnOrigin.y + 8);
    this.spawnUnit('pawn', 'blue', p1PawnOrigin.x + 24, p1PawnOrigin.y + 8);
    this.spawnUnit('warrior', 'blue', p1WarriorOrigin.x - 16, p1WarriorOrigin.y + 12);
    this.spawnUnit('slinger', 'blue', p1SlingerOrigin.x + 40, p1SlingerOrigin.y + 28);

    const p2PawnOrigin = this.getSpawnOriginForType('pawn', 'p2');
    const p2WarriorOrigin = this.getSpawnOriginForType('warrior', 'p2');
    const p2SlingerOrigin = this.getSpawnOriginForType('slinger', 'p2');

    // P2 starts with a mixed roster
    this.spawnUnit('pawn', 'red', p2PawnOrigin.x - 24, p2PawnOrigin.y + 8);
    this.spawnUnit('pawn', 'red', p2PawnOrigin.x + 24, p2PawnOrigin.y + 8);
    this.spawnUnit('warrior', 'red', p2WarriorOrigin.x - 16, p2WarriorOrigin.y + 12);
    this.spawnUnit('slinger', 'red', p2SlingerOrigin.x + 40, p2SlingerOrigin.y + 28);
  }

  // ── Unit / Building factories ────────────────────────────────────────────────
  spawnUnit(type: UnitType, faction: Faction, x: number, y: number, keepFormation = false): Unit {
    const spawnPos = this.findSafeSpawnPoint(faction, x, y, keepFormation);
    const unit = new Unit(this, spawnPos.x, spawnPos.y, type, faction);
    unit.setRoutePlanner((fromX, fromY, toX, toY) => {
      const clampedX = this.clampTerritoryX(faction, type, toX);
      return this.findPath(fromX, fromY, clampedX, toY);
    });
    const rKey: 'p1' | 'p2' = faction === 'blue' ? 'p1' : 'p2';
    unit.onKill = () => this.resourceSystem.addResources(rKey, 15, 0);
    if (faction === 'blue') {
      this.p1Units.push(unit);
    } else {
      this.p2Units.push(unit);
    }
    return unit;
  }

  private findSafeSpawnPoint(_faction: Faction, desiredX: number, desiredY: number, keepFormation = false) {
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
        x: keepFormation ? world.x : world.x + Phaser.Math.Between(-10, 10),
        y: keepFormation ? world.y : world.y + Phaser.Math.Between(-10, 10),
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
    if (!this.canTrainUnitByProducerCap(type, 'p1', true)) return;
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

  /** Hides deco and foam sprites outside the camera viewport (+256 px margin)
   *  to keep batch counts and per-frame work proportional to visible area. */
  private cullDecoAndFoam(): void {
    const cam = this.cameras.main;
    const margin = 256;
    const left   = cam.worldView.x - margin;
    const right  = cam.worldView.right + margin;
    const top    = cam.worldView.y - margin;
    const bottom = cam.worldView.bottom + margin;
    for (const s of this.decoSprites) {
      const visible = s.x >= left && s.x <= right && s.y >= top && s.y <= bottom;
      if (s.visible !== visible) s.setVisible(visible);
      if (s.active !== visible) s.setActive(visible);
    }
    for (const s of this.foamSprites) {
      const visible = s.x >= left && s.x <= right && s.y >= top && s.y <= bottom;
      if (s.visible !== visible) s.setVisible(visible);
      if (s.active !== visible) s.setActive(visible);
    }
    if (this.wildlifeSystem) {
      for (const s of this.wildlifeSystem.getSprites()) {
        const visible = s.x >= left && s.x <= right && s.y >= top && s.y <= bottom;
        if (s.visible !== visible) s.setVisible(visible);
        // Don't deactivate sheep — they need update() to keep wandering.
      }
    }
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
    const introZoom = 0.55;
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
    keyboard?.on('keydown-ESC', () => {
      this.cancelBuildMode();
      this.clearSelection();
    });

    // Mouse click for building placement and unit commands
    const isTouchDevice = this.sys.game.device.input.touch;
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.introCameraActive) return;
      if (!this.isPointerFromGameCanvas(ptr)) return;

      const wx = ptr.worldX;
      const wy = ptr.worldY;

      // ── TOUCH: tap-to-select, second-tap-to-move ───────────────────────────
      if (isTouchDevice) {
        const now = this.time.now;
        const activeTouchCount = [this.input.pointer1, this.input.pointer2, this.input.pointer3]
          .filter((p) => p.isDown).length;

        if (!this.buildMode) {
          // Double-tap camera reset only when nothing is selected
          if (!this.selectedUnitId && activeTouchCount <= 1 && now - this.lastTapMs < 280) {
            this.resetCameraView();
          }
          this.lastTapMs = now;

          const clickedUnit = this.getUnitAtPosition(wx, wy);

          // Tap on a friendly unit → select it
          if (clickedUnit && clickedUnit.state.faction === 'blue' && clickedUnit.isAlive()) {
            this.selectUnit(clickedUnit.state.id);
            return;
          }

          // Tap on empty/enemy while unit is selected → move command
          if (this.selectedUnitId) {
            const sel = this.p1Units.find(u => u.state.id === this.selectedUnitId && u.isAlive());
            if (sel) {
              // Calculate the actual target (nearest walkable tile from where player clicked)
              const targetTile = this.findNearestWalkableTile(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
              const actualTargetWorld = this.tileToWorld(targetTile.tx, targetTile.ty);
              
              this.commandSystem.enqueue({
                kind: 'move',
                faction: 'blue',
                unitId: this.selectedUnitId,
                x: actualTargetWorld.x,
                y: actualTargetWorld.y,
              });
              // Spawn marker at the actual target, not where player clicked
              this.spawnMoveMarker(actualTargetWorld.x, actualTargetWorld.y);
            }
            return;
          }

          // Tap empty with nothing selected — no-op; camera drag handles panning
          return;
        }
        // Build mode on touch falls through to the shared build block below
      }

      // ── DESKTOP: right-click cancels build / issues move ──────────────────
      if (!isTouchDevice) {
        if (this.buildMode && ptr.rightButtonDown()) {
          this.cancelBuildMode();
          return;
        }

        const clickedUnit = this.getUnitAtPosition(wx, wy);
        if (clickedUnit && clickedUnit.state.faction === 'blue' && clickedUnit.isAlive()) {
          if (ptr.leftButtonDown()) {
            this.selectUnit(clickedUnit.state.id);
            return;
          }
          // Right-click the selected unit itself → deselect
          if (ptr.rightButtonDown() && this.selectedUnitId === clickedUnit.state.id) {
            this.clearSelection();
            return;
          }
        }

        // Right-click empty space → move selected unit
        if (ptr.rightButtonDown() && this.selectedUnitId) {
          const sel = this.p1Units.find(u => u.state.id === this.selectedUnitId && u.isAlive());
          if (sel) {
            // Calculate the actual target (nearest walkable tile from where player clicked)
            const targetTile = this.findNearestWalkableTile(Math.floor(wx / TILE_SIZE), Math.floor(wy / TILE_SIZE));
            const actualTargetWorld = this.tileToWorld(targetTile.tx, targetTile.ty);
            
            this.commandSystem.enqueue({
              kind: 'move',
              faction: 'blue',
              unitId: this.selectedUnitId,
              x: actualTargetWorld.x,
              y: actualTargetWorld.y,
            });
            // Spawn marker at the actual target, not where player clicked
            this.spawnMoveMarker(actualTargetWorld.x, actualTargetWorld.y);
          }
          return;
        }

        // Left-click empty space deselects
        if (ptr.leftButtonDown() && !this.getUnitAtPosition(wx, wy)) {
          this.clearSelection();
        }
      }

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

        // Single-place mode: after a successful placement, exit build mode.
        if (placed) {
          this.cancelBuildMode();
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
    const wasPrep = !this.isWarActive();
    this.elapsedSecs += dt;
    if (wasPrep && this.isWarActive() && !this.warBeginNotified) {
      this.warBeginNotified = true;
      this.callbacks.onWarBegin?.();
      this.cameras.main.shake(420, 0.006);
    }

    // Camera pan
    this.handleCameraPan(stableDelta);

    // Stage territory clamps + build placement grid overlays.
    this.updateTerritoryClampOverlay();
    this.updateBuildGridOverlay();

    // Ambient sway (trees + grass tufts) — throttled to every 3rd frame on mobile.
    this.swayFrameCount++;
    if (!this.isMobileDevice || this.swayFrameCount % 3 === 0) {
      this.swaySystem.update(stableDelta);
    }

    // Wandering sheep
    this.wildlifeSystem?.update(stableDelta);

    // Frustum culling for deco/foam — throttled to 250 ms.
    this.cullCooldownMs -= stableDelta;
    if (this.cullCooldownMs <= 0) {
      this.cullCooldownMs = 250;
      this.cullDecoAndFoam();
    }

    // Fog of war
    this.fogSystem?.update(stableDelta, this.p1Units, this.p1Buildings, this.cameras.main);

    // Hide enemy units/buildings that are inside fog; reveal them when visible.
    // On mobile throttle to every other frame to halve the setVisible call cost.
    if (this.fogSystem && (!this.isMobileDevice || this.swayFrameCount % 2 === 0)) {
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
        this.spawnUnit(first.type, 'blue', spawnOrigin.x, spawnOrigin.y, true);
        playUnitTrained();
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

    // House/church passive economy income
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
    this.resolveUnitBuildingCollisions(stableDelta);
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
    // Reduced smoothing to prevent wavy motion; use snappier response
    const smoothing = Phaser.Math.Clamp(dt * 8, 0.08, 0.18);

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

      const midX = (pointer1.x + pointer2.x) * 0.5;
      const midY = (pointer1.y + pointer2.y) * 0.5;

      const distance = Phaser.Math.Distance.Between(pointer1.x, pointer1.y, pointer2.x, pointer2.y);
      if (this.pinchDistanceLast !== null) {
        const zoomDelta = (distance - this.pinchDistanceLast) * 0.004;
        const targetZoom = Phaser.Math.Clamp(cam.zoom + zoomDelta, this.minZoom, this.maxZoom);
        // Anchor zoom to pinch midpoint so the map doesn't drift
        const before = cam.getWorldPoint(midX, midY);
        cam.setZoom(targetZoom);
        const after = cam.getWorldPoint(midX, midY);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
      }
      this.pinchDistanceLast = distance;

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
          // Apply momentum directly without intermediate smoothing to avoid wavy motion
          this.dragInertia.x = velX * 0.85;
          this.dragInertia.y = velY * 0.85;
        } else {
          this.dragInertia.set(0, 0);
        }
        this.dragLastX = dragPtr.x;
        this.dragLastY = dragPtr.y;
        this.dragTracking = true;
      } else {
        this.dragTracking = false;
        // Momentum decay — friction-based (feels like sliding on glass)
        const friction = isTouchDevice ? 0.92 : 0.85;
        this.dragInertia.x *= friction;
        this.dragInertia.y *= friction;
        if (Math.abs(this.dragInertia.x) < 1.5 && Math.abs(this.dragInertia.y) < 1.5) {
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
    const gameplayZoom = 0.55;
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

    const p1All = [...this.p1Resources, ...this.forestNodes];
    const p2All = [...this.p2Resources, ...this.forestNodes];
    this.updatePawnWorkers(this.p1Units, p1All, 'p1');
    this.updatePawnWorkers(this.p2Units, p2All, 'p2');
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
        this.resourceSystem.addResources(faction, 0, TREE_WOOD_BONUS);
        this.spawnResourceText(u.state.x, u.state.y - 28, `+${TREE_WOOD_BONUS} wood`, '#8bff99');
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
        this.resourceSystem.addResources(faction, MINE_GOLD_BONUS, 0);
        this.spawnResourceText(u.state.x, u.state.y - 28, `+${MINE_GOLD_BONUS} gold`, '#ffd166');
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
      if (crowd >= maxCrowd) continue;
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
      // Scouts (slingers) are controlled by scout/manual logic, not guard patrol.
      if (unit.state.type === 'pawn' || unit.state.type === 'monk' || unit.state.type === 'slinger') continue;
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

    const aliveScoutIds = new Set<number>(scouts.map((s) => s.state.id));
    for (const id of this.p1SlingerWaypointIndex.keys()) {
      if (!aliveScoutIds.has(id)) this.p1SlingerWaypointIndex.delete(id);
    }
    for (const id of this.p1ManualScoutControl.keys()) {
      if (!aliveScoutIds.has(id)) this.p1ManualScoutControl.delete(id);
    }

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
      const manualControl = this.p1ManualScoutControl.has(scout.state.id);
      // Advance waypoint when the scout is close to the current one
      if (!manualControl && scout.state.state === 'idle') {
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
    for (const resource of this.forestNodes) {
      if (resource.active && resource.type === 'tree' && resource.tx === tx && resource.ty === ty) return true;
    }
    return false;
  }

  private hasActiveTreeAtTile(tx: number, ty: number) {
    for (const resource of this.p1Resources) {
      if (resource.active && resource.type === 'tree' && resource.tx === tx && resource.ty === ty) return true;
    }
    for (const resource of this.p2Resources) {
      if (resource.active && resource.type === 'tree' && resource.tx === tx && resource.ty === ty) return true;
    }
    for (const resource of this.forestNodes) {
      if (resource.active && resource.tx === tx && resource.ty === ty) return true;
    }
    return false;
  }

  private getBuildTileBlockReason(tileX: number, tileY: number, islandMinX: number, islandMaxX: number):
    | 'out-of-bounds'
    | 'terrain'
    | 'tree'
    | 'resource'
    | 'occupied'
    | null {
    const outOfBounds = tileX < islandMinX || tileX > islandMaxX || tileY < 1 || tileY > MAP_ROWS - 2;
    if (outOfBounds) return 'out-of-bounds';

    const cell = this.getTerrainCell(tileX, tileY);
    if (!cell || !cell.buildable || cell.stair) return 'terrain';
    if (this.hasActiveTreeAtTile(tileX, tileY)) return 'tree';
    if (this.hasResourceNodeAtTile(tileX, tileY)) return 'resource';
    if (this.occupiedTiles.has(`${tileX},${tileY}`)) return 'occupied';
    return null;
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
        if (this.getBuildTileBlockReason(tileX, tileY, islandMinX, islandMaxX) !== null) return false;
      }
    }

    for (let dtx = -1; dtx < cfg.width + 1; dtx++) {
      for (let dty = -1; dty < cfg.height + 1; dty++) {
        const bc = this.getTerrainCell(tx + dtx, ty + dty);
        if (!bc || bc.water) return false;
      }
    }
    return true;
  }

  private drawBuildFootprint(tx: number, ty: number, width: number, height: number, canPlace: boolean) {
    if (!this.buildFootprintGhost) return;

    const g = this.buildFootprintGhost;
    const goodFill = 0x5cff87;
    const badFill = 0xff4d4d;
    const treeFill = 0x2c8f3f;
    const resourceFill = 0xd3a93a;
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
        const reason = this.getBuildTileBlockReason(tileX, tileY, islandMinX, islandMaxX);
        const blocked = reason !== null;
        const fillColor = !blocked
          ? goodFill
          : reason === 'tree'
            ? treeFill
            : reason === 'resource'
              ? resourceFill
              : badFill;
        const lineColor = !blocked ? goodLine : badLine;
        const alpha = canPlace ? 0.20 : blocked ? 0.28 : 0.14;

        g.fillStyle(fillColor, alpha);
        g.lineStyle(2, lineColor, 0.8);
        g.fillRect(tileX * TILE_SIZE, tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        g.strokeRect(tileX * TILE_SIZE + 1, tileY * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);

        // Extra graph cue: draw an X over blocked tiles so the reason is obvious while dragging.
        if (blocked) {
          g.lineStyle(2, 0x1b2430, 0.45);
          g.lineBetween(tileX * TILE_SIZE + 8, tileY * TILE_SIZE + 8, tileX * TILE_SIZE + TILE_SIZE - 8, tileY * TILE_SIZE + TILE_SIZE - 8);
          g.lineBetween(tileX * TILE_SIZE + TILE_SIZE - 8, tileY * TILE_SIZE + 8, tileX * TILE_SIZE + 8, tileY * TILE_SIZE + TILE_SIZE - 8);
        }
      }
    }
  }

  /** Draw stage clamp boundaries (economy/prepare) directly on the world map. */
  private updateTerritoryClampOverlay() {
    if (!this.territoryClampOverlay) {
      this.territoryClampOverlay = this.add.graphics();
      this.territoryClampOverlay.setDepth(202);
    }

    const stage = this.getMatchStage();
    if (stage === this.lastTerritoryOverlayStage) return;
    this.lastTerritoryOverlayStage = stage;

    const g = this.territoryClampOverlay;
    g.clear();

    if (stage === 'war') return;

    const leftClamp = stage === 'economy' ? P1_TERRITORY_MAX_X : P1_STAGING_MAX_X;
    const rightClamp = stage === 'economy' ? P2_TERRITORY_MIN_X : P2_STAGING_MIN_X;
    const blockedBandW = Math.max(0, rightClamp - leftClamp);

    // Middle restricted strip for non-scout units.
    g.fillStyle(stage === 'economy' ? 0x7f1d1d : 0x8b5a10, stage === 'economy' ? 0.11 : 0.09);
    g.fillRect(leftClamp, 0, blockedBandW, MAP_ROWS * TILE_SIZE);

    // Clamp guide lines.
    g.lineStyle(2, 0xf0d060, 0.58);
    g.lineBetween(leftClamp, 0, leftClamp, MAP_ROWS * TILE_SIZE);
    g.lineBetween(rightClamp, 0, rightClamp, MAP_ROWS * TILE_SIZE);
  }

  /** Draws a tile grid over the current camera view while build mode is active. */
  private updateBuildGridOverlay() {
    if (!this.buildGridOverlay) {
      this.buildGridOverlay = this.add.graphics();
      this.buildGridOverlay.setDepth(220);
    }

    const g = this.buildGridOverlay;
    g.clear();
    if (!this.buildMode) return;

    const worldView = this.cameras.main.worldView;
    const startTx = Phaser.Math.Clamp(Math.floor(worldView.x / TILE_SIZE), 0, MAP_COLS);
    const endTx = Phaser.Math.Clamp(Math.ceil(worldView.right / TILE_SIZE), 0, MAP_COLS);
    const startTy = Phaser.Math.Clamp(Math.floor(worldView.y / TILE_SIZE), 0, MAP_ROWS);
    const endTy = Phaser.Math.Clamp(Math.ceil(worldView.bottom / TILE_SIZE), 0, MAP_ROWS);

    g.lineStyle(1, 0xf0d060, 0.28);
    for (let tx = startTx; tx <= endTx; tx++) {
      const x = tx * TILE_SIZE;
      g.lineBetween(x, startTy * TILE_SIZE, x, endTy * TILE_SIZE);
    }
    for (let ty = startTy; ty <= endTy; ty++) {
      const y = ty * TILE_SIZE;
      g.lineBetween(startTx * TILE_SIZE, y, endTx * TILE_SIZE, y);
    }
  }

  /** Safety pass: remove any resources that ended up on building footprints. */
  private pruneResourcesOnOccupiedTiles() {
    const prune = (nodes: ResourceNode[]) => {
      const kept: ResourceNode[] = [];
      for (const node of nodes) {
        if (this.occupiedTiles.has(`${node.tx},${node.ty}`)) {
          node.destroy();
          continue;
        }
        kept.push(node);
      }
      return kept;
    };

    this.p1Resources = prune(this.p1Resources);
    this.p2Resources = prune(this.p2Resources);
    this.forestNodes = prune(this.forestNodes);
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

  private resolveUnitBuildingCollisions(delta: number) {
    const dt = Math.max(0, delta) / 1000;
    const smoothPushSpeed = 380;
    const forcedSnapAfterMs = 300;

    const pushOut = (unit: Unit) => {
      if (!unit.isAlive()) return;

      const tile = this.worldToTile(unit.state.x, unit.state.y);
      if (!this.isBuildingTileOccupied(tile.tx, tile.ty)) {
        this.unitBuildingOverlapMs.delete(unit.state.id);
        return;
      }

      const overlapMs = (this.unitBuildingOverlapMs.get(unit.state.id) ?? 0) + delta;
      this.unitBuildingOverlapMs.set(unit.state.id, overlapMs);

      const nearest = this.findNearestWalkableTile(tile.tx, tile.ty);
      if (this.isBuildingTileOccupied(nearest.tx, nearest.ty)) return;
      const world = this.tileToWorld(nearest.tx, nearest.ty);
      const dx = world.x - unit.state.x;
      const dy = world.y - unit.state.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.001 || overlapMs >= forcedSnapAfterMs) {
        unit.state.x = world.x;
        unit.state.y = world.y;
      } else {
        const step = Math.min(dist, smoothPushSpeed * dt);
        unit.state.x += (dx / dist) * step;
        unit.state.y += (dy / dist) * step;
      }

      const nowTile = this.worldToTile(unit.state.x, unit.state.y);
      if (!this.isBuildingTileOccupied(nowTile.tx, nowTile.ty)) {
        this.unitBuildingOverlapMs.delete(unit.state.id);
      }
    };

    for (const unit of this.p1Units) pushOut(unit);
    for (const unit of this.p2Units) pushOut(unit);
  }

  private pruneDeadUnits() {
    const aliveIds = new Set<number>();
    for (const unit of this.p1Units) if (unit.isAlive()) aliveIds.add(unit.state.id);
    for (const unit of this.p2Units) if (unit.isAlive()) aliveIds.add(unit.state.id);
    for (const id of this.unitBuildingOverlapMs.keys()) {
      if (!aliveIds.has(id)) this.unitBuildingOverlapMs.delete(id);
    }
    // Clean all per-unit tracking maps so dead-unit entries don't accumulate
    // and don't inflate resource node crowd counts blocking live pawns.
    for (const id of this.workerGatherMs.keys()) {
      if (!aliveIds.has(id)) this.workerGatherMs.delete(id);
    }
    for (const id of this.pawnMoveStartMs.keys()) {
      if (!aliveIds.has(id)) this.pawnMoveStartMs.delete(id);
    }
    for (const id of this.pawnNodeAssignment.keys()) {
      if (!aliveIds.has(id)) this.pawnNodeAssignment.delete(id);
    }
    for (const id of this.monkPatrolMs.keys()) {
      if (!aliveIds.has(id)) this.monkPatrolMs.delete(id);
    }
    for (const id of this.idlePatrolMs.keys()) {
      if (!aliveIds.has(id)) this.idlePatrolMs.delete(id);
    }

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
    if (winner === 'player') playVictoryFanfare();
    else playDefeatSound();
    this.time.delayedCall(1200, () => {
      this.callbacks.onGameEnd(winner, reason);
    });
  }

  /** Public: returns current and max HP of both castles for HUD display. */
  getCastleHp(): { p1: { hp: number; maxHp: number } | null; p2: { hp: number; maxHp: number } | null } {
    const p1 = this.p1Buildings.find(b => b.type === 'castle');
    const p2 = this.p2Buildings.find(b => b.type === 'castle');
    return {
      p1: p1 ? { hp: p1.hp, maxHp: p1.maxHp } : null,
      p2: p2 ? { hp: p2.hp, maxHp: p2.maxHp } : null,
    };
  }

  /** Prep phase: armies stay home, only Scouts cross. War begins when this returns true. */
  isWarActive(): boolean {
    return this.getMatchStage() === 'war';
  }

  /** Seconds remaining in the prep phase (0 once war begins). */
  getPrepRemaining(): number {
    return Math.max(0, PREP_DURATION_SECS - this.elapsedSecs);
  }

  getMatchStage(): MatchStageId {
    if (this.elapsedSecs < STAGE_ECONOMY_DURATION_SECS) return 'economy';
    if (this.elapsedSecs < STAGE_ECONOMY_DURATION_SECS + STAGE_PREPARE_DURATION_SECS) return 'prepare';
    return 'war';
  }

  getMatchStageRemaining(): number {
    const stage = this.getMatchStage();
    if (stage === 'economy') return Math.max(0, STAGE_ECONOMY_DURATION_SECS - this.elapsedSecs);
    if (stage === 'prepare') {
      return Math.max(0, STAGE_ECONOMY_DURATION_SECS + STAGE_PREPARE_DURATION_SECS - this.elapsedSecs);
    }
    return Math.max(0, GAME_DURATION_SECS - this.elapsedSecs);
  }

  /** True if a non-scout unit of the given faction is being asked to leave its home half. */
  private wouldCrossTerritory(faction: Faction, type: UnitType, targetX: number): boolean {
    const stage = this.getMatchStage();
    if (stage === 'war') return false;
    // Scouts may cross at any stage to scout and respond to direct player commands.
    if (type === 'slinger') return false;
    if (stage === 'economy') {
      return faction === 'blue' ? targetX > P1_TERRITORY_MAX_X : targetX < P2_TERRITORY_MIN_X;
    }
    return faction === 'blue' ? targetX > P1_STAGING_MAX_X : targetX < P2_STAGING_MIN_X;
  }

  /** Clamp a target X to keep non-scout units inside their home territory during prep. */
  clampTerritoryX(faction: Faction, type: UnitType, targetX: number): number {
    if (!this.wouldCrossTerritory(faction, type, targetX)) return targetX;
    const stage = this.getMatchStage();
    const boundary = stage === 'economy'
      ? (faction === 'blue' ? P1_TERRITORY_MAX_X : P2_TERRITORY_MIN_X)
      : (faction === 'blue' ? P1_STAGING_MAX_X : P2_STAGING_MIN_X);
    return faction === 'blue'
      ? Math.min(targetX, boundary - TILE_SIZE)
      : Math.max(targetX, boundary + TILE_SIZE);
  }

  shutdown() {
    this.introUnlockEvent?.remove(false);
    this.introUnlockEvent = null;
    this.introCameraActive = false;
    this.input.enabled = true;
    this.cancelBuildMode();
    this.territoryClampOverlay?.destroy();
    this.territoryClampOverlay = null;
    this.buildGridOverlay?.destroy();
    this.buildGridOverlay = null;
    this.lastTerritoryOverlayStage = null;
  }
}

