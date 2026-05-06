/**
 * AIController - Phase-adaptive AI opponent with strategy specific to each game phase
 * 
 * Strategies:
 * - DEPLOYMENT: Build House → Barracks → Train 2 Pawns
 * - EARLY GAME: Mix Pawns and Warriors, defend castle, small attacks
 * - MID GAME: Balanced army, add Archers and Monk, attack when army bigger
 * - LATE GAME: Push to destroy enemy castle, upgrade all buildings
 * - FINAL STAND: Rush enemy castle with all units, ignore defense, train Scouts for speed
 */

import type { GameState } from './GameState';
import type { GamePhase } from './PhaseManager';
import type { UnitType } from './UnitTraining';

export interface AIDecision {
  action: 'train' | 'build' | 'upgrade' | 'repair' | 'wait';
  targetType?: UnitType | string;
  priority: number; // 1-10, higher = more important
}

export class AIController {
  private readonly faction: 'p2' = 'p2'; // AI always controls P2
  private decisionCooldown: number = 0;
  private decisionInterval: number = 3; // Decisions every 3 seconds
  private trainingQueueTarget: number = 0; // Target units in queue
  private lastPhase: GamePhase = 'deployment';

  constructor() {}

  /**
   * Update AI (call each frame)
   */
  public update(gameState: GameState, deltaSeconds: number): AIDecision[] {
    const decisions: AIDecision[] = [];

    this.decisionCooldown -= deltaSeconds;
    if (this.decisionCooldown > 0) {
      return decisions;
    }

    this.decisionCooldown = this.decisionInterval;

    const phase = gameState.getCurrentPhase();
    const playerState = gameState.getPlayerState(this.faction);

    // Strategy depends on phase
    switch (phase) {
      case 'deployment':
        decisions.push(...this.deploymentStrategy(gameState));
        break;
      case 'early-game':
        decisions.push(...this.earlyGameStrategy(gameState));
        break;
      case 'mid-game':
        decisions.push(...this.midGameStrategy(gameState));
        break;
      case 'late-game':
        decisions.push(...this.lateGameStrategy(gameState));
        break;
      case 'final-stand':
        decisions.push(...this.finalStandStrategy(gameState));
        break;
    }

    this.lastPhase = phase;
    return decisions;
  }

  /**
   * DEPLOYMENT PHASE: Build House → Barracks → Train 2 Pawns
   */
  private deploymentStrategy(gameState: GameState): AIDecision[] {
    const decisions: AIDecision[] = [];
    const playerState = gameState.getPlayerState(this.faction);

    // Priority 1: Build House first
    if (!playerState.buildings.hasBuilding('house') && playerState.resources.wood >= 40) {
      decisions.push({
        action: 'build',
        targetType: 'house',
        priority: 10,
      });
      return decisions;
    }

    // Priority 2: Build Barracks
    if (!playerState.buildings.hasBuilding('barracks') && playerState.resources.wood >= 60) {
      decisions.push({
        action: 'build',
        targetType: 'barracks',
        priority: 9,
      });
      return decisions;
    }

    // Priority 3: Train 2 Pawns
    if (
      playerState.buildings.hasBuilding('barracks') &&
      playerState.unitTraining.getQueueLength() < 2 &&
      playerState.resources.gold >= 8
    ) {
      decisions.push({
        action: 'train',
        targetType: 'pawn',
        priority: 8,
      });
    }

    return decisions;
  }

  /**
   * EARLY GAME: Mix Pawns and Warriors, defend castle, small attacks
   */
  private earlyGameStrategy(gameState: GameState): AIDecision[] {
    const decisions: AIDecision[] = [];
    const playerState = gameState.getPlayerState(this.faction);
    const enemyState = gameState.getPlayerState('p1');

    // Target: 5-7 units, mix of Pawns (3) and Warriors (2-4)
    if (playerState.unitsCount < 7) {
      // More Pawns early
      if (playerState.unitsCount < 3 && playerState.resources.gold >= 8) {
        decisions.push({
          action: 'train',
          targetType: 'pawn',
          priority: 8,
        });
        return decisions;
      }

      // Then Warriors
      if (playerState.unitsCount >= 3 && playerState.resources.gold >= 25) {
        decisions.push({
          action: 'train',
          targetType: 'warrior',
          priority: 7,
        });
        return decisions;
      }
    }

    // Build second house for capacity
    if (
      playerState.buildings.getBuildingsByType('house').length < 2 &&
      playerState.resources.wood >= 40 &&
      playerState.resources.gold >= 30 // Don't overcommit wood
    ) {
      decisions.push({
        action: 'build',
        targetType: 'house',
        priority: 6,
      });
    }

    return decisions;
  }

