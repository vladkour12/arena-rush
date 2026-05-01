import * as Phaser from 'phaser';
import type { Unit } from '../entities/Unit';
import type { Building } from '../entities/Building';
import { UNIT_CONFIGS } from '../config/units';
import { TILE_SIZE } from '../config/map';
import { playMeleeHit, playHealEffect } from '../../utils/sounds';

export class CombatSystem {
  private scene: Phaser.Scene;
  private getTerrainLevel: (wx: number, wy: number) => number;
  private findElevatedTileNear: (wx: number, wy: number, radiusTiles: number) => { x: number; y: number } | null;
  private isBattleActive: () => boolean;

  constructor(
    scene: Phaser.Scene,
    getTerrainLevel: (wx: number, wy: number) => number = () => 0,
    findElevatedTileNear: (wx: number, wy: number, radiusTiles: number) => { x: number; y: number } | null = () => null,
    isBattleActive: () => boolean = () => true,
  ) {
    this.scene = scene;
    this.getTerrainLevel = getTerrainLevel;
    this.findElevatedTileNear = findElevatedTileNear;
    this.isBattleActive = isBattleActive;
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
    const battleActive = this.isBattleActive();

    for (const attacker of attackers) {
      if (!attacker.isAlive()) continue;
      if (attacker.state.state === 'attacking') continue;

      // ── Prep phase: only scouts roam; everyone else holds territory ─────
      // Defensive exception: if an enemy is right next to a non-scout unit, it
      // may swing back. But it will not pursue across the map.
      if (!battleActive && attacker.state.type !== 'slinger') {
        const nearestEnemy = this.findNearest(attacker, enemies);
        if (nearestEnemy) {
          const dx = nearestEnemy.state.x - attacker.state.x;
          const dy = nearestEnemy.state.y - attacker.state.y;
          if (dx * dx + dy * dy < (TILE_SIZE * 1.6) * (TILE_SIZE * 1.6)) {
            attacker.attack(nearestEnemy);
          }
        }
        continue;
      }

      // If the unit is mid-chase (handleAttack issued a moveTo toward a live target),
      // don't interrupt it — CombatSystem re-issuing attack() every 80ms clears the
      // path and causes the unit to spin in place inside the chase-vs-engage gap.
      if (attacker.state.state === 'moving' &&
          attacker.state.attackTarget !== null &&
          attacker.state.attackTarget.isAlive()) continue;

      const cfg = UNIT_CONFIGS[attacker.state.type];

      // ── Pawn: worker unit — managed by updatePawnWorkers, never by combat AI ──
      if (attacker.state.type === 'pawn') continue;

      // ── Opportunistic building strike ─────────────────────────────────────────
      // If an enemy building is close enough to hit, attack it BEFORE deciding on
      // unit targets. This ensures invading units damage structures they're standing
      // next to, even when enemy units exist elsewhere on the map.
      // Melee units (range=0) use a 2-tile radius; ranged units use their own range.
      const closeBuilding = this.findNearestBuilding(attacker, enemyBuildings);
      if (closeBuilding && !closeBuilding.isDestroyed) {
        const cbdx = closeBuilding.wx - attacker.state.x;
        const cbdy = closeBuilding.wy - attacker.state.y;
        const cbDist = Math.sqrt(cbdx * cbdx + cbdy * cbdy);
        const strikeRange = Math.max(cfg.range, TILE_SIZE * 2) * 1.2;
        if (cbDist <= strikeRange) {
          this.attackBuilding(attacker, closeBuilding);
          continue;
        }
      }

      // ── Monk: seek injured allies, then follow warriors ────────────────
      if (attacker.state.type === 'monk') {
        this.monkBehavior(attacker, attackers);
        continue;
      }

      // ── Warrior: aggressive charge – interrupts movement to engage ─────
      if (attacker.state.type === 'warrior' || attacker.state.type === 'knight') {
        // Only chase units within 600px; beyond that, buildings take priority so warriors
        // don't get pulled away from a nearby castle by a distant harvesting pawn.
        const nearestUnit = this.findNearestWithinRange(attacker, enemies, 600);
        if (nearestUnit) {
          const dx = nearestUnit.state.x - attacker.state.x;
          const dy = nearestUnit.state.y - attacker.state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const range = TILE_SIZE * 0.75;
          if (dist <= range * 1.5) {
            attacker.attack(nearestUnit);
          } else {
            const engagePoint = battleActive
              ? this.getBattleEngagePoint(attacker, nearestUnit, range * 0.85)
              : { x: nearestUnit.state.x, y: nearestUnit.state.y };
            const mdx = engagePoint.x - attacker.state.targetX;
            const mdy = engagePoint.y - attacker.state.targetY;
            if (attacker.state.state !== 'moving' || (mdx * mdx + mdy * mdy) > 24 * 24) {
              attacker.moveTo(engagePoint.x, engagePoint.y);
            }
          }
        } else {
          if (attacker.state.state === 'moving') continue;
          const nearestBuilding = this.findNearestBuilding(attacker, enemyBuildings);
          if (nearestBuilding && !nearestBuilding.isDestroyed) {
            const dx = nearestBuilding.wx - attacker.state.x;
            const dy = nearestBuilding.wy - attacker.state.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= TILE_SIZE * 1.5) {
              this.attackBuilding(attacker, nearestBuilding);
            } else {
              const mdx = nearestBuilding.wx - attacker.state.targetX;
              const mdy = nearestBuilding.wy - attacker.state.targetY;
              if ((attacker.state.state as string) !== 'moving' || (mdx * mdx + mdy * mdy) > 24 * 24) {
                attacker.moveTo(nearestBuilding.wx, nearestBuilding.wy);
              }
            }
          }
        }
        continue;
      }

      // ── Archer: seek elevated terrain, hold position and snipe ─────────
      if (attacker.state.type === 'archer') {
        const terrainLevel = this.getTerrainLevel(attacker.state.x, attacker.state.y);
        const onHighGround = terrainLevel >= 2;
        const nearestUnit = this.findNearest(attacker, enemies);
        if (nearestUnit) {
          const dx = nearestUnit.state.x - attacker.state.x;
          const dy = nearestUnit.state.y - attacker.state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= cfg.range * 1.18) {
            attacker.attack(nearestUnit);
            continue;
          }
        }
        // Idle archers not on elevated ground seek the nearest elevated tile
        if (!battleActive && !onHighGround && attacker.state.state === 'idle') {
          const elevated = this.findElevatedTileNear(attacker.state.x, attacker.state.y, 7);
          if (elevated) {
            attacker.moveTo(elevated.x, elevated.y);
            continue;
          }
        }
        // Still moving to high ground — don't interrupt
        if (!battleActive && attacker.state.state === 'moving' && !onHighGround) continue;
        if (nearestUnit) {
          const dx = nearestUnit.state.x - attacker.state.x;
          const dy = nearestUnit.state.y - attacker.state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= cfg.range * 1.18) {
            attacker.attack(nearestUnit);
          } else if (battleActive || !onHighGround) {
            const engagePoint = this.getBattleEngagePoint(attacker, nearestUnit, cfg.range * 0.96);
            const mdx = engagePoint.x - attacker.state.targetX;
            const mdy = engagePoint.y - attacker.state.targetY;
            if (attacker.state.state !== 'moving' || (mdx * mdx + mdy * mdy) > 28 * 28) {
              attacker.moveTo(engagePoint.x, engagePoint.y);
            }
          }
        } else if (attacker.state.state !== 'moving') {
          const nearestBuilding = this.findNearestBuilding(attacker, enemyBuildings);
          if (nearestBuilding && !nearestBuilding.isDestroyed) {
            const dx = nearestBuilding.wx - attacker.state.x;
            const dy = nearestBuilding.wy - attacker.state.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= cfg.range * 1.5) {
              this.attackBuilding(attacker, nearestBuilding);
            } else {
              attacker.moveTo(nearestBuilding.wx, nearestBuilding.wy);
            }
          }
        }
        continue;
      }

      // ── Slinger: mobile skirmisher, shorter range, faster reposition ──
      if (attacker.state.type === 'slinger') {
        const nearestUnit = this.findNearest(attacker, enemies);
        const preferredRange = cfg.range * 0.74;
        const retreatRange = cfg.range * 0.42;
        if (nearestUnit) {
          const dx = nearestUnit.state.x - attacker.state.x;
          const dy = nearestUnit.state.y - attacker.state.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= cfg.range * 1.12) {
            attacker.attack(nearestUnit);
            if (dist < retreatRange) {
              const kitePoint = this.getBattleEngagePoint(attacker, nearestUnit, preferredRange);
              const mdx = kitePoint.x - attacker.state.targetX;
              const mdy = kitePoint.y - attacker.state.targetY;
              if ((mdx * mdx + mdy * mdy) > 18 * 18) {
                attacker.moveTo(kitePoint.x, kitePoint.y);
              }
            }
          } else {
            const engagePoint = this.getBattleEngagePoint(attacker, nearestUnit, preferredRange);
            const mdx = engagePoint.x - attacker.state.targetX;
            const mdy = engagePoint.y - attacker.state.targetY;
            if (attacker.state.state !== 'moving' || (mdx * mdx + mdy * mdy) > 20 * 20) {
              attacker.moveTo(engagePoint.x, engagePoint.y);
            }
          }
          continue;
        }

        if (attacker.state.state !== 'moving') {
          const nearestBuilding = this.findNearestBuilding(attacker, enemyBuildings);
          if (nearestBuilding && !nearestBuilding.isDestroyed) {
            const dx = nearestBuilding.wx - attacker.state.x;
            const dy = nearestBuilding.wy - attacker.state.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= cfg.range * 1.1) {
              this.attackBuilding(attacker, nearestBuilding);
            } else {
              attacker.moveTo(nearestBuilding.wx, nearestBuilding.wy);
            }
          }
        }
        continue;
      }

      // ── Default (pawn): original logic ────────────────────────────────
      const nearestUnit = this.findNearest(attacker, enemies);
      const nearestBuilding = this.findNearestBuilding(attacker, enemyBuildings);
      if (nearestUnit) {
        const dx = nearestUnit.state.x - attacker.state.x;
        const dy = nearestUnit.state.y - attacker.state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const range = cfg.range > 0 ? cfg.range : TILE_SIZE * 0.75;
        if (dist <= range * 1.5) {
          attacker.attack(nearestUnit);
        } else {
          attacker.moveTo(nearestUnit.state.x, nearestUnit.state.y);
        }
      } else if (nearestBuilding && !nearestBuilding.isDestroyed) {
        const dx = nearestBuilding.wx - attacker.state.x;
        const dy = nearestBuilding.wy - attacker.state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const range = cfg.range > 0 ? cfg.range : TILE_SIZE * 0.75;
        if (dist <= range * 1.5) {
          this.attackBuilding(attacker, nearestBuilding);
        } else {
          attacker.moveTo(nearestBuilding.wx, nearestBuilding.wy);
        }
      }
    }
  }

  private getBattleEngagePoint(attacker: Unit, target: Unit, preferredDistance: number) {
    const dx = target.state.x - attacker.state.x;
    const dy = target.state.y - attacker.state.y;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const nx = dx / dist;
    const ny = dy / dist;
    const slot = attacker.state.id % 5;
    const side = slot - 2;
    const lateralX = -ny * side * 18;
    const lateralY = nx * side * 18;

    return {
      x: target.state.x - nx * preferredDistance + lateralX,
      y: target.state.y - ny * preferredDistance + lateralY,
    };
  }

  private attackBuilding(attacker: Unit, building: Building) {
    if (attacker.state.attackCooldown > 0) return;
    const cfg = UNIT_CONFIGS[attacker.state.type];
    if (cfg.attackRate <= 0) return;

    building.takeDamage(cfg.damage);
    attacker.state.attackCooldown = 1 / cfg.attackRate;
    attacker.playAnim('attack');
    playMeleeHit();

    // Show damage number
    this.spawnDamageNumber(building.wx, building.wy, cfg.damage, building.faction === 'blue' ? '#ff4444' : '#4488ff');
  }

  private monkBehavior(monk: Unit, allies: Unit[]) {
    const healRange = UNIT_CONFIGS.monk.range;
    const seekRange = 300;

    // Find nearest injured ally within seek range
    let nearestInjured: Unit | null = null;
    let nearestInjuredDist = Infinity;
    for (const ally of allies) {
      if (!ally.isAlive() || ally === monk) continue;
      if (ally.state.hp >= ally.state.maxHp) continue;
      const dx = ally.state.x - monk.state.x;
      const dy = ally.state.y - monk.state.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestInjuredDist && dist <= seekRange) {
        nearestInjuredDist = dist;
        nearestInjured = ally;
      }
    }

    if (nearestInjured) {
      if (nearestInjuredDist <= healRange) {
        this.monkHeal(monk, allies);
      } else if (monk.state.state !== 'moving') {
        monk.moveTo(nearestInjured.state.x, nearestInjured.state.y);
      }
      return;
    }

    // No injured ally: follow nearest warrior when idle
    if (monk.state.state === 'idle') {
      let nearestWarrior: Unit | null = null;
      let nearestWarriorDist = Infinity;
      for (const ally of allies) {
        if (!ally.isAlive() || ally === monk) continue;
        if (ally.state.type !== 'warrior') continue;
        const dx = ally.state.x - monk.state.x;
        const dy = ally.state.y - monk.state.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestWarriorDist && dist <= 350) {
          nearestWarriorDist = dist;
          nearestWarrior = ally;
        }
      }
      if (nearestWarrior && nearestWarriorDist > 80) {
        monk.moveTo(nearestWarrior.state.x, nearestWarrior.state.y);
      }
    }
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
      playHealEffect();
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

  private findNearestWithinRange(unit: Unit, enemies: Unit[], maxRange: number): Unit | null {
    let best: Unit | null = null;
    let bestDist = maxRange * maxRange;
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
