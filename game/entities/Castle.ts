/**
 * Castle - Core defensive structure with HP, repair mechanics, and defense bonuses
 * 
 * Castle mechanics:
 * - 500 HP starting
 * - Can be repaired at Church: 10 HP/s per Church level (costs 2 gold/s)
 * - Defense: -10% damage per Tower level (stack with other defenses)
 * - Cannot attack, purely defensive
 * - Takes increased damage based on game phase
 * - Once destroyed, instant loss
 */

export interface CastleState {
  currentHP: number;
  maxHP: number;
  faction: 'p1' | 'p2';
  isDestroyed: boolean;
  repairingAtChurchLevel: number; // 0 if not repairing, 1-3 if repairing at that level
}

export class Castle {
  private state: CastleState;
  private readonly BASE_MAX_HP = 500;
  private readonly REPAIR_HP_PER_SECOND_PER_LEVEL = 10;
  private readonly REPAIR_GOLD_COST_PER_SECOND = 2;
  private readonly TOWER_DEFENSE_PER_LEVEL = 0.1; // -10% damage

  private repairListener: ((gold: number) => boolean) | null = null;

  constructor(faction: 'p1' | 'p2') {
    this.state = {
      currentHP: this.BASE_MAX_HP,
      maxHP: this.BASE_MAX_HP,
      faction,
      isDestroyed: false,
      repairingAtChurchLevel: 0,
    };
  }

  /**
   * Get current castle state
   */
  public getState(): Readonly<CastleState> {
    return { ...this.state };
  }

  /**
   * Get current HP
   */
  public getHP(): number {
    return this.state.currentHP;
  }

  /**
   * Get max HP
   */
  public getMaxHP(): number {
    return this.state.maxHP;
  }

  /**
   * Get HP as percentage (0-1)
   */
  public getHPPercent(): number {
    return Math.max(0, this.state.currentHP / this.state.maxHP);
  }

  /**
   * Check if castle is destroyed
   */
  public isDestroyed(): boolean {
    return this.state.isDestroyed;
  }

  /**
   * Set faction's tower defense level to calculate defense bonus
   * Returns the defense multiplier (1 - damage reduction)
   */
  public getDefenseMultiplier(towerLevel: number): number {
    const damageReduction = towerLevel * this.TOWER_DEFENSE_PER_LEVEL;
    return Math.max(0.1, 1 - damageReduction); // Min 0.1 to prevent exploits
  }

  /**
   * Take damage to the castle
   * @param baseDamage - Base damage amount
   * @param towerLevel - Enemy's tower level defending this castle (0-3)
   * @param phaseCastleDamageMultiplier - Current phase's castle damage multiplier
   * @returns Actual damage dealt
   */
  public takeDamage(
    baseDamage: number,
    towerLevel: number,
    phaseCastleDamageMultiplier: number,
  ): number {
    if (this.state.isDestroyed) return 0;

    const defenseMultiplier = this.getDefenseMultiplier(towerLevel);
    const actualDamage = Math.max(1, Math.round(baseDamage * phaseCastleDamageMultiplier * defenseMultiplier));

    this.state.currentHP = Math.max(0, this.state.currentHP - actualDamage);

    if (this.state.currentHP <= 0) {
      this.state.isDestroyed = true;
    }

    return actualDamage;
  }

  /**
   * Repair the castle (called each frame if a Church is active)
   * @param churchLevel - Church building level (1-3)
   * @param deltaSeconds - Time elapsed since last call
   * @param availableGold - Gold available to spend on repair
   * @returns Gold spent on repair
   */
  public repair(churchLevel: number, deltaSeconds: number, availableGold: number): number {
    if (this.state.isDestroyed || this.state.currentHP >= this.state.maxHP) {
      this.state.repairingAtChurchLevel = 0;
      return 0;
    }

    this.state.repairingAtChurchLevel = churchLevel;

    const hpPerSecond = this.REPAIR_HP_PER_SECOND_PER_LEVEL * churchLevel;
    const goldPerSecond = this.REPAIR_GOLD_COST_PER_SECOND * churchLevel;
    const goldNeeded = Math.ceil(goldPerSecond * deltaSeconds);

    if (availableGold < goldNeeded) {
      return 0; // Not enough gold to repair
    }

    const hpToRestore = hpPerSecond * deltaSeconds;
    const actualHPRestored = Math.min(
      hpToRestore,
      this.state.maxHP - this.state.currentHP,
    );

    // Calculate proportional gold cost based on actual HP restored
    const goldSpent = (actualHPRestored / hpPerSecond) * goldPerSecond;

    this.state.currentHP = Math.min(this.state.maxHP, this.state.currentHP + actualHPRestored);

    return goldSpent;
  }

  /**
   * Stop repairing
   */
  public stopRepair(): void {
    this.state.repairingAtChurchLevel = 0;
  }

  /**
   * Check if currently being repaired
   */
  public isRepairing(): boolean {
    return this.state.repairingAtChurchLevel > 0;
  }

  /**
   * Get repair status (level of church repairing)
   */
  public getRepairLevel(): number {
    return this.state.repairingAtChurchLevel;
  }

  /**
   * Restore full HP (debug/reset)
   */
  public restoreFull(): void {
    this.state.currentHP = this.state.maxHP;
    this.state.isDestroyed = false;
  }

  /**
   * Set a listener for repair costs (for resource deduction)
   */
  public setRepairGoldListener(listener: (gold: number) => boolean): void {
    this.repairListener = listener;
  }

  /**
   * Get faction
   */
  public getFaction(): 'p1' | 'p2' {
    return this.state.faction;
  }
}
