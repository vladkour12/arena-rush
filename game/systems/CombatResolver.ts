/**
 * CombatResolver - Handles combat resolution with turn order, targeting, and damage calculation
 * 
 * Combat mechanics:
 * - Simple turn-based with speed stat (fastest first)
 * - Target priority: Units (lowest HP) first, then Castle
 * - Damage formula: base × team_mult × phase_mult × (1 - def*0.1) × ±15% × crit (1.5x @10%)
 * - Type advantages: Warrior>Pawn (1.5x), Archer>Warrior (1.4x), Pawn>Archer (1.4x), Scout>Monk/Archer (1.3x)
 * - Monk heals 5 HP to lowest HP ally each turn
 * - No abilities, no cooldowns
 */

export type UnitType = 'pawn' | 'warrior' | 'archer' | 'monk' | 'scout';
export type Faction = 'p1' | 'p2';

export interface UnitStats {
  type: UnitType;
  hp: number;
  dmg: number;
  spd: number;
  def: number;
  range: number;
  faction: Faction;
}

export interface CombatAction {
  attacker: UnitStats & { id: string };
  defender: UnitStats & { id: string } | { type: 'castle'; faction: Faction };
  damageDealt: number;
  isCritical: boolean;
  typeAdvantage: number;
  isHeal: boolean;
}

export class CombatResolver {
  private readonly CRIT_CHANCE = 0.1; // 10%
  private readonly CRIT_MULTIPLIER = 1.5; // 1.5x
  private readonly DAMAGE_VARIANCE = 0.15; // ±15%
  private readonly DEFENSE_MULTIPLIER = 0.1; // def * 0.1
  private readonly MONK_HEAL_AMOUNT = 5;

  private readonly typeAdvantages: Record<UnitType, Record<UnitType, number>> = {
    warrior: { pawn: 1.5, warrior: 1.0, archer: 1.0, monk: 1.0, scout: 1.0 },
    archer: { warrior: 1.4, pawn: 1.0, archer: 1.0, monk: 1.0, scout: 1.0 },
    pawn: { archer: 1.4, warrior: 1.0, pawn: 1.0, monk: 1.0, scout: 1.0 },
    scout: { monk: 1.3, archer: 1.3, scout: 1.0, warrior: 1.0, pawn: 1.0 },
    monk: { pawn: 1.0, warrior: 1.0, archer: 1.0, monk: 1.0, scout: 1.0 },
  };

  /**
   * Calculate damage for a single attack
   */
  public calculateDamage(
    attacker: UnitStats,
    defender: UnitStats | { type: 'castle' },
    teamDamageMultiplier: number,
    phaseDamageMultiplier: number,
  ): { damage: number; isCritical: boolean; typeAdvantage: number } {
    let baseDamage = attacker.dmg;

    // Type advantage
    const typeAdvantage = 'type' in defender
      ? this.typeAdvantages[attacker.type][defender.type]
      : 1.0;
    baseDamage *= typeAdvantage;

    // Apply phase and team multipliers
    baseDamage *= teamDamageMultiplier * phaseDamageMultiplier;

    // Defense reduction (only for units, not castles)
    if ('def' in defender) {
      const defenseReduction = defender.def * this.DEFENSE_MULTIPLIER;
      baseDamage *= 1 - defenseReduction;
    }

    // Random variance ±15%
    const variance = 1 + (Math.random() - 0.5) * 2 * this.DAMAGE_VARIANCE;
    baseDamage *= variance;

    // Critical hit (10% chance for 1.5x)
    const isCritical = Math.random() < this.CRIT_CHANCE;
    if (isCritical) {
      baseDamage *= this.CRIT_MULTIPLIER;
    }

    return {
      damage: Math.max(1, Math.round(baseDamage)),
      isCritical,
      typeAdvantage,
    };
  }

  /**
   * Get unit's move order in combat (by speed, fastest first)
   */
  public getUnitMoveOrder(
    units: Array<UnitStats & { id: string }>,
  ): Array<UnitStats & { id: string }> {
    return [...units].sort((a, b) => b.spd - a.spd);
  }

  /**
   * Get type advantage multiplier for attacker vs defender
   */
  public getTypeAdvantage(attackerType: UnitType, defenderType: UnitType): number {
    return this.typeAdvantages[attackerType]?.[defenderType] ?? 1.0;
  }

