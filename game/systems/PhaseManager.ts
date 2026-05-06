/**
 * PhaseManager - Handles 5 game phases with distinct mechanics and timing
 * 
 * Phases:
 * 1. DEPLOYMENT (0-5 min): No combat, 0.75x income, 30% faster building, first Barracks/House instant
 * 2. EARLY GAME (5-15 min): Combat enabled, 1x income, 0.9x damage, Castle -50% damage
 * 3. MID GAME (15-25 min): Full combat, 1.5x income, 1.1x damage, normal castle damage
 * 4. LATE GAME (25-30 min): Massive battles, 2x income, 1.3x damage, Castle +50% damage
 * 5. FINAL STAND (30+ min): Sudden death, 3x castle damage, 2x unit damage, no income, 1.5x unit speed
 */

export type GamePhase = 'deployment' | 'early-game' | 'mid-game' | 'late-game' | 'final-stand';

export interface PhaseConfig {
  name: GamePhase;
  startMinute: number;
  endMinute: number;
  incomeMultiplier: number;
  damageMultiplier: number;
  castleDamageMultiplier: number;
  buildingSpeedMultiplier: number;
  combatEnabled: boolean;
  bannerColor: string;
  unitSpeedMultiplier?: number;
  castleVulnerability?: boolean;
}

export class PhaseManager {
  private currentPhase: GamePhase = 'deployment';
  private gameStartTime: number = 0;
  private elapsedSeconds: number = 0;
  private phaseConfigs: Map<GamePhase, PhaseConfig> = new Map();
  private listeners: Array<(phase: GamePhase) => void> = [];

  private readonly MATCH_DURATION_SECONDS = 30 * 60; // 30 minutes
  private readonly OVERTIME_THRESHOLD_SECONDS = 35 * 60; // 35 minutes for final stand

  constructor() {
    this.initializePhases();
  }

  private initializePhases(): void {
    // DEPLOYMENT: 0-5 min
    this.phaseConfigs.set('deployment', {
      name: 'deployment',
      startMinute: 0,
      endMinute: 5,
      incomeMultiplier: 0.75,
      damageMultiplier: 0, // No combat
      castleDamageMultiplier: 0,
      buildingSpeedMultiplier: 1.3, // 30% faster
      combatEnabled: false,
      bannerColor: '#3b82f6', // Blue
    });

    // EARLY GAME: 5-15 min
    this.phaseConfigs.set('early-game', {
      name: 'early-game',
      startMinute: 5,
      endMinute: 15,
      incomeMultiplier: 1.0,
      damageMultiplier: 0.9,
      castleDamageMultiplier: 0.5, // Castle takes -50% damage
      buildingSpeedMultiplier: 1.0,
      combatEnabled: true,
      bannerColor: '#eab308', // Yellow
    });

    // MID GAME: 15-25 min
    this.phaseConfigs.set('mid-game', {
      name: 'mid-game',
      startMinute: 15,
      endMinute: 25,
      incomeMultiplier: 1.5,
      damageMultiplier: 1.1,
      castleDamageMultiplier: 1.0, // Normal damage
      buildingSpeedMultiplier: 1.0,
      combatEnabled: true,
      bannerColor: '#f97316', // Orange
    });

    // LATE GAME: 25-30 min
    this.phaseConfigs.set('late-game', {
      name: 'late-game',
      startMinute: 25,
      endMinute: 30,
      incomeMultiplier: 2.0,
      damageMultiplier: 1.3,
      castleDamageMultiplier: 1.5, // Castle takes +50% damage
      buildingSpeedMultiplier: 1.0,
      combatEnabled: true,
      bannerColor: '#ef4444', // Red
    });

    // FINAL STAND: 30+ min (overtime)
    this.phaseConfigs.set('final-stand', {
      name: 'final-stand',
      startMinute: 30,
      endMinute: 999, // No end
      incomeMultiplier: 0, // Income disabled
      damageMultiplier: 2.0, // 2x damage to units
      castleDamageMultiplier: 3.0, // 3x damage to castles
      buildingSpeedMultiplier: 1.0,
      combatEnabled: true,
      bannerColor: '#dc2626', // Dark Red (flashing)
      unitSpeedMultiplier: 1.5,
      castleVulnerability: true,
    });
  }

  /**
   * Initialize the phase manager at game start
   */
  public start(): void {
    this.gameStartTime = Date.now();
    this.updatePhase();
  }

