/**
 * GameState - Central manager for all game state
 * Tracks resources, buildings, units, castles, and coordinates between systems
 */

import { PhaseManager, type GamePhase } from './PhaseManager';
import { Castle } from '../entities/Castle';
import { BuildingSystem } from './BuildingSystem';
import { UnitTraining } from './UnitTraining';
import { CombatResolver } from './CombatResolver';
import { VictoryChecker, type VictoryResult } from './VictoryChecker';
import type { UnitType } from './UnitTraining';

export interface PlayerResources {
  gold: number;
  wood: number;
}

export interface PlayerState {
  faction: 'p1' | 'p2';
  resources: PlayerResources;
  castle: Castle;
  buildings: BuildingSystem;
  unitTraining: UnitTraining;
  unitsCount: number;
}

export class GameState {
  private phaseManager: PhaseManager;
  private p1State: PlayerState;
  private p2State: PlayerState;
  private combatResolver: CombatResolver;
  private victoryChecker: VictoryChecker;
  private gameOver: boolean = false;
  private victory: VictoryResult | null = null;

  private readonly BASE_GOLD_PER_SECOND = 3;
  private readonly BASE_WOOD_PER_SECOND = 2;
  private readonly HOUSE_GOLD_PER_5_SECONDS = 2;

  constructor() {
    this.phaseManager = new PhaseManager();
    this.combatResolver = new CombatResolver();
    this.victoryChecker = new VictoryChecker();

    this.p1State = {
      faction: 'p1',
      resources: { gold: 100, wood: 100 },
      castle: new Castle('p1'),
      buildings: new BuildingSystem(),
      unitTraining: new UnitTraining(),
      unitsCount: 0,
    };

    this.p2State = {
      faction: 'p2',
      resources: { gold: 100, wood: 100 },
      castle: new Castle('p2'),
      buildings: new BuildingSystem(),
      unitTraining: new UnitTraining(),
      unitsCount: 0,
    };
  }

  /**
   * Start the game
   */
  public start(): void {
    this.phaseManager.start();
  }

  /**
   * Update game state (call every frame)
   */
  public update(deltaSeconds: number): void {
    // Update phase
    this.phaseManager.update();

    // Check for victory
    if (!this.gameOver) {
      const immediate = this.victoryChecker.checkImmediate(
        this.victoryChecker.getFactionStatus(
          'p1',
          this.p1State.castle.getHP(),
          this.p1State.castle.isDestroyed(),
          this.p1State.unitsCount,
          this.p1State.buildings.getBuildingsByType('barracks').length +
            this.p1State.buildings.getBuildingsByType('house').length +
            this.p1State.buildings.getBuildingsByType('tower').length +
            this.p1State.buildings.getBuildingsByType('archery').length +
            this.p1State.buildings.getBuildingsByType('church').length,
        ),
        this.victoryChecker.getFactionStatus(
          'p2',
          this.p2State.castle.getHP(),
          this.p2State.castle.isDestroyed(),
          this.p2State.unitsCount,
          this.p2State.buildings.getBuildingsByType('barracks').length +
            this.p2State.buildings.getBuildingsByType('house').length +
            this.p2State.buildings.getBuildingsByType('tower').length +
            this.p2State.buildings.getBuildingsByType('archery').length +
            this.p2State.buildings.getBuildingsByType('church').length,
        ),
      );

      if (immediate) {
        this.gameOver = true;
        this.victory = immediate;
      }

      // Check timeout
      if (this.phaseManager.getRemainingSeconds() <= 0) {
        const timeout = this.victoryChecker.checkTimeout(
          this.victoryChecker.getFactionStatus(
            'p1',
            this.p1State.castle.getHP(),
            this.p1State.castle.isDestroyed(),
            this.p1State.unitsCount,
            this.p1State.buildings.getBuildingsByType('barracks').length +
              this.p1State.buildings.getBuildingsByType('house').length +
              this.p1State.buildings.getBuildingsByType('tower').length +
              this.p1State.buildings.getBuildingsByType('archery').length +
              this.p1State.buildings.getBuildingsByType('church').length,
          ),
          this.victoryChecker.getFactionStatus(
            'p2',
            this.p2State.castle.getHP(),
            this.p2State.castle.isDestroyed(),
            this.p2State.unitsCount,
            this.p2State.buildings.getBuildingsByType('barracks').length +
              this.p2State.buildings.getBuildingsByType('house').length +
              this.p2State.buildings.getBuildingsByType('tower').length +
              this.p2State.buildings.getBuildingsByType('archery').length +
              this.p2State.buildings.getBuildingsByType('church').length,
          ),
        );

        if (timeout) {
          this.gameOver = true;
          this.victory = timeout;
        }
      }
    }

    // Update resources
    this.updateResources(deltaSeconds);

    // Update buildings
    const phaseConfig = this.phaseManager.getPhaseConfig();
    this.p1State.buildings.updateBuildings(deltaSeconds, phaseConfig.buildingSpeedMultiplier);
    this.p2State.buildings.updateBuildings(deltaSeconds, phaseConfig.buildingSpeedMultiplier);

    // Update unit training
    this.p1State.unitTraining.update(deltaSeconds);
    this.p2State.unitTraining.update(deltaSeconds);

    // Update castle repair (if active)
    this.p1State.castle.repair(
      this.p1State.buildings.getChurchLevel(),
      deltaSeconds,
      this.p1State.resources.gold,
    );
    this.p2State.castle.repair(
      this.p2State.buildings.getChurchLevel(),
      deltaSeconds,
      this.p2State.resources.gold,
    );
  }

