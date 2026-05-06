/**
 * BuildingSystem - Manages buildings and their mechanics
 * 
 * Buildings:
 * - Castle (500 HP): Core structure, destroyed = loss
 * - Barracks (60w): +10% dmg/lvl, unlocks Warrior/Pawn/Scout, max 3
 * - House (40w): +5 pop cap/lvl, base 5, max 3 (generates 2g/5s but simplified)
 * - Tower (90w): +15% castle defense/lvl, max 3
 * - Archery (140w): +15% ranged dmg/lvl, unlocks Archers, max 3
 * - Church (80w): Heals castle 10 HP/s/lvl, costs 2g/s, unlocks Monks, max 3
 */

export type BuildingType = 'castle' | 'barracks' | 'house' | 'tower' | 'archery' | 'church';

export interface BuildingConfig {
  type: BuildingType;
  cost: number; // wood cost (except castle which is free)
  costType: 'wood' | 'none';
  maxLevel: number;
  buildTimeSeconds: number;
  bonusPerLevel: string; // description of bonus
}

export interface BuildingInstance {
  type: BuildingType;
  level: number; // 1-3 for most, castle always 1
  x?: number;
  y?: number;
  health?: number;
  maxHealth?: number;
  isBuilding: boolean;
  buildProgress: number; // 0-1
}

export interface BuildingDatabase {
  [key: string]: BuildingConfig;
}

export class BuildingSystem {
  private buildings: Map<string, BuildingInstance> = new Map();
  private configs: BuildingDatabase;
  private unitCapacity: number = 5;
  private maxLevelReached: Record<BuildingType, number> = {
    castle: 1,
    barracks: 0,
    house: 0,
    tower: 0,
    archery: 0,
    church: 0,
  };

  constructor() {
    this.configs = this.initializeConfigs();
  }

  private initializeConfigs(): BuildingDatabase {
    return {
      castle: {
        type: 'castle',
        cost: 0,
        costType: 'none',
        maxLevel: 1,
        buildTimeSeconds: 0,
        bonusPerLevel: 'Core structure - 500 HP',
      },
      barracks: {
        type: 'barracks',
        cost: 60,
        costType: 'wood',
        maxLevel: 3,
        buildTimeSeconds: 30,
        bonusPerLevel: '+10% damage',
      },
      house: {
        type: 'house',
        cost: 40,
        costType: 'wood',
        maxLevel: 3,
        buildTimeSeconds: 20,
        bonusPerLevel: '+5 unit capacity',
      },
      tower: {
        type: 'tower',
        cost: 90,
        costType: 'wood',
        maxLevel: 3,
        buildTimeSeconds: 35,
        bonusPerLevel: '+15% castle defense',
      },
      archery: {
        type: 'archery',
        cost: 140,
        costType: 'wood',
        maxLevel: 3,
        buildTimeSeconds: 40,
        bonusPerLevel: '+15% ranged damage',
      },
      church: {
        type: 'church',
        cost: 80,
        costType: 'wood',
        maxLevel: 3,
        buildTimeSeconds: 30,
        bonusPerLevel: 'Heals castle 10 HP/s',
      },
    };
  }

  /**
   * Start building a structure
   */
  public startBuilding(
    buildingId: string,
    type: BuildingType,
    buildingSpeedMultiplier: number = 1.0,
  ): boolean {
    if (this.buildings.has(buildingId)) {
      return false; // Already exists
    }

    const config = this.configs[type];
    if (!config) {
      return false; // Unknown building type
    }

    const instance: BuildingInstance = {
      type,
      level: 1,
      isBuilding: true,
      buildProgress: 0,
      health: 100,
      maxHealth: 100,
    };

    this.buildings.set(buildingId, instance);
    return true;
  }

  /**
   * Complete a building
   */
  public completeBuilding(buildingId: string): boolean {
    const building = this.buildings.get(buildingId);
    if (!building) return false;

    building.isBuilding = false;
    building.buildProgress = 1;

    // Update max level tracking
    if (building.level > this.maxLevelReached[building.type]) {
      this.maxLevelReached[building.type] = building.level;
    }

    // Update unit capacity if it's a house
    if (building.type === 'house') {
      this.unitCapacity = 5 + building.level * 5;
    }

    return true;
  }