  /**
   * Update phase based on elapsed time (call every frame or periodically)
   */
  public update(): void {
    const previousPhase = this.currentPhase;
    this.elapsedSeconds = (Date.now() - this.gameStartTime) / 1000;
    this.updatePhase();

    if (this.currentPhase !== previousPhase) {
      this.notifyPhaseChange(this.currentPhase);
    }
  }

  private updatePhase(): void {
    const minutes = this.elapsedSeconds / 60;

    if (minutes >= 30) {
      this.currentPhase = 'final-stand';
    } else if (minutes >= 25) {
      this.currentPhase = 'late-game';
    } else if (minutes >= 15) {
      this.currentPhase = 'mid-game';
    } else if (minutes >= 5) {
      this.currentPhase = 'early-game';
    } else {
      this.currentPhase = 'deployment';
    }
  }

  private notifyPhaseChange(newPhase: GamePhase): void {
    this.listeners.forEach(listener => listener(newPhase));
  }

  public onPhaseChange(callback: (phase: GamePhase) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  /**
   * Get current phase configuration
   */
  public getPhaseConfig(): PhaseConfig {
    return this.phaseConfigs.get(this.currentPhase)!;
  }

  /**
   * Get current phase name
   */
  public getCurrentPhase(): GamePhase {
    return this.currentPhase;
  }

  /**
   * Get elapsed game time in seconds
   */
  public getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  /**
   * Get remaining time until end of match (or into overtime)
   */
  public getRemainingSeconds(): number {
    const remaining = this.MATCH_DURATION_SECONDS - this.elapsedSeconds;
    return Math.max(0, remaining);
  }

  /**
   * Get formatted timer display (MM:SS)
   */
  public getTimerDisplay(): string {
    const remaining = this.getRemainingSeconds();
    const minutes = Math.floor(remaining / 60);
    const seconds = Math.floor(remaining % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Check if in overtime (FINAL STAND)
   */
  public isOvertime(): boolean {
    return this.currentPhase === 'final-stand';
  }

  /**
   * Check if game is over (reached end of overtime or victory)
   */
  public isGameOver(): boolean {
    return this.isOvertime() && this.elapsedSeconds >= this.OVERTIME_THRESHOLD_SECONDS;
  }

  /**
   * Get phase name for UI display
   */
  public getPhaseName(): string {
    const config = this.getPhaseConfig();
    switch (config.name) {
      case 'deployment':
        return 'Deployment Phase';
      case 'early-game':
        return 'Early Game';
      case 'mid-game':
        return 'Mid Game';
      case 'late-game':
        return 'Late Game';
      case 'final-stand':
        return 'FINAL STAND - DESTROY THE CASTLE';
      default:
        return 'Unknown Phase';
    }
  }

  /**
   * Get phase-specific resource multiplier
   */
  public getIncomeMultiplier(): number {
    return this.getPhaseConfig().incomeMultiplier;
  }

  /**
   * Get phase-specific damage multiplier for units
   */
  public getDamageMultiplier(): number {
    return this.getPhaseConfig().damageMultiplier;
  }

  /**
   * Get phase-specific damage multiplier for castles
   */
  public getCastleDamageMultiplier(): number {
    return this.getPhaseConfig().castleDamageMultiplier;
  }

  /**
   * Get phase-specific building speed multiplier
   */
  public getBuildingSpeedMultiplier(): number {
    return this.getPhaseConfig().buildingSpeedMultiplier;
  }

  /**
   * Check if combat is enabled in current phase
   */
  public isCombatEnabled(): boolean {
    return this.getPhaseConfig().combatEnabled;
  }

  /**
   * Get unit speed multiplier (mainly for final stand)
   */
  public getUnitSpeedMultiplier(): number {
    return this.getPhaseConfig().unitSpeedMultiplier ?? 1.0;
  }

  /**
   * Check if castles are vulnerable (final stand)
   */
  public areCastlesVulnerable(): boolean {
    return this.getPhaseConfig().castleVulnerability ?? false;
  }

  /**
   * Get banner color for UI
   */
  public getBannerColor(): string {
    return this.getPhaseConfig().bannerColor;
  }

  /**
   * Check if this is the first phase
   */
  public isDeployment(): boolean {
    return this.currentPhase === 'deployment';
  }
}