  /**
   * Find best target for an attacker
   * Priority: enemy units (lowest HP first), then castle
   */
  public findBestTarget(
    attacker: UnitStats & { id: string },
    enemyUnits: Array<UnitStats & { id: string; currentHP: number }>,
    castleExists: boolean,
  ): (UnitStats & { id: string; currentHP: number }) | { type: 'castle' } | null {
    // If any enemy units exist, target the one with lowest HP
    if (enemyUnits.length > 0) {
      return enemyUnits.reduce((lowest, unit) =>
        unit.currentHP < lowest.currentHP ? unit : lowest,
      );
    }

    // Otherwise, target the castle if it exists
    if (castleExists) {
      return { type: 'castle' };
    }

    return null;
  }

  /**
   * Find best target for monk healing
   * Finds the friendly unit with the lowest current HP
   */
  public findHealTarget(
    alliedUnits: Array<UnitStats & { id: string; currentHP: number; maxHP: number }>,
  ): (UnitStats & { id: string; currentHP: number; maxHP: number }) | null {
    return alliedUnits.reduce((lowest, unit) =>
      unit.currentHP < lowest.currentHP ? unit : lowest,
      alliedUnits[0] ?? null,
    );
  }

  /**
   * Resolve a single unit's combat action
   */
  public resolveUnitAction(
    attacker: UnitStats & { id: string; currentHP: number; maxHP: number },
    alliedUnits: Array<UnitStats & { id: string; currentHP: number; maxHP: number }>,
    enemyUnits: Array<UnitStats & { id: string; currentHP: number }>,
    teamDamageMultiplier: number,
    phaseDamageMultiplier: number,
    castleExists: boolean,
    enemyFaction?: Faction,
  ): CombatAction | null {
    // Monks heal instead of attacking
    if (attacker.type === 'monk') {
      const healTarget = this.findHealTarget(alliedUnits);
      if (!healTarget) return null;

      return {
        attacker,
        defender: healTarget,
        damageDealt: this.MONK_HEAL_AMOUNT,
        isCritical: false,
        typeAdvantage: 1.0,
        isHeal: true,
      };
    }

    // Regular units attack
    const target = this.findBestTarget(attacker, enemyUnits, castleExists);
    if (!target) return null;

    // Extract defendable data for damage calculation
    const defendData = 'type' in target && target.type === 'castle'
      ? { type: 'castle' as const }
      : target;

    const dmgCalc = this.calculateDamage(
      attacker,
      defendData,
      teamDamageMultiplier,
      phaseDamageMultiplier,
    );

    // Create defender with faction for castle
    const defender = 'type' in target && target.type === 'castle'
      ? { type: 'castle' as const, faction: (enemyFaction ?? 'p1') }
      : target;

    return {
      attacker,
      defender,
      damageDealt: dmgCalc.damage,
      isCritical: dmgCalc.isCritical,
      typeAdvantage: dmgCalc.typeAdvantage,
      isHeal: false,
    };
  }

  /**
   * Simulate a full combat round
   * Returns array of all actions taken in turn order
   */
  public simulateCombatRound(
    p1Units: Array<UnitStats & { id: string; currentHP: number; maxHP: number }>,
    p2Units: Array<UnitStats & { id: string; currentHP: number; maxHP: number }>,
    teamDamageMultiplier: number,
    phaseDamageMultiplier: number,
    castleExists: boolean,
  ): CombatAction[] {
    const allUnits = [
      ...p1Units,
      ...p2Units,
    ].sort((a, b) => b.spd - a.spd);

    const actions: CombatAction[] = [];

    for (const unit of allUnits) {
      if (unit.currentHP <= 0) continue; // Skip dead units

      const isP1 = p1Units.some(u => u.id === unit.id);
      const alliedUnits = isP1 ? p1Units : p2Units;
      const enemyUnits = isP1 ? p2Units : p1Units;

      const action = this.resolveUnitAction(
        unit,
        alliedUnits,
        enemyUnits,
        teamDamageMultiplier,
        phaseDamageMultiplier,
        castleExists,
      );

      if (action) {
        actions.push(action);
      }
    }

    return actions;
  }
}