  private updateResources(deltaSeconds: number): void {
    const phaseConfig = this.phaseManager.getPhaseConfig();
    const incomeMultiplier = phaseConfig.incomeMultiplier;

    // Only generate resources if not in deployment or final stand
    if (phaseConfig.incomeMultiplier === 0) {
      return;
    }

    // Base income
    const goldPerSecond = this.BASE_GOLD_PER_SECOND * incomeMultiplier;
    const woodPerSecond = this.BASE_WOOD_PER_SECOND * incomeMultiplier;

    this.p1State.resources.gold += goldPerSecond * deltaSeconds;
    this.p1State.resources.wood += woodPerSecond * deltaSeconds;

    this.p2State.resources.gold += goldPerSecond * deltaSeconds;
    this.p2State.resources.wood += woodPerSecond * deltaSeconds;

    // House bonus (simplified - generates extra gold periodically)
    // This is a simplified version; real implementation might want async events
    const houseBonus = this.p1State.buildings.getBuildingsByType('house').length;
    if (houseBonus > 0) {
      this.p1State.resources.gold += (this.HOUSE_GOLD_PER_5_SECONDS / 5) * houseBonus * deltaSeconds;
    }

    const p2HouseBonus = this.p2State.buildings.getBuildingsByType('house').length;
    if (p2HouseBonus > 0) {
      this.p2State.resources.gold +=
        (this.HOUSE_GOLD_PER_5_SECONDS / 5) * p2HouseBonus * deltaSeconds;
    }
  }

  /**
   * Deduct resources for building
   */
  public spendResources(faction: 'p1' | 'p2', gold: number, wood: number): boolean {
    const state = faction === 'p1' ? this.p1State : this.p2State;

    if (state.resources.gold < gold || state.resources.wood < wood) {
      return false;
    }

    state.resources.gold -= gold;
    state.resources.wood -= wood;
    return true;
  }

  /**
   * Get player state
   */
  public getPlayerState(faction: 'p1' | 'p2'): PlayerState {
    return faction === 'p1' ? this.p1State : this.p2State;
  }

  /**
   * Get phase manager
   */
  public getPhaseManager(): PhaseManager {
    return this.phaseManager;
  }

  /**
   * Get current phase
   */
  public getCurrentPhase(): GamePhase {
    return this.phaseManager.getCurrentPhase();
  }

  /**
   * Check if game is over
   */
  public isGameOver(): boolean {
    return this.gameOver;
  }

  /**
   * Get victory result (if game is over)
   */
  public getVictoryResult(): VictoryResult | null {
    return this.victory;
  }

  /**
   * Get combat resolver
   */
  public getCombatResolver(): CombatResolver {
    return this.combatResolver;
  }

  /**
   * Train a unit for a faction
   */
  public trainUnit(faction: 'p1' | 'p2', unitType: UnitType): boolean {
    const state = faction === 'p1' ? this.p1State : this.p2State;
    const cost = state.unitTraining.getTrainingCost(unitType);
    const requiredBuilding = state.unitTraining.getRequiredBuilding(unitType);
    const hasBuilding = requiredBuilding ? state.buildings.hasBuilding(requiredBuilding as any) : true;

    if (
      !state.unitTraining.canTrain(
        unitType,
        state.resources.gold,
        hasBuilding,
        state.unitsCount,
        state.buildings.getUnitCapacity(),
      )
    ) {
      return false;
    }

    if (!this.spendResources(faction, cost, 0)) {
      return false;
    }

    return state.unitTraining.queueUnit(
      unitType,
      state.resources.gold,
      hasBuilding,
      state.unitsCount,
      state.buildings.getUnitCapacity(),
    );
  }

  /**
   * Build a structure for a faction
   */
  public buildStructure(faction: 'p1' | 'p2', buildingType: string): boolean {
    const state = faction === 'p1' ? this.p1State : this.p2State;
    const cost = state.buildings.getBuildingCost(buildingType as any);

    if (!this.spendResources(faction, 0, cost)) {
      return false;
    }

    const buildingId = `${faction}-${buildingType}-${Date.now()}`;
    state.buildings.startBuilding(buildingId, buildingType as any);
    return true;
  }

  /**
   * Add unit to faction
   */
  public addUnit(faction: 'p1' | 'p2'): void {
    const state = faction === 'p1' ? this.p1State : this.p2State;
    state.unitsCount += 1;
  }

  /**
   * Remove unit from faction
   */
  public removeUnit(faction: 'p1' | 'p2'): void {
    const state = faction === 'p1' ? this.p1State : this.p2State;
    state.unitsCount = Math.max(0, state.unitsCount - 1);
  }

  /**
   * Get timer display
   */
  public getTimerDisplay(): string {
    return this.phaseManager.getTimerDisplay();
  }
}