  /**
   * MID GAME: Balanced army, add Archers and Monk, attack when army bigger
   */
  private midGameStrategy(gameState: GameState): AIDecision[] {
    const decisions: AIDecision[] = [];
    const playerState = gameState.getPlayerState(this.faction);
    const enemyState = gameState.getPlayerState('p1');

    // Target: 10-12 units with Archers and Monk
    if (playerState.unitsCount < 12) {
      // Build Archery building first if we don't have it
      if (
        !playerState.buildings.hasBuilding('archery') &&
        playerState.resources.wood >= 140
      ) {
        decisions.push({
          action: 'build',
          targetType: 'archery',
          priority: 9,
        });
        return decisions;
      }

      // Build Church for Monk
      if (
        !playerState.buildings.hasBuilding('church') &&
        playerState.resources.wood >= 80
      ) {
        decisions.push({
          action: 'build',
          targetType: 'church',
          priority: 8,
        });
        return decisions;
      }

      // Train balanced units
      if (playerState.resources.gold >= 40) {
        const archersCount = this.countUnitTypeInQueue(playerState, 'archer');
        if (archersCount < 2) {
          decisions.push({
            action: 'train',
            targetType: 'archer',
            priority: 7,
          });
          return decisions;
        }
      }

      // Add monks
      if (playerState.resources.gold >= 55) {
        const monksCount = this.countUnitTypeInQueue(playerState, 'monk');
        if (monksCount < 1 && playerState.buildings.hasBuilding('church')) {
          decisions.push({
            action: 'train',
            targetType: 'monk',
            priority: 6,
          });
          return decisions;
        }
      }

      // Continue with Warriors/Pawns
      if (playerState.resources.gold >= 25) {
        decisions.push({
          action: 'train',
          targetType: 'warrior',
          priority: 5,
        });
      }
    }

    // Build Tower for castle defense
    if (
      playerState.buildings.getBuildingsByType('tower').length === 0 &&
      playerState.resources.wood >= 90 &&
      playerState.unitsCount >= 8
    ) {
      decisions.push({
        action: 'build',
        targetType: 'tower',
        priority: 4,
      });
    }

    return decisions;
  }

  /**
   * LATE GAME: Push to destroy enemy castle, upgrade all buildings
   */
  private lateGameStrategy(gameState: GameState): AIDecision[] {
    const decisions: AIDecision[] = [];
    const playerState = gameState.getPlayerState(this.faction);

    // Aggressive unit training: keep ~15+ units
    if (playerState.unitsCount < 15 && playerState.resources.gold >= 25) {
      // Prefer Warriors and Archers for damage
      if (playerState.resources.gold >= 40) {
        decisions.push({
          action: 'train',
          targetType: 'archer',
          priority: 8,
        });
        return decisions;
      }

      decisions.push({
        action: 'train',
        targetType: 'warrior',
        priority: 7,
      });
      return decisions;
    }

    // Upgrade all buildings to max
    if (playerState.buildings.getMaxLevelReached('barracks') < 3 && playerState.resources.wood >= 60) {
      decisions.push({
        action: 'upgrade',
        targetType: 'barracks',
        priority: 9,
      });
      return decisions;
    }

    if (playerState.buildings.getMaxLevelReached('archery') < 3 && playerState.resources.wood >= 140) {
      decisions.push({
        action: 'upgrade',
        targetType: 'archery',
        priority: 8,
      });
      return decisions;
    }

    if (playerState.buildings.getMaxLevelReached('church') < 3 && playerState.resources.wood >= 80) {
      decisions.push({
        action: 'upgrade',
        targetType: 'church',
        priority: 7,
      });
    }

    // Build more towers
    if (
      playerState.buildings.getBuildingsByType('tower').length < 2 &&
      playerState.resources.wood >= 90
    ) {
      decisions.push({
        action: 'build',
        targetType: 'tower',
        priority: 6,
      });
    }

    return decisions;
  }

  /**
   * FINAL STAND: Rush enemy castle with all units, ignore defense, train Scouts
   */
  private finalStandStrategy(gameState: GameState): AIDecision[] {
    const decisions: AIDecision[] = [];
    const playerState = gameState.getPlayerState(this.faction);

    // Emergency: Train Scouts for speed rushing (max 3)
    const scoutsCount = this.countUnitTypeInQueue(playerState, 'scout');
    if (scoutsCount < 3 && playerState.resources.gold >= 75) {
      decisions.push({
        action: 'train',
        targetType: 'scout',
        priority: 10, // Highest priority
      });
      return decisions;
    }

    // Continue aggressive training
    if (playerState.resources.gold >= 40) {
      decisions.push({
        action: 'train',
        targetType: 'archer',
        priority: 8,
      });
      return decisions;
    }

    if (playerState.resources.gold >= 25) {
      decisions.push({
        action: 'train',
        targetType: 'warrior',
        priority: 7,
      });
    }

    return decisions;
  }

  /**
   * Count units of a type in training queue
   */
  private countUnitTypeInQueue(playerState: any, unitType: UnitType): number {
    const queue = playerState.unitTraining.getQueue();
    const current = playerState.unitTraining.getCurrentTraining();

    let count = 0;
    if (current?.unitType === unitType) count += 1;
    count += queue.filter((q: any) => q.unitType === unitType).length;

    return count;
  }

  /**
   * Set custom decision interval (for testing)
   */
  public setDecisionInterval(seconds: number): void {
    this.decisionInterval = seconds;
  }

  /**
   * Get difficulty multiplier for AI
   */
  public getDifficultyMultiplier(difficulty: 'easy' | 'normal' | 'hard'): number {
    switch (difficulty) {
      case 'easy':
        return 0.7;
      case 'normal':
        return 1.0;
      case 'hard':
        return 1.3;
      default:
        return 1.0;
    }
  }
}
