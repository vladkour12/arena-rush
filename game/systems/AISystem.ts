/**
 * AISystem.ts  —  Multi-layer NPC opponent for Tiny Kingdoms
 *
 * Architecture overview
 * ─────────────────────
 *  ┌─────────────────────────────────────────────┐
 *  │  Strategic layer  (evaluatePhase)            │
 *  │   Tracks game phase: economy → military      │
 *  │   → attack → defend → recover               │
 *  │   Fires attack waves when army is ready.     │
 *  ├─────────────────────────────────────────────┤
 *  │  Economic layer  (economicDecision)          │
 *  │   Utility-scoring for buildings + training.  │
 *  │   Counter-build logic, income balance,       │
 *  │   pop-cap awareness, phase modifiers.        │
 *  ├─────────────────────────────────────────────┤
 *  │  Tactical layer  (tacticalUpdate — per frame)│
 *  │   Moves units toward phase objectives.       │
 *  │   Melee charges, ranged flanks, monk support,│
 *  │   retreat of low-HP units on hard.           │
 *  └─────────────────────────────────────────────┘
 *
 * Multiplayer-ready:  The AI issues commands through a CommandSystem.
 * Swap LocalNetworkAdapter for WebSocketNetworkAdapter to forward those
 * commands over the network with zero AI-logic changes.
 */

import type { Unit }           from '../entities/Unit';
import type { Building }       from '../entities/Building';
import type { ResourceSystem }  from './ResourceSystem';
import { UNIT_CONFIGS, type UnitType }      from '../config/units';
import { BUILDING_CONFIGS, type BuildingType } from '../config/buildings';
import {
  P1_CASTLE_TX, P1_CASTLE_TY,
  P2_SPAWN_X,   P2_SPAWN_Y,
  P2_CASTLE_TX, P2_CASTLE_TY,
  MAP_ROWS,
  TILE_SIZE,
} from '../config/map';
import { CommandSystem, LocalNetworkAdapter, type NetworkAdapter } from './CommandSystem';

// ── Re-export so callers don't need a separate import ─────────────────────────
export type Difficulty = 'easy' | 'normal' | 'hard';

// ── Callback types (identical to old API — scene needs no changes) ────────────
export type SpawnCallback = (
  type: UnitType, faction: 'red', x: number, y: number,
) => Unit;

export type PlaceBuildingCallback = (
  type: 'barracks' | 'tower' | 'house' | 'fort' | 'workshop',
  faction: 'red', tx: number, ty: number,
) => Building | null;

export type GetSpawnOriginCallback  = (type: UnitType) => { x: number; y: number };
export type GetPlayerUnitsCallback  = () => Partial<Record<UnitType, number>>;
export type GetPopInfoCallback      = () => { pop: number; cap: number };

// ── Difficulty profiles ───────────────────────────────────────────────────────

interface DifficultyProfile {
  /** Seconds between strategic (build/train) decisions. */
  decisionInterval: number;
  /** Uniform random noise applied to utility scores (0 = deterministic). */
  noiseAmplitude: number;
  /** Maximum units the AI will field simultaneously. */
  armyCap: number;
  /**
   * AI army power must be >= this multiple of the player's estimated power
   * before launching a wave (1.0 = equal, 1.5 = 50% stronger required).
   */
  attackPowerRatio: number;
  /**
   * Force an attack wave after this many seconds even if the AI is not
   * strong enough (prevents eternal turtling).
   */
  attackWaveInterval: number;
  /** Seconds between harassment raids. */
  harassInterval: number;
  /** Seconds to wait after a failed wave before attacking again. */
  retreatCooldown: number;
  /** Minimum alive units required to attempt a wave. */
  minWaveSize: number;
}

const DIFFICULTY_PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: {
    decisionInterval:   2.50,
    noiseAmplitude:     0.35,
    armyCap:            8,
    attackPowerRatio:   2.00,   // Very cautious — needs 2× player power
    attackWaveInterval: 180,    // Attacks at most every 3 minutes
    harassInterval:     9999,   // No harassment on easy
    retreatCooldown:    25,
    minWaveSize:        5,
  },
  normal: {
    decisionInterval:   1.25,
    noiseAmplitude:     0.10,
    armyCap:            14,
    attackPowerRatio:   1.40,   // Attacks when 40% stronger
    attackWaveInterval: 120,    // Attacks at most every 2 minutes
    harassInterval:     60,
    retreatCooldown:    18,
    minWaveSize:        4,
  },
  hard: {
    decisionInterval:   0.65,
    noiseAmplitude:     0.00,   // Fully deterministic — always optimal
    armyCap:            20,
    attackPowerRatio:   1.15,   // Very aggressive — attacks when barely stronger
    attackWaveInterval: 80,     // Relentless pressure
    harassInterval:     40,
    retreatCooldown:    12,
    minWaveSize:        3,
  },
};

// ── Game phases ───────────────────────────────────────────────────────────────

