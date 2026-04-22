import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import type { ResourceSystem } from './ResourceSystem';
import { UNIT_CONFIGS } from '../config/units';
import { BUILDING_CONFIGS } from '../config/buildings';
import {
  P2_SPAWN_X, P2_SPAWN_Y,
  P2_ISLAND_X1, P2_ISLAND_X2,
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

export class AISystem {
  private resources: ResourceSystem;
  private p2Units: Unit[];
  private p2Buildings: Building[];
  private bridgeOpen: boolean;
  private spawnUnit: SpawnCallback;
  private placeBuilding: PlaceBuildingCallback;

  private state: 'early' | 'mid' | 'rush' = 'early';
  private decisionTimer = 0;
  private decisionInterval = 2.5; // seconds
  private barracksBuilt = 0;
  private towerBuilt = 0;
  private rushSent = false;

  constructor(
    resources: ResourceSystem,
    p2Units: Unit[],
    p2Buildings: Building[],
    bridgeOpen: boolean,
    spawnUnit: SpawnCallback,
    placeBuilding: PlaceBuildingCallback,
  ) {
    this.resources = resources;
    this.p2Units = p2Units;
    this.p2Buildings = p2Buildings;
    this.bridgeOpen = bridgeOpen;
    this.spawnUnit = spawnUnit;
    this.placeBuilding = placeBuilding;
  }

  setBridgeOpen(val: boolean) {
    this.bridgeOpen = val;
  }

  updateP2Units(units: Unit[]) {
    // reference kept live externally
  }

  update(delta: number) {
    const dt = delta / 1000;
    this.decisionTimer += dt;
    if (this.decisionTimer < this.decisionInterval) return;
    this.decisionTimer = 0;

    const res = this.resources.p2;
    const aliveUnits = this.p2Units.filter(u => u.isAlive());

    if (!this.bridgeOpen) {
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

      // Train units based on available gold
      const hasBarracks = this.p2Buildings.some(b => b.type === 'barracks' && !b.isDestroyed);
      if (hasBarracks) {
        if (aliveUnits.length < 8) {
          if (res.gold >= UNIT_CONFIGS.warrior.goldCost) {
            this.spawnUnit('warrior', 'red', P2_SPAWN_X, P2_SPAWN_Y);
            this.resources.spend('p2', UNIT_CONFIGS.warrior.goldCost);
          }
        }
        if (aliveUnits.length % 4 === 0 && res.gold >= UNIT_CONFIGS.archer.goldCost) {
          this.spawnUnit('archer', 'red', P2_SPAWN_X, P2_SPAWN_Y);
          this.resources.spend('p2', UNIT_CONFIGS.archer.goldCost);
        }
      } else {
        // Train pawns while no barracks
        if (res.gold >= UNIT_CONFIGS.pawn.goldCost && aliveUnits.length < 5) {
          this.spawnUnit('pawn', 'red', P2_SPAWN_X, P2_SPAWN_Y);
          this.resources.spend('p2', UNIT_CONFIGS.pawn.goldCost);
        }
      }
    } else {
      // Bridge open: rush
      if (!this.rushSent) {
        this.rushSent = true;
        // Send all alive units toward center
        const centerX = (P2_ISLAND_X1 - 2) * TILE_SIZE;
        const centerY = 14 * TILE_SIZE;
        for (const unit of aliveUnits) {
          unit.moveTo(centerX, centerY);
        }
      }

      // Keep training aggressively
      const hasBarracks = this.p2Buildings.some(b => b.type === 'barracks' && !b.isDestroyed);
      if (hasBarracks && res.gold >= UNIT_CONFIGS.warrior.goldCost) {
        const u = this.spawnUnit('warrior', 'red', P2_SPAWN_X, P2_SPAWN_Y);
        this.resources.spend('p2', UNIT_CONFIGS.warrior.goldCost);
        // Immediately send to fight
        u.moveTo((P2_ISLAND_X1 - 2) * TILE_SIZE, 14 * TILE_SIZE);
      }
    }
  }

  private tryPlaceBuilding(type: 'barracks' | 'tower' | 'house'): boolean {
    // Find a valid spot on P2 island
    const candidates = [
      { tx: P2_ISLAND_X1 + 4, ty: 5 },
      { tx: P2_ISLAND_X1 + 8, ty: 7 },
      { tx: P2_ISLAND_X1 + 5, ty: 17 },
      { tx: P2_ISLAND_X1 + 8, ty: 21 },
      { tx: P2_ISLAND_X1 + 11, ty: 12 },
    ];
    for (const pos of candidates) {
      const result = this.placeBuilding(type, 'red', pos.tx, pos.ty);
      if (result) return true;
    }
    return false;
  }
}