  /**
   * Upgrade an existing building
   */
  public upgradeBuilding(buildingId: string): boolean {
    const building = this.buildings.get(buildingId);
    if (!building || building.isBuilding) return false;

    const config = this.configs[building.type];
    if (!config || building.level >= config.maxLevel) {
      return false; // Already max level
    }

    building.level += 1;
    building.isBuilding = true;
    building.buildProgress = 0;

    return true;
  }

  /**
   * Update building progress (call each frame)
   */
  public updateBuildings(deltaSeconds: number, buildingSpeedMultiplier: number = 1.0): void {
    for (const [id, building] of this.buildings.entries()) {
      if (!building.isBuilding) continue;

      const config = this.configs[building.type];
      const buildTime = config.buildTimeSeconds / buildingSpeedMultiplier;
      const progress = deltaSeconds / buildTime;

      building.buildProgress = Math.min(1, building.buildProgress + progress);

      if (building.buildProgress >= 1) {
        this.completeBuilding(id);
      }
    }
  }

  /**
   * Get building instance
   */
  public getBuilding(buildingId: string): BuildingInstance | undefined {
    return this.buildings.get(buildingId);
  }

  /**
   * Get all buildings of a type
   */
  public getBuildingsByType(type: BuildingType): BuildingInstance[] {
    return Array.from(this.buildings.values()).filter(b => b.type === type && !b.isBuilding);
  }

  /**
   * Get highest level of a building type
   */
  public getMaxLevelReached(type: BuildingType): number {
    return this.maxLevelReached[type];
  }

  /**
   * Calculate damage bonus from barracks
   */
  public getDamageBonus(): number {
    const barracks = this.getBuildingsByType('barracks');
    const level = barracks.length > 0 ? barracks[0].level : 0;
    return 1 + level * 0.1; // +10% per level
  }

  /**
   * Calculate ranged damage bonus from archery
   */
  public getRangedDamageBonus(): number {
    const archery = this.getBuildingsByType('archery');
    const level = archery.length > 0 ? archery[0].level : 0;
    return 1 + level * 0.15; // +15% per level
  }

  /**
   * Get tower level (for castle defense)
   */
  public getTowerLevel(): number {
    const towers = this.getBuildingsByType('tower');
    return towers.length > 0 ? towers[0].level : 0;
  }

  /**
   * Get church level (for healing)
   */
  public getChurchLevel(): number {
    const churches = this.getBuildingsByType('church');
    return churches.length > 0 ? churches[0].level : 0;
  }

  /**
   * Check if a building is built
   */
  public hasBuilding(type: BuildingType): boolean {
    return this.getBuildingsByType(type).length > 0;
  }

  /**
   * Get current unit capacity
   */
  public getUnitCapacity(): number {
    return this.unitCapacity;
  }

  /**
   * Set unit capacity (called when house is built)
   */
  public setUnitCapacity(capacity: number): void {
    this.unitCapacity = capacity;
  }

  /**
   * Check if a unit type is unlocked
   */
  public isUnitUnlocked(unitType: string): boolean {
    switch (unitType) {
      case 'pawn':
      case 'warrior':
      case 'scout':
        return this.hasBuilding('barracks');
      case 'archer':
        return this.hasBuilding('archery');
      case 'monk':
        return this.hasBuilding('church');
      default:
        return false;
    }
  }

  /**
   * Get building cost
   */
  public getBuildingCost(type: BuildingType): number {
    return this.configs[type]?.cost ?? 0;
  }

  /**
   * Get building config
   */
  public getConfig(type: BuildingType): BuildingConfig | undefined {
    return this.configs[type];
  }

  /**
   * Check if building is still constructing
   */
  public isConstructing(buildingId: string): boolean {
    const building = this.buildings.get(buildingId);
    return building?.isBuilding ?? false;
  }

  /**
   * Get all buildings
   */
  public getAllBuildings(): Map<string, BuildingInstance> {
    return new Map(this.buildings);
  }
}