/**
 * economy  — Establish income buildings before a military build-up.
 * military — Build barracks / fort and accumulate a staging army.
 * attack   — Full army advances on the enemy castle.
 * defend   — Enemy is damaging our buildings — garrison near own castle.
 * recover  — Wave failed; retreat, heal, rebuild before the next wave.
 */
type AIPhase = 'economy' | 'military' | 'attack' | 'defend' | 'recover';

// ── State snapshot ────────────────────────────────────────────────────────────

interface AISnapshot {
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
  elapsedSecs: number;
}

// ── Type helpers ──────────────────────────────────────────────────────────────
type TrainableBuilding = 'barracks' | 'tower' | 'house' | 'fort' | 'workshop';
const BUILD_TYPES:  readonly TrainableBuilding[] = ['house', 'barracks', 'workshop', 'tower', 'fort'];
const TRAIN_TYPES:  readonly UnitType[]           = ['warrior', 'pawn', 'knight', 'archer', 'slinger', 'monk'];

// ── Army power scoring ────────────────────────────────────────────────────────

/** Combat contribution of a single live unit: DPS × HP-weight × role bonus × health ratio. */
function unitPower(unit: Unit): number {
  const cfg  = UNIT_CONFIGS[unit.state.type];
  const hpR  = unit.state.hp / unit.state.maxHp;
  if (hpR <= 0) return 0;
  const dps        = cfg.damage * cfg.attackRate;
  const rangeMult  = cfg.range > 0 ? 1.20 : 1.00; // ranged safer, contributes more net DPS
  const tankMult   = cfg.hp >= 150 ? 1.15 : 1.00;  // tanks (knight/warrior) amplified
  return dps * rangeMult * tankMult * (cfg.hp / 80) * hpR;
}

/** Estimate player army power from a unit-count map (no individual HP data). */
function estimatePlayerPower(units: Partial<Record<UnitType, number>>): number {
  let power = 0;
  for (const [type, count] of Object.entries(units) as [UnitType, number][]) {
    if (!count) continue;
    const cfg = UNIT_CONFIGS[type];
    if (!cfg) continue;
    const dps       = cfg.damage * cfg.attackRate;
    const rangeMult = cfg.range > 0 ? 1.20 : 1.00;
    power += dps * rangeMult * (cfg.hp / 80) * count;
  }
  return power;
}

// ── AISystem ──────────────────────────────────────────────────────────────────

export class AISystem {

  // ── External references ─────────────────────────────────────────────────
  private readonly resources:         ResourceSystem;
  private readonly p2Units:           Unit[];
  private readonly p2Buildings:       Building[];
  private readonly spawnUnitCb:       SpawnCallback;
  private readonly placeBuildingCb:   PlaceBuildingCallback;
  private readonly getSpawnOriginCb:  GetSpawnOriginCallback | null;
  private readonly getPlayerUnitsCb:  GetPlayerUnitsCallback;
  private readonly getPopInfoCb:      GetPopInfoCallback;

  // ── Internal command bus ─────────────────────────────────────────────────
  private readonly commandSystem: CommandSystem;

  // ── Difficulty ──────────────────────────────────────────────────────────
  private difficulty: Difficulty;
  private profile: DifficultyProfile;

  // ── Timers ──────────────────────────────────────────────────────────────
  private decisionTimer    = 0;
  private attackWaveTimer  = 0;
  private harassTimer      = 0;
  private retreatTimer     = 0;
  private elapsedSecs      = 0;
  /** Throttle the tactical layer to ~5 Hz so BFS is not called every frame. */
  private tacticalUpdateMs = 0;
  private static readonly TACTICAL_INTERVAL_MS = 200;

  // ── Phase state ─────────────────────────────────────────────────────────
  private phase:        AIPhase = 'economy';
  private inAttackWave  = false;

  // ── Spawn point ─────────────────────────────────────────────────────────
  private spawnX = P2_SPAWN_X;
  private spawnY = P2_SPAWN_Y;

  // ────────────────────────────────────────────────────────────────────────

  constructor(
    resources:       ResourceSystem,
    p2Units:         Unit[],
    p2Buildings:     Building[],
    spawnUnit:       SpawnCallback,
    placeBuilding:   PlaceBuildingCallback,
    getSpawnOrigin?: GetSpawnOriginCallback,
    getPlayerUnits?: GetPlayerUnitsCallback,
    getPopInfo?:     GetPopInfoCallback,
    difficulty:      Difficulty = 'normal',
    networkAdapter?: NetworkAdapter,
  ) {
    this.resources          = resources;
    this.p2Units            = p2Units;
    this.p2Buildings        = p2Buildings;
    this.spawnUnitCb        = spawnUnit;
    this.placeBuildingCb    = placeBuilding;
    this.getSpawnOriginCb   = getSpawnOrigin ?? null;
    this.getPlayerUnitsCb   = getPlayerUnits ?? (() => ({}));
    this.getPopInfoCb       = getPopInfo     ?? (() => ({ pop: 0, cap: 999 }));
    this.difficulty         = difficulty;
    this.profile            = DIFFICULTY_PROFILES[difficulty];

    // Stagger initial timers so the first decision ticks are spread out
    this.attackWaveTimer = this.profile.attackWaveInterval;
    this.harassTimer     = this.profile.harassInterval;

    // Wire command system with concrete execution handlers
    this.commandSystem = new CommandSystem(networkAdapter ?? new LocalNetworkAdapter());
    this.registerCommandHandlers();
  }

