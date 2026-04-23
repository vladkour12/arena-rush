import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import type { ResourceSystem } from './ResourceSystem';
import { UNIT_CONFIGS } from '../config/units';
import { BUILDING_CONFIGS } from '../config/buildings';
import {
  P2_SPAWN_X, P2_SPAWN_Y,
  P2_ISLAND_X1,
  P2_ISLAND_X2,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
} from '../config/map';

export type SpawnCallback = (
  type: 'warrior' | 'archer' | 'monk' | 'pawn',
  faction: 'red',
  x: number,
  y: number,
) => Unit;

export type PlaceBuildingCallback = (
  type: 'barracks' | 'tower' | 'house',
  faction: 'red',
  tx: number,
  ty: number,
) => Building | null;

export type GetSpawnOriginCallback = (
  type: 'warrior' | 'archer' | 'monk' | 'pawn',
) => { x: number; y: number };

export class AISystem {
  private resources: ResourceSystem;
  private p2Units: Unit[];
  private p2Buildings: Building[];
  private islandsConnected: boolean;
  private spawnUnit: SpawnCallback;
  private placeBuilding: PlaceBuildingCallback;

  private state: 'early' | 'mid' | 'rush' = 'early';
  private decisionTimer = 0;
  private decisionInterval = 1.25; // seconds
  private barracksBuilt = 0;
  private towerBuilt = 0;
  private housesBuilt = 0;
  private rushSent = false;
  private p2SpawnX = P2_SPAWN_X;
  private p2SpawnY = P2_SPAWN_Y;
  private getSpawnOriginCb: GetSpawnOriginCallback | null = null;

  constructor(
    resources: ResourceSystem,
    p2Units: Unit[],
    p2Buildings: Building[],
    islandsConnected: boolean,
    spawnUnit: SpawnCallback,
    placeBuilding: PlaceBuildingCallback,
    getSpawnOrigin?: GetSpawnOriginCallback,
  ) {
    this.resources = resources;
    this.p2Units = p2Units;
    this.p2Buildings = p2Buildings;
    this.islandsConnected = islandsConnected;
    this.spawnUnit = spawnUnit;
    this.placeBuilding = placeBuilding;
    this.getSpawnOriginCb = getSpawnOrigin ?? null;
  }

  setIslandsConnected(val: boolean) {
    this.islandsConnected = val;
  }

  setSpawnPoint(x: number, y: number) {
    this.p2SpawnX = x;
    this.p2SpawnY = y;
  }

  updateP2Units(units: Unit[]) {
    // reference kept live externally
  }

