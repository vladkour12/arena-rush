import * as Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/ResourceNode';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { AISystem } from '../systems/AISystem';
import { TRAIN_QUEUE_MAX, UNIT_CONFIGS } from '../config/units';
import { BUILDING_CONFIGS } from '../config/buildings';
import {
  TILE_SIZE, MAP_COLS, MAP_ROWS,
  P1_ISLAND_X1, P1_ISLAND_X2, WATER_X1, WATER_X2, P2_ISLAND_X1, P2_ISLAND_X2,
  P1_CASTLE_TX, P1_CASTLE_TY, P2_CASTLE_TX, P2_CASTLE_TY,
  P1_SPAWN_X, P1_SPAWN_Y, P2_SPAWN_X, P2_SPAWN_Y,
  P1_RESOURCES, P2_RESOURCES,
  GAME_DURATION_SECS, ISLAND_COLLIDE_SECS,
} from '../config/map';
import type { UnitType, Faction } from '../config/units';
import type { BuildingType } from '../config/buildings';

export interface IslandWarsCallbacks {
  onResourcesUpdate: (gold: number, wood: number) => void;
  onTimerUpdate: (remaining: number, islandsConnected: boolean) => void;
  onGameEnd: (winner: 'player' | 'bot', reason: string) => void;
  onTrainQueueUpdate: (queue: TrainQueueDisplayItem[]) => void;
}

export interface TrainQueueDisplayItem {
  type: UnitType;
  remainingMs: number;
  active: boolean;
}

interface TerrainCell {
  level: number;
  walkable: boolean;
  buildable: boolean;
  stair: boolean;
  water: boolean;
  tileKind: 'water' | 'flat' | 'sand' | 'elevated' | 'summit' | 'stair';
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
  private islandsConnected = false;
  private driftColumnsClaimed = 0;
  private maxDriftColumnsPerSide = 0;
  private driftBannerShown = false;
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
  private civilianThinkMs = 0;
  private workerGatherMs = new Map<number, number>();
  private monkPatrolMs = new Map<number, number>();
  private cameraVelocity = new Phaser.Math.Vector2(0, 0);
  private pinchDistanceLast: number | null = null;
  private lastTapMs = 0;
  private introCameraActive = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private dragTracking = false;
  private combatThrottleMs = 0;
  private pruneThrottleMs = 0;
  private houseGoldMs = 0;
  private introUnlockEvent: Phaser.Time.TimerEvent | null = null;