  // ── Public API ───────────────────────────────────────────────────────────

  setSpawnPoint(x: number, y: number): void {
    this.spawnX = x;
    this.spawnY = y;
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
    this.profile    = DIFFICULTY_PROFILES[d];
    this.decisionTimer = 0;
  }

  /** Kept for API compatibility — p2Units reference is live. */
  updateP2Units(_units: Unit[]): void {}

  /**
   * Call once per frame from the scene's update().
   * @param delta  Frame delta in milliseconds.
   */
  update(delta: number): void {
    const dt = delta / 1000;

    this.elapsedSecs     += dt;
    this.attackWaveTimer -= dt;
    this.harassTimer     -= dt;
    if (this.retreatTimer > 0) this.retreatTimer -= dt;

    // Tactical layer throttled to ~5 Hz — units follow pre-planned paths smoothly
    // between ticks; only IDLE units receive new move orders, stopping BFS spam.
    this.tacticalUpdateMs += delta;
    if (this.tacticalUpdateMs >= AISystem.TACTICAL_INTERVAL_MS) {
      this.tacticalUpdateMs = 0;
      this.tacticalUpdate();
    }

    // Flush commands enqueued in the previous strategic tick
    this.commandSystem.flush();

    // Strategic + economic decisions on a throttled interval
    this.decisionTimer += dt;
    if (this.decisionTimer < this.profile.decisionInterval) return;
    this.decisionTimer -= this.profile.decisionInterval;

    const snap = this.captureSnapshot();
    this.evaluatePhase(snap);
    this.economicDecision(snap);

    // Harassment: send a small fast raiding party occasionally
    if (this.harassTimer <= 0 && snap.ownUnitCount >= 5 && !this.inAttackWave) {
      this.sendHarassmentSquad();
      this.harassTimer = this.profile.harassInterval;
    }
  }

  // ── Command handler registration ─────────────────────────────────────────

  /**
   * Each handler maps a command kind to the concrete game-engine call.
   * In multiplayer these same handlers run on every client, ensuring
   * deterministic execution from the same command stream.
   */
  private registerCommandHandlers(): void {

    this.commandSystem.register('build', (cmd) => {
      if (cmd.faction !== 'red') return;
      const type = cmd.buildingType as TrainableBuilding;
      const cfg  = BUILDING_CONFIGS[type];
      if (!cfg || this.resources.p2.wood < cfg.woodCost) return;

      const placed = (cmd.tx !== undefined && cmd.ty !== undefined)
        ? this.placeBuildingCb(type, 'red', cmd.tx, cmd.ty) !== null
        : this.tryPlaceBuilding(type);

      if (placed) this.resources.spend('p2', 0, cfg.woodCost);
    });

    this.commandSystem.register('train', (cmd) => {
      if (cmd.faction !== 'red') return;
      const type = cmd.unitType;
      const cfg  = UNIT_CONFIGS[type];
      if (!cfg || this.resources.p2.gold < cfg.goldCost) return;

      const origin = (cmd.x !== undefined && cmd.y !== undefined)
        ? { x: cmd.x, y: cmd.y }
        : this.getSpawnOriginCb
          ? this.getSpawnOriginCb(type)
          : { x: this.spawnX, y: this.spawnY };

      const spawned = this.spawnUnitCb(type, 'red', origin.x, origin.y);
      if (spawned) this.resources.spend('p2', cfg.goldCost);
    });

    this.commandSystem.register('move', (cmd) => {
      if (cmd.faction !== 'red') return;
      const unit = this.p2Units.find(u => u.state.id === cmd.unitId && u.isAlive());
      unit?.moveTo(cmd.x, cmd.y);
    });

    // attackmove: advance units toward (x,y); CombatSystem handles fighting
    this.commandSystem.register('attackmove', (cmd) => {
      if (cmd.faction !== 'red') return;
      for (const id of cmd.unitIds) {
        const unit = this.p2Units.find(u => u.state.id === id && u.isAlive());
        if (unit) this.positionUnitForAttack(unit, cmd.x, cmd.y);
      }
    });
  }

  // ── Phase evaluation ─────────────────────────────────────────────────────

