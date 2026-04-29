import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import type { ResourceSystem } from './ResourceSystem';
import { UNIT_CONFIGS, type UnitType } from '../config/units';
import { BUILDING_CONFIGS, type BuildingType } from '../config/buildings';
import {
  P2_SPAWN_X, P2_SPAWN_Y,
  P2_CASTLE_TX, P2_CASTLE_TY,
  MAP_COLS,
  MAP_ROWS,
  TILE_SIZE,
} from '../config/map';

// ── Public types ─────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'normal' | 'hard';

export type SpawnCallback = (
  type: 'warrior' | 'archer' | 'monk' | 'pawn' | 'knight' | 'slinger',
  faction: 'red',
  x: number,
  y: number,
) => Unit;

export type PlaceBuildingCallback = (
  type: 'barracks' | 'tower' | 'house' | 'fort' | 'workshop',
  faction: 'red',
  tx: number,
  ty: number,
) => Building | null;

export type GetSpawnOriginCallback = (
  type: 'warrior' | 'archer' | 'monk' | 'pawn' | 'knight' | 'slinger',
) => { x: number; y: number };

export type GetPlayerUnitsCallback = () => Partial<Record<UnitType, number>>;
export type GetPopInfoCallback = () => { pop: number; cap: number };

// ── Difficulty config ────────────────────────────────────────────────────────

interface DifficultyConfig {
  /** Seconds between each AI decision tick */
  decisionInterval: number;
  /** +-fraction of random noise applied to scores (0 = deterministic) */
  noiseAmplitude: number;
  /** Maximum number of units the AI will field at once */
  armyCap: number;
}

const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy:   { decisionInterval: 2.5,  noiseAmplitude: 0.30, armyCap: 8  },
  normal: { decisionInterval: 1.25, noiseAmplitude: 0.10, armyCap: 14 },
  hard:   { decisionInterval: 0.75, noiseAmplitude: 0.00, armyCap: 20 },
};

// ── Internal state snapshot ──────────────────────────────────────────────────

type TrainableBuildingType = 'barracks' | 'tower' | 'house' | 'fort' | 'workshop';

interface GameStateSnapshot {
  gold: number;
  wood: number;
  ownUnits: Partial<Record<UnitType, number>>;
  ownUnitCount: number;
  ownAvgHpRatio: number;
  hasBuilding: Partial<Record<BuildingType, boolean>>;
  buildingCount: Partial<Record<BuildingType, number>>;
  playerUnits: Partial<Record<UnitType, number>>;
  playerUnitCount: number;
  pop: number;
  popCap: number;
}

// ── AISystem ─────────────────────────────────────────────────────────────────

export class AISystem {
  private resources: ResourceSystem;
  private p2Units: Unit[];
  private p2Buildings: Building[];
  private spawnUnit: SpawnCallback;
  private placeBuilding: PlaceBuildingCallback;
  private getSpawnOriginCb: GetSpawnOriginCallback | null = null;
  private getPlayerUnitsCb: GetPlayerUnitsCallback;
  private getPopInfoCb: GetPopInfoCallback;

  private difficulty: Difficulty;
  private diffCfg: DifficultyConfig;
  private decisionTimer = 0;
  private p2SpawnX = P2_SPAWN_X;
  private p2SpawnY = P2_SPAWN_Y;

  constructor(
    resources: ResourceSystem,
    p2Units: Unit[],
    p2Buildings: Building[],
    spawnUnit: SpawnCallback,
    placeBuilding: PlaceBuildingCallback,
    getSpawnOrigin?: GetSpawnOriginCallback,
    getPlayerUnits?: GetPlayerUnitsCallback,
    getPopInfo?: GetPopInfoCallback,
    difficulty: Difficulty = 'normal',
  ) {
    this.resources = resources;
    this.p2Units = p2Units;
    this.p2Buildings = p2Buildings;
    this.spawnUnit = spawnUnit;
    this.placeBuilding = placeBuilding;
    this.getSpawnOriginCb = getSpawnOrigin ?? null;
    this.getPlayerUnitsCb = getPlayerUnits ?? (() => ({}));
    this.getPopInfoCb = getPopInfo ?? (() => ({ pop: 0, cap: 999 }));
    this.difficulty = difficulty;
    this.diffCfg = DIFFICULTY_CONFIGS[difficulty];
  }

