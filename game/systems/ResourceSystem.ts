import type { ResourceNode } from '../entities/ResourceNode';
import {
  BASE_GOLD_PER_SEC,
  BASE_WOOD_PER_SEC,
} from '../config/map';

export interface Resources {
  gold: number;
  wood: number;
}

export class ResourceSystem {
  public p1: Resources = { gold: 50, wood: 50 };
  public p2: Resources = { gold: 50, wood: 50 };
  private accumP1 = 0;
  private accumP2 = 0;
  // ResourceNode arrays were passed historically but resource bonuses are
  // applied directly in IslandWarsScene. Constructor kept for API compatibility.
  constructor(_p1Resources: ResourceNode[], _p2Resources: ResourceNode[]) {}

  update(delta: number) {
    const dt = delta / 1000;

    this.accumP1 += dt;
    this.accumP2 += dt;

    // Tick every second
    if (this.accumP1 >= 1) {
      this.accumP1 -= 1;
      this.p1.gold += BASE_GOLD_PER_SEC;
      this.p1.wood += BASE_WOOD_PER_SEC;
    }

    if (this.accumP2 >= 1) {
      this.accumP2 -= 1;
      this.p2.gold += BASE_GOLD_PER_SEC;
      this.p2.wood += BASE_WOOD_PER_SEC;
    }
  }

  canAfford(faction: 'p1' | 'p2', goldCost: number, woodCost = 0): boolean {
    const res = faction === 'p1' ? this.p1 : this.p2;
    return res.gold >= goldCost && res.wood >= woodCost;
  }

  spend(faction: 'p1' | 'p2', goldCost: number, woodCost = 0): boolean {
    if (!this.canAfford(faction, goldCost, woodCost)) return false;
    const res = faction === 'p1' ? this.p1 : this.p2;
    res.gold -= goldCost;
    res.wood -= woodCost;
    return true;
  }

  addResources(faction: 'p1' | 'p2', goldGain = 0, woodGain = 0) {
    const res = faction === 'p1' ? this.p1 : this.p2;
    res.gold += Math.max(0, goldGain);
    res.wood += Math.max(0, woodGain);
  }
}