  private readonly minZoom = 0.12;
  private readonly maxZoom = 1.4;

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
    this.buildFootprintGhost = null;
    this.civilianThinkMs = 0;
    this.workerGatherMs = new Map();
    this.monkPatrolMs = new Map();
    this.islandsConnected = false;
    this.driftColumnsClaimed = 0;
    this.maxDriftColumnsPerSide = Math.max(1, Math.floor((WATER_X2 - WATER_X1 + 1) / 2));
    this.driftBannerShown = false;
    this.p1SpawnPoint = { x: P1_SPAWN_X, y: P1_SPAWN_Y };
    this.p2SpawnPoint = { x: P2_SPAWN_X, y: P2_SPAWN_Y };
    this.introCameraActive = false;
    this.introUnlockEvent?.remove(false);
    this.introUnlockEvent = null;

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
    );
    this.resourceSystem = new ResourceSystem(this.p1Resources, this.p2Resources);

    this.aiSystem = new AISystem(
      this.resourceSystem,
      this.p2Units,
      this.p2Buildings,
      false,
      (type, faction, x, y) => this.spawnUnit(type, faction, x, y),
      (type, faction, tx, ty) => this.placeBuilding(type, faction, tx, ty),
      (type) => this.getSpawnOriginForType(type, 'p2'),
    );
    this.aiSystem.setSpawnPoint(this.p2SpawnPoint.x, this.p2SpawnPoint.y);

    this.setupCamera();
    this.setupInput();
    this.playIntroCameraPan();
  }

  // ── Map building ────────────────────────────────────────────────────────────
  private buildMap() {
    const mapW = MAP_COLS * TILE_SIZE;
    const mapH = MAP_ROWS * TILE_SIZE;
    const waterDeep = 0x2f9fa4;
    const waterMid = 0x63c7c4;
    const grassColor = 0x5a8a3a;
    const sandColor  = 0xd4a44c;

    this.terrainGrid = Array.from({ length: MAP_ROWS }, () =>
      Array.from({ length: MAP_COLS }, () => ({
        level: 0,
        walkable: false,
        buildable: false,
        stair: false,
        water: true,
        tileKind: 'water' as const,
      })),
    );

    // Water base uses actual Tiny Swords water art for a more dimensional look.
    const waterBg = this.add.tileSprite(mapW * 0.5, mapH * 0.5, mapW, mapH, 'terrain_water');
    waterBg.setTint(waterDeep);
    waterBg.setAlpha(0.96);
    waterBg.setDepth(0);

    // Lighter water lane in the center
    const waterLane = this.add.graphics();
    waterLane.fillStyle(waterMid, 0.18);
    waterLane.fillRect(WATER_X1 * TILE_SIZE, 0, (WATER_X2 - WATER_X1 + 1) * TILE_SIZE, mapH);
    waterLane.setDepth(0.2);

    // Horizontal wave bands for visible depth
    for (let i = 0; i < 6; i++) {
      const band = this.add.graphics();
      band.fillStyle(0x4f86c9, 0.06 + i * 0.01);
      band.fillRect(WATER_X1 * TILE_SIZE + i * 14, 0, (WATER_X2 - WATER_X1 + 1) * TILE_SIZE - i * 28, mapH);
      band.setDepth(0.25 + i * 0.01);
    }

    // Animated water shimmer
    for (let i = 0; i < 20; i++) {
      const wx = Phaser.Math.Between(WATER_X1 * TILE_SIZE, WATER_X2 * TILE_SIZE);
      const wy = Phaser.Math.Between(0, mapH);
      const ripple = this.add.ellipse(wx, wy, Phaser.Math.Between(18, 36), Phaser.Math.Between(4, 10), 0x75a9e5, 0.32);
      ripple.setDepth(1);
      this.tweens.add({
        targets: ripple,
        alpha: 0,
        scaleX: 2.3,
        scaleY: 1.5,
        duration: Phaser.Math.Between(1300, 2700),
        repeat: -1,
        yoyo: false,
        delay: Phaser.Math.Between(0, 2600),
      });
    }

    // Water foam sits above water but below land, following the tilemap guide.
    this.addFoamBand(P1_ISLAND_X2, true);
    this.addFoamBand(P2_ISLAND_X1, false);

    // P1 island
    this.drawIsland(P1_ISLAND_X1, P1_ISLAND_X2, grassColor, sandColor);
    this.decorateIsland(P1_ISLAND_X1, P1_ISLAND_X2, true);
    // P2 island
    this.drawIsland(P2_ISLAND_X1, P2_ISLAND_X2, grassColor, sandColor);
    this.decorateIsland(P2_ISLAND_X1, P2_ISLAND_X2, false);

    // Water strips at top and bottom make islands feel surrounded by sea
    const topSea = this.add.graphics();
    topSea.fillStyle(waterDeep, 0.9);
    topSea.fillRect(0, 0, mapW, TILE_SIZE);
    topSea.setDepth(2.6);

    const bottomSea = this.add.graphics();
    bottomSea.fillStyle(waterDeep, 0.9);
    bottomSea.fillRect(0, (MAP_ROWS - 1) * TILE_SIZE, mapW, TILE_SIZE);
    bottomSea.setDepth(2.6);

    // Island labels
    this.add.text(
      (P1_ISLAND_X1 + P1_ISLAND_X2 + 1) * 0.5 * TILE_SIZE,
      3 * TILE_SIZE,
      'YOUR KINGDOM',
      { fontFamily: 'serif', fontSize: '20px', color: '#ffffff', stroke: '#222', strokeThickness: 4 },
    ).setOrigin(0.5).setDepth(30);

    this.add.text(
      (P2_ISLAND_X1 + P2_ISLAND_X2 + 1) * 0.5 * TILE_SIZE,
      3 * TILE_SIZE,
      'ENEMY KINGDOM',
      { fontFamily: 'serif', fontSize: '20px', color: '#ff8888', stroke: '#222', strokeThickness: 4 },
    ).setOrigin(0.5).setDepth(30);
  }

  private drawIsland(x1: number, x2: number, _grassColor: number, _sandColor: number) {
    const T = TILE_SIZE;
    const isP1 = x2 < MAP_COLS / 2;
    const islandWidth = x2 - x1 + 1;
    const icx = (x1 + x2) * 0.5;
    const icy = MAP_ROWS * 0.5;
    const rx = islandWidth * 0.50;
    const ry = MAP_ROWS * 0.28;
    const seed = isP1 ? 0.4 : 2.9;

    // ── Organic signed-distance from island boundary ───────────────────────
    // Returns > 0 inside island, < 0 in water.
    const islandSDF = (tx: number, ty: number): number => {
      const dx = (tx - icx) / rx;
      const dy = (ty - icy) / ry;
      const angle = Math.atan2(dy, dx);
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const noise =
        Math.sin(angle * 3.0 + seed)        * 0.13 +
        Math.sin(angle * 5.6 + seed * 1.4)  * 0.07 +
        Math.sin(angle * 8.1 + seed * 0.8)  * 0.04 +
        Math.sin(angle * 11.3 + seed * 0.3) * 0.02 +
        Math.sin(tx * 0.26  + seed * 1.2)   * 0.015 +
        Math.cos(ty * 0.21  + seed * 0.9)   * 0.015;
      return 1.0 + noise - dist;
    };

    // ── Visual level: 0=water, 1=sand beach, 2=grass, 3=elevated ──────────
    const computeVisualLevel = (tx: number, ty: number): 0 | 1 | 2 | 3 => {
      if (tx < x1 || tx > x2 || ty < 5 || ty > MAP_ROWS - 6) return 0;
      const sdf = islandSDF(tx, ty);
      if (sdf < 0) return 0;
      if (sdf < 0.22) return 1; // sand beach ring
      const dx = (tx - icx) / rx;
      const dy = (ty - icy) / ry;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const en =
        Math.sin(angle * 3.8 + seed + 1.0) * 0.09 +
        Math.sin(angle * 6.1 + seed * 1.3) * 0.05 +
        Math.cos(tx    * 0.18 + seed * 0.7) * 0.03 +
        Math.sin(ty    * 0.24 + seed * 1.4) * 0.03;
      if (dist < 0.42 + en) return 3; // elevated plateau
      return 2;
    };

    // ── 2. Write terrain grid ─────────────────────────────────────────────────
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const vl = computeVisualLevel(tx, ty);
        if (vl === 0) continue;
        const cell = this.terrainGrid[ty][tx];
        cell.water    = false;
        cell.walkable = true;
        if (vl <= 2) {
          cell.level     = 1;
          cell.buildable = true;
          cell.tileKind  = vl === 1 ? 'sand' : 'flat';
        } else {
          cell.level     = 2;
          cell.buildable = false;
          cell.tileKind  = 'elevated';
        }
      }
    }
    this.applyIslandStairs(x1, x2, isP1);

    // ── 3. Tile frame helpers ─────────────────────────────────────────────────
    // Tilemap_Flat.png = 640×256 = 10 cols × 4 rows at 64 px → key 'tf'
    // frame = row*10 + col,  col 0-2 = grass,  col 5-7 = sand (same layout)
    const levelAt = (tx: number, ty: number): number => {
      if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) return 0;
      const c = this.terrainGrid[ty][tx];
      return (!c || c.water) ? 0 : c.level;
    };

    const tfFrame = (tx: number, ty: number, minLv: number, sandOffset: number): number => {
      const L = levelAt(tx - 1, ty) >= minLv;
      const R = levelAt(tx + 1, ty) >= minLv;
      const U = levelAt(tx, ty - 1) >= minLv;
      const D = levelAt(tx, ty + 1) >= minLv;
      const col = (!L && !R) ? 1 : (!L) ? 0 : (!R) ? 2 : 1;
      const row = (!U && !D) ? 1 : (!U) ? 0 : (!D) ? 2 : 1;
      return row * 10 + col + sandOffset;
    };

    // Tilemap_Elevation = 256×384, 4 cols × 6 rows at 64 px → key 'te'
    // Rows 0-1 = main cliff face (top cap + body). frame = row*4 + col.
    const cliffEdgeCol = (tx: number, ty: number): number => {
      const L = levelAt(tx - 1, ty) >= 2;
      const R = levelAt(tx + 1, ty) >= 2;
      return (!L && !R) ? 1 : (!L) ? 0 : (!R) ? 2 : 1;
    };

    // ── 4. Draw tiles ─────────────────────────────────────────────────────────
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const cell = this.terrainGrid[ty][tx];
        if (!cell || cell.water) continue;

        const l      = cell.level;
        const isSand = cell.tileKind === 'sand';
        const isElev = l >= 2 && !cell.stair;
        const px     = tx * T + T * 0.5;
        const py     = ty * T + T * 0.5;
        const depth  = isElev ? 2.5 : 1.5;
        const lift   = isElev ? 22 : 0;
        const drawY  = py - lift;

        // Surface tile
        const frame = tfFrame(tx, ty, l, isSand ? 5 : 0);
        const surf  = this.add.image(px, drawY, 'tf', frame);
        surf.setDepth(depth);
        if (isElev) surf.setTint(0xd4eba8); // light green elevated plateau
        if (isSand) surf.setTint(0xf0df90); // warm sandy beach

        // Rim highlights on elevated edges
        if (isElev) {
          if (levelAt(tx, ty - 1) < 2)
            this.add.rectangle(px, drawY - T * 0.5 + 2, T, 3, 0xffffff, 0.22).setDepth(depth + 0.16);
          if (levelAt(tx, ty + 1) < 2)
            this.add.rectangle(px, drawY + T * 0.5 - 2, T, 4, 0x000000, 0.16).setDepth(depth + 0.16);
        }

        // 2-tile cliff face wherever elevation drops going south
        if (levelAt(tx, ty + 1) < l && ty + 1 < MAP_ROWS) {
          const cc     = cliffEdgeCol(tx, ty);
          const faceY  = ty * T + T - lift;
          // Row 0 of Tilemap_Elevation = cliff top cap
          const cap = this.add.image(px, faceY, 'te', cc);
          cap.setOrigin(0.5, 0); cap.setDepth(depth + 0.14);
          // Row 1 = cliff body
          const body = this.add.image(px, faceY + T, 'te', 4 + cc);
          body.setOrigin(0.5, 0); body.setDepth(depth + 0.13);
          // Soft shadow at base
          const sh = this.add.image(px, faceY + T * 1.9, 'ts', 0);
          sh.setAlpha(0.30); sh.setDepth(depth + 0.09);
        }
      }
    }
  }

  // ── Island decorations: trees, deco mushrooms, water rocks ────────────────
  private decorateIsland(x1: number, x2: number, isP1: boolean) {
    const T = TILE_SIZE;

    // Deterministic pseudo-random (no external dependency)
    const rng = (seed: number): number => {
      const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };

    // ── Trees on grass and elevated tiles ──────────────────────────────────
    for (let ty = 5; ty < MAP_ROWS - 5; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.stair) continue;
        const kind = cell.tileKind;
        if (kind !== 'flat' && kind !== 'elevated') continue;

        const prob     = kind === 'elevated' ? 0.12 : 0.05;
        const tileSeed = (tx + 1) * 1009 + (ty + 1) * 37 + (isP1 ? 0 : 50000);
        if (rng(tileSeed) >= prob) continue;

        // Skip tiles within 2 steps of a stair
        let nearStair = false;
        outer: for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (this.terrainGrid[ty + dy]?.[tx + dx]?.stair) { nearStair = true; break outer; }
          }
        }
        if (nearStair) continue;

        const isElev    = cell.level >= 2;
        const lift      = isElev ? 22 : 0;
        const px        = tx * T + T * 0.5 + (rng(tileSeed * 3) - 0.5) * 14;
        const py        = ty * T + T - lift;          // anchor at tile floor
        const frameIdx  = Math.floor(rng(tileSeed * 7) * 6); // frames 0-5
        const scale     = 0.44 + rng(tileSeed * 11) * 0.22;
        const tree      = this.add.image(px, py, 'tree_sheet', frameIdx);
        tree.setScale(scale);
        tree.setOrigin(0.5, 1.0);
        tree.setDepth(2.0 + ty * 0.01 + (isElev ? 1.0 : 0.5));
      }
    }

    // ── Mushroom deco on elevated tiles ────────────────────────────────────
    const decoKeys = ['deco_01', 'deco_02', 'deco_03'] as const;
    for (let ty = 6; ty < MAP_ROWS - 6; ty++) {
      for (let tx = x1; tx <= x2; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2 || cell.stair) continue;
        const tileSeed = (tx + 1) * 997 + (ty + 1) * 53 + (isP1 ? 0 : 80000);
        if (rng(tileSeed) >= 0.06) continue;
        const px   = tx * T + T * 0.5 + (rng(tileSeed * 3) - 0.5) * 22;
        const py   = ty * T + T * 0.5 - 22 + (rng(tileSeed * 5) - 0.5) * 10;
        const dKey = decoKeys[Math.floor(rng(tileSeed * 7) * 3)];
        const d    = this.add.image(px, py, dKey);
        d.setScale(0.5 + rng(tileSeed * 11) * 0.35);
        d.setDepth(2.6 + ty * 0.001);
      }
    }

    // ── Water rocks near the island shore ──────────────────────────────────
    for (let ty = 4; ty < MAP_ROWS - 4; ty++) {
      for (let tx = x1 - 3; tx <= x2 + 3; tx++) {
        if (tx < 1 || tx >= MAP_COLS - 1) continue;
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell?.water) continue;

        // Only place rocks adjacent (within 2 tiles) to land
        let nearLand = false;
        outer2: for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const n = this.terrainGrid[ty + dy]?.[tx + dx];
            if (n && !n.water) { nearLand = true; break outer2; }
          }
        }
        if (!nearLand) continue;

        const tileSeed = (tx + 1) * 1013 + (ty + 1) * 59 + (isP1 ? 0 : 70000);
        if (rng(tileSeed) >= 0.045) continue;

        const px    = tx * T + T * 0.5 + (rng(tileSeed * 3) - 0.5) * 18;
        const py    = ty * T + T * 0.5 + (rng(tileSeed * 5) - 0.5) * 10;
        const big   = rng(tileSeed * 7) > 0.4;
        const rock  = this.add.image(px, py, big ? 'rock_pile' : 'rock_small', 0);
        rock.setScale(big ? 0.40 : 0.36);
        rock.setAlpha(0.75 + rng(tileSeed * 9) * 0.25);
        rock.setDepth(0.8);

        this.tweens.add({
          targets:  rock,
          y:        rock.y + 3,
          duration: 1800 + Math.floor(rng(tileSeed * 13) * 1200),
          yoyo:     true,
          repeat:   -1,
          ease:     'Sine.easeInOut',
          delay:    Math.floor(rng(tileSeed * 17) * 2000),
        });
      }
    }
  }

  private addMaskedTexture(
    textureKey: string,
    crop: { x: number; y: number; width: number; height: number },
    bounds: { x: number; y: number; width: number; height: number },
    points: Array<{ x: number; y: number }>,
    depth: number,
    alpha = 1,
    tint?: number,
  ) {
    const maskSource = this.add.graphics();
    maskSource.fillStyle(0xffffff, 1);
    maskSource.fillPoints(points.map((point) => new Phaser.Math.Vector2(point.x, point.y)), true);

    const image = this.add.image(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5, textureKey);
    image.setCrop(crop.x, crop.y, crop.width, crop.height);
    image.setDisplaySize(bounds.width, bounds.height);
    image.setDepth(depth);
    image.setAlpha(alpha);
    if (tint !== undefined) image.setTint(tint);
    image.setMask(maskSource.createGeometryMask());
    maskSource.setVisible(false);

    return image;
  }

  private addShiftedMaskedTexture(
    textureKey: string,
    crop: { x: number; y: number; width: number; height: number },
    bounds: { x: number; y: number; width: number; height: number },
    points: Array<{ x: number; y: number }>,
    depth: number,
    alpha = 1,
    tint?: number,
    shiftX = 0,
    shiftY = 0,
  ) {
    const shiftedBounds = {
      x: bounds.x + shiftX,
      y: bounds.y + shiftY,
      width: bounds.width,
      height: bounds.height,
    };
    const shiftedPoints = points.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY }));
    return this.addMaskedTexture(textureKey, crop, shiftedBounds, shiftedPoints, depth, alpha, tint);
  }

  private addFoamBand(edgeTileX: number, isLeftIsland: boolean) {
    const mapH = MAP_ROWS * TILE_SIZE;
    for (let row = 0; row < MAP_ROWS; row++) {
      const wx = (edgeTileX + (isLeftIsland ? 0.95 : 0.05)) * TILE_SIZE;
      const wy = (row + 0.5) * TILE_SIZE;
      const foam = this.add.image(wx, wy, 'terrain_foam');
      foam.setDepth(0.85);
      foam.setScale(0.34, 0.5);
      foam.setAlpha(0.34);
      foam.setFlipX(!isLeftIsland);
      foam.setAngle(isLeftIsland ? 90 : -90);
      foam.y = Phaser.Math.Clamp(foam.y + Math.sin(row * 0.7) * 6, 0, mapH);
    }
  }

  private applyTerrainPolygons(
    outerPoly: Array<{ x: number; y: number }>,
    coastTopPoly: Array<{ x: number; y: number }>,
    terraceTopPoly: Array<{ x: number; y: number }>,
    summitTopPoly: Array<{ x: number; y: number }>,
  ) {
    for (let ty = 0; ty < MAP_ROWS; ty++) {
      for (let tx = 0; tx < MAP_COLS; tx++) {
        const px = (tx + 0.5) * TILE_SIZE;
        const py = (ty + 0.5) * TILE_SIZE;
        if (!Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(outerPoly), px, py)) continue;

        const cell = this.terrainGrid[ty][tx];
        cell.level = 1;
        cell.walkable = true;
        cell.buildable = true;
        cell.water = false;
        cell.tileKind = 'flat';

        if (Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(coastTopPoly), px, py)) {
          cell.level = 1;
          cell.tileKind = 'flat';
        }
        if (Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(terraceTopPoly), px, py)) {
          cell.level = 2;
          cell.buildable = false;
          cell.tileKind = 'elevated';
        }
        if (Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(summitTopPoly), px, py)) {
          cell.level = 3;
          cell.walkable = false;
          cell.buildable = false;
          cell.tileKind = 'summit';
        }
      }
    }
  }

  private applyIslandStairs(x1: number, x2: number, isP1: boolean) {
    const stairColumns = isP1
      ? [x1 + 6, x1 + 10, x1 + 13]
      : [x2 - 6, x2 - 10, x2 - 13];
    const stairRows = [Math.floor(MAP_ROWS * 0.72), Math.floor(MAP_ROWS * 0.54), Math.floor(MAP_ROWS * 0.36)];

    this.setStairRun(stairColumns[0], stairRows[0], 2, isP1 ? 1 : -1);
    this.setStairRun(stairColumns[1], stairRows[1], 2, isP1 ? 1 : -1);
    this.setStairRun(stairColumns[2], stairRows[2], 3, isP1 ? 1 : -1);
  }

  private setStairRun(tx: number, ty: number, level: number, dir: number) {
    for (let i = 0; i < 3; i++) {
      const sx = tx + i * dir;
      const sy = ty + i;
      if (!this.isInBounds(sx, sy)) continue;
      const cell = this.terrainGrid[sy][sx];
      cell.level = level;
      cell.walkable = true;
      cell.buildable = false;
      cell.stair = true;
      cell.water = false;
      cell.tileKind = 'stair';

      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        const nx = sx + dx;
        const ny = sy + dy;
        if (!this.isInBounds(nx, ny)) continue;
        const neighbor = this.terrainGrid[ny][nx];
        if (neighbor.water) continue;
        neighbor.walkable = true;
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
    if (levelDiff === 0) return true;
    if (levelDiff === 1 && (from.stair || to.stair)) return true;
    return false;
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

  private updateIslandDrift() {
    if (this.islandsConnected) return;

    const progress = Phaser.Math.Clamp(this.elapsedSecs / ISLAND_COLLIDE_SECS, 0, 1);
    const targetClaimed = Math.floor(progress * this.maxDriftColumnsPerSide);

    while (this.driftColumnsClaimed < targetClaimed) {
      this.claimNextDriftColumns();
    }
  }

  private claimNextDriftColumns() {
    const leftTx = P1_ISLAND_X2 + 1 + this.driftColumnsClaimed;
    const rightTx = P2_ISLAND_X1 - 1 - this.driftColumnsClaimed;

    if (leftTx > rightTx) {
      this.onIslandsConnected();
      return;
    }

    this.paintDriftColumn(leftTx);
    if (rightTx !== leftTx) {
      this.paintDriftColumn(rightTx);
    }

    this.driftColumnsClaimed += 1;

    if (leftTx + 1 >= rightTx) {
      this.onIslandsConnected();
    }
  }

  private paintDriftColumn(tx: number) {
    if (!this.isInBounds(tx, 0)) return;

    const midY = (MAP_ROWS - 1) * 0.5;
    const bandRadius = MAP_ROWS * 0.42;

    for (let ty = 2; ty <= MAP_ROWS - 3; ty++) {
      const ny = Math.abs((ty - midY) / bandRadius);
      if (ny > 1) continue;

      const cell = this.terrainGrid[ty][tx];
      cell.level = 1;
      cell.walkable = true;
      cell.buildable = false;
      cell.stair = false;
      cell.water = false;
      cell.tileKind = 'flat';

      const frame = ny > 0.9 ? (ty < midY ? 1 : 21) : 11;
      const tile = this.add.image((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, 'tf', frame);
      tile.setDepth(1.58);
      if (ny < 0.6) {
        tile.setTint(0xb7df87);
      }
    }
  }

  private onIslandsConnected() {
    if (this.islandsConnected) return;

    this.islandsConnected = true;
    this.aiSystem.setIslandsConnected(true);
    this.cancelBuildMode();
    this.clearAndRefundPlayerTrainQueue();

    // If the original sea gap is odd, fill the center seam tile column to guarantee path continuity.
    const gapCols = WATER_X2 - WATER_X1 + 1;
    if (gapCols % 2 === 1) {
      this.paintDriftColumn(Math.floor((WATER_X1 + WATER_X2) * 0.5));
    }

    if (!this.driftBannerShown) {
      this.driftBannerShown = true;
      const cam = this.cameras.main;
      const banner = this.add.text(cam.scrollX + cam.width * 0.5, cam.scrollY + cam.height * 0.5, 'ISLANDS COLLIDE', {
        fontFamily: 'serif',
        fontSize: '42px',
        color: '#ffe066',
        stroke: '#4c3710',
        strokeThickness: 6,
      });
      banner.setOrigin(0.5);
      banner.setDepth(120);
      banner.setScrollFactor(0);
      this.tweens.add({
        targets: banner,
        alpha: 0,
        y: banner.y - 84,
        duration: 1900,
        delay: 900,
        ease: 'Power2',
        onComplete: () => banner.destroy(),
      });
    }

    this.cameras.main.shake(550, 0.01);

    const clashX = MAP_COLS * TILE_SIZE * 0.5;
    const clashY = MAP_ROWS * TILE_SIZE * 0.5;
    for (const u of this.p2Units) {
      if (u.isAlive()) u.moveTo(clashX, clashY);
    }
  }

  private getPolygonBounds(points: Array<{ x: number; y: number }>) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  private buildCoastPolygon(
    x1: number,
    x2: number,
    isP1: boolean,
    inset: number,
    waterJitter: number,
    topBottomJitter: number,
    phase: number,
  ): Array<{ x: number; y: number }> {
    const T = TILE_SIZE;
    const mapH = MAP_ROWS * T;
    const N = 22;

    const left = x1 * T + inset;
    const right = (x2 + 1) * T - inset;
    const top = inset * 0.5;
    const bottom = mapH - inset * 0.5;
    const cx = (left + right) * 0.5;
    const radiusX = (right - left) * 0.5;
    const radiusY = (bottom - top) * 0.5;

    const pts: Array<{ x: number; y: number }> = [];

    // Top edge arcs inward so the island reads round instead of rectangular.
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = left + t * (right - left);
      const normalized = radiusX === 0 ? 0 : (x - cx) / radiusX;
      const arc = Math.sqrt(Math.max(0, 1 - normalized * normalized));
      const roundInset = (1 - arc) * radiusY * 0.58;
      const wave = Math.sin(t * Math.PI * 3 + phase) * topBottomJitter * (t * (1 - t) * 4);
      pts.push({ x, y: Math.max(0, top + roundInset + wave) });
    }

    // Water-facing coast edge
    if (isP1) {
      const minX = (x2 - 1) * T + inset;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const y = top + t * (bottom - top);
        const wave = Math.sin(t * Math.PI * 5.2 + phase + 1.1) * waterJitter;
        pts.push({ x: Math.max(minX, right + Math.min(0, wave)), y });
      }
    } else {
      const maxX = (x1 + 2) * T - inset;
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const y = top + t * (bottom - top);
        const wave = Math.sin(t * Math.PI * 5.2 + phase + 2.2) * waterJitter;
        pts.push({ x: Math.min(maxX, left + Math.max(0, wave)), y });
      }
    }

    // Bottom edge mirrors the rounded cap.
    for (let i = 1; i <= N; i++) {
      const t = i / N;
      const x = right - t * (right - left);
      const normalized = radiusX === 0 ? 0 : (x - cx) / radiusX;
      const arc = Math.sqrt(Math.max(0, 1 - normalized * normalized));
      const roundInset = (1 - arc) * radiusY * 0.52;
      const wave = Math.sin(t * Math.PI * 3 + phase + 2.0) * topBottomJitter * (t * (1 - t) * 4);
      pts.push({ x, y: Math.min(mapH, bottom - roundInset - wave) });
    }

    // Outer map boundary edge
    if (isP1) {
      pts.push({ x: left, y: bottom });
      pts.push({ x: left, y: top });
    } else {
      pts.push({ x: right, y: bottom });
      pts.push({ x: right, y: top });
    }

    return pts;
  }

  private placeResources() {
    const p1Used = new Set<string>();
    const p2Used = new Set<string>();
    const p1MinX = P1_ISLAND_X1 + 2;
    const p1MaxX = P1_ISLAND_X2 - 2;
    const p2MinX = P2_ISLAND_X1 + 2;
    const p2MaxX = P2_ISLAND_X2 - 2;

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
    if (type === 'pawn') {
      const house = buildings.find(b => b.type === 'house' && !b.isDestroyed);
      if (house) return { x: (house.tx + 0.5) * TILE_SIZE, y: (house.ty + 1) * TILE_SIZE };
    } else {
      const barracks = buildings.find(b => b.type === 'barracks' && !b.isDestroyed);
      if (barracks) return { x: (barracks.tx + 0.5) * TILE_SIZE, y: (barracks.ty + 1) * TILE_SIZE };
    }
    return fallback;
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
    }
  }

  private pickRandomCastleSpot(faction: Faction) {
    const cfg = BUILDING_CONFIGS.castle;
    const islandMinX = faction === 'blue' ? P1_ISLAND_X1 + 2 : P2_ISLAND_X1 + 2;
    const islandMaxX = faction === 'blue' ? P1_ISLAND_X2 - cfg.width - 2 : P2_ISLAND_X2 - cfg.width - 2;
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
    // P1 starts with 2 pawns + 1 warrior
    this.spawnUnit('pawn', 'blue', this.p1SpawnPoint.x - 32, this.p1SpawnPoint.y);
    this.spawnUnit('pawn', 'blue', this.p1SpawnPoint.x + 32, this.p1SpawnPoint.y);
    this.spawnUnit('warrior', 'blue', this.p1SpawnPoint.x, this.p1SpawnPoint.y + 48);
    // P2 starts with 2 pawns + 1 warrior
    this.spawnUnit('pawn', 'red', this.p2SpawnPoint.x - 32, this.p2SpawnPoint.y);
    this.spawnUnit('pawn', 'red', this.p2SpawnPoint.x + 32, this.p2SpawnPoint.y);
    this.spawnUnit('warrior', 'red', this.p2SpawnPoint.x, this.p2SpawnPoint.y + 48);
  }

  // ── Unit / Building factories ────────────────────────────────────────────────
  spawnUnit(type: UnitType, faction: Faction, x: number, y: number): Unit {
    const spawnPos = this.findSafeSpawnPoint(faction, x, y);
    const unit = new Unit(this, spawnPos.x, spawnPos.y, type, faction);
    unit.setRoutePlanner((fromX, fromY, toX, toY) => this.findPath(fromX, fromY, toX, toY));
    if (faction === 'blue') {
      this.p1Units.push(unit);
    } else {
      this.p2Units.push(unit);
    }
    return unit;
  }

  private findSafeSpawnPoint(faction: Faction, desiredX: number, desiredY: number) {
    const minX = faction === 'blue' ? P1_ISLAND_X1 + 1 : P2_ISLAND_X1 + 1;
    const maxX = faction === 'blue' ? P1_ISLAND_X2 - 1 : P2_ISLAND_X2 - 1;
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
    if (this.islandsConnected) return null;
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
    return this.gameOver || this.islandsConnected;
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
      this.callbacks.onResourcesUpdate(
        Math.floor(this.resourceSystem.p1.gold),
        Math.floor(this.resourceSystem.p1.wood),
      );
    }

    this.emitTrainQueueUpdate();
  }

  enqueueUnit(type: UnitType) {
    if (this.isProductionLocked()) return;
    if (this.trainQueue.length >= TRAIN_QUEUE_MAX) return;
    const hasBarracks = this.p1Buildings.some(b => b.type === 'barracks' && !b.isDestroyed);
    if (!hasBarracks && type !== 'pawn') return;
    const cfg = UNIT_CONFIGS[type];
    if (!this.resourceSystem.spend('p1', cfg.goldCost)) return;

    this.trainQueue.push({
      type,
      timeRemaining: cfg.trainTime,
      totalTime: cfg.trainTime,
    });
    this.emitTrainQueueUpdate();
  }

  private emitTrainQueueUpdate() {
    let cumulativeRemaining = 0;
    const snapshot: TrainQueueDisplayItem[] = this.trainQueue.map((item, index) => {
      cumulativeRemaining += index === 0 ? item.timeRemaining : item.totalTime;
      return {
        type: item.type,
        remainingMs: Math.max(0, cumulativeRemaining),
        active: index === 0,
      };
    });
    this.callbacks.onTrainQueueUpdate(snapshot);
  }

  cancelQueuedUnit(index: number) {
    if (this.isProductionLocked()) return;
    if (index < 0 || index >= this.trainQueue.length) return;

    const [removed] = this.trainQueue.splice(index, 1);
    if (!removed) return;

    const cfg = UNIT_CONFIGS[removed.type];
    this.resourceSystem.addResources('p1', cfg.goldCost, 0);
    this.callbacks.onResourcesUpdate(
      Math.floor(this.resourceSystem.p1.gold),
      Math.floor(this.resourceSystem.p1.wood),
    );
    this.emitTrainQueueUpdate();
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
    const introZoom = isTouchDevice ? 0.3 : 0.38;
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
        // Must be on P1 island
        if (tx >= P1_ISLAND_X1 + 1 && tx <= P1_ISLAND_X2 - 2 && ty >= 1 && ty <= MAP_ROWS - 2) {
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
      const newZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, this.minZoom, this.maxZoom);
      cam.setZoom(newZoom);
    });

    keyboard?.on('keydown-EQUALS', () => this.zoomCameraBy(0.08));
    keyboard?.on('keydown-NUMPAD_ADD', () => this.zoomCameraBy(0.08));
    keyboard?.on('keydown-MINUS', () => this.zoomCameraBy(-0.08));
    keyboard?.on('keydown-NUMPAD_SUBTRACT', () => this.zoomCameraBy(-0.08));
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  update(time: number, delta: number) {
    if (this.gameOver) return;

    const dt = delta / 1000;
    this.elapsedSecs += dt;

    // Camera pan
    this.handleCameraPan(delta);

    // Game timer and drifting island progression
    const remaining = GAME_DURATION_SECS - this.elapsedSecs;
    this.updateIslandDrift();

    // Resources
    this.resourceSystem.update(delta);
    this.callbacks.onResourcesUpdate(
      Math.floor(this.resourceSystem.p1.gold),
      Math.floor(this.resourceSystem.p1.wood),
    );

    // Timer callback
    this.callbacks.onTimerUpdate(Math.max(0, remaining), this.islandsConnected);

    // Civilian unit behavior (workers and monks)
    this.updateCivilianJobs(delta, this.islandsConnected);

    // Train queue
    if (!this.islandsConnected && this.trainQueue.length > 0) {
      const first = this.trainQueue[0];
      first.timeRemaining -= delta;
      if (first.timeRemaining <= 0) {
        this.trainQueue.shift();
        const spawnOrigin = this.getSpawnOriginForType(first.type, 'p1');
        this.spawnUnit(first.type, 'blue', spawnOrigin.x, spawnOrigin.y);
      }
      this.emitTrainQueueUpdate();
    }
    // House passive gold income
    this.houseGoldMs += delta;
    if (this.houseGoldMs >= 5000) {
      this.houseGoldMs = 0;
      const p1Houses = this.p1Buildings.filter(b => b.type === 'house' && !b.isDestroyed).length;
      const p2Houses = this.p2Buildings.filter(b => b.type === 'house' && !b.isDestroyed).length;
      if (p1Houses > 0) this.resourceSystem.addResources('p1', p1Houses * 2, 0);
      if (p2Houses > 0) this.resourceSystem.addResources('p2', p2Houses * 2, 0);
    }
    // Bot AI
    this.aiSystem.update(delta);

    // Core frame simulation
    for (const u of this.p1Units) u.update(delta);
    for (const u of this.p2Units) u.update(delta);
    for (const b of this.p1Buildings) b.update(delta, this.p2Units);
    for (const b of this.p2Buildings) b.update(delta, this.p1Units);
    // Throttled combat decisions (80 ms)
    this.combatThrottleMs += delta;
    if (this.combatThrottleMs >= 80) {
      this.combatThrottleMs = 0;
      this.combatSystem.update(this.p1Units, this.p2Units, this.p1Buildings, this.p2Buildings);
    }

    // Throttled dead-unit pruning (250 ms)
    this.pruneThrottleMs += delta;
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
    const speedX = 900 / cam.zoom;
    const speedY = 620 / cam.zoom;

    const targetVX =
      (this.registry.get('panRight') ? speedX : 0) -
      (this.registry.get('panLeft') ? speedX : 0);
    const targetVY =
      (this.registry.get('panDown') ? speedY : 0) -
      (this.registry.get('panUp') ? speedY : 0);

    if (this.introCameraActive) {
      this.pinchDistanceLast = null;
      this.dragTracking = false;
      return;
    }

    this.cameraVelocity.x = Phaser.Math.Linear(this.cameraVelocity.x, targetVX, 0.24);
    this.cameraVelocity.y = Phaser.Math.Linear(this.cameraVelocity.y, targetVY, 0.24);

    cam.scrollX += this.cameraVelocity.x * dt;
    cam.scrollY += this.cameraVelocity.y * dt;

    const pointer1 = this.input.pointer1;
    const pointer2 = this.input.pointer2;
    const p1Down = pointer1.isDown && this.isPointerDownFromGameCanvas(pointer1);
    const p2Down = pointer2.isDown && this.isPointerDownFromGameCanvas(pointer2);
    const isTouchDevice = this.sys.game.device.input.touch;

    if (p1Down && p2Down) {
      this.dragTracking = false;
      const distance = Phaser.Math.Distance.Between(pointer1.x, pointer1.y, pointer2.x, pointer2.y);
      if (this.pinchDistanceLast !== null) {
        const zoomDelta = (distance - this.pinchDistanceLast) * 0.0032;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom + zoomDelta, this.minZoom, this.maxZoom));
      }
      this.pinchDistanceLast = distance;

      const prevMidX = (pointer1.prevPosition.x + pointer2.prevPosition.x) * 0.5;
      const prevMidY = (pointer1.prevPosition.y + pointer2.prevPosition.y) * 0.5;
      const midX = (pointer1.x + pointer2.x) * 0.5;
      const midY = (pointer1.y + pointer2.y) * 0.5;
      cam.scrollX -= (midX - prevMidX) / cam.zoom;
      cam.scrollY -= (midY - prevMidY) / cam.zoom;
      return;
    }

    this.pinchDistanceLast = null;

    if (!this.buildMode && p1Down) {
      if (this.dragTracking) {
        let dragDx = pointer1.x - this.dragLastX;
        let dragDy = pointer1.y - this.dragLastY;
        // Clamp to prevent jumps from stale prevPosition on new-touch events
        dragDx = Phaser.Math.Clamp(dragDx, -60, 60);
        dragDy = Phaser.Math.Clamp(dragDy, -60, 60);
        if (Math.abs(dragDx) > 1.5 || Math.abs(dragDy) > 1.5) {
          cam.scrollX -= dragDx / cam.zoom;
          cam.scrollY -= dragDy / cam.zoom;
        }
      }
      this.dragLastX = pointer1.x;
      this.dragLastY = pointer1.y;
      this.dragTracking = true;
      return;
    }
    this.dragTracking = false;

    // Edge pan — mouse only, never on touch devices.
    if (isTouchDevice) return;
    if (!this.isPointerFromGameCanvas(ptr)) return;

    const edge = 36;
    const w = this.scale.width;
    const h = this.scale.height;
    const edgeX = speedX * dt * 0.45;
    const edgeY = speedY * dt * 0.35;

    if (ptr.x > 0 && ptr.x < edge) cam.scrollX -= edgeX;
    if (ptr.x < w && ptr.x > w - edge) cam.scrollX += edgeX;
    if (ptr.y > 0 && ptr.y < edge) cam.scrollY -= edgeY;
    if (ptr.y < h && ptr.y > h - edge) cam.scrollY += edgeY;
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
    const gameplayZoom = isTouchDevice ? 0.3 : 0.38;
    cam.centerOn(castleFocus.x, castleFocus.y);
    cam.setZoom(gameplayZoom);
  }

  private updateCivilianJobs(delta: number, islandsConnected: boolean) {
    this.civilianThinkMs += delta;
    if (this.civilianThinkMs < 140) return;
    this.civilianThinkMs = 0;

    if (!islandsConnected) {
      this.updatePawnWorkers(this.p1Units, this.p1Resources, 'p1');
      this.updatePawnWorkers(this.p2Units, this.p2Resources, 'p2');
    }

    this.updateMonkSupport(this.p1Units, P1_ISLAND_X1 + 1, P1_ISLAND_X2 - 1);
    this.updateMonkSupport(this.p2Units, P2_ISLAND_X1 + 1, P2_ISLAND_X2 - 1);
  }

  private updatePawnWorkers(units: Unit[], nodes: ResourceNode[], faction: 'p1' | 'p2') {
    const now = this.time.now;
    const res = faction === 'p1' ? this.resourceSystem.p1 : this.resourceSystem.p2;
    const preferredType = res.wood < res.gold ? 'tree' : 'goldmine';

    for (const u of units) {
      if (!u.isAlive() || u.state.type !== 'pawn') continue;
      if (u.state.state === 'attacking' || u.state.state === 'dead') continue;

      const target = this.findNearestNode(u, nodes, preferredType) ?? this.findNearestNode(u, nodes);
      if (!target) continue;

      const dx = target.wx - u.state.x;
      const dy = target.wy - u.state.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > TILE_SIZE * 0.85) {
        u.moveTo(target.wx, target.wy);
        continue;
      }

      const lastGather = this.workerGatherMs.get(u.state.id) ?? 0;
      if (now - lastGather < 850) continue;

      this.workerGatherMs.set(u.state.id, now);
      if (target.type === 'tree') {
        this.resourceSystem.addResources(faction, 0, 7);
        this.spawnResourceText(u.state.x, u.state.y - 28, '+7 wood', '#8bff99');
      } else {
        this.resourceSystem.addResources(faction, 9, 0);
        this.spawnResourceText(u.state.x, u.state.y - 28, '+9 gold', '#ffd166');
      }
      u.playAnim('attack');
    }
  }

  private updateMonkSupport(units: Unit[], minTx: number, maxTx: number) {
    const now = this.time.now;
    for (const monk of units) {
      if (!monk.isAlive() || monk.state.type !== 'monk') continue;
      if (monk.state.state === 'attacking' || monk.state.state === 'dead') continue;

      const injured = this.findMostInjuredAlly(monk, units);
      if (injured) {
        const dx = injured.state.x - monk.state.x;
        const dy = injured.state.y - monk.state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > UNIT_CONFIGS.monk.range * 0.8) {
          monk.moveTo(injured.state.x + Phaser.Math.Between(-18, 18), injured.state.y + Phaser.Math.Between(-18, 18));
        }
        continue;
      }

      // No one to heal: light patrol so monks don't look frozen
      const lastPatrol = this.monkPatrolMs.get(monk.state.id) ?? 0;
      if (now - lastPatrol < 1500) continue;
      this.monkPatrolMs.set(monk.state.id, now);

      const tx = Phaser.Math.Between(minTx, maxTx);
      const ty = Phaser.Math.Between(2, MAP_ROWS - 3);
      monk.moveTo((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE);
    }
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
      if (resource.tx === tx && resource.ty === ty) return true;
    }
    for (const resource of this.p2Resources) {
      if (resource.tx === tx && resource.ty === ty) return true;
    }
    return false;
  }

  private canPlaceBuildingAt(type: BuildingType, tx: number, ty: number, faction: Faction): boolean {
    if (this.islandsConnected) return false;
    const cfg = BUILDING_CONFIGS[type];
    const islandMinX = faction === 'blue' ? P1_ISLAND_X1 + 1 : P2_ISLAND_X1 + 1;
    const islandMaxX = faction === 'blue' ? P1_ISLAND_X2 - 2 : P2_ISLAND_X2 - 2;

    if (tx < islandMinX || ty < 1) return false;
    if (tx + cfg.width - 1 > islandMaxX || ty + cfg.height - 1 > MAP_ROWS - 2) return false;

    for (let dtx = 0; dtx < cfg.width; dtx++) {
      for (let dty = 0; dty < cfg.height; dty++) {
        const tileX = tx + dtx;
        const tileY = ty + dty;
        const cell = this.getTerrainCell(tileX, tileY);
        if (!cell || !cell.buildable || cell.stair || cell.level > 1) return false;
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
    const islandMinX = P1_ISLAND_X1 + 1;
    const islandMaxX = P1_ISLAND_X2 - 2;

    g.clear();
    for (let dtx = 0; dtx < width; dtx++) {
      for (let dty = 0; dty < height; dty++) {
        const tileX = tx + dtx;
        const tileY = ty + dty;
        const outOfBounds = tileX < islandMinX || tileX > islandMaxX || tileY < 1 || tileY > MAP_ROWS - 2;
        const cell = this.getTerrainCell(tileX, tileY);
        const terrainBlocked = !cell || !cell.buildable || cell.stair || cell.level > 1;
        const blocked = outOfBounds || terrainBlocked || this.occupiedTiles.has(`${tileX},${tileY}`);
        const fillColor = !blocked ? goodFill : badFill;
        const lineColor = !blocked ? goodLine : badLine;
        const alpha = canPlace ? 0.22 : blocked ? 0.26 : 0.16;

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