  private evaluatePhase(snap: AISnapshot): void {
    const alive      = this.p2Units.filter(u => u.isAlive());
    const ownPower   = alive.reduce((s, u) => s + unitPower(u), 0);
    const plyrPower  = estimatePlayerPower(snap.playerUnits);
    const powerRatio = plyrPower > 0 ? ownPower / plyrPower : (ownPower > 0 ? 99 : 1);

    // Detect if own buildings are taking damage (under attack)
    const underAttack = this.p2Buildings.some(b => !b.isDestroyed && b.hp < b.maxHp * 0.85);

    // ── Check for wave failure ───────────────────────────────────────────
    if (this.inAttackWave) {
      const avgHp = alive.length > 0
        ? alive.reduce((s, u) => s + u.state.hp / u.state.maxHp, 0) / alive.length
        : 0;
      if (avgHp < 0.20 || alive.length < 2) {
        const cx = (P2_CASTLE_TX + 2) * TILE_SIZE;
        const cy = (P2_CASTLE_TY + 2) * TILE_SIZE;
        this.retreatAllUnits(cx, cy);
        this.inAttackWave    = false;
        this.phase           = 'recover';
        this.retreatTimer    = this.profile.retreatCooldown;
        this.attackWaveTimer = this.profile.attackWaveInterval * 0.6;
        return;
      }
    }

    // ── Under attack → defend ────────────────────────────────────────────
    if (underAttack && !this.inAttackWave) {
      this.phase = 'defend';
      this.inAttackWave = false;
      return;
    }

    // ── Launch attack wave ───────────────────────────────────────────────
    const enoughUnits  = snap.ownUnitCount >= this.profile.minWaveSize;
    const strongEnough = powerRatio >= this.profile.attackPowerRatio;
    const timerForced  = this.attackWaveTimer <= 0;
    const canAttack    = enoughUnits && this.retreatTimer <= 0 && !underAttack;

    if (canAttack && (strongEnough || timerForced) && this.phase !== 'attack') {
      this.phase           = 'attack';
      this.inAttackWave    = true;
      this.attackWaveTimer = this.profile.attackWaveInterval;
      this.launchAttackWave();
      return;
    }

    // ── Recovery ────────────────────────────────────────────────────────
    if (this.phase === 'recover' && this.retreatTimer <= 0) {
      const avgHp = alive.length > 0
        ? alive.reduce((s, u) => s + u.state.hp / u.state.maxHp, 0) / alive.length
        : 1;
      if (avgHp > 0.55) this.phase = snap.hasBuilding.barracks ? 'military' : 'economy';
      return;
    }

    // ── Defend → military when threat cleared ────────────────────────────
    if (this.phase === 'defend' && !underAttack) {
      this.phase = 'military';
    }

    // ── Economy → military when barracks exists and first units ready ────
    if (this.phase === 'economy' && snap.hasBuilding.barracks && snap.ownUnitCount >= 2) {
      this.phase = 'military';
    }

    // ── Attack → economy when all units are dead ─────────────────────────
    if (this.phase === 'attack' && alive.length === 0) {
      this.phase        = 'economy';
      this.inAttackWave = false;
      this.retreatTimer = this.profile.retreatCooldown * 0.5;
    }
  }

  // ── Economic decisions ────────────────────────────────────────────────────

  private economicDecision(snap: AISnapshot): void {
    type Action =
      | { kind: 'build'; type: TrainableBuilding; score: number }
      | { kind: 'train'; type: UnitType;          score: number };

    const actions: Action[] = [];

    for (const type of BUILD_TYPES) {
      const raw = this.scoreBuilding(type, snap);
      if (raw > 0) actions.push({ kind: 'build', type, score: this.noise(raw) });
    }
    for (const type of TRAIN_TYPES) {
      const raw = this.scoreUnit(type, snap);
      if (raw > 0) actions.push({ kind: 'train', type, score: this.noise(raw) });
    }

    if (actions.length === 0) return;
    actions.sort((a, b) => b.score - a.score);

    // Execute up to one BUILD + one TRAIN per tick (more responsive than one-or-other)
    let didBuild = false;
    let didTrain = false;

    for (const action of actions) {
      if (didBuild && didTrain) break;

      if (!didBuild && action.kind === 'build') {
        this.commandSystem.enqueue({ kind: 'build', faction: 'red', buildingType: action.type });
        didBuild = true;
      }
      if (!didTrain && action.kind === 'train') {
        const origin = this.getSpawnOriginCb
          ? this.getSpawnOriginCb(action.type)
          : { x: this.spawnX, y: this.spawnY };
        this.commandSystem.enqueue({ kind: 'train', faction: 'red', unitType: action.type, x: origin.x, y: origin.y });
        didTrain = true;
      }
    }
  }

  // ── Tactical layer (every frame) ─────────────────────────────────────────

