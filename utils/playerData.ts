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
      
      // Validate profile structure
      if (!profile || typeof profile !== 'object') {
        console.error('Invalid profile structure');
        return null;
      }
      
      // Ensure nickname exists and is valid
      if (!profile.nickname || typeof profile.nickname !== 'string' || profile.nickname.trim().length === 0) {
        console.error('Invalid or missing nickname');
        return null;
      }
      
      // Ensure stats exist and are valid
      if (!profile.stats || typeof profile.stats !== 'object') {
        profile.stats = { ...defaultStats };
      } else {
        // Validate and fix any invalid stat values (prevent negative or NaN)
        profile.stats = {
          gamesPlayed: Math.max(0, Number(profile.stats.gamesPlayed) || 0),
          wins: Math.max(0, Number(profile.stats.wins) || 0),
          losses: Math.max(0, Number(profile.stats.losses) || 0),
          kills: Math.max(0, Number(profile.stats.kills) || 0),
          deaths: Math.max(0, Number(profile.stats.deaths) || 0),
          damageDealt: Math.max(0, Number(profile.stats.damageDealt) || 0),
          damageReceived: Math.max(0, Number(profile.stats.damageReceived) || 0),
          itemsCollected: Math.max(0, Number(profile.stats.itemsCollected) || 0),
          playTime: Math.max(0, Number(profile.stats.playTime) || 0)
        };
      }
      
      // Migrate old profiles without separate stats
      if (!profile.botStats || typeof profile.botStats !== 'object') {
        profile.botStats = { ...profile.stats };
      } else {
        // Validate botStats
        profile.botStats = {
          gamesPlayed: Math.max(0, Number(profile.botStats.gamesPlayed) || 0),
          wins: Math.max(0, Number(profile.botStats.wins) || 0),
          losses: Math.max(0, Number(profile.botStats.losses) || 0),
          kills: Math.max(0, Number(profile.botStats.kills) || 0),
          deaths: Math.max(0, Number(profile.botStats.deaths) || 0),
          damageDealt: Math.max(0, Number(profile.botStats.damageDealt) || 0),
          damageReceived: Math.max(0, Number(profile.botStats.damageReceived) || 0),
          itemsCollected: Math.max(0, Number(profile.botStats.itemsCollected) || 0),
          playTime: Math.max(0, Number(profile.botStats.playTime) || 0)
        };
      }
      
      if (!profile.pvpStats || typeof profile.pvpStats !== 'object') {
        profile.pvpStats = { ...defaultStats };
      } else {
        // Validate pvpStats
        profile.pvpStats = {
          gamesPlayed: Math.max(0, Number(profile.pvpStats.gamesPlayed) || 0),
          wins: Math.max(0, Number(profile.pvpStats.wins) || 0),
          losses: Math.max(0, Number(profile.pvpStats.losses) || 0),
          kills: Math.max(0, Number(profile.pvpStats.kills) || 0),
          deaths: Math.max(0, Number(profile.pvpStats.deaths) || 0),
          damageDealt: Math.max(0, Number(profile.pvpStats.damageDealt) || 0),
          damageReceived: Math.max(0, Number(profile.pvpStats.damageReceived) || 0),
          itemsCollected: Math.max(0, Number(profile.pvpStats.itemsCollected) || 0),
          playTime: Math.max(0, Number(profile.pvpStats.playTime) || 0)
        };
      }
      
      // Validate lastPlayed
      if (!profile.lastPlayed || typeof profile.lastPlayed !== 'number' || isNaN(profile.lastPlayed)) {
        profile.lastPlayed = Date.now();
      }
      
      // Save fixed profile
      savePlayerProfile(profile);
      
      return profile;
    }
  } catch (e) {
    console.error('Error loading player profile:', e);
    // Clear corrupted data
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (clearError) {
      console.error('Error clearing corrupted profile:', clearError);
    }
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
  
  // Update category-specific stats with null safety
  if (isAgainstBot) {
    const botStats = profile.botStats || { ...defaultStats };
    updatedProfile.botStats = {
      gamesPlayed: (botStats.gamesPlayed || 0) + gameStats.gamesPlayed,
      wins: (botStats.wins || 0) + gameStats.wins,
      losses: (botStats.losses || 0) + gameStats.losses,
      kills: (botStats.kills || 0) + gameStats.kills,
      deaths: (botStats.deaths || 0) + gameStats.deaths,
      damageDealt: (botStats.damageDealt || 0) + gameStats.damageDealt,
      damageReceived: (botStats.damageReceived || 0) + gameStats.damageReceived,
      itemsCollected: (botStats.itemsCollected || 0) + gameStats.itemsCollected,
      playTime: (botStats.playTime || 0) + gameStats.playTime
    };
  } else {
    const pvpStats = profile.pvpStats || { ...defaultStats };
    updatedProfile.pvpStats = {
      gamesPlayed: (pvpStats.gamesPlayed || 0) + gameStats.gamesPlayed,
      wins: (pvpStats.wins || 0) + gameStats.wins,
      losses: (pvpStats.losses || 0) + gameStats.losses,
      kills: (pvpStats.kills || 0) + gameStats.kills,
      deaths: (pvpStats.deaths || 0) + gameStats.deaths,
      damageDealt: (pvpStats.damageDealt || 0) + gameStats.damageDealt,
      damageReceived: (pvpStats.damageReceived || 0) + gameStats.damageReceived,
      itemsCollected: (pvpStats.itemsCollected || 0) + gameStats.itemsCollected,
      playTime: (pvpStats.playTime || 0) + gameStats.playTime
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
