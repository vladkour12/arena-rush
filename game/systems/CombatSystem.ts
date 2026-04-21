import * as Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import { UNIT_CONFIGS } from '../config/units';
import { TILE_SIZE } from '../config/map';

export class CombatSystem {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  update(
    p1Units: Unit[],
    p2Units: Unit[],
    p1Buildings: Building[],
    p2Buildings: Building[],
  ) {
    // P1 units attack P2 units/buildings
    this.processUnits(p1Units, p2Units, p2Buildings);
    // P2 units attack P1 units/buildings
    this.processUnits(p2Units, p1Units, p1Buildings);
  }

  private processUnits(
    attackers: Unit[],
    enemies: Unit[],
    enemyBuildings: Building[],
  ) {
    for (const attacker of attackers) {
      if (!attacker.isAlive()) continue;
      if (attacker.state.state === 'attacking') continue;
      if (attacker.state.state === 'moving') continue;

      const cfg = UNIT_CONFIGS[attacker.state.type];

      // Monks: heal allies instead
      if (attacker.state.type === 'monk') {
        this.monkHeal(attacker, attackers);
        continue;
      }

      // Find nearest enemy unit
      const nearestUnit = this.findNearest(attacker, enemies);
      const nearestBuilding = this.findNearestBuilding(attacker, enemyBuildings);

      // Prefer units over buildings
      if (nearestUnit) {
        const dx = nearestUnit.state.x - attacker.state.x;
        const dy = nearestUnit.state.y - attacker.state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const range = cfg.range > 0 ? cfg.range : TILE_SIZE * 0.75;
        if (dist <= range * 1.5) {
          attacker.attack(nearestUnit);
        } else {
          // Walk toward
          attacker.moveTo(nearestUnit.state.x, nearestUnit.state.y);
        }
      } else if (nearestBuilding && !nearestBuilding.isDestroyed) {
        const dx = nearestBuilding.wx - attacker.state.x;
        const dy = nearestBuilding.wy - attacker.state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const range = cfg.range > 0 ? cfg.range : TILE_SIZE * 0.75;
        if (dist <= range * 1.5) {
          // Attack building directly
          this.attackBuilding(attacker, nearestBuilding);
        } else {
          attacker.moveTo(nearestBuilding.wx, nearestBuilding.wy);
        }
      }
    }
  }

  private attackBuilding(attacker: Unit, building: Building) {
    if (attacker.state.attackCooldown > 0) return;
    const cfg = UNIT_CONFIGS[attacker.state.type];
    if (cfg.attackRate <= 0) return;

    building.takeDamage(cfg.damage);
    attacker.state.attackCooldown = 1 / cfg.attackRate;
    attacker.playAnim('attack');

    // Show damage number
    this.spawnDamageNumber(building.wx, building.wy, cfg.damage, building.faction === 'blue' ? '#ff4444' : '#4488ff');
  }

  private monkHeal(monk: Unit, allies: Unit[]) {
    if (monk.state.healCooldown > 0) return;
    const healRate = UNIT_CONFIGS.monk.healRate ?? 8;
    const range = UNIT_CONFIGS.monk.range;

    let healed = false;
    for (const ally of allies) {
      if (!ally.isAlive() || ally === monk) continue;
      if (ally.state.hp >= ally.state.maxHp) continue;
      const dx = ally.state.x - monk.state.x;
      const dy = ally.state.y - monk.state.y;
      if (Math.sqrt(dx * dx + dy * dy) <= range) {
        ally.state.hp = Math.min(ally.state.maxHp, ally.state.hp + healRate);
        healed = true;
        monk.playAnim('heal');
        this.spawnDamageNumber(ally.state.x, ally.state.y - 20, healRate, '#44ff88', '+');
      }
    }
    if (healed) {
      monk.state.healCooldown = 0.5;
    }
  }

  private findNearest(unit: Unit, enemies: Unit[]): Unit | null {
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const e of enemies) {
      if (!e.isAlive()) continue;
      const dx = e.state.x - unit.state.x;
      const dy = e.state.y - unit.state.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  private findNearestBuilding(unit: Unit, buildings: Building[]): Building | null {
    let best: Building | null = null;
    let bestDist = Infinity;
    for (const b of buildings) {
      if (b.isDestroyed) continue;
      const dx = b.wx - unit.state.x;
      const dy = b.wy - unit.state.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = b;
      }
    }
    return best;
  }

  private spawnDamageNumber(x: number, y: number, amount: number, color: string, prefix = '') {
    const text = this.scene.add.text(x, y - 10, `${prefix}${Math.round(amount)}`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color,
      stroke: '#000000',
      strokeThickness: 3,
    });
    text.setDepth(50);
    text.setOrigin(0.5, 1);

    this.scene.tweens.add({
      targets: text,
      y: y - 50,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }
}
