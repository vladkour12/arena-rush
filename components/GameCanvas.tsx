import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Player, Bullet, LootItem, Wall, WeaponType, Vector2, ItemType, NetworkMsgType, InitPackage, InputPackage, StatePackage, SkinType, GameMode } from '../types';
import { WEAPONS, MAP_SIZE, TILE_SIZE, PLAYER_RADIUS, PLAYER_SPEED, BOT_SPEED, INITIAL_ZONE_RADIUS, SHRINK_START_TIME, SHRINK_DURATION, MIN_ZONE_RADIUS, LOOT_SPAWN_INTERVAL, ZOOM_LEVEL, PHONE_ZOOM_MULTIPLIER, CAMERA_LERP, SPRINT_MULTIPLIER, SPRINT_DURATION, SPRINT_COOLDOWN, DASH_MULTIPLIER, DASH_DURATION, DASH_COOLDOWN, MOVE_ACCEL, MOVE_DECEL, MOVE_TURN_ACCEL, STICK_AIM_TURN_SPEED, AUTO_FIRE_THRESHOLD, MAX_LOOT_ITEMS, BOT_MIN_SEPARATION_DISTANCE, BOT_ACCURACY, BOT_LOOT_SEARCH_RADIUS, ZONE_DAMAGE_PER_SECOND, HEALTH_REGEN_DELAY, HEALTH_REGEN_RATE, MUZZLE_FLASH_DURATION, BOT_LEAD_FACTOR, BOT_LEAD_MULTIPLIER, TARGET_FPS, MOBILE_SHADOW_BLUR_REDUCTION, MOBILE_MAX_PARTICLES, DESKTOP_MAX_PARTICLES, MOBILE_BULLET_TRAIL_LENGTH, MAP_BOUNDARY_PADDING, AIM_SNAP_RANGE, AIM_SNAP_ANGLE, AIM_SNAP_STRENGTH, AIM_SNAP_MAINTAIN_ANGLE, AIM_SNAP_AUTO_FIRE, AIM_SNAP_MIN_MAGNITUDE, LOOT_BOB_SPEED, LOOT_PULSE_SPEED, LOOT_BOB_AMOUNT, LOOT_PULSE_AMOUNT, LOOT_BASE_SCALE, BRICK_WIDTH, BRICK_HEIGHT, MORTAR_WIDTH, BULLET_RADIUS, LASER_COLLISION_CHECK_RADIUS, LASER_COLLISION_STEPS, WAVE_PREPARATION_TIME, WAVE_BASE_ZOMBIE_COUNT, WAVE_ZOMBIE_COUNT_INCREASE, WAVE_BASE_ZOMBIE_HP, WAVE_ZOMBIE_HP_INCREASE, WAVE_BASE_ZOMBIE_SPEED, WAVE_ZOMBIE_SPEED_INCREASE, WAVE_BASE_ZOMBIE_DAMAGE, WAVE_ZOMBIE_DAMAGE_INCREASE, WAVE_LOOT_MULTIPLIER_BASE, WAVE_LOOT_MULTIPLIER_INCREASE, WAVE_HEALTH_REWARD, WAVE_AMMO_REWARD, ZOMBIE_MELEE_RANGE, ZOMBIE_COLLISION_PUSH } from '../constants';
import { getDistance, getAngle, checkCircleCollision, checkWallCollision, randomRange, lerp, lerpAngle, isMobileDevice, getOptimizedDPR, hasLineOfSight } from '../utils/gameUtils';
import { NetworkManager } from '../utils/network';
import { initAudio, playShootSound, playHitSound, playDeathSound, playPickupSound, playReloadSound, playFootstepSound, playZombieGrowlSound, playZombieAttackSound, playSprintSound, playDashSound, playLowAmmoSound } from '../utils/sounds';
import { generateMap } from '../utils/mapGenerator';
import { Game3DRenderer } from './Game3DRenderer';
import { frameMonitor } from '../utils/frameMonitor';
import { createFrameThrottler } from '../utils/frameThrottler';
import { createBulletTrail, createExplosion, createDamageNumber, ParticlePool } from '../utils/particleSystem';

