/**
 * UnitTraining - Manages unit training with queue and prerequisites
 * 
 * Training mechanics:
 * - One unit at a time
 * - Prerequisites: barracks for warrior/pawn/scout, archery for archer, church for monk
 * - Costs: Pawn 8g/5s, Warrior 25g/10s, Archer 40g/8s, Monk 55g/12s, Scout 75g/6s
 * - Cannot train if unit cap reached
 * - Queue system: supports queuing multiple units
 */

export type UnitType = 'pawn' | 'warrior' | 'archer' | 'monk' | 'scout';

export interface UnitTrainingConfig {
  type: UnitType;
  cost: number; // gold cost
  trainingTimeSeconds: number;
  requiredBuilding?: string; // e.g., 'barracks', 'archery', 'church'
}

export interface TrainingQueue {
  unitType: UnitType;
  progress: number; // 0-1
  timeRemaining: number;
}

export class UnitTraining {
  private configs: Record<UnitType, UnitTrainingConfig> = {
    pawn: { type: 'pawn', cost: 8, trainingTimeSeconds: 5, requiredBuilding: 'barracks' },
    warrior: { type: 'warrior', cost: 25, trainingTimeSeconds: 10, requiredBuilding: 'barracks' },
    archer: { type: 'archer', cost: 40, trainingTimeSeconds: 8, requiredBuilding: 'archery' },
    monk: { type: 'monk', cost: 55, trainingTimeSeconds: 12, requiredBuilding: 'church' },
    scout: { type: 'scout', cost: 75, trainingTimeSeconds: 6, requiredBuilding: 'barracks' },
  };

  private queue: TrainingQueue[] = [];
  private currentlyTraining: TrainingQueue | null = null;
  private unitsCompleted: number = 0;

  /**
   * Check if a unit type is trainable with prerequisites met
   */
  public canTrain(
    unitType: UnitType,
    availableGold: number,
    hasRequiredBuilding: boolean,
    currentUnits: number,
    unitCapacity: number,
  ): boolean {
    if (currentUnits >= unitCapacity) {
      return false; // Unit cap reached
    }

    if (!hasRequiredBuilding) {
      return false; // Missing required building
    }

    const config = this.configs[unitType];
    return availableGold >= config.cost;
  }

  /**
   * Queue a unit for training
   */
  public queueUnit(
    unitType: UnitType,
    availableGold: number,
    hasRequiredBuilding: boolean,
    currentUnits: number,
    unitCapacity: number,
  ): boolean {
    if (!this.canTrain(unitType, availableGold, hasRequiredBuilding, currentUnits, unitCapacity)) {
      return false;
    }

    const config = this.configs[unitType];
    this.queue.push({
      unitType,
      progress: 0,
      timeRemaining: config.trainingTimeSeconds,
    });

    return true;
  }

  /**
   * Get current training unit
   */
  public getCurrentTraining(): TrainingQueue | null {
    return this.currentlyTraining;
  }

  /**
   * Get queue length
   */
  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get full queue
   */
  public getQueue(): TrainingQueue[] {
    return [...this.queue];
  }

  /**
   * Update training progress (call each frame)
   * Returns newly completed units
   */
  public update(deltaSeconds: number): UnitType[] {
    const completedUnits: UnitType[] = [];

    // If nothing is training and queue is not empty, start next unit
    if (!this.currentlyTraining && this.queue.length > 0) {
      this.currentlyTraining = this.queue.shift()!;
    }

    // Update current training
    if (this.currentlyTraining) {
      this.currentlyTraining.timeRemaining -= deltaSeconds;
      const config = this.configs[this.currentlyTraining.unitType];
      this.currentlyTraining.progress = Math.max(
        0,
        1 - this.currentlyTraining.timeRemaining / config.trainingTimeSeconds,
      );

      // Check if training completed
      if (this.currentlyTraining.timeRemaining <= 0) {
        completedUnits.push(this.currentlyTraining.unitType);
        this.unitsCompleted += 1;
        this.currentlyTraining = null;
      }
    }

    return completedUnits;
  }

  /**
   * Cancel current training (partial refund)
   */
  public cancelCurrent(): { unitType: UnitType; refund: number } | null {
    if (!this.currentlyTraining) return null;

    const config = this.configs[this.currentlyTraining.unitType];
    const refund = Math.floor(config.cost * this.currentlyTraining.progress);

    this.currentlyTraining = null;
    return { unitType: config.type, refund };
  }

  /**
   * Get training cost for a unit type
   */
  public getTrainingCost(unitType: UnitType): number {
    return this.configs[unitType].cost;
  }

  /**
   * Get training time for a unit type
   */
  public getTrainingTime(unitType: UnitType): number {
    return this.configs[unitType].trainingTimeSeconds;
  }

  /**
   * Get training progress as percentage (0-100)
   */
  public getCurrentProgress(): number {
    if (!this.currentlyTraining) return 0;
    return this.currentlyTraining.progress * 100;
  }

  /**
   * Get total units trained
   */
  public getTotalUnitsTrained(): number {
    return this.unitsCompleted;
  }

  /**
   * Get required building for unit type
   */
  public getRequiredBuilding(unitType: UnitType): string | undefined {
    return this.configs[unitType].requiredBuilding;
  }

  /**
   * Get all unit training configs
   */
  public getConfigs(): Record<UnitType, UnitTrainingConfig> {
    return { ...this.configs };
  }

  /**
   * Check if unit is currently training
   */
  public isTraining(): boolean {
    return this.currentlyTraining !== null;
  }

  /**
   * Clear queue (for debug/reset)
   */
  public clearQueue(): void {
    this.queue = [];
    this.currentlyTraining = null;
  }

  /**
   * Get time remaining for current training
   */
  public getTimeRemaining(): number {
    if (!this.currentlyTraining) return 0;
    return Math.max(0, this.currentlyTraining.timeRemaining);
  }
}
