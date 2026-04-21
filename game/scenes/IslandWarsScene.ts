import * as Phaser from 'phaser';
import { Unit } from '../entities/Unit';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/ResourceNode';
import { CombatSystem } from '../systems/CombatSystem';
import { ResourceSystem } from '../systems/ResourceSystem';
import { BridgeSystem } from '../systems/BridgeSystem';
import { AISystem } from '../systems/AISystem';
import { UNIT_CONFIGS } from '../config/units';
import { BUILDING_CONFIGS } from '../config/buildings';
import {
  TILE_SIZE, MAP_COLS, MAP_ROWS,
  P1_ISLAND_X1, P1_ISLAND_X2, WATER_X1, WATER_X2, P2_ISLAND_X1, P2_ISLAND_X2,
  P1_CASTLE_TX, P1_CASTLE_TY, P2_CASTLE_TX, P2_CASTLE_TY,
  P1_SPAWN_X, P1_SPAWN_Y, P2_SPAWN_X, P2_SPAWN_Y,
  P1_RESOURCES, P2_RESOURCES,
  GAME_DURATION_SECS, BRIDGE_OPEN_SECS,
} from '../config/map';
import type { UnitType, Faction } from '../config/units';
import type { BuildingType } from '../config/buildings';

export interface IslandWarsCallbacks {
  onResourcesUpdate: (gold: number, wood: number) => void;
  onTimerUpdate: (remaining: number, bridgeOpen: boolean) => void;
  onGameEnd: (winner: 'player' | 'bot', reason: string) => void;
  onTrainQueueUpdate: (queue: string[]) => void;
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
  private bridgeSystem!: BridgeSystem;
  private aiSystem!: AISystem;

  private elapsedSecs = 0;
  private gameOver = false;
  private trainQueue: Array<{ type: UnitType; timeRemaining: number; totalTime: number }> = [];
  private buildMode: BuildingType | null = null;
  private buildGhost: Phaser.GameObjects.Image | null = null;
  private occupiedTiles = new Set<string>();

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

    this.buildMap();
    this.placeResources();
    this.spawnStartBuildings();
    this.spawnStartUnits();

    this.combatSystem = new CombatSystem(this);
    this.resourceSystem = new ResourceSystem(this.p1Resources, this.p2Resources);
    this.bridgeSystem = new BridgeSystem(this);

    this.aiSystem = new AISystem(
      this.resourceSystem,
      this.p2Units,
      this.p2Buildings,
      false,
      (type, faction, x, y) => this.spawnUnit(type, faction, x, y),
      (type, faction, tx, ty) => this.placeBuilding(type, faction, tx, ty),
    );