  setSpawnPoint(x: number, y: number) {
    this.p2SpawnX = x;
    this.p2SpawnY = y;
  }

  setDifficulty(d: Difficulty) {
    this.difficulty = d;
    this.diffCfg = DIFFICULTY_CONFIGS[d];
    this.decisionTimer = 0;
  }

  /** Kept for API compatibility - p2Units array reference is live. */
  updateP2Units(_units: Unit[]) {}

  update(delta: number) {
    const dt = delta / 1000;
    this.decisionTimer += dt;
    if (this.decisionTimer < this.diffCfg.decisionInterval) return;
    this.decisionTimer -= this.diffCfg.decisionInterval;

    const snapshot = this.captureState();
    this.buildPhaseUpdate(snapshot);
  }

  // ── State capture ────────────────────────────────────────────────────────

  private captureState(): GameStateSnapshot {
    const res = this.resources.p2;
    const aliveUnits = this.p2Units.filter(u => u.isAlive());

    const ownUnits: Partial<Record<UnitType, number>> = {};
    let totalHpRatio = 0;
    for (const u of aliveUnits) {
      ownUnits[u.state.type] = (ownUnits[u.state.type] ?? 0) + 1;
      totalHpRatio += u.state.hp / u.state.maxHp;
    }

    const hasBuilding: Partial<Record<BuildingType, boolean>> = {};
    const buildingCount: Partial<Record<BuildingType, number>> = {};
    for (const type of Object.keys(BUILDING_CONFIGS) as BuildingType[]) {
      const count = this.p2Buildings.filter(b => b.type === type && !b.isDestroyed).length;
      hasBuilding[type] = count > 0;
      buildingCount[type] = count;
    }

    const playerUnits = this.getPlayerUnitsCb();
    const playerUnitCount = (Object.values(playerUnits) as number[]).reduce((a, b) => a + b, 0);
    const { pop, cap: popCap } = this.getPopInfoCb();

    return {
      gold: res.gold,
      wood: res.wood,
      ownUnits,
      ownUnitCount: aliveUnits.length,
      ownAvgHpRatio: aliveUnits.length > 0 ? totalHpRatio / aliveUnits.length : 1,
      hasBuilding,
      buildingCount,
      playerUnits,
      playerUnitCount,
      pop,
      popCap,
    };
  }

  // ── Build phase ──────────────────────────────────────────────────────────

  private buildPhaseUpdate(s: GameStateSnapshot) {
    type ScoredAction =
      | { kind: 'build'; type: TrainableBuildingType; score: number }
      | { kind: 'train'; type: UnitType; score: number };

    const actions: ScoredAction[] = [];

    const buildableTypes: TrainableBuildingType[] = ['barracks', 'tower', 'house', 'fort', 'workshop'];
    for (const type of buildableTypes) {
      const raw = this.scoreBuilding(type, s);
      if (raw <= 0) continue;
      actions.push({ kind: 'build', type, score: this.applyNoise(raw) });
    }

    const trainableTypes: UnitType[] = ['warrior', 'archer', 'monk', 'pawn', 'knight', 'slinger'];
    for (const type of trainableTypes) {
      const raw = this.scoreUnit(type, s);
      if (raw <= 0) continue;
      actions.push({ kind: 'train', type, score: this.applyNoise(raw) });
    }

    if (actions.length === 0) return;

    actions.sort((a, b) => b.score - a.score);
    const best = actions[0];

    if (best.kind === 'build') {
      const cfg = BUILDING_CONFIGS[best.type];
      if (s.wood >= cfg.woodCost) {
        const placed = this.tryPlaceBuilding(best.type);
        if (placed) {
          this.resources.spend('p2', 0, cfg.woodCost);
        }
      }
    } else {
      const cfg = UNIT_CONFIGS[best.type];
      if (s.gold >= cfg.goldCost) {
        const origin = this.getSpawnOriginCb
          ? this.getSpawnOriginCb(best.type as Parameters<GetSpawnOriginCallback>[0])
          : { x: this.p2SpawnX, y: this.p2SpawnY };
        const spawned = this.spawnUnit(best.type as Parameters<SpawnCallback>[0], 'red', origin.x, origin.y);
        // Only deduct gold if the spawn actually succeeded (not blocked by pop cap)
        if (spawned) this.resources.spend('p2', cfg.goldCost);
      }
    }
  }