  private tacticalUpdate(): void {
    const alive = this.p2Units.filter(u => u.isAlive());
    if (alive.length === 0) return;

    const ownCX   = (P2_CASTLE_TX + 2) * TILE_SIZE;
    const ownCY   = (P2_CASTLE_TY + 2) * TILE_SIZE;
    const enemyCX = (P1_CASTLE_TX + 2) * TILE_SIZE;
    const enemyCY = (P1_CASTLE_TY + 2) * TILE_SIZE;

    switch (this.phase) {
      case 'attack':
        this.tacticalAttack(alive, enemyCX, enemyCY);
        break;
      case 'defend':
        this.tacticalDefend(alive, ownCX, ownCY);
        break;
      case 'recover':
        for (const unit of alive) {
          if (unit.state.state !== 'idle') continue; // only re-path idle units
          const slot  = unit.state.id % 5;
          const angle = (slot / 5) * Math.PI * 2;
          const gx = ownCX + Math.cos(angle) * TILE_SIZE * 4;
          const gy = ownCY + Math.sin(angle) * TILE_SIZE * 4;
          if (this.dist(unit, gx, gy) > TILE_SIZE * 5) unit.moveTo(gx, gy);
        }
        break;
      case 'military':
      case 'economy':
        this.tacticalStage(alive, ownCX, ownCY, enemyCX, enemyCY);
        break;
    }
  }

  /** Full assault: melee charges, ranged flanks, monks support army centroid. */
  private tacticalAttack(units: Unit[], targetX: number, targetY: number): void {
    for (const unit of units) {
      const hpRatio = unit.state.hp / unit.state.maxHp;
      const cfg     = UNIT_CONFIGS[unit.state.type];

      // Hard: badly-wounded units peel off — emergency order that interrupts movement
      if (this.difficulty === 'hard' && hpRatio < 0.22 && unit.state.state !== 'attacking') {
        const ownCX = (P2_CASTLE_TX + 2) * TILE_SIZE;
        const ownCY = (P2_CASTLE_TY + 2) * TILE_SIZE;
        if (this.dist(unit, ownCX, ownCY) > TILE_SIZE * 3) unit.moveTo(ownCX, ownCY);
        continue;
      }

      // Only give new orders to units that have finished their current movement.
      // This stops BFS from running every frame and eliminates jitter.
      if (unit.state.state !== 'idle') continue;

      // Monks: follow army centroid so they stay in heal range
      if (unit.state.type === 'monk') {
        const cx = units.reduce((s, u) => s + u.state.x, 0) / units.length;
        const cy = units.reduce((s, u) => s + u.state.y, 0) / units.length;
        if (this.dist(unit, cx, cy) > TILE_SIZE * 2) unit.moveTo(cx, cy);
        continue;
      }

      const slot    = unit.state.id % 5;
      const lateral = (slot - 2) * 80;

      if (cfg.range === 0) {
        // Melee: loose formation charge
        const tx = targetX + (slot - 2) * 48;
        const ty = targetY + lateral * 0.3;
        if (this.dist(unit, tx, ty) > TILE_SIZE * 3) unit.moveTo(tx, ty);
      } else {
        // Ranged: stand off behind melee at ~55% of range
        const dx      = targetX - unit.state.x;
        const dy      = targetY - unit.state.y;
        const len     = Math.sqrt(dx * dx + dy * dy) || 1;
        const standoff = cfg.range * 0.55;
        const sx = targetX - (dx / len) * standoff + lateral * 0.25;
        const sy = targetY - (dy / len) * standoff + lateral * 0.40;
        if (this.dist(unit, sx, sy) > TILE_SIZE * 3) unit.moveTo(sx, sy);
      }
    }
  }

  /** Defensive ring formation around own castle. */
  private tacticalDefend(units: Unit[], castleX: number, castleY: number): void {
    for (const unit of units) {
      if (unit.state.state !== 'idle') continue; // only move idle units
      const angle = ((unit.state.id % 6) / 6) * Math.PI * 2;
      const gx    = castleX + Math.cos(angle) * TILE_SIZE * 3.5;
      const gy    = castleY + Math.sin(angle) * TILE_SIZE * 3.5;
      if (this.dist(unit, gx, gy) > TILE_SIZE * 1.5) unit.moveTo(gx, gy);
    }
  }