    this.setupCamera();
    this.setupInput();
  }

  // ── Map building ────────────────────────────────────────────────────────────
  private buildMap() {
    const waterColor = 0x2255aa;
    const grassColor = 0x5a8a3a;
    const sandColor  = 0xd4a44c;

    // Water background
    const waterBg = this.add.graphics();
    waterBg.fillStyle(waterColor);
    waterBg.fillRect(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
    waterBg.setDepth(0);

    // Animated water shimmer
    for (let i = 0; i < 12; i++) {
      const wx = Phaser.Math.Between(WATER_X1 * TILE_SIZE, WATER_X2 * TILE_SIZE);
      const wy = Phaser.Math.Between(0, MAP_ROWS * TILE_SIZE);
      const ripple = this.add.ellipse(wx, wy, 20, 6, 0x4477cc, 0.4);
      ripple.setDepth(1);
      this.tweens.add({
        targets: ripple,
        alpha: 0,
        scaleX: 2,
        duration: Phaser.Math.Between(1200, 2400),
        repeat: -1,
        yoyo: false,
        delay: Phaser.Math.Between(0, 2000),
      });
    }

    // P1 island
    this.drawIsland(P1_ISLAND_X1, P1_ISLAND_X2, grassColor, sandColor);
    // P2 island
    this.drawIsland(P2_ISLAND_X1, P2_ISLAND_X2, grassColor, sandColor);

    // Island labels
    this.add.text(
      (P1_ISLAND_X1 + (P1_ISLAND_X2 - P1_ISLAND_X1) / 2) * TILE_SIZE,
      2 * TILE_SIZE,
      'YOUR KINGDOM',
      { fontFamily: 'serif', fontSize: '20px', color: '#ffffff', stroke: '#222', strokeThickness: 4 },
    ).setOrigin(0.5).setDepth(30);

    this.add.text(
      (P2_ISLAND_X1 + (P2_ISLAND_X2 - P2_ISLAND_X1) / 2) * TILE_SIZE,
      2 * TILE_SIZE,
      'ENEMY KINGDOM',
      { fontFamily: 'serif', fontSize: '20px', color: '#ff8888', stroke: '#222', strokeThickness: 4 },
    ).setOrigin(0.5).setDepth(30);
  }

  private drawIsland(x1: number, x2: number, grassColor: number, sandColor: number) {
    // Sand border (1 tile)
    const sand = this.add.graphics();
    sand.fillStyle(sandColor);
    sand.fillRect(x1 * TILE_SIZE, 0, (x2 - x1 + 1) * TILE_SIZE, MAP_ROWS * TILE_SIZE);
    sand.setDepth(1);

    // Grass interior (inset by 1)
    const grass = this.add.graphics();
    grass.fillStyle(grassColor);
    grass.fillRect((x1 + 1) * TILE_SIZE, TILE_SIZE, (x2 - x1 - 1) * TILE_SIZE, (MAP_ROWS - 2) * TILE_SIZE);
    grass.setDepth(2);

    // Tile grid lines (subtle)
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x000000, 0.06);
    for (let tx = x1; tx <= x2; tx++) {
      grid.moveTo(tx * TILE_SIZE, 0);
      grid.lineTo(tx * TILE_SIZE, MAP_ROWS * TILE_SIZE);
    }
    for (let ty = 0; ty <= MAP_ROWS; ty++) {
      grid.moveTo(x1 * TILE_SIZE, ty * TILE_SIZE);
      grid.lineTo((x2 + 1) * TILE_SIZE, ty * TILE_SIZE);
    }
    grid.strokePath();
    grid.setDepth(2);
  }

  private placeResources() {
    for (const r of P1_RESOURCES) {
      const node = new ResourceNode(this, r.tx, r.ty, r.type);
      this.p1Resources.push(node);
    }
    for (const r of P2_RESOURCES) {
      const node = new ResourceNode(this, r.tx, r.ty, r.type);
      this.p2Resources.push(node);
    }
  }

  private spawnStartBuildings() {
    const p1Castle = this.placeBuilding('castle', 'blue', P1_CASTLE_TX, P1_CASTLE_TY);
    const p2Castle = this.placeBuilding('castle', 'red',  P2_CASTLE_TX, P2_CASTLE_TY);
  }

  private spawnStartUnits() {
    // P1 starts with 2 pawns
    this.spawnUnit('pawn', 'blue', P1_SPAWN_X - 32, P1_SPAWN_Y);
    this.spawnUnit('pawn', 'blue', P1_SPAWN_X + 32, P1_SPAWN_Y);
    // P2 starts with 2 pawns
    this.spawnUnit('pawn', 'red', P2_SPAWN_X - 32, P2_SPAWN_Y);
    this.spawnUnit('pawn', 'red', P2_SPAWN_X + 32, P2_SPAWN_Y);
  }

  // ── Unit / Building factories ────────────────────────────────────────────────
  spawnUnit(type: UnitType, faction: Faction, x: number, y: number): Unit {
    // Jitter spawn position
    const jx = x + Phaser.Math.Between(-20, 20);
    const jy = y + Phaser.Math.Between(-20, 20);
    const unit = new Unit(this, jx, jy, type, faction);
    if (faction === 'blue') {
      this.p1Units.push(unit);
    } else {
      this.p2Units.push(unit);
    }
    return unit;
  }

  placeBuilding(type: BuildingType, faction: Faction, tx: number, ty: number): Building | null {
    const cfg = BUILDING_CONFIGS[type];
    // Check occupied
    for (let dtx = 0; dtx < cfg.width; dtx++) {
      for (let dty = 0; dty < cfg.height; dty++) {
        const key = `${tx + dtx},${ty + dty}`;
        if (this.occupiedTiles.has(key)) return null;
      }
    }
    // Mark tiles
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
  enqueueUnit(type: UnitType) {
    if (this.gameOver) return;
    const cfg = UNIT_CONFIGS[type];
    if (!this.resourceSystem.spend('p1', cfg.goldCost)) return;
    const hasBarracks = this.p1Buildings.some(b => b.type === 'barracks' && !b.isDestroyed);
    if (!hasBarracks && type !== 'pawn') return;

    this.trainQueue.push({
      type,
      timeRemaining: cfg.trainTime,
      totalTime: cfg.trainTime,
    });
    this.callbacks.onTrainQueueUpdate(this.trainQueue.map(q => q.type));
  }

  enterBuildMode(type: BuildingType) {
    this.buildMode = type;
    this.input.setDefaultCursor('crosshair');
  }

  cancelBuildMode() {
    this.buildMode = null;
    this.buildGhost?.destroy();
    this.buildGhost = null;
    this.input.setDefaultCursor('default');
  }

  // ── Camera setup ────────────────────────────────────────────────────────────
  private setupCamera() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
    // Start looking at P1 castle
    cam.centerOn(P1_CASTLE_TX * TILE_SIZE + 128, P1_CASTLE_TY * TILE_SIZE + 128);
    cam.setZoom(1.2);
  }

  // ── Input ────────────────────────────────────────────────────────────────────
  private setupInput() {
    const cam = this.cameras.main;

    // WASD / arrow key camera pan
    this.input.keyboard!.on('keydown-A', () => { this.registry.set('panLeft', true); });
    this.input.keyboard!.on('keyup-A',   () => { this.registry.set('panLeft', false); });
    this.input.keyboard!.on('keydown-D', () => { this.registry.set('panRight', true); });
    this.input.keyboard!.on('keyup-D',   () => { this.registry.set('panRight', false); });
    this.input.keyboard!.on('keydown-W', () => { this.registry.set('panUp', true); });
    this.input.keyboard!.on('keyup-W',   () => { this.registry.set('panUp', false); });
    this.input.keyboard!.on('keydown-S', () => { this.registry.set('panDown', true); });
    this.input.keyboard!.on('keyup-S',   () => { this.registry.set('panDown', false); });

    // Escape cancels build mode
    this.input.keyboard!.on('keydown-ESC', () => this.cancelBuildMode());

    // Mouse click for building placement and unit commands
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      const wx = ptr.worldX;
      const wy = ptr.worldY;

      if (this.buildMode) {
        const tx = Math.floor(wx / TILE_SIZE);
        const ty = Math.floor(wy / TILE_SIZE);
        // Must be on P1 island
        if (tx >= P1_ISLAND_X1 + 1 && tx <= P1_ISLAND_X2 - 2 && ty >= 1 && ty <= MAP_ROWS - 2) {
          const cfg = BUILDING_CONFIGS[this.buildMode];
          if (this.resourceSystem.canAfford('p1', 0, cfg.woodCost)) {
            const placed = this.placeBuilding(this.buildMode, 'blue', tx, ty);
            if (placed) {
              this.resourceSystem.spend('p1', 0, cfg.woodCost);
            }
          }
        }
        this.cancelBuildMode();
        return;
      }
    });

    // Mouse move for build ghost
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!this.buildMode) {
        this.buildGhost?.destroy();
        this.buildGhost = null;
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

      const canPlace = tx >= P1_ISLAND_X1 + 1 && tx <= P1_ISLAND_X2 - 2;
      this.buildGhost.setTint(canPlace ? 0x88ff88 : 0xff4444);
    });

    // Scroll to zoom
    this.input.on('wheel', (_ptr: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
      const newZoom = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.5, 2.0);
      cam.setZoom(newZoom);
    });
  }

  // ── Update ───────────────────────────────────────────────────────────────────
  update(time: number, delta: number) {
    if (this.gameOver) return;

    const dt = delta / 1000;
    this.elapsedSecs += dt;

    // Camera pan
    this.handleCameraPan(delta);

    // Bridge timer
    const remaining = GAME_DURATION_SECS - this.elapsedSecs;
    const bridgeOpen = this.bridgeSystem.isOpen;

    if (!bridgeOpen && this.elapsedSecs >= BRIDGE_OPEN_SECS) {
      this.bridgeSystem.openBridge(() => {
        this.aiSystem.setBridgeOpen(true);
        // Send all P2 units toward bridge
        for (const u of this.p2Units) {
          if (u.isAlive()) u.moveTo(WATER_X1 * TILE_SIZE, MAP_ROWS / 2 * TILE_SIZE);
        }
      });
    }

    // Resources
    this.resourceSystem.update(delta);
    this.callbacks.onResourcesUpdate(
      Math.floor(this.resourceSystem.p1.gold),
      Math.floor(this.resourceSystem.p1.wood),
    );

    // Timer callback
    this.callbacks.onTimerUpdate(Math.max(0, remaining), bridgeOpen);

    // Train queue
    if (this.trainQueue.length > 0) {
      const first = this.trainQueue[0];
      first.timeRemaining -= delta;
      if (first.timeRemaining <= 0) {
        this.trainQueue.shift();
        this.spawnUnit(first.type, 'blue', P1_SPAWN_X, P1_SPAWN_Y);
        this.callbacks.onTrainQueueUpdate(this.trainQueue.map(q => q.type));
      }
    }

    // Update units
    for (const u of this.p1Units) u.update(delta);
    for (const u of this.p2Units) u.update(delta);

    // Update buildings (towers shoot)
    for (const b of this.p1Buildings) b.update(delta, this.p2Units);
    for (const b of this.p2Buildings) b.update(delta, this.p1Units);

    // Combat AI (idle units find targets)
    if (bridgeOpen) {
      this.combatSystem.update(this.p1Units, this.p2Units, this.p1Buildings, this.p2Buildings);
    }

    // Bot AI
    this.aiSystem.update(delta);

    // Prune dead units
    this.pruneDeadUnits();

    // Win condition
    this.checkWinCondition(remaining);
  }

  private handleCameraPan(delta: number) {
    const cam = this.cameras.main;
    const speed = 400 * (delta / 1000);
    if (this.registry.get('panLeft'))  cam.scrollX -= speed;
    if (this.registry.get('panRight')) cam.scrollX += speed;
    if (this.registry.get('panUp'))    cam.scrollY -= speed;
    if (this.registry.get('panDown'))  cam.scrollY += speed;
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
    this.cancelBuildMode();
  }
}