  // ── Scoring: buildings ───────────────────────────────────────────────────

  private scoreBuilding(type: TrainableBuildingType, s: GameStateSnapshot): number {
    const cfg = BUILDING_CONFIGS[type];
    if (s.wood < cfg.woodCost) return 0;

    const count = s.buildingCount[type] ?? 0;
    const playerMelee   = (s.playerUnits.warrior ?? 0) + (s.playerUnits.pawn ?? 0) + (s.playerUnits.knight ?? 0);
    const playerRanged  = (s.playerUnits.archer ?? 0) + (s.playerUnits.slinger ?? 0);
    const playerKnights = s.playerUnits.knight ?? 0;

    let score = 0;

    switch (type) {
      case 'house':
        if (count >= 3) return 0;
        score = 0.40 - count * 0.15;
        // At pop cap: building a house is urgent — score above anything else
        if (s.pop >= s.popCap) score = 1.5 - count * 0.3;
        else if (s.pop >= s.popCap - 2) score += 0.4; // close to cap
        break;

      case 'barracks':
        if (count >= 2) return 0;
        score = 0.55 - count * 0.18;
        if (playerRanged >= 3) score += 0.20;
        break;

      case 'tower':
        if (count >= 1) return 0;
        score = 0.30;
        if (playerMelee >= 4) score += 0.35;
        break;

      case 'fort':
        if (count >= 1) return 0;
        score = 0.38;
        if (playerMelee >= 4) score += 0.35;
        if (playerKnights >= 3) score += 0.40;
        break;

      case 'workshop':
        if (count >= 1) return 0;
        score = 0.25;
        if (s.ownUnitCount >= 4) score += 0.15;
        break;
    }

    return Math.max(0, score);
  }

  // ── Scoring: units ───────────────────────────────────────────────────────

  private scoreUnit(type: UnitType, s: GameStateSnapshot): number {
    const cfg = UNIT_CONFIGS[type];

    if (s.gold < cfg.goldCost) return 0;
    if (s.ownUnitCount >= this.diffCfg.armyCap) return 0;
    // Don't try to train when at pop cap — would waste gold (spawn is blocked)
    if (s.pop >= s.popCap) return 0;

    if (type === 'pawn'                                                   && !s.hasBuilding.house) return 0;
    if ((type === 'warrior' || type === 'knight' || type === 'slinger')   && !s.hasBuilding.barracks) return 0;
    if (type === 'archer'                                                  && !s.hasBuilding.fort) return 0;
    if (type === 'monk'                                                    && !s.hasBuilding.workshop) return 0;

    const playerMelee   = (s.playerUnits.warrior ?? 0) + (s.playerUnits.pawn ?? 0) + (s.playerUnits.knight ?? 0);
    const playerRanged  = (s.playerUnits.archer ?? 0) + (s.playerUnits.slinger ?? 0);
    const playerKnights = s.playerUnits.knight ?? 0;
    const ownMelee      = (s.ownUnits.warrior ?? 0) + (s.ownUnits.pawn ?? 0) + (s.ownUnits.knight ?? 0);

    let score = 0;

    switch (type) {
      case 'warrior':
        score = 0.50;
        score -= Math.min(0.25, (s.ownUnits.warrior ?? 0) * 0.05);
        if (playerRanged >= 3) score += 0.30;
        break;

      case 'pawn':
        if ((s.ownUnits.pawn ?? 0) >= 5) return 0;
        score = 0.30;
        score -= (s.ownUnits.pawn ?? 0) * 0.04;
        break;

      case 'knight':
        score = 0.45;
        if (s.gold < 80) score -= 0.20;
        score -= Math.min(0.25, (s.ownUnits.knight ?? 0) * 0.08);
        if (playerMelee >= 4) score += 0.20;
        break;

      case 'archer':
        score = 0.42;
        score -= Math.min(0.20, (s.ownUnits.archer ?? 0) * 0.06);
        if (playerMelee >= 4) score += 0.35;
        if (playerKnights >= 3) score += 0.40;
        if (ownMelee === 0) score -= 0.20;
        break;

      case 'slinger':
        score = 0.38;
        score -= Math.min(0.20, (s.ownUnits.slinger ?? 0) * 0.05);
        if (playerMelee >= 4) score += 0.25;
        if ((s.ownUnits.archer ?? 0) >= 2) score += 0.10;
        if (ownMelee === 0) score -= 0.15;
        break;

      case 'monk':
        if ((s.ownUnits.monk ?? 0) >= 2) return 0;
        score = 0.35;
        if (s.ownUnitCount >= 4) score += 0.20;
        break;
    }

    return Math.max(0, score);
  }