  /**
   * Staging formation: units hold between own castle and the map centre,
   * grouped by role. Wounded units return to castle to receive monk healing.
   */
  private tacticalStage(
    units: Unit[],
    castleX: number, castleY: number,
    enemyCastleX: number, enemyCastleY: number,
  ): void {
    const dx  = enemyCastleX - castleX;
    const dy  = enemyCastleY - castleY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const stagingX = castleX + (dx / len) * TILE_SIZE * 18;
    const stagingY = castleY + (dy / len) * TILE_SIZE * 12;

    for (const unit of units) {
      if (unit.state.state !== 'idle') continue; // only move idle units
      const hpRatio = unit.state.hp / unit.state.maxHp;

      // Wounded → return to castle for monk healing
      if (hpRatio < 0.40) {
        const slot = unit.state.id % 4;
        const gx   = castleX + (slot - 1.5) * TILE_SIZE * 2;
        const gy   = castleY + TILE_SIZE * 2;
        if (this.dist(unit, gx, gy) > TILE_SIZE * 2) unit.moveTo(gx, gy);
        continue;
      }

      const slot    = unit.state.id % 5;
      const lateral = (slot - 2) * 72;
      const cfg     = UNIT_CONFIGS[unit.state.type];

      if (cfg.range === 0) {
        const tx = stagingX + lateral * 0.4;
        const ty = stagingY + lateral * 0.5;
        if (this.dist(unit, tx, ty) > TILE_SIZE * 2.5) unit.moveTo(tx, ty);
      } else {
        const backX = stagingX - (dx / len) * cfg.range * 0.45;
        const backY = stagingY - (dy / len) * cfg.range * 0.45 + lateral * 0.6;
        if (this.dist(unit, backX, backY) > TILE_SIZE * 2.5) unit.moveTo(backX, backY);
      }
    }
  }

  // ── Attack wave ──────────────────────────────────────────────────────────

  private launchAttackWave(): void {
    const alive = this.p2Units.filter(u => u.isAlive());
    if (alive.length === 0) return;
    this.commandSystem.enqueue({
      kind:    'attackmove',
      faction: 'red',
      unitIds: alive.map(u => u.state.id),
      x:       (P1_CASTLE_TX + 2) * TILE_SIZE,
      y:       (P1_CASTLE_TY + 2) * TILE_SIZE,
    });
  }

  private retreatAllUnits(castleX: number, castleY: number): void {
    for (const unit of this.p2Units) {
      if (!unit.isAlive()) continue;
      const angle = ((unit.state.id % 6) / 6) * Math.PI * 2;
      unit.moveTo(
        castleX + Math.cos(angle) * TILE_SIZE * 4,
        castleY + Math.sin(angle) * TILE_SIZE * 4,
      );
    }
  }

  // ── Harassment ───────────────────────────────────────────────────────────

  /**
   * Dispatch 2-3 of the fastest idle units toward the enemy spawn area.
   * Forces the player to react and split their attention.
   */
  private sendHarassmentSquad(): void {
    const idle = this.p2Units.filter(u => u.isAlive() && u.state.state !== 'attacking');
    if (idle.length < 2) return;

    // Fastest units make the best raiders
    const sorted    = [...idle].sort((a, b) => UNIT_CONFIGS[b.state.type].speed - UNIT_CONFIGS[a.state.type].speed);
    const squadSize = this.difficulty === 'hard' ? 3 : 2;
    const squad     = sorted.slice(0, Math.min(squadSize, sorted.length));

    const targetX = (P1_CASTLE_TX + 3) * TILE_SIZE;
    const targetY = (P1_CASTLE_TY + 5) * TILE_SIZE;
    for (const unit of squad) {
      const jitter = (unit.state.id % 3 - 1) * TILE_SIZE * 2;
      unit.moveTo(targetX + jitter, targetY);
    }
  }

  // ── Building utility scoring ─────────────────────────────────────────────

  private scoreBuilding(type: TrainableBuilding, snap: AISnapshot): number {
    const cfg   = BUILDING_CONFIGS[type];
    if (snap.wood < cfg.woodCost) return 0;

    const count         = snap.buildingCount[type]  ?? 0;
    const playerMelee   = (snap.playerUnits.warrior ?? 0) + (snap.playerUnits.pawn ?? 0) + (snap.playerUnits.knight ?? 0);
    const playerRanged  = (snap.playerUnits.archer  ?? 0) + (snap.playerUnits.slinger ?? 0);
    const playerKnights = snap.playerUnits.knight ?? 0;
    const earlyGame     = snap.elapsedSecs < 90;
    const midGame       = snap.elapsedSecs >= 90 && snap.elapsedSecs < 240;
    let score = 0;

    switch (type) {

      case 'house': {
        if (count >= 3) return 0;
        score = 0.35 - count * 0.12;
        // Pop-cap urgency dominates all other priorities
        if      (snap.pop >= snap.popCap)     score = 1.80;
        else if (snap.pop >= snap.popCap - 1) score = 1.10;
        else if (snap.pop >= snap.popCap - 2) score = 0.65;
        if (this.phase === 'economy') score += 0.20; // houses also drip gold
        break;
      }

      case 'barracks': {
        if (count >= 2) return 0;
        score = earlyGame ? 0.72 : 0.45;
        if (count >= 1)       score *= 0.40;   // second barracks is low priority
        if (playerRanged >= 3) score += 0.18;  // need melee to close on ranged
        if (this.phase === 'economy') score *= 0.50;
        break;
      }

      case 'tower': {
        if (count >= 2) return 0;              // hard cap: 2 towers
        score = 0.26 - count * 0.10;
        if (playerMelee >= 4) score += 0.38;  // towers shred melee rushes
        if (this.phase === 'defend') score += 0.55;
        if (earlyGame && count === 0) score -= 0.12;
        if (!snap.hasBuilding.barracks) return 0; // barracks first
        break;
      }

      case 'fort': {
        if (count >= 1) return 0;
        score = midGame ? 0.44 : 0.22;
        if (playerKnights >= 2) score += 0.42; // fort → archers → hard-counter cavalry
        if (playerMelee   >= 5) score += 0.30;
        if (!snap.hasBuilding.barracks) score -= 0.30;
        break;
      }

      case 'workshop': {
        if (count >= 1) return 0;
        score = 0.25;
        if (snap.wood < 100)        score += 0.18; // low wood → build income
        if (snap.ownUnitCount >= 5) score += 0.10;
        if (earlyGame)              score -= 0.10;
        break;
      }
    }

    return Math.max(0, score);
  }

