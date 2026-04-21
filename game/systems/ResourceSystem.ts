import type { ResourceNode } from '../entities/ResourceNode';
import {
  BASE_GOLD_PER_SEC,
  BASE_WOOD_PER_SEC,
  MINE_GOLD_BONUS,
  TREE_WOOD_BONUS,
} from '../config/map';

export interface Resources {
  gold: number;
  wood: number;
}

export class ResourceSystem {
  public p1: Resources = { gold: 50, wood: 50 };
  public p2: Resources = { gold: 50, wood: 50 };

  private p1Resources: ResourceNode[];
  private p2Resources: ResourceNode[];
  private accumP1 = 0;
  private accumP2 = 0;

  constructor(p1Resources: ResourceNode[], p2Resources: ResourceNode[]) {
    this.p1Resources = p1Resources;
    this.p2Resources = p2Resources;
  }

  update(delta: number) {
    const dt = delta / 1000;

    this.accumP1 += dt;
    this.accumP2 += dt;

    // Tick every second
    if (this.accumP1 >= 1) {
      this.accumP1 -= 1;
      this.p1.gold += BASE_GOLD_PER_SEC + this.countActive(this.p1Resources, 'goldmine') * MINE_GOLD_BONUS;
      this.p1.wood += BASE_WOOD_PER_SEC + this.countActive(this.p1Resources, 'tree') * TREE_WOOD_BONUS;
    }

    if (this.accumP2 >= 1) {
      this.accumP2 -= 1;
      this.p2.gold += BASE_GOLD_PER_SEC + this.countActive(this.p2Resources, 'goldmine') * MINE_GOLD_BONUS;
      this.p2.wood += BASE_WOOD_PER_SEC + this.countActive(this.p2Resources, 'tree') * TREE_WOOD_BONUS;
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

  private countActive(nodes: ResourceNode[], type: 'tree' | 'goldmine'): number {
    return nodes.filter(n => n.active && n.type === type).length;
  }
}