  update(delta: number) {
    const dt = delta / 1000;
    this.decisionTimer += dt;
    if (this.decisionTimer < this.decisionInterval) return;
    this.decisionTimer -= this.decisionInterval;

    const res = this.resources.p2;
    const aliveUnits = this.p2Units.filter(u => u.isAlive());

    if (!this.islandsConnected) {
      // Early game: build and train
      if (this.barracksBuilt < 2 && res.wood >= BUILDING_CONFIGS.barracks.woodCost) {
        const placed = this.tryPlaceBuilding('barracks');
        if (placed) {
          this.barracksBuilt++;
          this.resources.spend('p2', 0, BUILDING_CONFIGS.barracks.woodCost);
        }
      }

      if (this.towerBuilt < 1 && res.wood >= BUILDING_CONFIGS.tower.woodCost) {
        const placed = this.tryPlaceBuilding('tower');
        if (placed) {
          this.towerBuilt++;
          this.resources.spend('p2', 0, BUILDING_CONFIGS.tower.woodCost);
        }
      }

      if (this.housesBuilt < 2 && res.wood >= BUILDING_CONFIGS.house.woodCost) {
        const placed = this.tryPlaceBuilding('house');
        if (placed) {
          this.housesBuilt++;
          this.resources.spend('p2', 0, BUILDING_CONFIGS.house.woodCost);
        }
      }

      // Train units based on available gold
      const hasBarracks = this.p2Buildings.some(b => b.type === 'barracks' && !b.isDestroyed);
      if (hasBarracks) {
        if (aliveUnits.length < 8) {
          const origin = this.getSpawnOriginCb ? this.getSpawnOriginCb('warrior') : { x: this.p2SpawnX, y: this.p2SpawnY };
          if (res.gold >= UNIT_CONFIGS.warrior.goldCost) {
            this.spawnUnit('warrior', 'red', origin.x, origin.y);
            this.resources.spend('p2', UNIT_CONFIGS.warrior.goldCost);
          }
        }
        if (aliveUnits.length % 4 === 0 && res.gold >= UNIT_CONFIGS.archer.goldCost) {
          const origin = this.getSpawnOriginCb ? this.getSpawnOriginCb('archer') : { x: this.p2SpawnX, y: this.p2SpawnY };
          this.spawnUnit('archer', 'red', origin.x, origin.y);
          this.resources.spend('p2', UNIT_CONFIGS.archer.goldCost);
        }
        // Train a monk once the army grows
        const hasMonk = aliveUnits.some(u => u.state.type === 'monk');
        if (!hasMonk && aliveUnits.length >= 4 && res.gold >= UNIT_CONFIGS.monk.goldCost) {
          const origin = this.getSpawnOriginCb ? this.getSpawnOriginCb('monk') : { x: this.p2SpawnX, y: this.p2SpawnY };
          this.spawnUnit('monk', 'red', origin.x, origin.y);
          this.resources.spend('p2', UNIT_CONFIGS.monk.goldCost);
        }
      } else {
        // Train pawns while no barracks
        if (res.gold >= UNIT_CONFIGS.pawn.goldCost && aliveUnits.length < 5) {
          const origin = this.getSpawnOriginCb ? this.getSpawnOriginCb('pawn') : { x: this.p2SpawnX, y: this.p2SpawnY };
          this.spawnUnit('pawn', 'red', origin.x, origin.y);
          this.resources.spend('p2', UNIT_CONFIGS.pawn.goldCost);
        }
      }
    } else {
      // Islands connected: stop production and only resolve current battle.
      const invadeX = MAP_COLS * TILE_SIZE * 0.5;
      const invadeY = MAP_ROWS * TILE_SIZE * 0.5;

      if (!this.rushSent) {
        this.rushSent = true;
        // Send all alive units toward center
        for (const unit of aliveUnits) {
          unit.moveTo(invadeX, invadeY);
        }
      }
    }
  }

  private tryPlaceBuilding(type: 'barracks' | 'tower' | 'house'): boolean {
    const cfg = BUILDING_CONFIGS[type];
    const minX = P2_ISLAND_X1 + 2;
    const maxX = P2_ISLAND_X2 - cfg.width - 1;
    const minY = Math.floor(MAP_ROWS * 0.14);
    const maxY = Math.floor(MAP_ROWS * 0.82) - cfg.height;
    if (minX > maxX || minY > maxY) return false;

    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Try a randomized placement first so bot bases don't look identical every match.
    for (let i = 0; i < 30; i++) {
      const tx = randInt(minX, maxX);
      const ty = randInt(minY, maxY);
      const result = this.placeBuilding(type, 'red', tx, ty);
      if (result) return true;
    }

    // Deterministic fallback to avoid AI deadlock if random trials fail.
    const xSpan = Math.max(1, P2_ISLAND_X2 - P2_ISLAND_X1 - cfg.width - 2);
    const candidates = [
      { tx: P2_ISLAND_X1 + 1 + Math.floor(xSpan * 0.20), ty: Math.floor(MAP_ROWS * 0.22) },
      { tx: P2_ISLAND_X1 + 1 + Math.floor(xSpan * 0.35), ty: Math.floor(MAP_ROWS * 0.34) },
      { tx: P2_ISLAND_X1 + 1 + Math.floor(xSpan * 0.45), ty: Math.floor(MAP_ROWS * 0.50) },
      { tx: P2_ISLAND_X1 + 1 + Math.floor(xSpan * 0.32), ty: Math.floor(MAP_ROWS * 0.66) },
      { tx: P2_ISLAND_X1 + 1 + Math.floor(xSpan * 0.55), ty: Math.floor(MAP_ROWS * 0.76) },
    ];
    for (const pos of candidates) {
      const tx = Math.max(minX, Math.min(maxX, pos.tx));
      const ty = Math.max(minY, Math.min(maxY, pos.ty));
      const result = this.placeBuilding(type, 'red', tx, ty);
      if (result) return true;
    }
    return false;
  }
}
