import { PlayerProfile, PlayerStats, LeaderboardEntry } from '../types';

const STORAGE_KEY = 'arena_rush_player_profile';
const LEADERBOARD_KEY = 'arena_rush_leaderboard';

// Default player stats
const defaultStats: PlayerStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  kills: 0,
  deaths: 0,
  damageDealt: 0,
  damageReceived: 0,
  itemsCollected: 0,
  playTime: 0
};

// Get player profile from localStorage
export function getPlayerProfile(): PlayerProfile | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading player profile:', e);
  }
  return null;
}

// Save player profile to localStorage
export function savePlayerProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error('Error saving player profile:', e);
  }
}

// Create new player profile
export function createPlayerProfile(nickname: string): PlayerProfile {
  return {
    nickname,
    stats: { ...defaultStats },
    lastPlayed: Date.now()
  };
}

// Update player stats
export function updatePlayerStats(
  profile: PlayerProfile,
  updates: Partial<PlayerStats>
): PlayerProfile {
  return {
    ...profile,
    stats: {
      ...profile.stats,
      ...updates
    },
    lastPlayed: Date.now()
  };
}

// Get leaderboard from localStorage
export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const stored = localStorage.getItem(LEADERBOARD_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading leaderboard:', e);
  }
  return [];
}

// Update leaderboard with new player data
export function updateLeaderboard(profile: PlayerProfile): void {
  try {
    let leaderboard = getLeaderboard();
    
    // Remove existing entry for this player
    leaderboard = leaderboard.filter(entry => entry.nickname !== profile.nickname);
    
    // Add new entry
    const winRate = profile.stats.gamesPlayed > 0 
      ? (profile.stats.wins / profile.stats.gamesPlayed) * 100 
      : 0;
    
    leaderboard.push({
      nickname: profile.nickname,
      wins: profile.stats.wins,
      kills: profile.stats.kills,
      gamesPlayed: profile.stats.gamesPlayed,
      winRate
    });
    
    // Sort by wins (descending), then by kills
    leaderboard.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.kills - a.kills;
    });
    
    // Keep only top 100
    leaderboard = leaderboard.slice(0, 100);
    
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(leaderboard));
  } catch (e) {
    console.error('Error updating leaderboard:', e);
  }
}

// Record game result
export function recordGameResult(
  profile: PlayerProfile,
  won: boolean,
  kills: number,
  damageDealt: number,
  damageReceived: number,
  itemsCollected: number,
  playTime: number
): PlayerProfile {
  const updatedProfile = updatePlayerStats(profile, {
    gamesPlayed: profile.stats.gamesPlayed + 1,
    wins: profile.stats.wins + (won ? 1 : 0),
    losses: profile.stats.losses + (won ? 0 : 1),
    kills: profile.stats.kills + kills,
    deaths: profile.stats.deaths + (won ? 0 : 1),
    damageDealt: profile.stats.damageDealt + damageDealt,
    damageReceived: profile.stats.damageReceived + damageReceived,
    itemsCollected: profile.stats.itemsCollected + itemsCollected,
    playTime: profile.stats.playTime + playTime
  });
  
  savePlayerProfile(updatedProfile);
  updateLeaderboard(updatedProfile);
  
  return updatedProfile;
}
