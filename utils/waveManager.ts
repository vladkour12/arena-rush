import { WaveConfig, Player, SkinType } from '../types';
import {
  WAVE_BASE_ZOMBIE_COUNT,
  WAVE_ZOMBIE_COUNT_INCREASE,
  WAVE_BASE_ZOMBIE_HP,
  WAVE_ZOMBIE_HP_INCREASE,
  WAVE_BASE_ZOMBIE_SPEED,
  WAVE_ZOMBIE_SPEED_INCREASE,
  WAVE_BASE_ZOMBIE_DAMAGE,
  WAVE_ZOMBIE_DAMAGE_INCREASE,
  WAVE_LOOT_MULTIPLIER_BASE,
  WAVE_LOOT_MULTIPLIER_INCREASE,
  WAVE_HEALTH_REWARD,
  WAVE_AMMO_REWARD,
  MAP_SIZE,
  PLAYER_RADIUS
} from '../constants';

/**
 * Generates wave configuration based on wave number
 */
export function generateWaveConfig(waveNumber: number): WaveConfig {
  return {
    waveNumber,
    zombieCount: WAVE_BASE_ZOMBIE_COUNT + (waveNumber - 1) * WAVE_ZOMBIE_COUNT_INCREASE,
    zombieHealth: WAVE_BASE_ZOMBIE_HP + (waveNumber - 1) * WAVE_ZOMBIE_HP_INCREASE,
    zombieSpeed: WAVE_BASE_ZOMBIE_SPEED + (waveNumber - 1) * WAVE_ZOMBIE_SPEED_INCREASE,
    zombieDamage: WAVE_BASE_ZOMBIE_DAMAGE + (waveNumber - 1) * WAVE_ZOMBIE_DAMAGE_INCREASE,
    lootMultiplier: WAVE_LOOT_MULTIPLIER_BASE + (waveNumber - 1) * WAVE_LOOT_MULTIPLIER_INCREASE,
    rewards: {
      healthBonus: WAVE_HEALTH_REWARD + (waveNumber - 1) * 10,
      ammoBonus: WAVE_AMMO_REWARD + (waveNumber - 1) * 5
    }
  };
}

/**
 * Creates a zombie enemy
 */
export function createZombie(
  id: string,
  position: { x: number; y: number },
  health: number,
  speed: number,
  targetPlayerId: string
): Player {
  return {
    id,
    position,
    radius: PLAYER_RADIUS,
    hp: health,
    maxHp: health,
    armor: 0,
    velocity: { x: 0, y: 0 },
    angle: 0,
    weapon: 0 as any, // Zombies don't use weapons
    ammo: 0,
    isReloading: false,
    reloadTimer: 0,
    lastFired: 0,
    speedMultiplier: speed / 100, // Convert speed to multiplier
    invulnerable: 0,
    isBot: true,
    isZombie: true,
    skin: SkinType.Zombie,
    sprintTime: 0,
    sprintCooldown: 0,
    dashTime: 0,
    dashCooldown: 0,
    lastDamageTime: 0,
    regenTimer: 0,
    slowedUntil: 0,
    slowAmount: 0,
    targetId: targetPlayerId
  };
}

/**
 * Spawns zombies around the map edges, away from players
 */
export function spawnZombies(
  count: number,
  health: number,
  speed: number,
  playerPositions: { x: number; y: number }[],
  existingZombieCount: number
): Player[] {
  const zombies: Player[] = [];
  const margin = 200; // Spawn distance from edge
  const minPlayerDistance = 400; // Minimum distance from any player
  
  for (let i = 0; i < count; i++) {
    let position = { x: 0, y: 0 };
    let attempts = 0;
    const maxAttempts = 50;
    
    // Try to find a valid spawn position
    while (attempts < maxAttempts) {
      attempts++;
      
      // Random spawn on map edges
      const edge = Math.floor(Math.random() * 4);
      switch (edge) {
        case 0: // Top edge
          position = { x: Math.random() * MAP_SIZE, y: margin };
          break;
        case 1: // Right edge
          position = { x: MAP_SIZE - margin, y: Math.random() * MAP_SIZE };
          break;
        case 2: // Bottom edge
          position = { x: Math.random() * MAP_SIZE, y: MAP_SIZE - margin };
          break;
        case 3: // Left edge
          position = { x: margin, y: Math.random() * MAP_SIZE };
          break;
      }
      
      // Check distance from all players
      let validPosition = true;
      for (const playerPos of playerPositions) {
        const dx = position.x - playerPos.x;
        const dy = position.y - playerPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < minPlayerDistance) {
          validPosition = false;
          break;
        }
      }
      
      if (validPosition) break;
    }
    
    // Find closest player to target
    let targetPlayerId = 'p1';
    let minDist = Infinity;
    for (let j = 0; j < playerPositions.length; j++) {
      const dx = position.x - playerPositions[j].x;
      const dy = position.y - playerPositions[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        targetPlayerId = `p${j + 1}`;
      }
    }
    
    const zombie = createZombie(
      `zombie_${existingZombieCount + i}`,
      position,
      health,
      speed,
      targetPlayerId
    );
    
    zombies.push(zombie);
  }
  
  return zombies;
}

/**
 * Updates zombie AI - simple chase behavior
 */
export function updateZombieAI(
  zombie: Player,
  players: Player[],
  deltaTime: number
): void {
  // Find target player
  const target = players.find(p => p.id === zombie.targetId && p.hp > 0);
  
  if (!target) {
    // Find nearest living player if target is dead
    let nearest: Player | null = null;
    let minDist = Infinity;
    
    for (const player of players) {
      if (player.hp > 0 && !player.isZombie) {
        const dx = zombie.position.x - player.position.x;
        const dy = zombie.position.y - player.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < minDist) {
          minDist = dist;
          nearest = player;
        }
      }
    }
    
    if (nearest) {
      zombie.targetId = nearest.id;
      return; // Will update in next frame
    } else {
      // No targets, stop moving
      zombie.velocity.x = 0;
      zombie.velocity.y = 0;
      return;
    }
  }
  
  // Calculate direction to target
  const dx = target.position.x - zombie.position.x;
  const dy = target.position.y - zombie.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance > 0) {
    // Normalize direction and apply speed
    const normalizedX = dx / distance;
    const normalizedY = dy / distance;
    
    const effectiveSpeed = zombie.speedMultiplier * 100;
    
    zombie.velocity.x = normalizedX * effectiveSpeed;
    zombie.velocity.y = normalizedY * effectiveSpeed;
    
    // Update angle to face target
    zombie.angle = Math.atan2(dy, dx);
  }
}

/**
 * Checks if zombie can attack a player (melee range)
 */
export function canZombieAttack(zombie: Player, target: Player, meleeRange: number): boolean {
  const dx = zombie.position.x - target.position.x;
  const dy = zombie.position.y - target.position.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  return distance < meleeRange + zombie.radius + target.radius;
}