  // ── Unit utility scoring ──────────────────────────────────────────────────

  private scoreUnit(type: UnitType, snap: AISnapshot): number {
    const cfg = UNIT_CONFIGS[type];
    if (snap.gold < cfg.goldCost)          return 0;
    if (snap.ownUnitCount >= this.profile.armyCap) return 0;
    if (snap.pop >= snap.popCap)            return 0; // pop cap prevents spawn

    // Building prerequisites
    if (type === 'pawn'                                                   && !snap.hasBuilding.house)    return 0;
    if ((type === 'warrior' || type === 'knight' || type === 'slinger')   && !snap.hasBuilding.barracks) return 0;
    if (type === 'archer'                                                  && !snap.hasBuilding.fort)     return 0;
    if (type === 'monk'                                                    && !snap.hasBuilding.workshop)  return 0;

    const playerMelee   = (snap.playerUnits.warrior ?? 0) + (snap.playerUnits.pawn ?? 0) + (snap.playerUnits.knight ?? 0);
    const playerRanged  = (snap.playerUnits.archer  ?? 0) + (snap.playerUnits.slinger ?? 0);
    const playerKnights = snap.playerUnits.knight ?? 0;
    const playerMonks   = snap.playerUnits.monk   ?? 0;
    const ownMelee      = (snap.ownUnits.warrior ?? 0) + (snap.ownUnits.pawn ?? 0) + (snap.ownUnits.knight ?? 0);
    const ownRanged     = (snap.ownUnits.archer  ?? 0) + (snap.ownUnits.slinger ?? 0);

    let score = 0;

    switch (type) {

      case 'warrior': {
        score = 0.56;
        score -= Math.min(0.30, (snap.ownUnits.warrior ?? 0) * 0.055);
        if (playerRanged >= 3) score += 0.30;  // melee closes on ranged faster
        if (playerMonks  >= 1) score += 0.15;  // monks heal ranged — melee bypasses
        if (ownMelee     >  6) score -= 0.25;  // diversify after 6 melee
        break;
      }

      case 'pawn': {
        if ((snap.ownUnits.pawn ?? 0) >= 4) return 0;
        score = 0.28;
        score -= (snap.ownUnits.pawn ?? 0) * 0.05;
        if (snap.elapsedSecs < 60) score += 0.10; // cheap filler early
        break;
      }

      case 'knight': {
        score = 0.52;
        if (snap.gold < cfg.goldCost + 30) score -= 0.15; // protect gold reserves
        score -= Math.min(0.28, (snap.ownUnits.knight ?? 0) * 0.085);
        if (playerMelee  >= 4) score += 0.22;
        if (playerRanged >= 4) score -= 0.10;  // knights poor vs massed ranged
        if (ownMelee >= 3 && ownRanged === 0) score += 0.10;
        break;
      }

      case 'archer': {
        score = 0.47;
        score -= Math.min(0.22, (snap.ownUnits.archer ?? 0) * 0.065);
        if (playerKnights >= 2) score += 0.46; // hard counter to cavalry
        if (playerMelee   >= 4) score += 0.35;
        if (playerMonks   >= 2) score += 0.22; // focus-fire monks
        if (ownMelee      === 0) score -= 0.25; // always need a melee screen
        break;
      }

      case 'slinger': {
        score = 0.40;
        score -= Math.min(0.22, (snap.ownUnits.slinger ?? 0) * 0.055);
        if (playerMelee   >= 4) score += 0.28;
        if (playerKnights >= 2) score += 0.30;
        if (ownMelee      === 0) score -= 0.18;
        if ((snap.ownUnits.archer ?? 0) >= 2) score -= 0.10; // diversify ranged
        break;
      }

      case 'monk': {
        if ((snap.ownUnits.monk ?? 0) >= 2) return 0;
        score = 0.38;
        if (snap.ownUnitCount   >= 5) score += 0.22;
        if (snap.ownAvgHpRatio  <  0.60) score += 0.15; // army is wounded
        break;
      }
    }

    // Save gold when reserves are tight
    if (snap.gold < 50 && cfg.goldCost > 40) score -= 0.18;

    // Phase modifiers
    if (this.phase === 'attack' || this.phase === 'military') score += 0.10;
    if (this.phase === 'economy') score -= 0.10;

    return Math.max(0, score);
  }