interface GameCanvasProps {
  onGameOver: (winner: 'Player' | 'Bot') => void;
  onUpdateStats: (hp: number, ammo: number, totalAmmo: number, weapon: WeaponType, armor: number, time: number, sprint: number, dash: number, speedBoost?: number, damageBoost?: number, invincibility?: number, wave?: number, zombiesRemaining?: number, prepTime?: number, inventory?: Array<{ weapon: WeaponType; ammo: number; totalAmmo: number }>) => void;
  onUpdateMinimap: (playerPos: Vector2, enemyPos: Vector2, loot: LootItem[], zoneRad: number) => void;
  inputRef: React.MutableRefObject<{ 
    move: Vector2; 
    aim: Vector2; 
    sprint: boolean;
    dash: boolean;
    fire: boolean;
    pointer: { x: number; y: number };
    isPointerAiming: boolean;
    weaponSwitch: number;
  }>;
  network?: NetworkManager | null;
  isHost?: boolean;
  playerSkin?: SkinType;
  gameMode?: GameMode;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  onGameOver, 
  onUpdateStats,
  onUpdateMinimap,
  inputRef,
  network,
  isHost = false,
  playerSkin = SkinType.Police,
  gameMode = GameMode.PvP
}) => {
  const [isReady, setIsReady] = useState(false); // For client waiting for Init
  const particlePoolRef = useRef<ParticlePool | null>(null); // Ref for 3D particle effects
  
  // Use ref for 3D state to avoid React state update delays (immediate sync)
  const gameStateFor3DRef = useRef<{
    walls: Wall[];
    players: Player[];
    lootItems: LootItem[];
    bullets: Bullet[];
    zombies: Player[];
    damageNumbers: Array<{ x: number; y: number; damage: number; life: number; maxLife: number; vy: number; color: string }>;
    cameraPosition: Vector2;
    cameraAngle: number;
    zoom: number;
  }>({
    walls: [],
    players: [],
    lootItems: [],
    bullets: [],
    zombies: [],
    damageNumbers: [],
    cameraPosition: { x: 0, y: 0 },
    cameraAngle: 0,
    zoom: ZOOM_LEVEL
  });
  
  // Optimized frame throttling
  const frameThrottlerRef = useRef(createFrameThrottler(isMobileDevice() ? 30 : TARGET_FPS, false));
  const frameMonitorRef = useRef(frameMonitor);
  
  // FPS Control - optimized
  const lastFrameTimeRef = useRef(0);
  
  // Cache mobile device detection to avoid repeated DOM queries
  const isMobileRef = useRef(isMobileDevice());
  
  // Map size based on game mode: 5x bigger for survival (15000 vs 3000)
  const mapSize = useRef(gameMode === GameMode.CoopSurvival ? MAP_SIZE * 5 : MAP_SIZE);
  
  // Update mobile detection on window resize
  useEffect(() => {
    const handleResize = () => {
      isMobileRef.current = isMobileDevice();
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const getViewportSize = () => {
    const vv = window.visualViewport;
    // Always use landscape dimensions (swap if in portrait)
    const rawWidth = vv?.width ?? window.innerWidth;
    const rawHeight = vv?.height ?? window.innerHeight;
    
    // Force landscape: use the larger dimension as width
    const width = Math.max(rawWidth, rawHeight);
    const height = Math.min(rawWidth, rawHeight);
    
    return {
      width: Math.floor(width),
      height: Math.floor(height)
    };
  };

  // Mutable Game State
  const gameState = useRef({
    player: {
      id: 'p1',
      position: { x: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? MAP_SIZE / 2 : MAP_SIZE / 4, y: MAP_SIZE / 2 },
      radius: PLAYER_RADIUS,
      hp: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? 350 : 150,
      maxHp: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? 350 : 150,
      armor: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? 25 : 0,
      velocity: { x: 0, y: 0 },
      angle: 0,
      weapon: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? WeaponType.SMG : WeaponType.Pistol,
      ammo: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? WEAPONS[WeaponType.SMG].clipSize : WEAPONS[WeaponType.Pistol].clipSize,
      totalAmmo: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? WEAPONS[WeaponType.SMG].clipSize * 4 : WEAPONS[WeaponType.Pistol].clipSize * 3,
      isReloading: false,
      reloadTimer: 0,
      lastFired: 0,
      speedMultiplier: 1,
      invulnerable: 0,
      isBot: false,
      skin: playerSkin,
      sprintTime: 0,
      sprintCooldown: 0,
      dashTime: 0,
      dashCooldown: 0,
      lastDamageTime: 0,
      regenTimer: 0,
      slowedUntil: 0,
      slowAmount: 0,
      inventory: [{ 
        weapon: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? WeaponType.SMG : WeaponType.Pistol, 
        ammo: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? WEAPONS[WeaponType.SMG].clipSize : WEAPONS[WeaponType.Pistol].clipSize,
        totalAmmo: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? WEAPONS[WeaponType.SMG].clipSize * 4 : WEAPONS[WeaponType.Pistol].clipSize * 3
      }]
    } as Player,
    aimSnapTarget: null as Player | null, // Track which target player is snapped to
    bot: { // Used as Opponent (Bot or Player 2) in PvP mode
      id: 'p2',
      position: { x: MAP_SIZE * 0.75, y: MAP_SIZE / 2 },
      radius: PLAYER_RADIUS,
      hp: 150,
      maxHp: 150,
      armor: 0,
      velocity: { x: 0, y: 0 },
      angle: Math.PI,
      weapon: WeaponType.Pistol, // Bot starts with Pistol (less powerful)
      ammo: WEAPONS[WeaponType.Pistol].clipSize,
      totalAmmo: WEAPONS[WeaponType.Pistol].clipSize * 3,
      isReloading: false,
      reloadTimer: 0,
      lastFired: 0,
      speedMultiplier: 1,
      invulnerable: 0,
      isBot: !network, // True if singleplayer
      skin: !network ? SkinType.Homeless : playerSkin, // Bot gets homeless skin, multiplayer opponent gets player's skin
      sprintTime: 0,
      sprintCooldown: 0,
      dashTime: 0,
      dashCooldown: 0,
      lastDamageTime: 0,
      regenTimer: 0,
      slowedUntil: 0,
      slowAmount: 0
    } as Player,
    zombies: [] as Player[], // Array of zombie enemies for survival mode
    bullets: [] as Bullet[],
    loot: [] as LootItem[],
    walls: [] as Wall[],
    mapSize: mapSize.current, // Dynamic map size based on game mode
    zoneRadius: INITIAL_ZONE_RADIUS,
    startTime: Date.now(),
    lastTime: Date.now(), 
    lastLootTime: 0,
    gameOver: false,
    camera: { x: 0, y: 0 },
    
    // Survival Mode State
    currentWave: 0,
    zombiesRemaining: 0,
    zombiesKilled: 0,
    isWaveActive: false,
    waveStartTime: 0,
    preparationTimeRemaining: 0,
    
    // Visual Effects
    particles: [] as Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }>,
    muzzleFlashes: [] as Array<{ x: number; y: number; angle: number; life: number }>,
    last3DUpdate: 0, // Timestamp for 3D renderer updates
    hitMarkers: [] as Array<{ x: number; y: number; life: number; damage: number; vx?: number; vy?: number; maxLife?: number }>,
    damageNumbers: [] as Array<{ x: number; y: number; damage: number; life: number; maxLife: number; vy: number; color: string }>,
    
    // Performance tracking
    lastStatsUpdate: 0,
    lastNetworkSync: 0,
    
    // Multiplayer specific
    remoteInput: {
        move: { x: 0, y: 0 },
        aim: { x: 0, y: 0 },
        sprint: false,
        fire: false,
        angle: 0
    } as InputPackage
  });

  // Helper function to add particles with mobile limits
  const addParticle = (state: any, particle: any) => {
    const maxParticles = isMobileRef.current ? MOBILE_MAX_PARTICLES : DESKTOP_MAX_PARTICLES;
    
    // If at limit, remove oldest particle first
    if (state.particles.length >= maxParticles) {
      state.particles.shift();
    }
    
    state.particles.push(particle);
  };

  // Initialize Map & Network
  useEffect(() => {
    const state = gameState.current;
    
    // If Multiplayer Client, wait for init
    if (network && !isHost) {
        console.log('Client waiting for initialization from host...');
        
        network.onMessage = (msg) => {
            if (msg.type === NetworkMsgType.Init) {
                console.log('Client received Init message:', msg.payload);
                const data = msg.payload as InitPackage;
                
                if (!data || !data.walls || !data.playerStart || !data.enemyStart) {
                    console.error('Invalid Init data received:', data);
                    return;
                }
                
                state.walls = data.walls;
                state.player.position = data.enemyStart; // Client is P2
                state.bot.position = data.playerStart;   // Host is P1 (Opponent)
                
                // Reset stats for Client with all required properties
                state.player.hp = 150;
                state.player.maxHp = 150;
                state.player.weapon = WeaponType.Pistol;
                state.player.ammo = WEAPONS[WeaponType.Pistol].clipSize;
                state.player.totalAmmo = WEAPONS[WeaponType.Pistol].clipSize * 3;
                state.bot.hp = 150;
                state.bot.maxHp = 150;
                state.bot.weapon = WeaponType.Pistol;
                state.bot.ammo = WEAPONS[WeaponType.Pistol].clipSize;
                state.bot.totalAmmo = WEAPONS[WeaponType.Pistol].clipSize * 3;
                
                state.startTime = Date.now();
                state.lastTime = Date.now();
                
                // Initialize camera for client
                const { width: viewportWidth, height: viewportHeight } = getViewportSize();
                state.camera = { 
                    x: state.player.position.x - (viewportWidth / ZOOM_LEVEL) / 2, 
                    y: state.player.position.y - (viewportHeight / ZOOM_LEVEL) / 2 
                };
                
                // Initialize 3D state immediately so renderer has data on first render (Client)
                gameStateFor3DRef.current = {
                  walls: state.walls,
                  players: [state.player, state.bot],
                  lootItems: state.loot,
                  bullets: state.bullets,
                  zombies: state.zombies || [],
                  damageNumbers: state.damageNumbers || [],
                  cameraPosition: state.camera,
                  cameraAngle: state.player.angle,
                  zoom: ZOOM_LEVEL
                };
                
                setIsReady(true);
                console.log('Client initialized and ready to play at position:', state.player.position);
            } else if (msg.type === NetworkMsgType.State) {
                const data = msg.payload as StatePackage;
                // Client Render Logic -> Interpolate
                // P1 is Host (Bot slot), P2 is Client (Player slot)
                
                if (data.players && data.players.length >= 2) {
                    // Update ME (Authoritative override from host, or just reconcile)
                    // For smooth movement, we might ignore position updates if delta is small, but for now simple sync
                    // Actually, let's just sync for simplicity.
                    const myAngle = state.player.angle; // PRESERVE LOCAL ANGLE
                    
                    // Safely update player state
                    const p2Data = data.players[1];
                    if (p2Data) {
                        state.player = { ...state.player, ...p2Data };
                        state.player.angle = myAngle; // Keep local aim authoritative for visuals
                    }
                    
                    // Update opponent
                    const p1Data = data.players[0];
                    if (p1Data) {
                        state.bot = p1Data; // Host is my opponent
                    }
                    
                    state.bullets = data.bullets || [];
                    state.loot = data.loot || [];
                    state.zoneRadius = data.zoneRadius || INITIAL_ZONE_RADIUS;
                }
                
                // Fix camera if snapped
                // Camera logic is independent
            }
        };
        return;
    }

    // Host or Single Player -> Generate Map using new map generator with dynamic size
    const currentMapSize = mapSize.current;
    const walls = generateMap(); // Generates a random map type with varied layouts
    
    state.walls = walls;
    state.mapSize = currentMapSize; // Store in state for game logic
    state.startTime = Date.now();
    state.lastTime = Date.now();

    // Spawn Safe Check - improved to ensure minimum distance between players
    const isSafe = (pos: Vector2, otherPos?: Vector2) => {
        const dummy: any = { position: pos, radius: PLAYER_RADIUS + 20 }; 
        for(const w of walls) if (checkWallCollision(dummy, w)) return false;
        // Ensure minimum distance from other player
        if (otherPos && getDistance(pos, otherPos) < BOT_MIN_SEPARATION_DISTANCE) return false;
        return true;
    };

    // Spawn players in opposite corners for better initial positioning (scaled to map size)
    let pPos = { x: currentMapSize * 0.2, y: currentMapSize * 0.2 };
    let bPos = { x: currentMapSize * 0.8, y: currentMapSize * 0.8 };
    
    // Retry spawns with improved safety checks
    let attempts = 0;
    while(!isSafe(pPos) && attempts < 50) {
      pPos = { x: randomRange(150, currentMapSize * 0.4), y: randomRange(150, currentMapSize * 0.4) };
      attempts++;
    }
    
    attempts = 0;
    while(!isSafe(bPos, pPos) && attempts < 50) {
      bPos = { x: randomRange(currentMapSize * 0.6, currentMapSize - 150), y: randomRange(currentMapSize * 0.6, currentMapSize - 150) };
      attempts++;
    }

    state.player.position = pPos;
    state.bot.position = bPos;
    
    // In PvP (Host), ensure both start fair
    if (isHost && network) {
        state.bot.isBot = false;
        state.bot.weapon = WeaponType.Pistol; // Reset bot weapon to fair start
        state.bot.ammo = WEAPONS[WeaponType.Pistol].clipSize;
        state.bot.totalAmmo = WEAPONS[WeaponType.Pistol].clipSize * 3;
        
        // Send Init
        const initData: InitPackage = {
            walls: walls,
            playerStart: pPos, // Host pos
            enemyStart: bPos,  // Client pos
            seed: 0
        };
        
        console.log('Host sending Init message to client:', initData);
        network.send(NetworkMsgType.Init, initData);

        network.onMessage = (msg) => {
            if (msg.type === NetworkMsgType.Input) {
                const inputData = msg.payload as InputPackage;
                state.remoteInput = inputData;
                // console.log('Host received input from client:', inputData);
            }
        };
    }

    setIsReady(true); // Host/Single is ready immediately

    // Camera Init
    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    state.camera = { 
        x: state.player.position.x - (viewportWidth / ZOOM_LEVEL) / 2, 
        y: state.player.position.y - (viewportHeight / ZOOM_LEVEL) / 2 
    };

    // Initialize 3D state immediately so renderer has data on first render
    gameStateFor3DRef.current = {
      walls: state.walls,
      players: [state.player, state.bot],
      lootItems: state.loot,
      bullets: state.bullets,
      zombies: state.zombies || [],
      damageNumbers: state.damageNumbers || [],
      cameraPosition: state.camera,
      cameraAngle: state.player.angle,
      zoom: ZOOM_LEVEL
    };

  }, [network, isHost]);

  // Main Loop
  useEffect(() => {
    if (!isReady) return; // Wait for init

    // No longer need canvas - game loop runs independently for 3D rendering
    let animationFrameId: number;

    const spawnLoot = (now: number) => {
      const state = gameState.current;
      
      if (now - state.lastLootTime > LOOT_SPAWN_INTERVAL && state.loot.length < MAX_LOOT_ITEMS) {
        state.lastLootTime = now;
        const types = [ItemType.Medkit, ItemType.Shield, ItemType.Ammo, ItemType.Weapon, ItemType.Weapon];
        const type = types[Math.floor(Math.random() * types.length)];
        let weaponType: WeaponType | undefined;
        if (type === ItemType.Weapon) {
          const wTypes = [WeaponType.Shotgun, WeaponType.SMG, WeaponType.Sniper, WeaponType.Rocket, WeaponType.AK47, WeaponType.Minigun, WeaponType.BurstRifle];
          weaponType = wTypes[Math.floor(Math.random() * wTypes.length)];
        }
        
        let lootPos = { x: randomRange(100, MAP_SIZE-100), y: randomRange(100, MAP_SIZE-100) };
        let attempts = 0;
        const checkSafe = (pos: Vector2) => {
            const dummy: any = { position: pos, radius: 25 };
            for(const w of state.walls) if(checkWallCollision(dummy, w)) return false;
            return true;
        }
        while(!checkSafe(lootPos) && attempts < 20) {
             lootPos = { x: randomRange(100, MAP_SIZE-100), y: randomRange(100, MAP_SIZE-100) };
             attempts++;
        }

        state.loot.push({
          id: `loot-${now}`,
          position: lootPos,
          radius: 30, // Increased from 20 to 30 for easier pickup
          type,
          weaponType,
          value: type === ItemType.Medkit ? 30 : 0
        });
      }
    };

    // Survival Mode: Spawn a zombie with wave-based stats
    const spawnZombie = (waveNumber: number, zombieIndex: number) => {
      const state = gameState.current;
      
      // Calculate zombie stats based on wave number
      const zombieHP = WAVE_BASE_ZOMBIE_HP + (waveNumber - 1) * WAVE_ZOMBIE_HP_INCREASE;
      const zombieSpeed = WAVE_BASE_ZOMBIE_SPEED + (waveNumber - 1) * WAVE_ZOMBIE_SPEED_INCREASE;
      const zombieDamage = WAVE_BASE_ZOMBIE_DAMAGE + (waveNumber - 1) * WAVE_ZOMBIE_DAMAGE_INCREASE;
      
      // Randomize zombie type based on wave - now includes special types from wave 1
      let zombieType: 'normal' | 'fast' | 'tank' = 'normal';
      if (waveNumber >= 1) {
        const typeRoll = Math.random();
        if (waveNumber === 1) {
          // Wave 1: 15% fast, 10% tank, 75% normal
          if (typeRoll < 0.15) zombieType = 'fast';
          else if (typeRoll < 0.25) zombieType = 'tank';
        } else if (waveNumber === 2) {
          // Wave 2: 20% fast, 15% tank
          if (typeRoll < 0.20) zombieType = 'fast';
          else if (typeRoll < 0.35) zombieType = 'tank';
        } else {
          // Wave 3+: 25% fast, 20% tank
          if (typeRoll < 0.25) zombieType = 'fast';
          else if (typeRoll < 0.45) zombieType = 'tank';
        }
      }
      
      // Adjust stats based on type
      let finalHP = zombieHP;
      let finalSpeed = zombieSpeed;
      let finalDamage = zombieDamage;
      
      if (zombieType === 'fast') {
        finalSpeed *= 1.5;  // 50% faster
        finalHP *= 0.6;     // 40% less HP
        finalDamage *= 0.8; // 20% less damage
      } else if (zombieType === 'tank') {
        finalHP *= 2.0;     // 2x HP
        finalSpeed *= 0.7;  // 30% slower
        finalDamage *= 1.5; // 50% more damage
      }
      
      // Spawn position around the map edges
      const currentZombieCount = WAVE_BASE_ZOMBIE_COUNT + (waveNumber - 1) * WAVE_ZOMBIE_COUNT_INCREASE;
      const angle = (Math.PI * 2 / currentZombieCount) * zombieIndex + Math.random() * 0.5;
      const spawnRadius = MAP_SIZE * 0.45;
      const spawnX = MAP_SIZE / 2 + Math.cos(angle) * spawnRadius;
      const spawnY = MAP_SIZE / 2 + Math.sin(angle) * spawnRadius;
      
      const zombie: Player = {
        id: `zombie-${waveNumber}-${zombieIndex}-${Date.now()}`,
        position: { x: spawnX, y: spawnY },
        radius: PLAYER_RADIUS,
        hp: finalHP,
        maxHp: finalHP,
        armor: 0,
        velocity: { x: 0, y: 0 },
        angle: 0,
        weapon: WeaponType.Knife, // Zombies use melee
        ammo: Infinity,
        isReloading: false,
        reloadTimer: 0,
        lastFired: 0,
        speedMultiplier: 1,
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
        targetId: 'p1' // Always target the player
      };
      
      // Store zombie damage and stats
      zombie.zombieDamage = finalDamage;
      zombie.zombieSpeed = finalSpeed;
      zombie.zombieType = zombieType;
      zombie.totalAmmo = Infinity; // Zombies don't need ammo
      
      // Assign random skin variant for visual variety (0-4)
      zombie.zombieSkinVariant = Math.floor(Math.random() * 5);
      
      state.zombies.push(zombie);
    };

    // Survival Mode: Start a new wave
    const startWave = () => {
      const state = gameState.current;
      state.currentWave++;
      state.isWaveActive = true;
      state.waveStartTime = Date.now();
      
      const zombieCount = WAVE_BASE_ZOMBIE_COUNT + (state.currentWave - 1) * WAVE_ZOMBIE_COUNT_INCREASE;
      state.zombiesRemaining = zombieCount;
      
      // Spawn all zombies for this wave
      for (let i = 0; i < zombieCount; i++) {
        spawnZombie(state.currentWave, i);
      }
    };

    // Survival Mode: Handle wave completion and rewards
    const completeWave = () => {
      const state = gameState.current;
      state.isWaveActive = false;
      state.preparationTimeRemaining = WAVE_PREPARATION_TIME;
      
      // Give rewards to player
      state.player.hp = Math.min(state.player.hp + WAVE_HEALTH_REWARD, state.player.maxHp);
      state.player.ammo = Math.min(state.player.ammo + WAVE_AMMO_REWARD, WEAPONS[state.player.weapon].clipSize);
      
      // Spawn bonus loot
      const lootMultiplier = WAVE_LOOT_MULTIPLIER_BASE + (state.currentWave - 1) * WAVE_LOOT_MULTIPLIER_INCREASE;
      const bonusLootCount = Math.floor(3 * lootMultiplier);
      
      for (let i = 0; i < bonusLootCount; i++) {
        const types = [ItemType.Medkit, ItemType.Shield, ItemType.Weapon, ItemType.MegaHealth];
        const type = types[Math.floor(Math.random() * types.length)];
        let weaponType: WeaponType | undefined;
        
        if (type === ItemType.Weapon) {
          const wTypes = [WeaponType.Shotgun, WeaponType.SMG, WeaponType.Sniper, WeaponType.Rocket, WeaponType.AK47, WeaponType.Minigun, WeaponType.BurstRifle];
          weaponType = wTypes[Math.floor(Math.random() * wTypes.length)];
        }
        
        const lootPos = {
          x: state.player.position.x + randomRange(-200, 200),
          y: state.player.position.y + randomRange(-200, 200)
        };
        
        state.loot.push({
          id: `wave-loot-${state.currentWave}-${i}`,
          position: lootPos,
          radius: 30,
          type,
          weaponType,
          value: type === ItemType.Medkit ? 50 : type === ItemType.MegaHealth ? 100 : 0
        });
      }
    };

    // Survival Mode: Drop loot from killed zombie
    const dropZombieLoot = (zombie: Player) => {
      const state = gameState.current;
      const lootMultiplier = WAVE_LOOT_MULTIPLIER_BASE + (state.currentWave - 1) * WAVE_LOOT_MULTIPLIER_INCREASE;
      
      // Higher chance to drop good items
      const dropChance = Math.random();
      if (dropChance < 0.5 * lootMultiplier) { // 50% base chance, increases with waves
        const types = [ItemType.Medkit, ItemType.Shield, ItemType.Weapon, ItemType.Ammo, ItemType.MegaHealth];
        const weights = [30, 25, 25, 15, 5]; // Weighted distribution
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const roll = Math.random() * totalWeight;
        
        let cumulative = 0;
        let selectedType = ItemType.Medkit;
        for (let i = 0; i < types.length; i++) {
          cumulative += weights[i];
          if (roll <= cumulative) {
            selectedType = types[i];
            break;
          }
        }
        
        let weaponType: WeaponType | undefined;
        if (selectedType === ItemType.Weapon) {
          const wTypes = [WeaponType.Shotgun, WeaponType.SMG, WeaponType.Sniper, WeaponType.Rocket, WeaponType.AK47, WeaponType.Minigun, WeaponType.BurstRifle];
          weaponType = wTypes[Math.floor(Math.random() * wTypes.length)];
        }
        
        state.loot.push({
          id: `zombie-drop-${Date.now()}-${Math.random()}`,
          position: { ...zombie.position },
          radius: 30,
          type: selectedType,
          weaponType,
          value: selectedType === ItemType.Medkit ? 50 : selectedType === ItemType.MegaHealth ? 100 : 0
        });
      }
    };

    // Shared update logic
    const updateEntity = (entity: Player, moveVec: Vector2, aimVec: Vector2 | null, wantSprint: boolean, wantDash: boolean, inputAngle: number | null, dt: number, now: number) => {
      const state = gameState.current;
      
      // Health Regeneration - with safety checks
      if (entity.hp < entity.maxHp && entity.hp > 0 && entity.maxHp > 0) {
          entity.regenTimer += dt * 1000;
          if (entity.regenTimer >= HEALTH_REGEN_DELAY && HEALTH_REGEN_RATE > 0) {
              entity.hp = Math.max(0, Math.min(entity.hp + HEALTH_REGEN_RATE, entity.maxHp));
              entity.regenTimer = 0; // Reset to allow next regen cycle
          }
      } else {
          entity.regenTimer = 0;
      }
      
      // Safety: Clamp HP to valid range
      entity.hp = Math.max(0, Math.min(entity.hp, entity.maxHp || 100));
      entity.armor = Math.max(0, entity.armor);
      
      // Sprint
      if (entity.sprintTime > 0) entity.sprintTime -= dt * 1000;
      if (entity.sprintCooldown > 0) entity.sprintCooldown -= dt * 1000;

      if (wantSprint && entity.sprintCooldown <= 0 && entity.sprintTime <= 0) {
        entity.sprintTime = SPRINT_DURATION;
        entity.sprintCooldown = SPRINT_COOLDOWN;
        // Play sprint sound for player only
        if (!entity.isBot && entity.id === state.player.id) {
          playSprintSound();
        }
      }
      
      const isSprinting = entity.sprintTime > 0;
      
      // Dash
      if (entity.dashTime > 0) entity.dashTime -= dt * 1000;
      if (entity.dashCooldown > 0) entity.dashCooldown -= dt * 1000;

      if (wantDash && entity.dashCooldown <= 0 && entity.dashTime <= 0) {
        entity.dashTime = DASH_DURATION;
        entity.dashCooldown = DASH_COOLDOWN;
        // Play dash sound for player only
        if (!entity.isBot && entity.id === state.player.id) {
          playDashSound();
        }
      }
      
      const isDashing = entity.dashTime > 0;
      
      // Speed multiplier: dash overrides sprint
      entity.speedMultiplier = isDashing ? DASH_MULTIPLIER : (isSprinting ? SPRINT_MULTIPLIER : 1);

      // Physics - Improved responsiveness
      const maxSpeed = (entity.isBot ? BOT_SPEED : PLAYER_SPEED) * entity.speedMultiplier;
      
      // Normalize move vector to ensure consistent speed
      const moveMagnitude = Math.sqrt(moveVec.x * moveVec.x + moveVec.y * moveVec.y);
      let normalizedMove = moveVec;
      if (moveMagnitude > 1.0) {
        normalizedMove = { x: moveVec.x / moveMagnitude, y: moveVec.y / moveMagnitude };
      }
      
      const targetVx = normalizedMove.x * maxSpeed;
      const targetVy = normalizedMove.y * maxSpeed;

      // Increased acceleration for more responsive movement
      const ACCEL = isSprinting ? MOVE_ACCEL * 2.0 : MOVE_ACCEL * 1.5; // Faster acceleration
      const FRICTION = MOVE_DECEL * 1.2; // Faster deceleration
      const TURN_ACCEL = MOVE_TURN_ACCEL * 1.5; // Faster turning

      const getFactor = (curr: number, target: number) => {
        if (Math.abs(target) < 5) return FRICTION; // Lower threshold for stopping
        if (curr * target < 0) return TURN_ACCEL; // Faster direction changes
        return ACCEL;
      };

      const factorX = getFactor(entity.velocity.x, targetVx);
      const factorY = getFactor(entity.velocity.y, targetVy);

      // Use exponential interpolation for smoother, more responsive movement
      const lerpFactorX = Math.min(dt * factorX, 0.95); // Cap at 95% for smoother feel
      const lerpFactorY = Math.min(dt * factorY, 0.95);
      
      entity.velocity.x = lerp(entity.velocity.x, targetVx, lerpFactorX);
      entity.velocity.y = lerp(entity.velocity.y, targetVy, lerpFactorY);

      // Lower threshold for stopping to prevent jitter
      if (Math.abs(entity.velocity.x) < 5) entity.velocity.x = 0;
      if (Math.abs(entity.velocity.y) < 5) entity.velocity.y = 0;

      // Improved Collision with sliding and unstuck detection
      let testX = entity.position.x + entity.velocity.x * dt;
      let testY = entity.position.y + entity.velocity.y * dt;
      let hitWallX = false;
      let hitWallY = false;
      
      // Test X movement
      for (const wall of state.walls) {
         if (checkWallCollision({ ...entity, position: { x: testX, y: entity.position.y } }, wall)) {
             hitWallX = true;
             break;
         }
      }
      
      // Test Y movement
      for (const wall of state.walls) {
         if (checkWallCollision({ ...entity, position: { x: entity.position.x, y: testY } }, wall)) {
             hitWallY = true;
             break;
         }
      }
      
      // Apply movement with bounce-back to prevent sticking
      if (!hitWallX) {
        entity.position.x = testX;
      } else {
        entity.velocity.x *= -0.2; // Increased bounce for better unstuck
      }
      
      if (!hitWallY) {
        entity.position.y = testY;
      } else {
        entity.velocity.y *= -0.2; // Increased bounce for better unstuck
      }
      
      // Enhanced sliding: if one axis is blocked, maintain momentum on free axis
      if (hitWallX && !hitWallY) {
        // Can't move X but can move Y, reduce X velocity slightly for sliding
        entity.velocity.x *= 0.2;
      }
      if (hitWallY && !hitWallX) {
        // Can't move Y but can move X, reduce Y velocity slightly for sliding
        entity.velocity.y *= 0.2;
      }
      
      // Additional unstuck check: push away from walls if still colliding
      for (const wall of state.walls) {
        if (checkWallCollision(entity, wall)) {
          if (wall.isCircular) {
            const dx = entity.position.x - wall.position.x;
            const dy = entity.position.y - wall.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0 && dist < entity.radius + wall.radius) {
              const pushDist = (entity.radius + wall.radius - dist) * 1.1;
              entity.position.x += (dx / dist) * pushDist;
              entity.position.y += (dy / dist) * pushDist;
            }
          } else {
            const closestX = Math.max(wall.position.x, Math.min(entity.position.x, wall.position.x + wall.width));
            const closestY = Math.max(wall.position.y, Math.min(entity.position.y, wall.position.y + wall.height));
            const dx = entity.position.x - closestX;
            const dy = entity.position.y - closestY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 0 && dist < entity.radius) {
              const pushDist = (entity.radius - dist) * 1.2;
              entity.position.x += (dx / dist) * pushDist;
              entity.position.y += (dy / dist) * pushDist;
            }
          }
        }
      }
      
      // Enhanced unstuck mechanism: if player is stuck in walls, push them out more aggressively
      let totalPushX = 0;
      let totalPushY = 0;
      let collisionCount = 0;
      
      for (const wall of state.walls) {
        if (checkWallCollision(entity, wall)) {
          // Calculate push direction (away from wall center)
          const wallCenterX = wall.position.x + wall.width / 2;
          const wallCenterY = wall.position.y + wall.height / 2;
          const dx = entity.position.x - wallCenterX;
          const dy = entity.position.y - wallCenterY;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist > 0) {
            // Weight the push more heavily for walls the player is deeper into
            const penetrationDepth = entity.radius + 20; // Add extra margin
            const weight = Math.max(1, penetrationDepth / dist);
            totalPushX += (dx / dist) * weight;
            totalPushY += (dy / dist) * weight;
            collisionCount++;
          }
        }
      }
      
      // Apply averaged push if stuck - more aggressive
      if (collisionCount > 0) {
        const pushStrength = 10; // Increased from 5 to 10 for stronger unstuck
        entity.position.x += (totalPushX / collisionCount) * pushStrength;
        entity.position.y += (totalPushY / collisionCount) * pushStrength;
        
        // If still stuck after push, try multiple iterations
        let maxAttempts = 3;
        let attempt = 0;
        while (attempt < maxAttempts) {
          let stillStuck = false;
          for (const wall of state.walls) {
            if (checkWallCollision(entity, wall)) {
              stillStuck = true;
              // Push away from nearest edge
              const wallCenterX = wall.position.x + wall.width / 2;
              const wallCenterY = wall.position.y + wall.height / 2;
              const dx = entity.position.x - wallCenterX;
              const dy = entity.position.y - wallCenterY;
              const dist = Math.sqrt(dx*dx + dy*dy);
              if (dist > 0) {
                entity.position.x += (dx / dist) * 15;
                entity.position.y += (dy / dist) * 15;
              }
              break;
            }
          }
          if (!stillStuck) break;
          attempt++;
        }
      }

      // Aiming
      let firing = false;
      
      // If Human (Local or Remote P2)
      if (!entity.isBot) {
          // Enhanced Aim Snap System - Find potential target with improved detection
          let snapTarget: Player | null = null;
          
          // Build list of potential targets (bot in PvP, or zombies in survival)
          const potentialTargets: Player[] = [];
          
          if (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) {
              // In survival mode, target zombies
              state.zombies.forEach(zombie => {
                  if (zombie.hp > 0) potentialTargets.push(zombie);
              });
          } else {
              // In PvP mode, target the opponent
              const opponent = entity.id === state.player.id ? state.bot : state.player;
              if (opponent.hp > 0) potentialTargets.push(opponent);
          }
          
          // Find best target to snap to
          let bestTarget: Player | null = null;
          let bestScore = Infinity;
          
          for (const target of potentialTargets) {
              const distToTarget = getDistance(entity.position, target.position);
              const angleToTarget = getAngle(entity.position, target.position);
              
              // Check if target is within snap range and visible (line of sight)
              const hasLOS = hasLineOfSight(entity.position, target.position, state.walls);
              
              if (distToTarget <= AIM_SNAP_RANGE && hasLOS) {
                  // Calculate angle difference
                  let angleDiff = angleToTarget - entity.angle;
                  // Normalize angle difference to -PI to PI
                  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
                  
                  const absAngleDiff = Math.abs(angleDiff);
                  
                  // Check if currently snapped to this target
                  if (state.aimSnapTarget === target) {
                      // Maintain snap if within maintain angle AND visible (more forgiving)
                      if (absAngleDiff <= AIM_SNAP_MAINTAIN_ANGLE) {
                          snapTarget = target;
                          break; // Keep current target
                      }
                  } else {
                      // Try to acquire snap if within snap angle AND visible
                      if (absAngleDiff <= AIM_SNAP_ANGLE) {
                          // Score based on angle and distance (prefer closer and more centered targets)
                          const score = absAngleDiff * 2 + (distToTarget / AIM_SNAP_RANGE);
                          if (score < bestScore) {
                              bestScore = score;
                              bestTarget = target;
                          }
                      }
                  }
              } else {
                  // Out of range or not visible, lose snap if this was the target
                  if (state.aimSnapTarget === target) {
                      state.aimSnapTarget = null;
                  }
              }
          }
          
          // Set snap target
          if (!snapTarget && bestTarget) {
              snapTarget = bestTarget;
              state.aimSnapTarget = bestTarget;
          }
          
          // Clear snap if no valid target found
          if (!snapTarget && state.aimSnapTarget) {
              state.aimSnapTarget = null;
          }
          
          if (aimVec) {
             // Normalize aim vector to ensure consistent behavior
             const aimMagnitude = Math.sqrt(aimVec.x**2 + aimVec.y**2);
             
             if (aimMagnitude > 0.05) { // Lower threshold for more responsive aiming
                 // Normalize aim vector
                 const normalizedAim = aimMagnitude > 1.0 
                   ? { x: aimVec.x / aimMagnitude, y: aimVec.y / aimMagnitude }
                   : aimVec;
                 
                 let desiredAngle = Math.atan2(normalizedAim.y, normalizedAim.x);
                 
                 // Apply enhanced aim snap if target locked
                 if (snapTarget) {
                     const angleToTarget = getAngle(entity.position, snapTarget.position);
                     // Stronger blend for better tracking
                     desiredAngle = lerpAngle(desiredAngle, angleToTarget, AIM_SNAP_STRENGTH);
                     
                     // Auto-fire when snapped and aiming (more responsive)
                     if (AIM_SNAP_AUTO_FIRE && aimMagnitude > AIM_SNAP_MIN_MAGNITUDE) {
                         firing = true;
                     }
                 }
                 
                 // Much faster turn speed for instant responsiveness
                 const turnSpeed = STICK_AIM_TURN_SPEED * 1.5; // 50% faster
                 entity.angle = lerpAngle(entity.angle, desiredAngle, Math.min(dt * turnSpeed, 0.95));
                 
                 // Regular auto-fire threshold - lower for easier firing
                 if (!snapTarget && aimMagnitude > AUTO_FIRE_THRESHOLD * 0.9) firing = true;
             } else {
                 // Not actively aiming with stick - face movement direction
                 const moveMagnitude = Math.sqrt(moveVec.x * moveVec.x + moveVec.y * moveVec.y);
                 if (moveMagnitude > 0.05) {
                     const moveAngle = Math.atan2(moveVec.y, moveVec.x);
                     entity.angle = lerpAngle(entity.angle, moveAngle, dt * 12); // Faster face movement
                 }
                 // Lose snap when not aiming
                 state.aimSnapTarget = null;
             }
          } else {
              // No aim vector - face movement direction or lose snap
              const moveMagnitude = Math.sqrt(moveVec.x * moveVec.x + moveVec.y * moveVec.y);
              if (moveMagnitude > 0.05) {
                  const moveAngle = Math.atan2(moveVec.y, moveVec.x);
                  entity.angle = lerpAngle(entity.angle, moveAngle, dt * 12);
              }
              state.aimSnapTarget = null;
          }
          
          // Remote players might send explicit angle
          if (inputAngle !== null) {
              entity.angle = inputAngle; // Use authoritative angle from client or host
          }
      }

      // Reloading with limited ammo system
      if (entity.isReloading) {
        if (now > entity.reloadTimer) {
          entity.isReloading = false;
          // Only reload if we have reserve ammo
          if (entity.totalAmmo > 0) {
            const ammoNeeded = WEAPONS[entity.weapon].clipSize - entity.ammo;
            const ammoToReload = Math.min(ammoNeeded, entity.totalAmmo);
            entity.ammo += ammoToReload;
            entity.totalAmmo -= ammoToReload;
          }
        }
      }

      // Return firing intent
      return firing;
    };

    const runGameLoop = () => {
      const state = gameState.current;
      if (state.gameOver) return;
      
      frameMonitorRef.current.startFrame();
      frameMonitorRef.current.startGameLoop();
      
      // Schedule next frame immediately
      animationFrameId = requestAnimationFrame(runGameLoop);
      
      // Get consistent delta time from throttler
      const throttler = frameThrottlerRef.current;
      const dt = throttler.captureFrame();
      
      const now = Date.now();
      const state_obj = gameState.current;
      state_obj.lastTime = now;
      const elapsed = now - state_obj.startTime;
      
      // Get input with proper normalization
      const rawMove = inputRef.current.move;
      const rawAim = inputRef.current.aim;
      
      // Normalize movement input to prevent speed variations
      const moveMagnitude = Math.sqrt(rawMove.x * rawMove.x + rawMove.y * rawMove.y);
      const move = moveMagnitude > 1.0 
        ? { x: rawMove.x / moveMagnitude, y: rawMove.y / moveMagnitude }
        : rawMove;
      
      // Normalize aim input
      const aimMagnitude = Math.sqrt(rawAim.x * rawAim.x + rawAim.y * rawAim.y);
      const aim = aimMagnitude > 1.0
        ? { x: rawAim.x / aimMagnitude, y: rawAim.y / aimMagnitude }
        : rawAim;
      
      const sprint = inputRef.current.sprint;

      // No canvas resizing needed - 3D renderer handles its own size
      
      // --- CLIENT MODE ---
      if (network && !isHost) {
          // Client-Side Prediction: Aiming
          // Immediately apply local aim to local state for rendering
          const rawAim = inputRef.current.aim;
          
          // Normalize aim input
          const aimMagnitude = Math.sqrt(rawAim.x * rawAim.x + rawAim.y * rawAim.y);
          const aim = aimMagnitude > 1.0
            ? { x: rawAim.x / aimMagnitude, y: rawAim.y / aimMagnitude }
            : rawAim;
          
          // Re-calculate aim angle if using stick (same logic as updateEntity)
          if (aim && (aim.x !== 0 || aim.y !== 0)) {
             const aimMag = Math.sqrt(aim.x**2 + aim.y**2);
             if (aimMag > 0.05) { // Lower threshold for more responsive aiming
                 const desiredAngle = Math.atan2(aim.y, aim.x);
                 const turnSpeed = STICK_AIM_TURN_SPEED * 1.5; // Match host turn speed
                 state.player.angle = lerpAngle(state.player.angle, desiredAngle, Math.min(dt * turnSpeed, 0.95));
             }
          }

          // Send Input
          network.send(NetworkMsgType.Input, {
              move: inputRef.current.move, 
              aim: inputRef.current.aim, 
              sprint: inputRef.current.sprint, 
              fire: inputRef.current.fire, 
              angle: state.player.angle // Send the predicted angle
          } as InputPackage);
          
          // Update 3D state for rendering (no 2D canvas needed)
          // Calculate viewport for camera
          const viewportW = window.innerWidth / ZOOM_LEVEL;
          const visibleH = window.innerHeight / ZOOM_LEVEL;
          
          const targetCamX = state.player.position.x - viewportW / 2;
          const targetCamY = state.player.position.y - visibleH / 2;
          
          state.camera.x += (targetCamX - state.camera.x) * CAMERA_LERP;
          state.camera.y += (targetCamY - state.camera.y) * CAMERA_LERP;
          
          // Update 3D state for rendering
          const allPlayers = [state.player, state.bot];
          gameStateFor3DRef.current = {
            walls: state.walls,
            players: allPlayers,
            lootItems: state.loot,
            bullets: state.bullets,
            zombies: state.zombies || [],
            damageNumbers: state.damageNumbers || [],
            cameraPosition: state.camera,
            cameraAngle: state.player.angle,
            zoom: ZOOM_LEVEL
          };
          
          return;
      }

      // --- HOST or SINGLEPLAYER ---
      
      // Zone mechanic removed

      spawnLoot(now);
      
      // Calculate dynamic zoom early (needed for mouse aiming)
      const isSprinting = state.player.sprintTime > 0;
      const baseZoom = isMobileRef.current ? ZOOM_LEVEL * PHONE_ZOOM_MULTIPLIER : ZOOM_LEVEL;
      const dynamicZoom = isSprinting ? baseZoom * 0.92 : baseZoom; // 8% wider when sprinting, closer on phones
      
      // Update Player 1 (Me) - Handle both touch and mouse controls
      const dash = inputRef.current.dash;
      
      // Handle weapon switching
      if (inputRef.current.weaponSwitch !== 0 && state.player.inventory && state.player.inventory.length > 1) {
        // Save current weapon state to inventory
        const currentInvIndex = state.player.inventory.findIndex(inv => inv.weapon === state.player.weapon);
        if (currentInvIndex >= 0) {
          state.player.inventory[currentInvIndex].ammo = state.player.ammo;
          state.player.inventory[currentInvIndex].totalAmmo = state.player.totalAmmo;
        }
        
        // Find next weapon index
        let nextIndex = currentInvIndex + inputRef.current.weaponSwitch;
        if (nextIndex < 0) nextIndex = state.player.inventory.length - 1;
        if (nextIndex >= state.player.inventory.length) nextIndex = 0;
        
        // Switch to new weapon
        const nextWeapon = state.player.inventory[nextIndex];
        state.player.weapon = nextWeapon.weapon;
        state.player.ammo = nextWeapon.ammo;
        state.player.totalAmmo = nextWeapon.totalAmmo;
        state.player.isReloading = false;
        
        // Reset weapon switch input
        inputRef.current.weaponSwitch = 0;
      }
      
      // Use aim vector directly (works for both joystick and click-drag mouse)
      let finalAim = aim;
      
      // Update player angle based on aim direction
      const aimMag = Math.sqrt(aim.x * aim.x + aim.y * aim.y);
      if (aimMag > 0.1) {
        state.player.angle = Math.atan2(aim.y, aim.x);
      }
      
      const p1Fire = updateEntity(state.player, move, finalAim, sprint, dash, null, dt, now);
      
      // Fire when mouse button is pressed OR joystick auto-fire
      const shouldFire = inputRef.current.fire === true || p1Fire;
      
      if (shouldFire && !state.player.isReloading && now - state.player.lastFired > WEAPONS[state.player.weapon].fireRate) {
          fireWeapon(state.player, now);
      }

      // Update Player 2 (Bot or Client) - Skip in Survival mode
      const bot = state.bot;
      let p2Fire = false;

      if (network && isHost) {
          // Multiplayer Opponent
          const remote = state.remoteInput;
          // Apply remote inputs
          p2Fire = updateEntity(bot, remote.move, remote.aim, remote.sprint, false, remote.angle, dt, now);
          if (remote.fire) p2Fire = true;
      } else if (gameMode === GameMode.PvP) {
          // Bot Logic (only in PvP mode)
          const distToPlayer = getDistance(bot.position, state.player.position);
          const angleToPlayer = getAngle(bot.position, state.player.position);
          const weaponRange = WEAPONS[bot.weapon].range;
          let botMove = { x: 0, y: 0 };
          
          // Enhanced Bot AI with advanced tactics
          const isLowHealth = bot.hp < 40;
          const isCriticalHealth = bot.hp < 20;
          const playerIsLowHealth = state.player.hp < 30;
          
          // Seek nearby health/armor when low
          let targetLoot = null;
          if (isLowHealth || bot.armor < 25) {
            let nearestDist = Infinity;
            state.loot.forEach((item: LootItem) => {
              if (item.type === ItemType.Medkit || item.type === ItemType.Shield) {
                const dist = getDistance(bot.position, item.position);
                if (dist < BOT_LOOT_SEARCH_RADIUS && dist < nearestDist) {
                  nearestDist = dist;
                  targetLoot = item;
                }
              }
            });
          }
          
          // Aggressive behavior when player is weak
          const shouldPressAdvantage = playerIsLowHealth && bot.hp > 50;
          
          if (targetLoot && isCriticalHealth) {
            // Desperately seek health with unpredictable movement
            const lootAngle = getAngle(bot.position, targetLoot.position);
            const dodgeOffset = Math.sin(now / 200) * 0.4;
            botMove = { x: Math.cos(lootAngle + dodgeOffset), y: Math.sin(lootAngle + dodgeOffset) };
          } else if (isLowHealth && distToPlayer < 600 && !shouldPressAdvantage) {
              // Flee while low health, with evasive zigzag movement
              const fleeAngle = angleToPlayer + Math.PI + (Math.sin(now / 250) * 0.7); 
              const zigzag = Math.sin(now / 150) * 0.5;
              botMove = { x: Math.cos(fleeAngle + zigzag), y: Math.sin(fleeAngle + zigzag) };
          } else {
              // Advanced combat tactics based on weapon and situation
              const strafeDir = Math.sin(now / 1200) > 0 ? 1 : -1;
              const optimalRange = shouldPressAdvantage ? weaponRange * 0.5 : weaponRange * 0.6;
              
              if (distToPlayer > optimalRange + 150) {
                 // Aggressive approach with unpredictable weaving
                 const approachAngle = angleToPlayer + Math.sin(now / 800) * 0.35;
                 const weave = Math.cos(now / 600) * 0.15;
                 botMove = { x: Math.cos(approachAngle + weave), y: Math.sin(approachAngle + weave) };
              } else if (distToPlayer < optimalRange - 100 && !shouldPressAdvantage) {
                 // Tactical retreat while maintaining line of sight
                 const retreatAngle = angleToPlayer + Math.PI + Math.sin(now / 600) * 0.25;
                 botMove = { x: Math.cos(retreatAngle), y: Math.sin(retreatAngle) };
              } else {
                 // Dynamic circle strafe with varied patterns
                 const strafeSpeed = shouldPressAdvantage ? 0.3 : 0.2;
                 const strafeAngle = angleToPlayer + (Math.PI / 2 * strafeDir) + Math.sin(now / 400) * strafeSpeed;
                 botMove = { x: Math.cos(strafeAngle), y: Math.sin(strafeAngle) };
              }
          }
          
          // Unstuck logic
          const currentSpeed = Math.sqrt(bot.velocity.x**2 + bot.velocity.y**2);
          if (currentSpeed < 20 && (Math.abs(botMove.x) > 0.1 || Math.abs(botMove.y) > 0.1)) {
               const escapeAngle = (now / 400) * Math.PI * 2; 
               botMove = { x: Math.cos(escapeAngle), y: Math.sin(escapeAngle) };
          }
          
          // Lead target for better accuracy (predict player movement)
          const leadAmount = distToPlayer / WEAPONS[bot.weapon].speed * BOT_LEAD_FACTOR;
          const velMagnitude = Math.sqrt(state.player.velocity.x**2 + state.player.velocity.y**2);
          const leadOffset = velMagnitude > 0 ? (velMagnitude * leadAmount * BOT_LEAD_MULTIPLIER) : 0;
          bot.angle = angleToPlayer + leadOffset; 
          
          // Improved firing logic with burst control
          const botFireRateMod = bot.weapon === WeaponType.Pistol ? 2.0 : 1.1; 
          const canFire = distToPlayer < weaponRange * 1.1 && !bot.isReloading;
          const hasLineOfSight = distToPlayer < weaponRange;
          
          if (canFire && hasLineOfSight) {
            if (now - bot.lastFired > WEAPONS[bot.weapon].fireRate * botFireRateMod) {
              // Add slight randomness to firing based on bot accuracy
              if (Math.random() < BOT_ACCURACY) p2Fire = true;
            }
          }
          
          updateEntity(bot, botMove, null, (isLowHealth || distToPlayer > 600) && bot.sprintCooldown <= 0, false, null, dt, now);
      }

      if (p2Fire && !bot.isReloading) {
           fireWeapon(bot, now);
      }

      // Survival Mode: Update zombies and wave management
      if ((gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) && !network) {
        // Wave management
        if (!state.isWaveActive && state.preparationTimeRemaining > 0) {
          state.preparationTimeRemaining -= dt * 1000;
          if (state.preparationTimeRemaining <= 0) {
            startWave();
          }
        } else if (!state.isWaveActive && state.preparationTimeRemaining <= 0 && state.currentWave === 0) {
          // Start first wave immediately
          startWave();
        }
        
        // Update all zombies
        for (let i = state.zombies.length - 1; i >= 0; i--) {
          const zombie = state.zombies[i];
          
          // Check if zombie is dead
          if (zombie.hp <= 0) {
            // Add large explosion effect on death
            if (particlePoolRef.current) {
              createExplosion(
                particlePoolRef.current,
                new THREE.Vector3(zombie.position.x, zombie.position.y, 50),
                new THREE.Color('#00ff00'),
                30 // Larger explosion for death
              );
            }
            dropZombieLoot(zombie);
            state.zombies.splice(i, 1);
            state.zombiesRemaining--;
            state.zombiesKilled++;
            continue;
          }
          
          // Ensure zombie has damage value (fix for missing damage)
          if (!zombie.zombieDamage) {
            zombie.zombieDamage = WAVE_BASE_ZOMBIE_DAMAGE;
          }
          if (!zombie.zombieSpeed) {
            zombie.zombieSpeed = WAVE_BASE_ZOMBIE_SPEED;
          }
          
          // First, check if zombie is stuck inside a wall and push it out
          for (const wall of state.walls) {
            if (checkWallCollision(zombie, wall)) {
              // Push zombie out of wall
              if (wall.isCircular) {
                const dist = getDistance(zombie.position, wall.position);
                if (dist < zombie.radius + wall.radius && dist > 0) {
                  const pushAngle = getAngle(wall.position, zombie.position);
                  const pushDist = (zombie.radius + wall.radius) - dist + 5; // Push out with buffer
                  zombie.position.x += Math.cos(pushAngle) * pushDist;
                  zombie.position.y += Math.sin(pushAngle) * pushDist;
                }
              } else {
                // Rectangular wall - push to closest edge
                const closestX = Math.max(wall.position.x, Math.min(zombie.position.x, wall.position.x + wall.width));
                const closestY = Math.max(wall.position.y, Math.min(zombie.position.y, wall.position.y + wall.height));
                const dx = zombie.position.x - closestX;
                const dy = zombie.position.y - closestY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < zombie.radius && dist > 0) {
                  const pushDist = zombie.radius - dist + 5;
                  zombie.position.x += (dx / dist) * pushDist;
                  zombie.position.y += (dy / dist) * pushDist;
                }
              }
            }
          }
          
          // Enhanced Zombie AI: Intelligent chase with obstacle avoidance
          const distToPlayer = getDistance(zombie.position, state.player.position);
          const angleToPlayer = getAngle(zombie.position, state.player.position);
          const zombieSpeed = zombie.zombieSpeed;
          
          // Update zombie angle to face player
          zombie.angle = angleToPlayer;
          
          // Enhanced movement with prediction and obstacle awareness
          let moved = false;
          const moveSpeed = zombieSpeed * dt;
          
          // If very close, use bounce-back collision resolution
          for (const wall of state.walls) {
            if (checkWallCollision(zombie, wall)) {
              resolveWallCollision(zombie, wall);
            }
          }
          
          // Strategy 1: Direct movement with lookahead (predictive collision)
          const lookaheadDist = moveSpeed * 1.5; // Check further ahead
          let testX = zombie.position.x + Math.cos(angleToPlayer) * lookaheadDist;
          let testY = zombie.position.y + Math.sin(angleToPlayer) * lookaheadDist;
          let canMoveDirect = true;
          let nearestWall: Wall | null = null;
          let minDist = Infinity;
          
          for (const wall of state.walls) {
            if (checkWallCollision({ ...zombie, position: { x: testX, y: testY } }, wall)) {
              canMoveDirect = false;
              const wallDist = getDistance(zombie.position, wall.position);
              if (wallDist < minDist) {
                minDist = wallDist;
                nearestWall = wall;
              }
            }
          }
          
          if (canMoveDirect) {
            // Safe to move directly
            zombie.position.x += Math.cos(angleToPlayer) * moveSpeed;
            zombie.position.y += Math.sin(angleToPlayer) * moveSpeed;
            moved = true;
          } else if (nearestWall) {
            // Strategy 2: Try sliding along walls (separate X and Y)
            const testXOnly = zombie.position.x + Math.cos(angleToPlayer) * moveSpeed;
            const testYOnly = zombie.position.y + Math.sin(angleToPlayer) * moveSpeed;
            let canMoveX = true;
            let canMoveY = true;
            
            for (const wall of state.walls) {
              if (checkWallCollision({ ...zombie, position: { x: testXOnly, y: zombie.position.y } }, wall)) {
                canMoveX = false;
                break;
              }
            }
            
            for (const wall of state.walls) {
              if (checkWallCollision({ ...zombie, position: { x: zombie.position.x, y: testYOnly } }, wall)) {
                canMoveY = false;
                break;
              }
            }
            
            if (canMoveX) {
              zombie.position.x = testXOnly;
              moved = true;
            }
            if (canMoveY) {
              zombie.position.y = testYOnly;
              moved = true;
            }
            
            // Strategy 3: Wall-following behavior (slide along obstacles)
            if (!moved && nearestWall) {
              // Calculate perpendicular direction to wall
              const wallAngle = getAngle(nearestWall.position, zombie.position);
              const alternateAngles = [
                wallAngle + Math.PI / 2, // Perpendicular right
                wallAngle - Math.PI / 2, // Perpendicular left
                angleToPlayer + Math.PI / 3,
                angleToPlayer - Math.PI / 3,
                angleToPlayer + Math.PI / 2,
                angleToPlayer - Math.PI / 2,
                wallAngle // Away from wall
              ];
              
              for (const altAngle of alternateAngles) {
                const altTestX = zombie.position.x + Math.cos(altAngle) * moveSpeed * 0.8;
                const altTestY = zombie.position.y + Math.sin(altAngle) * moveSpeed * 0.8;
                
                let canMoveAlt = true;
                for (const wall of state.walls) {
                  if (checkWallCollision({ ...zombie, position: { x: altTestX, y: altTestY } }, wall)) {
                    canMoveAlt = false;
                    break;
                  }
                }
                
                if (canMoveAlt) {
                  zombie.position.x = altTestX;
                  zombie.position.y = altTestY;
                  moved = true;
                  break;
                }
              }
            }
          }
          
          // Update velocity for rendering (ensure valid values)
          zombie.velocity.x = Math.cos(angleToPlayer || 0) * (zombieSpeed || WAVE_BASE_ZOMBIE_SPEED);
          zombie.velocity.y = Math.sin(angleToPlayer || 0) * (zombieSpeed || WAVE_BASE_ZOMBIE_SPEED);
          
          // Ensure velocity is valid (prevent NaN/Infinity)
          if (isNaN(zombie.velocity.x) || !isFinite(zombie.velocity.x)) zombie.velocity.x = 0;
          if (isNaN(zombie.velocity.y) || !isFinite(zombie.velocity.y)) zombie.velocity.y = 0;
          
          // Clamp position to valid range to prevent "ghost" positions outside map
          const oldX = zombie.position.x;
          const oldY = zombie.position.y;
          zombie.position.x = Math.max(zombie.radius, Math.min(MAP_SIZE - zombie.radius, zombie.position.x));
          zombie.position.y = Math.max(zombie.radius, Math.min(MAP_SIZE - zombie.radius, zombie.position.y));
          
          // Ensure position is valid (prevent NaN/Infinity)
          if (isNaN(zombie.position.x) || !isFinite(zombie.position.x)) {
            zombie.position.x = MAP_SIZE / 2;
          }
          if (isNaN(zombie.position.y) || !isFinite(zombie.position.y)) {
            zombie.position.y = MAP_SIZE / 2;
          }
          
          // If boundary check moved zombie, verify it's not in a wall
          if (zombie.position.x !== oldX || zombie.position.y !== oldY) {
            for (const wall of state.walls) {
              if (checkWallCollision(zombie, wall)) {
                // Push back to old position if boundary check put us in a wall
                zombie.position.x = oldX;
                zombie.position.y = oldY;
                break;
              }
            }
          }
          
          // Prevent zombies from stacking on player - push them away (with validation)
          const distNow = getDistance(zombie.position, state.player.position);
          if (isFinite(distNow) && distNow > 0) {
            // Min distance should be less than ZOMBIE_MELEE_RANGE so zombies can attack
            const minDist = zombie.radius + state.player.radius - 5; // Allow zombies to get close enough to attack
            if (distNow < minDist) {
              // Push zombie away from player
              const pushAngle = getAngle(state.player.position, zombie.position);
              const pushStrength = Math.min((minDist - distNow) * ZOMBIE_COLLISION_PUSH, 10); // Reduced push
              zombie.position.x += Math.cos(pushAngle) * pushStrength;
              zombie.position.y += Math.sin(pushAngle) * pushStrength;
              
              // Validate position after push
              if (isNaN(zombie.position.x) || !isFinite(zombie.position.x)) {
                zombie.position.x = state.player.position.x + Math.cos(pushAngle) * minDist;
              }
              if (isNaN(zombie.position.y) || !isFinite(zombie.position.y)) {
                zombie.position.y = state.player.position.y + Math.sin(pushAngle) * minDist;
              }
            }
          }
          
          // Prevent zombies from stacking on each other (with validation)
          for (let j = i + 1; j < state.zombies.length; j++) {
            const otherZombie = state.zombies[j];
            if (!otherZombie || !otherZombie.position) continue;
            
            const zombieDist = getDistance(zombie.position, otherZombie.position);
            if (isFinite(zombieDist) && zombieDist > 0) {
              const minZombieDist = zombie.radius + otherZombie.radius + 10;
              if (zombieDist < minZombieDist) {
                // Push zombies apart
                const pushAngle = getAngle(otherZombie.position, zombie.position);
                const pushStrength = Math.min((minZombieDist - zombieDist) * (ZOMBIE_COLLISION_PUSH * 0.5), 15);
                zombie.position.x += Math.cos(pushAngle) * pushStrength;
                zombie.position.y += Math.sin(pushAngle) * pushStrength;
                otherZombie.position.x -= Math.cos(pushAngle) * pushStrength;
                otherZombie.position.y -= Math.sin(pushAngle) * pushStrength;
                
                // Validate positions after push
                if (isNaN(zombie.position.x) || !isFinite(zombie.position.x)) {
                  zombie.position.x = otherZombie.position.x + Math.cos(pushAngle) * minZombieDist;
                }
                if (isNaN(zombie.position.y) || !isFinite(zombie.position.y)) {
                  zombie.position.y = otherZombie.position.y + Math.sin(pushAngle) * minZombieDist;
                }
                if (isNaN(otherZombie.position.x) || !isFinite(otherZombie.position.x)) {
                  otherZombie.position.x = zombie.position.x - Math.cos(pushAngle) * minZombieDist;
                }
                if (isNaN(otherZombie.position.y) || !isFinite(otherZombie.position.y)) {
                  otherZombie.position.y = zombie.position.y - Math.sin(pushAngle) * minZombieDist;
                }
              }
            }
          }
          
          // Melee attack when close - zombies deal damage to player
          const currentDist = getDistance(zombie.position, state.player.position);
          if (currentDist < ZOMBIE_MELEE_RANGE + zombie.radius && now - zombie.lastFired > 800) {
            zombie.lastFired = now;
            const zombieDamage = zombie.zombieDamage || WAVE_BASE_ZOMBIE_DAMAGE;
            
            // Play zombie attack sound
            playZombieAttackSound();
            
            // Deal damage to player
            if (state.player.invulnerable <= 0) {
              // Handle armor damage with overflow to HP
              if (state.player.armor > 0) {
                const armorAbsorb = Math.min(state.player.armor, zombieDamage * 0.5);
                state.player.armor = Math.max(0, state.player.armor - armorAbsorb);
                const remainingDamage = zombieDamage - armorAbsorb;
                if (remainingDamage > 0) {
                  state.player.hp = Math.max(0, state.player.hp - remainingDamage);
                }
              } else {
                state.player.hp = Math.max(0, state.player.hp - zombieDamage);
              }
              state.player.lastDamageTime = now;
              state.player.regenTimer = 0;
              playHitSound();
              
              // Add 3D explosion particle effect on hit
              if (particlePoolRef.current) {
                createExplosion(
                  particlePoolRef.current,
                  new THREE.Vector3(state.player.position.x, state.player.position.y, 40),
                  new THREE.Color('#ff4444')
                );
                // TODO: createDamageNumber needs scene reference
                // createDamageNumber(
                //   particlePoolRef.current,
                //   { x: state.player.position.x, y: state.player.position.y, z: 80 },
                //   Math.floor(zombieDamage),
                //   '#ff0000'
                // );
              }
              
              // Add visual feedback
              state.hitMarkers.push({
                x: state.player.position.x,
                y: state.player.position.y,
                life: 600,
                maxLife: 600,
                damage: zombieDamage,
                vx: (Math.random() - 0.5) * 20,
                vy: -50 - Math.random() * 30
              });
            }
          }
        }
        
        // Check if wave is complete
        if (state.isWaveActive && state.zombiesRemaining === 0 && state.zombies.length === 0) {
          completeWave();
        }
      }

      // Bullets
      updateBullets(state, dt, now);

      // Update Visual Effects
      updateVisualEffects(state, dt);

      // Loot
      updateLoot(state);
      // Zone check removed

      // Game Over Check - ensure HP is clamped and check properly
      // Clamp HP to prevent negative values
      state.player.hp = Math.max(0, Math.min(state.player.hp, state.player.maxHp));
      if (gameMode === GameMode.PvP) {
        state.bot.hp = Math.max(0, Math.min(state.bot.hp, state.bot.maxHp));
      }
      
      if (state.player.hp <= 0 && !state.gameOver) { 
        state.gameOver = true;
        // Add large explosion effect on player death
        if (particlePoolRef.current) {
          createExplosion(
            particlePoolRef.current,
            new THREE.Vector3(state.player.position.x, state.player.position.y, 60),
            new THREE.Color('#ff0000'),
            40 // Large explosion for player death
          );
        }
        playDeathSound(); 
        onGameOver('Bot'); 
        if(network) {
          try {
            network.send(NetworkMsgType.GameOver, 'Bot');
          } catch (e) {
            console.error('Error sending game over message:', e);
          }
        }
      } 
      else if (gameMode === GameMode.PvP && state.bot.hp <= 0 && !state.gameOver) { 
        state.gameOver = true;
        // Add large explosion effect on bot death
        if (particlePoolRef.current) {
          createExplosion(
            particlePoolRef.current,
            new THREE.Vector3(state.bot.position.x, state.bot.position.y, 60),
            new THREE.Color('#ff4444'),
            40 // Large explosion for bot death
          );
        }
        onGameOver('Player'); 
        if(network) {
          try {
            network.send(NetworkMsgType.GameOver, 'Player');
          } catch (e) {
            console.error('Error sending game over message:', e);
          }
        }
      }

      // Sync State to Client
      // 30Hz Tick Rate (approx 33ms) to prevent flooding
      if (network && isHost && now - state.lastNetworkSync > 33) {
          state.lastNetworkSync = now;
          network.send(NetworkMsgType.State, {
              players: [state.player, state.bot],
              bullets: state.bullets,
              loot: state.loot,
              zoneRadius: state.zoneRadius,
              timeRemaining: elapsed // Just show elapsed time instead of zone timer
          } as StatePackage);
      }

      // Update UI (throttled to reduce re-renders)
      if (now - state.lastStatsUpdate > 100) {
        state.lastStatsUpdate = now;
        onUpdateStats(
            Math.ceil(state.player.hp), 
            state.player.ammo,
            state.player.totalAmmo,
            state.player.weapon, 
            Math.ceil(state.player.armor), 
            elapsed, // Show elapsed time instead of zone countdown
            Math.max(0, state.player.sprintCooldown),
            Math.max(0, state.player.dashCooldown),
            0, // speedBoost - not implemented yet
            0, // damageBoost - not implemented yet  
            0, // invincibility - not implemented yet
            state.currentWave,
            state.zombiesRemaining,
            Math.max(0, state.preparationTimeRemaining),
            state.player.inventory // Pass inventory for UI
        );
        
        // Update minimap
        onUpdateMinimap(
            state.player.position,
            state.bot.position,
            state.loot,
            state.zoneRadius
        );
      }

      // Render with dynamic FOV (no canvas needed)
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      
      // Use already calculated dynamicZoom from earlier
      
      const visibleW = viewportW / dynamicZoom;
      const visibleH = viewportH / dynamicZoom;
      
      // Camera directly centered on player - no look-ahead
      const targetCamX = state.player.position.x - visibleW / 2;
      const targetCamY = state.player.position.y - visibleH / 2;
      
      // Adaptive camera lerp - faster on desktop, slower on mobile
      const camereLerpFactor = isMobileRef.current ? CAMERA_LERP : (CAMERA_LERP * 1.5);
      state.camera.x = lerp(state.camera.x, targetCamX, camereLerpFactor);
      state.camera.y = lerp(state.camera.y, targetCamY, camereLerpFactor);
      
      // Clamp camera to valid bounds with extra margin
      const currentMapSize = state.mapSize || MAP_SIZE;
      state.camera.x = Math.max(-200, Math.min(state.camera.x, currentMapSize + 200 - visibleW));
      state.camera.y = Math.max(-200, Math.min(state.camera.y, currentMapSize + 200 - visibleH));

      // Update 3D renderer state directly (no 2D rendering needed)
      frameMonitorRef.current.startRender();
      const allPlayers = [state.player, state.bot];
      // Update 3D state via ref for immediate synchronization (no React state delay)
      gameStateFor3DRef.current = {
        walls: state.walls,
        players: allPlayers,
        lootItems: state.loot,
        bullets: state.bullets,
        zombies: (gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival) ? state.zombies : [],
        damageNumbers: state.damageNumbers || [],
        cameraPosition: state.camera,
        cameraAngle: state.player.angle,
        zoom: dynamicZoom
      };
      frameMonitorRef.current.endRender();
      
      frameMonitorRef.current.startThreeD();
      // 3D update happens asynchronously via state change
      frameMonitorRef.current.endThreeD();
    };

    // Helpers
    // Enhanced collision resolution with bounce-back to prevent sticking
    const resolveWallCollision = (entity: Player, wall: Wall) => {
      if (wall.isCircular) {
        // Circular wall collision - push away from center
        const dx = entity.position.x - wall.position.x;
        const dy = entity.position.y - wall.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < entity.radius + wall.radius) {
          const overlap = entity.radius + wall.radius - dist;
          const bounceForce = 1.2; // Bounce back slightly more to prevent sticking
          entity.position.x += (dx / dist) * overlap * bounceForce;
          entity.position.y += (dy / dist) * overlap * bounceForce;
          // Reduce velocity in collision direction
          entity.velocity.x *= 0.5;
          entity.velocity.y *= 0.5;
        }
      } else {
        // Rectangular wall collision
        const closestX = Math.max(wall.position.x, Math.min(entity.position.x, wall.position.x + wall.width));
        const closestY = Math.max(wall.position.y, Math.min(entity.position.y, wall.position.y + wall.height));
        const dx = entity.position.x - closestX;
        const dy = entity.position.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < entity.radius) {
          const overlap = entity.radius - dist;
          const bounceForce = 1.3; // Stronger bounce for rectangular walls
          entity.position.x += (dx / dist) * overlap * bounceForce;
          entity.position.y += (dy / dist) * overlap * bounceForce;
          // Dampen velocity
          entity.velocity.x *= 0.4;
          entity.velocity.y *= 0.4;
        }
      }
    };
    
    const fireWeapon = (entity: Player, now: number) => {
        const state = gameState.current;
        if (entity.ammo > 0) {
          entity.lastFired = now;
          entity.ammo--;
          const weapon = WEAPONS[entity.weapon];
          const spreadAngle = (Math.random() - 0.5) * weapon.spread;
          const finalAngle = entity.angle + spreadAngle;
          const pellets = entity.weapon === WeaponType.Shotgun ? 5 : 1;
          
          // Play shooting sound
          if (entity.id === state.player.id) {
            playShootSound(entity.weapon);
            
            // Low ammo warning sound (3 bullets left)
            if (entity.ammo === 3 && entity.totalAmmo === 0) {
              setTimeout(() => playLowAmmoSound(), 100);
            }
          }
          
          // Enhanced muzzle flash effect with particles
          state.muzzleFlashes.push({
            x: entity.position.x,
            y: entity.position.y,
            angle: entity.angle,
            life: MUZZLE_FLASH_DURATION
          });
          
          // Add muzzle smoke particles
          const smokeCount = isMobileRef.current ? 2 : 3; // Reduce particles on mobile
          for (let i = 0; i < smokeCount; i++) {
            const smokeAngle = entity.angle + (Math.random() - 0.5) * 0.3;
            const smokeSpeed = 60 + Math.random() * 40;
            addParticle(state, {
              x: entity.position.x + Math.cos(entity.angle) * 25,
              y: entity.position.y + Math.sin(entity.angle) * 25,
              vx: Math.cos(smokeAngle) * smokeSpeed,
              vy: Math.sin(smokeAngle) * smokeSpeed,
              life: 400,
              maxLife: 400,
              color: ['#64748b', '#475569'][Math.floor(Math.random() * 2)],
              size: 3 + Math.random() * 2
            });
          }
          
          // Add 3D bullet trail particle effect
          if (particlePoolRef.current) {
            const muzzleX = entity.position.x + Math.cos(entity.angle) * 30;
            const muzzleY = entity.position.y + Math.sin(entity.angle) * 30;
            const dirX = Math.cos(entity.angle);
            const dirY = Math.sin(entity.angle);
            
            // Convert to THREE.Vector3 for particle system
            const fromVec = new THREE.Vector3(muzzleX, muzzleY, 50);
            const toVec = new THREE.Vector3(muzzleX + dirX * weapon.range, muzzleY + dirY * weapon.range, 50);
            
            createBulletTrail(
              particlePoolRef.current,
              fromVec,
              toVec,
              weapon.color
            );
          }
          
          for(let i=0; i<pellets; i++) {
            const pAngle = finalAngle + (Math.random() - 0.5) * (entity.weapon === WeaponType.Shotgun ? 0.3 : 0);
             state.bullets.push({
              id: `b-${entity.id}-${now}-${i}`,
              ownerId: entity.id,
              position: { ...entity.position },
              radius: BULLET_RADIUS,
              velocity: {
                x: Math.cos(pAngle) * weapon.speed,
                y: Math.sin(pAngle) * weapon.speed
              },
              damage: weapon.damage,
              rangeRemaining: weapon.range,
              color: weapon.color,
              weaponType: entity.weapon
            });
          }
          // Auto-reload when clip is empty (only if we have reserve ammo)
          if (entity.ammo === 0 && entity.totalAmmo > 0) { 
            entity.isReloading = true; 
            entity.reloadTimer = now + weapon.reloadTime; 
            if (entity.id === state.player.id) playReloadSound();
          }
        } else {
            entity.isReloading = true; 
            entity.reloadTimer = now + WEAPONS[entity.weapon].reloadTime;
            if (entity.id === state.player.id) playReloadSound();
        }
    };

    const updateBullets = (state: any, dt: number, now: number) => {
      for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.position.x += b.velocity.x * dt;
        b.position.y += b.velocity.y * dt;
        b.rangeRemaining -= Math.sqrt(b.velocity.x**2 + b.velocity.y**2) * dt;
        let remove = false;
        
        // Check wall collision
        for(const w of state.walls) { 
          if (checkWallCollision(b, w)) {
            // Enhanced impact particles on wall hit
            const impactAngle = Math.atan2(b.velocity.y, b.velocity.x);
            const impactParticleCount = isMobileRef.current ? 2 : 4; // Reduce on mobile
            for (let j = 0; j < impactParticleCount; j++) {
              const spreadAngle = impactAngle + Math.PI + (Math.random() - 0.5) * Math.PI;
              const speed = 150 + Math.random() * 120;
              addParticle(state, {
                x: b.position.x,
                y: b.position.y,
                vx: Math.cos(spreadAngle) * speed,
                vy: Math.sin(spreadAngle) * speed,
                life: 500,
                maxLife: 500,
                color: ['#9ca3af', '#64748b', '#475569'][Math.floor(Math.random() * 3)],
                size: 2 + Math.random() * 2
              });
            }
            // Add spark effect
            addParticle(state, {
              x: b.position.x,
              y: b.position.y,
              vx: Math.cos(impactAngle + Math.PI) * 100,
              vy: Math.sin(impactAngle + Math.PI) * 100,
              life: 300,
              maxLife: 300,
              color: '#fbbf24',
              size: 3
            });
            remove = true;
          }
        }
        
        // Check collision with PvP bot or player
        const target = b.ownerId === state.player.id ? state.bot : state.player;
        if (!remove && checkCircleCollision(b, target)) {
          // Properly handle armor damage with overflow to HP
          if (target.armor > 0) {
            const armorDamage = Math.min(target.armor, b.damage);
            target.armor = Math.max(0, target.armor - armorDamage);
            const remainingDamage = b.damage - armorDamage;
            if (remainingDamage > 0) {
              target.hp = Math.max(0, target.hp - remainingDamage);
            }
          } else {
            target.hp = Math.max(0, target.hp - b.damage);
          }
          target.lastDamageTime = now;
          target.regenTimer = 0; 
          
          // Play hit sound (only for player being hit)
          if (target.id === state.player.id) {
            playHitSound(b.damage >= 40); // Critical hit sound for high damage
          }
          
          // Add 3D explosion particle effect on hit
          if (particlePoolRef.current) {
            createExplosion(
              particlePoolRef.current,
              new THREE.Vector3(b.position.x, b.position.y, 40),
              new THREE.Color('#ff4444')
            );
            // TODO: createDamageNumber needs scene reference
            // createDamageNumber(
            //   particlePoolRef.current,
            //   { x: target.position.x, y: target.position.y, z: 80 },
            //   Math.floor(b.damage),
            //   b.damage >= 40 ? '#ffaa00' : '#ff0000'
            // );
          }
          
          // Add hit marker with improved animation
          state.hitMarkers.push({
            x: b.position.x,
            y: b.position.y,
            life: 800, // Longer duration (was 500)
            maxLife: 800,
            damage: b.damage,
            vx: (Math.random() - 0.5) * 30, // Slight horizontal drift
            vy: -60 - Math.random() * 40 // Float upward
          });
          
          // Enhanced blood/impact particles with better physics
          const impactDir = Math.atan2(b.velocity.y, b.velocity.x);
          const bloodParticleCount = isMobileRef.current ? 3 : 5; // Reduce on mobile
          for (let j = 0; j < bloodParticleCount; j++) {
            const spreadAngle = impactDir + (Math.random() - 0.5) * Math.PI * 0.6;
            const speed = 200 + Math.random() * 150;
            addParticle(state, {
              x: b.position.x,
              y: b.position.y,
              vx: Math.cos(spreadAngle) * speed,
              vy: Math.sin(spreadAngle) * speed,
              life: 600,
              maxLife: 600,
              color: ['#ef4444', '#dc2626', '#b91c1c'][Math.floor(Math.random() * 3)],
              size: 2.5 + Math.random() * 1.5
            });
          }
          // Add impact flash
          addParticle(state, {
            x: b.position.x,
            y: b.position.y,
            vx: 0,
            vy: 0,
            life: 200,
            maxLife: 200,
            color: '#fef3c7',
            size: 6
          });
          
          if (!network && target.isBot) { // Drop loot logic
              if (Math.random() < 0.15) {
                   const dropTypes = [ItemType.Medkit, ItemType.Ammo];
                   const dropType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
                   state.loot.push({ id: `loot-drop-${now}-${i}`, position: { x: target.position.x + randomRange(-30, 30), y: target.position.y + randomRange(-30, 30) }, radius: 15, type: dropType, value: dropType === ItemType.Medkit ? 25 : 0 });
              }
          }
          remove = true;
        }
        
        // Check collision with zombies in survival mode
        if (!remove && state.zombies) {
          for (let z = 0; z < state.zombies.length; z++) {
            const zombie = state.zombies[z];
            if (b.ownerId === state.player.id && checkCircleCollision(b, zombie)) {
              zombie.hp -= b.damage;
              zombie.lastDamageTime = now;
              
              // Add red blood splash particle effect on zombie hit
              if (particlePoolRef.current) {
                // Red blood splash
                createExplosion(
                  particlePoolRef.current,
                  new THREE.Vector3(b.position.x, b.position.y, 40),
                  new THREE.Color('#cc0000'),
                  0.8
                );
              }
              
              // Add floating damage number
              state.damageNumbers = state.damageNumbers || [];
              state.damageNumbers.push({
                x: zombie.position.x,
                y: zombie.position.y,
                damage: Math.floor(b.damage),
                life: 1000,
                maxLife: 1000,
                vy: -80,
                color: '#ffff00'
              });
              
              // Add hit marker
              state.hitMarkers.push({
                x: b.position.x,
                y: b.position.y,
                life: 800,
                maxLife: 800,
                damage: b.damage,
                vx: (Math.random() - 0.5) * 30,
                vy: -60 - Math.random() * 40
              });
              
              // Green blood particles for zombies
              const impactDir = Math.atan2(b.velocity.y, b.velocity.x);
              const bloodParticleCount = isMobileRef.current ? 3 : 5;
              for (let j = 0; j < bloodParticleCount; j++) {
                const spreadAngle = impactDir + (Math.random() - 0.5) * Math.PI * 0.6;
                const speed = 200 + Math.random() * 150;
                addParticle(state, {
                  x: b.position.x,
                  y: b.position.y,
                  vx: Math.cos(spreadAngle) * speed,
                  vy: Math.sin(spreadAngle) * speed,
                  life: 600,
                  maxLife: 600,
                  color: ['#22c55e', '#16a34a', '#15803d'][Math.floor(Math.random() * 3)],
                  size: 2.5 + Math.random() * 1.5
                });
              }
              
              remove = true;
              break;
            }
          }
        }
        if (b.rangeRemaining <= 0) remove = true;
        if (remove) state.bullets.splice(i, 1);
      }
    };

    const updateVisualEffects = (state: any, dt: number) => {
      // Update particles
      for (let i = state.particles.length - 1; i >= 0; i--) {
        const p = state.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.95; // friction
        p.vy *= 0.95;
        p.life -= dt * 1000;
        if (p.life <= 0) state.particles.splice(i, 1);
      }
      
      // Update muzzle flashes
      for (let i = state.muzzleFlashes.length - 1; i >= 0; i--) {
        state.muzzleFlashes[i].life -= dt * 1000;
        if (state.muzzleFlashes[i].life <= 0) state.muzzleFlashes.splice(i, 1);
      }
      
      // Update hit markers
      for (let i = state.hitMarkers.length - 1; i >= 0; i--) {
        const marker = state.hitMarkers[i];
        marker.life -= dt * 1000;
        // Animate position for floating effect
        marker.x += (marker.vx || 0) * dt;
        marker.y += (marker.vy || 0) * dt;
        if (marker.vy !== undefined) marker.vy += 20 * dt; // Slight gravity/deceleration
        if (marker.life <= 0) state.hitMarkers.splice(i, 1);
      }
      
      // Update damage numbers (floating damage text)
      if (state.damageNumbers) {
        for (let i = state.damageNumbers.length - 1; i >= 0; i--) {
          const dmgNum = state.damageNumbers[i];
          dmgNum.life -= dt * 1000;
          dmgNum.y += dmgNum.vy * dt;
          dmgNum.vy += 100 * dt; // Slow down over time
          if (dmgNum.life <= 0) state.damageNumbers.splice(i, 1);
        }
      }
    };

    const updateLoot = (state: any) => {
        // Only host/single handles pickup logic logic, client just renders state.loot
        // Wait, Client sends Input, but if they walk over loot, Host needs to know?
        // Simple: Host checks collisions for both players.
        if (network && !isHost) return;

        [state.player, state.bot].forEach((p: Player) => {
            for (let i = state.loot.length - 1; i >= 0; i--) {
                const item = state.loot[i];
                if (checkCircleCollision(p, item)) {
                  let consumed = true;
                  if (item.type === ItemType.Medkit) {
                    if (p.hp < p.maxHp) {
                      p.hp = Math.min(Math.max(0, p.hp + item.value), p.maxHp); // Clamp to valid range
                      if (p.id === state.player.id) playPickupSound('Medkit');
                    } else consumed = false;
                  } else if (item.type === ItemType.MegaHealth) {
                    if (p.hp < p.maxHp) {
                      p.hp = Math.min(Math.max(0, p.hp + item.value), p.maxHp); // Clamp to valid range
                      if (p.id === state.player.id) playPickupSound('MegaHealth');
                    } else consumed = false;
                  } else if (item.type === ItemType.Shield) {
                    p.armor = Math.min(Math.max(0, p.armor + 50), 50); // Clamp to valid range
                    if (p.id === state.player.id) playPickupSound('Shield');
                  } else if (item.type === ItemType.Ammo) {
                    // Ammo pickup adds to reserve ammo for current weapon and all inventory weapons
                    p.totalAmmo = Math.min(p.totalAmmo + WEAPONS[p.weapon].clipSize * 2, WEAPONS[p.weapon].clipSize * 10);
                    // Also add ammo to inventory
                    if (p.inventory) {
                      const invItem = p.inventory.find(inv => inv.weapon === p.weapon);
                      if (invItem) {
                        invItem.totalAmmo = p.totalAmmo;
                      }
                    }
                    if (p.id === state.player.id) playPickupSound('Ammo');
                  } else if (item.type === ItemType.Weapon && item.weaponType) {
                    // Initialize inventory if not exists
                    if (!p.inventory) {
                      p.inventory = [{ weapon: p.weapon, ammo: p.ammo, totalAmmo: p.totalAmmo }];
                    }
                    
                    // Save current weapon state to inventory
                    const currentInvIndex = p.inventory.findIndex(inv => inv.weapon === p.weapon);
                    if (currentInvIndex >= 0) {
                      p.inventory[currentInvIndex].ammo = p.ammo;
                      p.inventory[currentInvIndex].totalAmmo = p.totalAmmo;
                    }
                    
                    // Check if we already have this weapon
                    const existingWeaponIndex = p.inventory.findIndex(inv => inv.weapon === item.weaponType);
                    if (existingWeaponIndex >= 0) {
                      // Already have this weapon, just add ammo
                      p.inventory[existingWeaponIndex].totalAmmo = Math.min(
                        p.inventory[existingWeaponIndex].totalAmmo + WEAPONS[item.weaponType!].clipSize * 2,
                        WEAPONS[item.weaponType!].clipSize * 10
                      );
                    } else {
                      // Add new weapon to inventory (max 3 weapons)
                      if (p.inventory.length < 3) {
                        p.inventory.push({
                          weapon: item.weaponType!,
                          ammo: WEAPONS[item.weaponType!].clipSize,
                          totalAmmo: WEAPONS[item.weaponType!].clipSize * 3
                        });
                      } else {
                        // Replace current weapon if inventory is full
                        const replaceIndex = p.inventory.findIndex(inv => inv.weapon === p.weapon);
                        if (replaceIndex >= 0) {
                          p.inventory[replaceIndex] = {
                            weapon: item.weaponType!,
                            ammo: WEAPONS[item.weaponType!].clipSize,
                            totalAmmo: WEAPONS[item.weaponType!].clipSize * 3
                          };
                        }
                      }
                    }
                    
                    // Switch to the new weapon
                    p.weapon = item.weaponType; 
                    p.ammo = WEAPONS[item.weaponType].clipSize; 
                    p.totalAmmo = WEAPONS[item.weaponType].clipSize * 3;
                    p.isReloading = false;
                    if (p.id === state.player.id) playPickupSound('Weapon');
                  }
                  if (consumed) state.loot.splice(i, 1);
                }
            }
        });
    };

    // Zone damage mechanic removed

    animationFrameId = requestAnimationFrame(runGameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isReady]); // Depend on isReady

  if (!isReady) {
    return (
      <div className="absolute inset-0 bg-black flex items-center justify-center text-white">
        <div className="animate-pulse text-2xl font-bold">Loading Game...</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* 3D Renderer - full 3D game rendering */}
      <Game3DRenderer
        walls={gameStateFor3DRef.current.walls}
        players={gameStateFor3DRef.current.players}
        lootItems={gameStateFor3DRef.current.lootItems}
        bullets={gameStateFor3DRef.current.bullets}
        zombies={gameStateFor3DRef.current.zombies}
        damageNumbers={gameStateFor3DRef.current.damageNumbers}
        cameraPosition={gameStateFor3DRef.current.cameraPosition}
        cameraAngle={gameStateFor3DRef.current.cameraAngle}
        zoom={gameStateFor3DRef.current.zoom}
        enabled={true}
        onParticlePoolReady={(pool) => { particlePoolRef.current = pool; }}
      />
    </div>
  );
};