  // ── Battle phase ─────────────────────────────────────────────────────────

  private battlePhaseUpdate(s: GameStateSnapshot) {
    const aliveUnits = this.p2Units.filter(u => u.isAlive());
    if (aliveUnits.length === 0) return;

    const castleX = (P2_CASTLE_TX + 2) * TILE_SIZE;
    const castleY = (P2_CASTLE_TY + 2) * TILE_SIZE;
    const centerX = MAP_COLS * TILE_SIZE * 0.5;
    const centerY = MAP_ROWS * TILE_SIZE * 0.5;
    const frontLineX = centerX - TILE_SIZE * 4;

    void s;

    switch (this.difficulty) {
      case 'easy':
        for (const unit of aliveUnits) {
          if (unit.state.state !== 'attacking') {
            unit.moveTo(centerX, centerY);
          }
        }
        break;

      case 'normal': {
        for (const unit of aliveUnits) {
          if (unit.state.state === 'attacking') continue;
          const cfg = UNIT_CONFIGS[unit.state.type];
          const isMelee = cfg.range === 0;
          const slot = unit.state.id % 5;
          const lateral = (slot - 2) * 72;

          if (isMelee) {
            unit.moveTo(frontLineX, centerY + lateral);
          } else {
            const backX = frontLineX + cfg.range * 0.75;
            unit.moveTo(backX, centerY + (slot - 2) * 60);
          }
        }
        break;
      }

      case 'hard': {
        for (const unit of aliveUnits) {
          if (unit.state.state === 'attacking') continue;
          const hpRatio = unit.state.hp / unit.state.maxHp;

          if (hpRatio < 0.25) {
            unit.moveTo(castleX, castleY);
            continue;
          }

          const cfg = UNIT_CONFIGS[unit.state.type];
          const isMelee = cfg.range === 0;
          const slot = unit.state.id % 5;

          if (isMelee) {
            unit.moveTo(frontLineX, centerY + (slot - 2) * 64);
          } else {
            const backX = frontLineX + cfg.range * 0.75;
            unit.moveTo(backX, centerY + (slot - 2) * 55);
          }
        }
        break;
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private applyNoise(score: number): number {
    if (this.diffCfg.noiseAmplitude === 0) return score;
    const noise = (Math.random() * 2 - 1) * this.diffCfg.noiseAmplitude;
    return score * (1 + noise);
  }

  private tryPlaceBuilding(type: TrainableBuildingType): boolean {
    const cfg = BUILDING_CONFIGS[type];
    const minX = 112;
    const maxX = 148 - cfg.width - 1;
    const minY = Math.floor(MAP_ROWS * 0.14);
    const maxY = Math.floor(MAP_ROWS * 0.82) - cfg.height;
    if (minX > maxX || minY > maxY) return false;

    const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    for (let i = 0; i < 30; i++) {
      const tx = randInt(minX, maxX);
      const ty = randInt(minY, maxY);
      const result = this.placeBuilding(type, 'red', tx, ty);
      if (result) return true;
    }

    const xSpan = Math.max(1, 148 - 110 - cfg.width - 2);
    const candidates = [
      { tx: 110 + 1 + Math.floor(xSpan * 0.20), ty: Math.floor(MAP_ROWS * 0.22) },
      { tx: 110 + 1 + Math.floor(xSpan * 0.35), ty: Math.floor(MAP_ROWS * 0.34) },
      { tx: 110 + 1 + Math.floor(xSpan * 0.45), ty: Math.floor(MAP_ROWS * 0.50) },
      { tx: 110 + 1 + Math.floor(xSpan * 0.32), ty: Math.floor(MAP_ROWS * 0.66) },
      { tx: 110 + 1 + Math.floor(xSpan * 0.55), ty: Math.floor(MAP_ROWS * 0.76) },
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
