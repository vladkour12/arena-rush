/**
 * VictoryChecker - Determines win conditions and match outcome
 * 
 * Victory conditions (checked in order):
 * 1. Castle destroyed = Instant Win
 * 2. All units dead + Castle standing = Win (opponent can't attack)
 * 3. Timer expires = Judge by:
 *    - Castle HP (50% weight)
 *    - Units alive (30% weight)
 *    - Buildings standing (20% weight)
 */

export type VictoryCondition = 'castle-destroyed' | 'units-wiped' | 'timeout' | 'none';
export type Faction = 'p1' | 'p2';

export interface FactionStatus {
  faction: Faction;
  castleHP: number;
  castleDestroyed: boolean;
  unitsAlive: number;
  buildingsAlive: number;
}

export interface VictoryResult {
  winner: Faction | 'draw';
  condition: VictoryCondition;
  winnerScore?: number;
  loserScore?: number;
  reason: string;
}

export class VictoryChecker {
  /**
   * Check for immediate victory conditions
   */
  public checkImmediate(p1Status: FactionStatus, p2Status: FactionStatus): VictoryResult | null {
    // P1 wins: P2 castle destroyed
    if (p2Status.castleDestroyed) {
      return {
        winner: 'p1',
        condition: 'castle-destroyed',
        reason: `Player 2's castle has been destroyed!`,
      };
    }

    // P2 wins: P1 castle destroyed
    if (p1Status.castleDestroyed) {
      return {
        winner: 'p2',
        condition: 'castle-destroyed',
        reason: `Player 1's castle has been destroyed!`,
      };
    }

    // P1 wins: P2 has no units
    if (p2Status.unitsAlive === 0 && p1Status.unitsAlive > 0) {
      return {
        winner: 'p1',
        condition: 'units-wiped',
        reason: `Player 2's entire army has been wiped out!`,
      };
    }

    // P2 wins: P1 has no units
    if (p1Status.unitsAlive === 0 && p2Status.unitsAlive > 0) {
      return {
        winner: 'p2',
        condition: 'units-wiped',
        reason: `Player 1's entire army has been wiped out!`,
      };
    }

    // Both have no units - whoever attacks castle first loses (draw for now)
    if (p1Status.unitsAlive === 0 && p2Status.unitsAlive === 0) {
      return {
        winner: 'draw',
        condition: 'units-wiped',
        reason: `Both armies have been wiped out! Draw!`,
      };
    }

    return null;
  }

  /**
   * Score-based victory for timeout
   * Formula: (castleHP * 0.5 + unitsAlive * 30 + buildingsAlive * 20)
   */
  public calculateTimeoutScore(status: FactionStatus): number {
    const castleScore = Math.min(1, status.castleHP / 500) * 50; // Castle HP out of 500, 50% weight
    const unitsScore = status.unitsAlive * 30; // 30 units = 900 points max, 30% weight
    const buildingsScore = status.buildingsAlive * 20; // 6 buildings = 120 points max, 20% weight

    return castleScore + unitsScore + buildingsScore;
  }

  /**
   * Check timeout victory condition
   */
  public checkTimeout(
    p1Status: FactionStatus,
    p2Status: FactionStatus,
  ): VictoryResult | null {
    const p1Score = this.calculateTimeoutScore(p1Status);
    const p2Score = this.calculateTimeoutScore(p2Status);

    if (Math.abs(p1Score - p2Score) < 1) {
      return {
        winner: 'draw',
        condition: 'timeout',
        winnerScore: p1Score,
        loserScore: p2Score,
        reason: `Time's up! The match is a draw!`,
      };
    }

    const winner = p1Score > p2Score ? 'p1' : 'p2';
    const reason = `Time's up! Winner determined by:
- Castle HP: ${winner === 'p1' ? p1Status.castleHP : p2Status.castleHP} HP
- Units Alive: ${winner === 'p1' ? p1Status.unitsAlive : p2Status.unitsAlive}
- Buildings: ${winner === 'p1' ? p1Status.buildingsAlive : p2Status.buildingsAlive}`;

    return {
      winner,
      condition: 'timeout',
      winnerScore: winner === 'p1' ? p1Score : p2Score,
      loserScore: winner === 'p1' ? p2Score : p1Score,
      reason,
    };
  }

  /**
   * Get current status of a faction
   */
  public getFactionStatus(
    faction: Faction,
    castleHP: number,
    castleDestroyed: boolean,
    unitsAlive: number,
    buildingsAlive: number,
  ): FactionStatus {
    return {
      faction,
      castleHP,
      castleDestroyed,
      unitsAlive,
      buildingsAlive,
    };
  }

  /**
   * Format victory message
   */
  public formatVictoryMessage(result: VictoryResult): string {
    let message = `🏆 VICTORY! 🏆\n\n`;

    if (result.winner === 'draw') {
      message += `It's a Draw!\n`;
    } else {
      message += `${result.winner === 'p1' ? 'Player 1' : 'Player 2'} Wins!\n`;
    }

    message += `\nCondition: ${this.formatCondition(result.condition)}\n`;
    message += `${result.reason}`;

    if (result.winnerScore !== undefined && result.loserScore !== undefined) {
      message += `\n\nWinner Score: ${Math.round(result.winnerScore)}`;
      message += `\nLoser Score: ${Math.round(result.loserScore)}`;
    }

    return message;
  }

  private formatCondition(condition: VictoryCondition): string {
    switch (condition) {
      case 'castle-destroyed':
        return 'Castle Destroyed';
      case 'units-wiped':
        return 'Army Wiped Out';
      case 'timeout':
        return 'Time Expired';
      default:
        return 'Unknown';
    }
  }
}
