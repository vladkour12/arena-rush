import { PlayerProfile, PlayerStats, LeaderboardEntry } from '../types';

const STORAGE_KEY = 'arena_rush_player_profile';
const LEADERBOARD_KEY = 'arena_rush_leaderboard';
const BOT_LEADERBOARD_KEY = 'arena_rush_bot_leaderboard';
const PVP_LEADERBOARD_KEY = 'arena_rush_pvp_leaderboard';

// Helper function to calculate win rate
export function calculateWinRate(wins: number, gamesPlayed: number): number {
  return gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0;
}

// Helper function to format play time
export function formatPlayTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

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
      const profile = JSON.parse(stored);
      
      // Migrate old profiles without separate stats
      if (!profile.botStats || !profile.pvpStats) {
        profile.botStats = profile.stats ? { ...profile.stats } : { ...defaultStats };
        profile.pvpStats = { ...defaultStats };
        savePlayerProfile(profile);
      }
      
      return profile;
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
    stats: { ...defaultStats }, // Overall stats (combined)
    botStats: { ...defaultStats }, // Stats against bots
    pvpStats: { ...defaultStats }, // Stats against real players
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

// Get bot leaderboard (games against bots)
export function getBotLeaderboard(): LeaderboardEntry[] {
  try {
    const stored = localStorage.getItem(BOT_LEADERBOARD_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading bot leaderboard:', e);
  }
  return [];
}

// Get PvP leaderboard (games against real players)
export function getPvPLeaderboard(): LeaderboardEntry[] {
  try {
    const stored = localStorage.getItem(PVP_LEADERBOARD_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading PvP leaderboard:', e);
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
    const winRate = calculateWinRate(profile.stats.wins, profile.stats.gamesPlayed);
    
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

// Update bot leaderboard
export function updateBotLeaderboard(profile: PlayerProfile): void {
  try {
    let leaderboard = getBotLeaderboard();
    
    // Remove existing entry for this player
    leaderboard = leaderboard.filter(entry => entry.nickname !== profile.nickname);
    
    // Add new entry from botStats
    const winRate = calculateWinRate(profile.botStats.wins, profile.botStats.gamesPlayed);
    
    leaderboard.push({
      nickname: profile.nickname,
      wins: profile.botStats.wins,
      kills: profile.botStats.kills,
      gamesPlayed: profile.botStats.gamesPlayed,
      winRate,
      isBot: true
    });
    
    // Sort by wins (descending), then by kills
    leaderboard.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.kills - a.kills;
    });
    
    // Keep only top 100
    leaderboard = leaderboard.slice(0, 100);
    
    localStorage.setItem(BOT_LEADERBOARD_KEY, JSON.stringify(leaderboard));
  } catch (e) {
    console.error('Error updating bot leaderboard:', e);
  }
}

// Update PvP leaderboard
export function updatePvPLeaderboard(profile: PlayerProfile): void {
  try {
    let leaderboard = getPvPLeaderboard();
    
    // Remove existing entry for this player
    leaderboard = leaderboard.filter(entry => entry.nickname !== profile.nickname);
    
    // Add new entry from pvpStats
    const winRate = calculateWinRate(profile.pvpStats.wins, profile.pvpStats.gamesPlayed);
    
    leaderboard.push({
      nickname: profile.nickname,
      wins: profile.pvpStats.wins,
      kills: profile.pvpStats.kills,
      gamesPlayed: profile.pvpStats.gamesPlayed,
      winRate,
      isBot: false
    });
    
    // Sort by wins (descending), then by kills
    leaderboard.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return b.kills - a.kills;
    });
    
    // Keep only top 100
    leaderboard = leaderboard.slice(0, 100);
    
    localStorage.setItem(PVP_LEADERBOARD_KEY, JSON.stringify(leaderboard));
  } catch (e) {
    console.error('Error updating PvP leaderboard:', e);
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
  playTime: number,
  isAgainstBot: boolean = true
): PlayerProfile {
  const gameStats = {
    gamesPlayed: 1,
    wins: won ? 1 : 0,
    losses: won ? 0 : 1,
    kills: kills,
    deaths: won ? 0 : 1,
    damageDealt: damageDealt,
    damageReceived: damageReceived,
    itemsCollected: itemsCollected,
    playTime: playTime
  };
  
  // Update overall stats
  const updatedProfile: PlayerProfile = {
    ...profile,
    stats: {
      gamesPlayed: profile.stats.gamesPlayed + gameStats.gamesPlayed,
      wins: profile.stats.wins + gameStats.wins,
      losses: profile.stats.losses + gameStats.losses,
      kills: profile.stats.kills + gameStats.kills,
      deaths: profile.stats.deaths + gameStats.deaths,
      damageDealt: profile.stats.damageDealt + gameStats.damageDealt,
      damageReceived: profile.stats.damageReceived + gameStats.damageReceived,
      itemsCollected: profile.stats.itemsCollected + gameStats.itemsCollected,
      playTime: profile.stats.playTime + gameStats.playTime
    },
    lastPlayed: Date.now()
  };
  
  // Update category-specific stats
  if (isAgainstBot) {
    updatedProfile.botStats = {
      gamesPlayed: profile.botStats.gamesPlayed + gameStats.gamesPlayed,
      wins: profile.botStats.wins + gameStats.wins,
      losses: profile.botStats.losses + gameStats.losses,
      kills: profile.botStats.kills + gameStats.kills,
      deaths: profile.botStats.deaths + gameStats.deaths,
      damageDealt: profile.botStats.damageDealt + gameStats.damageDealt,
      damageReceived: profile.botStats.damageReceived + gameStats.damageReceived,
      itemsCollected: profile.botStats.itemsCollected + gameStats.itemsCollected,
      playTime: profile.botStats.playTime + gameStats.playTime
    };
  } else {
    updatedProfile.pvpStats = {
      gamesPlayed: profile.pvpStats.gamesPlayed + gameStats.gamesPlayed,
      wins: profile.pvpStats.wins + gameStats.wins,
      losses: profile.pvpStats.losses + gameStats.losses,
      kills: profile.pvpStats.kills + gameStats.kills,
      deaths: profile.pvpStats.deaths + gameStats.deaths,
      damageDealt: profile.pvpStats.damageDealt + gameStats.damageDealt,
      damageReceived: profile.pvpStats.damageReceived + gameStats.damageReceived,
      itemsCollected: profile.pvpStats.itemsCollected + gameStats.itemsCollected,
      playTime: profile.pvpStats.playTime + gameStats.playTime
    };
  }
  
  savePlayerProfile(updatedProfile);
  updateLeaderboard(updatedProfile);
  
  // Update category-specific leaderboards
  if (isAgainstBot) {
    updateBotLeaderboard(updatedProfile);
  } else {
    updatePvPLeaderboard(updatedProfile);
  }
  
  return updatedProfile;
}