  // ── Attack positioning helper ─────────────────────────────────────────────

  private positionUnitForAttack(unit: Unit, targetX: number, targetY: number): void {
    if (unit.state.state === 'attacking') return;
    const cfg     = UNIT_CONFIGS[unit.state.type];
    const slot    = unit.state.id % 5;
    const lateral = (slot - 2) * 80;

    if (unit.state.type === 'monk') return; // monks handled by tacticalAttack each frame

    if (cfg.range === 0) {
      unit.moveTo(targetX + (slot - 2) * 48, targetY + lateral * 0.3);
    } else {
      const dx      = targetX - unit.state.x;
      const dy      = targetY - unit.state.y;
      const len     = Math.sqrt(dx * dx + dy * dy) || 1;
      const standoff = cfg.range * 0.55;
      unit.moveTo(
        targetX - (dx / len) * standoff + lateral * 0.25,
        targetY - (dy / len) * standoff + lateral * 0.40,
      );
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private noise(score: number): number {
    if (this.profile.noiseAmplitude === 0) return score;
    return score * (1 + (Math.random() * 2 - 1) * this.profile.noiseAmplitude);
  }

  private dist(unit: Unit, x: number, y: number): number {
    const dx = unit.state.x - x;
    const dy = unit.state.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Find a valid tile for a new building by random sampling in P2 territory,
   * falling back to deterministic candidates if sampling fails.
   */
  private tryPlaceBuilding(type: TrainableBuilding): boolean {
    const cfg  = BUILDING_CONFIGS[type];
    const minX = 112;
    const maxX = 148 - cfg.width - 1;
    const minY = Math.floor(MAP_ROWS * 0.14);
    const maxY = Math.floor(MAP_ROWS * 0.82) - cfg.height;
    if (minX > maxX || minY > maxY) return false;

    const ri = (lo: number, hi: number) => Math.floor(Math.random() * (hi - lo + 1)) + lo;

    for (let i = 0; i < 30; i++) {
      if (this.placeBuildingCb(type, 'red', ri(minX, maxX), ri(minY, maxY))) return true;
    }

    const xSpan = Math.max(1, 148 - 110 - cfg.width - 2);
    const fallbacks = [
      { tx: 110 + Math.floor(xSpan * 0.20), ty: Math.floor(MAP_ROWS * 0.22) },
      { tx: 110 + Math.floor(xSpan * 0.35), ty: Math.floor(MAP_ROWS * 0.34) },
      { tx: 110 + Math.floor(xSpan * 0.45), ty: Math.floor(MAP_ROWS * 0.50) },
      { tx: 110 + Math.floor(xSpan * 0.32), ty: Math.floor(MAP_ROWS * 0.66) },
      { tx: 110 + Math.floor(xSpan * 0.55), ty: Math.floor(MAP_ROWS * 0.76) },
    ];
    for (const pos of fallbacks) {
      const tx = Math.max(minX, Math.min(maxX, pos.tx));
      const ty = Math.max(minY, Math.min(maxY, pos.ty));
      if (this.placeBuildingCb(type, 'red', tx, ty)) return true;
    }
    return false;
  }

  /** Build an immutable snapshot of the current game state for scoring. */
  private captureSnapshot(): AISnapshot {
    const res   = this.resources.p2;
    const alive = this.p2Units.filter(u => u.isAlive());

    const ownUnits: Partial<Record<UnitType, number>> = {};
    let totalHpRatio = 0;
    for (const u of alive) {
      ownUnits[u.state.type] = (ownUnits[u.state.type] ?? 0) + 1;
      totalHpRatio += u.state.hp / u.state.maxHp;
    }

    const hasBuilding:   Partial<Record<BuildingType, boolean>> = {};
    const buildingCount: Partial<Record<BuildingType, number>>  = {};
    for (const type of Object.keys(BUILDING_CONFIGS) as BuildingType[]) {
      const cnt          = this.p2Buildings.filter(b => b.type === type && !b.isDestroyed).length;
      hasBuilding[type]  = cnt > 0;
      buildingCount[type] = cnt;
    }

    const playerUnits = this.getPlayerUnitsCb();
    const playerCount = (Object.values(playerUnits) as number[]).reduce((a, b) => a + b, 0);
    const { pop, cap: popCap } = this.getPopInfoCb();

    return {
      gold:           res.gold,
      wood:           res.wood,
      ownUnits,
      ownUnitCount:   alive.length,
      ownAvgHpRatio:  alive.length > 0 ? totalHpRatio / alive.length : 1,
      hasBuilding,
      buildingCount,
      playerUnits,
      playerUnitCount: playerCount,
      pop,
      popCap,
      elapsedSecs:    this.elapsedSecs,
    };
  }
}
