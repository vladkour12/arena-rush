import React, { useEffect, useRef, useState } from 'react';
import { Player, Bullet, LootItem, Wall, WeaponType, Vector2, ItemType, NetworkMsgType, InitPackage, InputPackage, StatePackage, SkinType, GameMode } from '../types';
import { WEAPONS, MAP_SIZE, TILE_SIZE, PLAYER_RADIUS, PLAYER_SPEED, BOT_SPEED, INITIAL_ZONE_RADIUS, SHRINK_START_TIME, SHRINK_DURATION, MIN_ZONE_RADIUS, LOOT_SPAWN_INTERVAL, ZOOM_LEVEL, CAMERA_LERP, SPRINT_MULTIPLIER, SPRINT_DURATION, SPRINT_COOLDOWN, DASH_MULTIPLIER, DASH_DURATION, DASH_COOLDOWN, MOVE_ACCEL, MOVE_DECEL, MOVE_TURN_ACCEL, STICK_AIM_TURN_SPEED, AUTO_FIRE_THRESHOLD, MAX_LOOT_ITEMS, BOT_MIN_SEPARATION_DISTANCE, BOT_ACCURACY, BOT_LOOT_SEARCH_RADIUS, ZONE_DAMAGE_PER_SECOND, HEALTH_REGEN_DELAY, HEALTH_REGEN_RATE, MUZZLE_FLASH_DURATION, BOT_LEAD_FACTOR, BOT_LEAD_MULTIPLIER, TARGET_FPS, MOBILE_SHADOW_BLUR_REDUCTION, MOBILE_MAX_PARTICLES, DESKTOP_MAX_PARTICLES, MOBILE_BULLET_TRAIL_LENGTH, MAP_BOUNDARY_PADDING, AIM_SNAP_RANGE, AIM_SNAP_ANGLE, AIM_SNAP_STRENGTH, AIM_SNAP_MAINTAIN_ANGLE, AIM_SNAP_AUTO_FIRE, AIM_SNAP_MIN_MAGNITUDE, LOOT_BOB_SPEED, LOOT_PULSE_SPEED, LOOT_BOB_AMOUNT, LOOT_PULSE_AMOUNT, LOOT_BASE_SCALE, BRICK_WIDTH, BRICK_HEIGHT, MORTAR_WIDTH, BULLET_RADIUS, LASER_COLLISION_CHECK_RADIUS, LASER_COLLISION_STEPS, WAVE_PREPARATION_TIME, WAVE_BASE_ZOMBIE_COUNT, WAVE_ZOMBIE_COUNT_INCREASE, WAVE_BASE_ZOMBIE_HP, WAVE_ZOMBIE_HP_INCREASE, WAVE_BASE_ZOMBIE_SPEED, WAVE_ZOMBIE_SPEED_INCREASE, WAVE_BASE_ZOMBIE_DAMAGE, WAVE_ZOMBIE_DAMAGE_INCREASE, WAVE_LOOT_MULTIPLIER_BASE, WAVE_LOOT_MULTIPLIER_INCREASE, WAVE_HEALTH_REWARD, WAVE_AMMO_REWARD, ZOMBIE_MELEE_RANGE, ZOMBIE_COLLISION_PUSH } from '../constants';
import { getDistance, getAngle, checkCircleCollision, checkWallCollision, randomRange, lerp, lerpAngle, isMobileDevice, getOptimizedDPR, hasLineOfSight } from '../utils/gameUtils';
import { NetworkManager } from '../utils/network';
import { initAudio, playShootSound, playHitSound, playDeathSound, playPickupSound, playReloadSound } from '../utils/sounds';
import { generateMap } from '../utils/mapGenerator';

interface GameCanvasProps {
  onGameOver: (winner: 'Player' | 'Bot') => void;
  onUpdateStats: (hp: number, ammo: number, totalAmmo: number, weapon: WeaponType, armor: number, time: number, sprint: number, dash: number, speedBoost?: number, damageBoost?: number, invincibility?: number, wave?: number, zombiesRemaining?: number, prepTime?: number) => void;
  onUpdateMinimap: (playerPos: Vector2, enemyPos: Vector2, loot: LootItem[], zoneRad: number) => void;
  inputRef: React.MutableRefObject<{ move: Vector2; aim: Vector2; sprint: boolean }>;
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false); // For client waiting for Init
  
  // FPS Control
  const frameTime = 1000 / TARGET_FPS;
  const lastFrameTimeRef = useRef(0);
  
  // Cache mobile device detection to avoid repeated DOM queries
  const isMobileRef = useRef(isMobileDevice());
  
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
  
  // Cache for static rendering elements
  const renderCache = useRef<{
    backgroundCanvas?: HTMLCanvasElement;
    gridCanvas?: HTMLCanvasElement;
    lastZoom?: number;
  }>({});

  const getViewportSize = () => {
    const vv = window.visualViewport;
    return {
      width: Math.floor(vv?.width ?? window.innerWidth),
      height: Math.floor(vv?.height ?? window.innerHeight)
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
      slowAmount: 0
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
    hitMarkers: [] as Array<{ x: number; y: number; life: number; damage: number }>,
    
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
        network.onMessage = (msg) => {
            if (msg.type === NetworkMsgType.Init) {
                const data = msg.payload as InitPackage;
                state.walls = data.walls;
                state.player.position = data.enemyStart; // Client is P2
                state.bot.position = data.playerStart;   // Host is P1 (Opponent)
                
                // Reset stats for Client
                state.player.hp = 100;
                state.player.weapon = WeaponType.Pistol;
                state.bot.hp = 100;
                state.bot.weapon = WeaponType.Pistol; // Host starts with Pistol too in PvP
                
                state.startTime = Date.now();
                setIsReady(true);
            } else if (msg.type === NetworkMsgType.State) {
                const data = msg.payload as StatePackage;
                // Client Render Logic -> Interpolate
                // P1 is Host (Bot slot), P2 is Client (Player slot)
                
                // Update ME (Authoritative override from host, or just reconcile)
                // For smooth movement, we might ignore position updates if delta is small, but for now simple sync
                // Actually, let's just sync for simplicity.
                const myAngle = state.player.angle; // PRESERVE LOCAL ANGLE
                
                state.player = data.players[1];
                state.player.angle = myAngle; // Keep local aim authoritative for visuals
                
                state.bot = data.players[0]; // Host is my opponent
                state.bullets = data.bullets;
                state.loot = data.loot;
                state.zoneRadius = data.zoneRadius;
                
                // Fix camera if snapped
                // Camera logic is independent
            }
        };
        return;
    }

    // Host or Single Player -> Generate Map using new map generator
    const walls = generateMap(); // Generates a random map type with varied layouts
    
    state.walls = walls;
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

    // Spawn players in opposite corners for better initial positioning
    let pPos = { x: MAP_SIZE * 0.2, y: MAP_SIZE * 0.2 };
    let bPos = { x: MAP_SIZE * 0.8, y: MAP_SIZE * 0.8 };
    
    // Retry spawns with improved safety checks
    let attempts = 0;
    while(!isSafe(pPos) && attempts < 50) {
      pPos = { x: randomRange(150, MAP_SIZE * 0.4), y: randomRange(150, MAP_SIZE * 0.4) };
      attempts++;
    }
    
    attempts = 0;
    while(!isSafe(bPos, pPos) && attempts < 50) {
      bPos = { x: randomRange(MAP_SIZE * 0.6, MAP_SIZE - 150), y: randomRange(MAP_SIZE * 0.6, MAP_SIZE - 150) };
      attempts++;
    }

    state.player.position = pPos;
    state.bot.position = bPos;
    
    // In PvP (Host), ensure both start fair
    if (isHost && network) {
        state.bot.isBot = false;
        state.bot.weapon = WeaponType.Pistol; // Reset bot weapon to fair start
        state.bot.ammo = WEAPONS[WeaponType.Pistol].clipSize;
        
        // Send Init
        network.send(NetworkMsgType.Init, {
            walls: walls,
            playerStart: pPos, // Host pos
            enemyStart: bPos,  // Client pos
            seed: 0
        } as InitPackage);

        network.onMessage = (msg) => {
            if (msg.type === NetworkMsgType.Input) {
                state.remoteInput = msg.payload as InputPackage;
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

  }, [network, isHost]);

  // Main Loop
  useEffect(() => {
    if (!isReady) return; // Wait for init

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
      
      // Health Regeneration
      if (entity.hp < entity.maxHp && entity.hp > 0) {
          entity.regenTimer += dt * 1000;
          if (entity.regenTimer >= HEALTH_REGEN_DELAY) {
              entity.hp = Math.min(entity.hp + HEALTH_REGEN_RATE, entity.maxHp);
              entity.regenTimer = 0; // Reset to allow next regen cycle
          }
      } else {
          entity.regenTimer = 0;
      }
      
      // Sprint
      if (entity.sprintTime > 0) entity.sprintTime -= dt * 1000;
      if (entity.sprintCooldown > 0) entity.sprintCooldown -= dt * 1000;

      if (wantSprint && entity.sprintCooldown <= 0 && entity.sprintTime <= 0) {
        entity.sprintTime = SPRINT_DURATION;
        entity.sprintCooldown = SPRINT_COOLDOWN;
      }
      
      const isSprinting = entity.sprintTime > 0;
      
      // Dash
      if (entity.dashTime > 0) entity.dashTime -= dt * 1000;
      if (entity.dashCooldown > 0) entity.dashCooldown -= dt * 1000;

      if (wantDash && entity.dashCooldown <= 0 && entity.dashTime <= 0) {
        entity.dashTime = DASH_DURATION;
        entity.dashCooldown = DASH_COOLDOWN;
      }
      
      const isDashing = entity.dashTime > 0;
      
      // Speed multiplier: dash overrides sprint
      entity.speedMultiplier = isDashing ? DASH_MULTIPLIER : (isSprinting ? SPRINT_MULTIPLIER : 1);

      // Physics
      const maxSpeed = (entity.isBot ? BOT_SPEED : PLAYER_SPEED) * entity.speedMultiplier;
      const targetVx = moveVec.x * maxSpeed;
      const targetVy = moveVec.y * maxSpeed;

      const ACCEL = isSprinting ? MOVE_ACCEL * 1.5 : MOVE_ACCEL;       
      const FRICTION = MOVE_DECEL; 
      const TURN_ACCEL = MOVE_TURN_ACCEL;

      const getFactor = (curr: number, target: number) => {
        if (Math.abs(target) < 10) return FRICTION;
        if (curr * target < 0) return TURN_ACCEL;
        return ACCEL;
      };

      const factorX = getFactor(entity.velocity.x, targetVx);
      const factorY = getFactor(entity.velocity.y, targetVy);

      entity.velocity.x = lerp(entity.velocity.x, targetVx, Math.min(dt * factorX, 1));
      entity.velocity.y = lerp(entity.velocity.y, targetVy, Math.min(dt * factorY, 1));

      if (Math.abs(entity.velocity.x) < 10) entity.velocity.x = 0;
      if (Math.abs(entity.velocity.y) < 10) entity.velocity.y = 0;

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
      
      // Apply movement with sliding
      if (!hitWallX) {
        entity.position.x = testX;
      } else {
        entity.velocity.x *= -0.1; // Small bounce for better feel
      }
      
      if (!hitWallY) {
        entity.position.y = testY;
      } else {
        entity.velocity.y *= -0.1; // Small bounce for better feel
      }
      
      // Sliding: if one axis is blocked, try to slide along the wall
      if (hitWallX && !hitWallY) {
        // Can't move X but can move Y, reduce X velocity for sliding feel
        entity.velocity.x *= 0.3;
      }
      if (hitWallY && !hitWallX) {
        // Can't move Y but can move X, reduce Y velocity for sliding feel
        entity.velocity.y *= 0.3;
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
             const aimMagnitude = Math.sqrt(aimVec.x**2 + aimVec.y**2);
             if (aimMagnitude > 0.1) {
                 let desiredAngle = Math.atan2(aimVec.y, aimVec.x);
                 
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
                 
                 // Faster turn speed for more responsive aiming
                 entity.angle = lerpAngle(entity.angle, desiredAngle, dt * STICK_AIM_TURN_SPEED);
                 
                 // Regular auto-fire threshold
                 if (!snapTarget && aimMagnitude > AUTO_FIRE_THRESHOLD) firing = true;
             } else {
                 // Not actively aiming with stick
                 if (Math.abs(moveVec.x) > 0.1 || Math.abs(moveVec.y) > 0.1) {
                     const moveAngle = Math.atan2(moveVec.y, moveVec.x);
                     entity.angle = lerpAngle(entity.angle, moveAngle, dt * 10);
                 }
                 // Lose snap when not aiming
                 state.aimSnapTarget = null;
             }
          } else {
              // No aim vector - lose snap
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
      
      const now = Date.now();
      
      // FPS throttling to target 30 FPS with high precision timing
      const elapsed_since_last_frame = now - lastFrameTimeRef.current;
      if (elapsed_since_last_frame < frameTime) {
        animationFrameId = requestAnimationFrame(runGameLoop);
        return;
      }
      
      // Update last frame time, accounting for any drift
      lastFrameTimeRef.current = now - (elapsed_since_last_frame % frameTime);
      
      const dt = Math.min((now - state.lastTime) / 1000, 0.1);
      state.lastTime = now;
      const elapsed = now - state.startTime;
      const { move, aim, sprint } = inputRef.current; // Local Input (mobile joysticks only)

      // Check for Resize (use optimized DPR for performance)
      const dpr = getOptimizedDPR();
      const rect = canvas.getBoundingClientRect();
      const targetWidth = Math.floor(rect.width * dpr);
      const targetHeight = Math.floor(rect.height * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
          canvas.width = targetWidth;
          canvas.height = targetHeight;
      }
      
      // --- CLIENT MODE ---
      if (network && !isHost) {
          // Client-Side Prediction: Aiming
          // Immediately apply local aim to local state for rendering
          const { aim, angle } = inputRef.current;
          
          // Re-calculate aim angle if using stick (same logic as updateEntity)
          if (aim && (aim.x !== 0 || aim.y !== 0)) {
             const aimMagnitude = Math.sqrt(aim.x**2 + aim.y**2);
             if (aimMagnitude > 0.1) {
                 const desiredAngle = Math.atan2(aim.y, aim.x);
                 state.player.angle = lerpAngle(state.player.angle, desiredAngle, dt * STICK_AIM_TURN_SPEED);
             }
          }
          // Or if angle was set by mouse (pointer)
          else if (angle !== undefined) {
              state.player.angle = angle;
          }

          // Send Input
          network.send(NetworkMsgType.Input, {
              move: inputRef.current.move, 
              aim: inputRef.current.aim, 
              sprint: inputRef.current.sprint, 
              fire: inputRef.current.fire, 
              angle: state.player.angle // Send the predicted angle
          } as InputPackage);
          
          // Render handled by shared render code below
          // State is updated via onMessage asynchronously
          
          // Interpolate Camera
          const viewportW = canvas.width / dpr;
          const viewportH = canvas.height / dpr;
          const visibleW = viewportW / ZOOM_LEVEL;
          const visibleH = viewportH / ZOOM_LEVEL;
          
          const targetCamX = state.player.position.x - visibleW / 2;
          const targetCamY = state.player.position.y - visibleH / 2;
          
          state.camera.x += (targetCamX - state.camera.x) * CAMERA_LERP;
          state.camera.y += (targetCamY - state.camera.y) * CAMERA_LERP;
          
          render(canvas, ctx, state, now);
          animationFrameId = requestAnimationFrame(runGameLoop);
          return;
      }

      // --- HOST or SINGLEPLAYER ---
      
      if (elapsed > SHRINK_START_TIME) {
        const shrinkProgress = Math.min((elapsed - SHRINK_START_TIME) / SHRINK_DURATION, 1);
        state.zoneRadius = INITIAL_ZONE_RADIUS - (INITIAL_ZONE_RADIUS - MIN_ZONE_RADIUS) * shrinkProgress;
      }

      spawnLoot(now);
      
      // Update Player 1 (Me) - Mobile touch controls only
      const dash = inputRef.current.dash;
      const p1Fire = updateEntity(state.player, move, aim, sprint, dash, null, dt, now);
      if (p1Fire && !state.player.isReloading && now - state.player.lastFired > WEAPONS[state.player.weapon].fireRate) {
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
            dropZombieLoot(zombie);
            state.zombies.splice(i, 1);
            state.zombiesRemaining--;
            state.zombiesKilled++;
            continue;
          }
          
          // Zombie AI: Chase player with improved obstacle avoidance
          const distToPlayer = getDistance(zombie.position, state.player.position);
          const angleToPlayer = getAngle(zombie.position, state.player.position);
          const zombieSpeed = zombie.zombieSpeed || WAVE_BASE_ZOMBIE_SPEED;
          
          // Move towards player
          const zombieMove = {
            x: Math.cos(angleToPlayer),
            y: Math.sin(angleToPlayer)
          };
          
          // Update zombie position (simplified movement)
          zombie.angle = angleToPlayer;
          const maxSpeed = zombieSpeed;
          zombie.velocity.x = zombieMove.x * maxSpeed;
          zombie.velocity.y = zombieMove.y * maxSpeed;
          
          // Apply movement with collision and wall sliding
          let testX = zombie.position.x + zombie.velocity.x * dt;
          let testY = zombie.position.y + zombie.velocity.y * dt;
          let hitWallX = false;
          let hitWallY = false;
          
          for (const wall of state.walls) {
            if (checkWallCollision({ ...zombie, position: { x: testX, y: zombie.position.y } }, wall)) {
              hitWallX = true;
              break;
            }
          }
          
          for (const wall of state.walls) {
            if (checkWallCollision({ ...zombie, position: { x: zombie.position.x, y: testY } }, wall)) {
              hitWallY = true;
              break;
            }
          }
          
          // Wall sliding: allow movement in axes that aren't blocked
          if (!hitWallX) {
            zombie.position.x = testX;
          }
          
          if (!hitWallY) {
            zombie.position.y = testY;
          }
          
          // Try diagonal movement only if both direct axes are blocked
          // Limit this expensive check to once every 5 frames per zombie
          if (hitWallX && hitWallY && (zombie.lastFired % 5 === 0 || zombie.lastFired === 0)) {
            // Try moving at an angle to get around the obstacle
            const alternateAngles = [angleToPlayer + Math.PI/4, angleToPlayer - Math.PI/4];
            for (const altAngle of alternateAngles) {
              const altTestX = zombie.position.x + Math.cos(altAngle) * zombieSpeed * dt * 0.5;
              const altTestY = zombie.position.y + Math.sin(altAngle) * zombieSpeed * dt * 0.5;
              
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
                break;
              }
            }
          }
          
          // Boundary check
          zombie.position.x = Math.max(zombie.radius, Math.min(MAP_SIZE - zombie.radius, zombie.position.x));
          zombie.position.y = Math.max(zombie.radius, Math.min(MAP_SIZE - zombie.radius, zombie.position.y));
          
          // Prevent zombies from stacking on player - push them away
          const distNow = getDistance(zombie.position, state.player.position);
          const minDist = zombie.radius + state.player.radius + 15; // Minimum separation distance
          if (distNow < minDist && distNow > 0) {
            // Push zombie away from player
            const pushAngle = getAngle(state.player.position, zombie.position);
            const pushStrength = (minDist - distNow) * ZOMBIE_COLLISION_PUSH;
            zombie.position.x += Math.cos(pushAngle) * pushStrength;
            zombie.position.y += Math.sin(pushAngle) * pushStrength;
          }
          
          // Prevent zombies from stacking on each other
          for (let j = i + 1; j < state.zombies.length; j++) {
            const otherZombie = state.zombies[j];
            const zombieDist = getDistance(zombie.position, otherZombie.position);
            const minZombieDist = zombie.radius + otherZombie.radius + 10;
            if (zombieDist < minZombieDist && zombieDist > 0) {
              // Push zombies apart
              const pushAngle = getAngle(otherZombie.position, zombie.position);
              const pushStrength = (minZombieDist - zombieDist) * (ZOMBIE_COLLISION_PUSH * 0.5);
              zombie.position.x += Math.cos(pushAngle) * pushStrength;
              zombie.position.y += Math.sin(pushAngle) * pushStrength;
              otherZombie.position.x -= Math.cos(pushAngle) * pushStrength;
              otherZombie.position.y -= Math.sin(pushAngle) * pushStrength;
            }
          }
          
          // Melee attack when close
          if (distToPlayer < ZOMBIE_MELEE_RANGE && now - zombie.lastFired > 1000) {
            zombie.lastFired = now;
            const zombieDamage = zombie.zombieDamage || WAVE_BASE_ZOMBIE_DAMAGE;
            
            // Deal damage to player
            if (state.player.invulnerable <= 0) {
              if (state.player.armor > 0) {
                const armorAbsorb = Math.min(state.player.armor, zombieDamage * 0.5);
                state.player.armor -= armorAbsorb;
                state.player.hp -= (zombieDamage - armorAbsorb);
              } else {
                state.player.hp -= zombieDamage;
              }
              state.player.lastDamageTime = now;
              state.player.regenTimer = 0;
              playHitSound();
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

      // Loot & Zone
      updateLoot(state);
      checkZone(state, now, dt);

      // Game Over Check
      if (state.player.hp <= 0) { 
        state.gameOver = true; 
        playDeathSound(); 
        onGameOver('Bot'); 
        if(network) network.send(NetworkMsgType.GameOver, 'Bot'); 
      } 
      else if (gameMode === GameMode.PvP && state.bot.hp <= 0) { 
        state.gameOver = true; 
        onGameOver('Player'); 
        if(network) network.send(NetworkMsgType.GameOver, 'Player'); 
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
              timeRemaining: Math.max(0, SHRINK_START_TIME + SHRINK_DURATION - elapsed)
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
            Math.max(0, SHRINK_START_TIME + SHRINK_DURATION - elapsed),
            Math.max(0, state.player.sprintCooldown),
            Math.max(0, state.player.dashCooldown),
            0, // speedBoost - not implemented yet
            0, // damageBoost - not implemented yet  
            0, // invincibility - not implemented yet
            state.currentWave,
            state.zombiesRemaining,
            Math.max(0, state.preparationTimeRemaining)
        );
        
        // Update minimap
        onUpdateMinimap(
            state.player.position,
            state.bot.position,
            state.loot,
            state.zoneRadius
        );
      }

      // Render with dynamic FOV
      const viewportW = canvas.width / dpr;
      const viewportH = canvas.height / dpr;
      
      // Dynamic zoom based on sprint (wider FOV when sprinting for better awareness)
      const isSprinting = state.player.sprintTime > 0;
      const dynamicZoom = isSprinting ? ZOOM_LEVEL * 0.92 : ZOOM_LEVEL; // 8% wider when sprinting
      
      const visibleW = viewportW / dynamicZoom;
      const visibleH = viewportH / dynamicZoom;
      
      // Enhanced look-ahead based on velocity for better camera positioning
      const lookAheadX = state.player.velocity.x * 0.6;
      const lookAheadY = state.player.velocity.y * 0.6;
      const targetCamX = (state.player.position.x + lookAheadX) - visibleW / 2;
      const targetCamY = (state.player.position.y + lookAheadY) - visibleH / 2;
      state.camera.x += (targetCamX - state.camera.x) * CAMERA_LERP;
      state.camera.y += (targetCamY - state.camera.y) * CAMERA_LERP;
      state.camera.x = Math.max(-100, Math.min(state.camera.x, MAP_SIZE + 100 - visibleW));
      state.camera.y = Math.max(-100, Math.min(state.camera.y, MAP_SIZE + 100 - visibleH));

      render(canvas, ctx, state, now, dynamicZoom);
      animationFrameId = requestAnimationFrame(runGameLoop);
    };

    // Helpers
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
              color: weapon.color
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
          if (target.armor > 0) target.armor = Math.max(0, target.armor - b.damage);
          else target.hp -= b.damage;
          target.lastDamageTime = now;
          target.regenTimer = 0; 
          
          // Play hit sound (only for player being hit)
          if (target.id === state.player.id) {
            playHitSound(b.damage >= 40); // Critical hit sound for high damage
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
        marker.x += marker.vx * dt;
        marker.y += marker.vy * dt;
        marker.vy += 20 * dt; // Slight gravity/deceleration
        if (marker.life <= 0) state.hitMarkers.splice(i, 1);
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
                      p.hp = Math.min(p.hp + item.value, p.maxHp);
                      if (p.id === state.player.id) playPickupSound('Medkit');
                    } else consumed = false;
                  } else if (item.type === ItemType.MegaHealth) {
                    if (p.hp < p.maxHp) {
                      p.hp = Math.min(p.hp + item.value, p.maxHp);
                      if (p.id === state.player.id) playPickupSound('MegaHealth');
                    } else consumed = false;
                  } else if (item.type === ItemType.Shield) {
                    p.armor = Math.min(p.armor + 50, 50);
                    if (p.id === state.player.id) playPickupSound('Shield');
                  } else if (item.type === ItemType.Ammo) {
                    // Ammo pickup adds to reserve ammo
                    p.totalAmmo = Math.min(p.totalAmmo + WEAPONS[p.weapon].clipSize * 2, WEAPONS[p.weapon].clipSize * 10);
                    if (p.id === state.player.id) playPickupSound('Ammo');
                  } else if (item.type === ItemType.Weapon && item.weaponType) {
                    // Weapon pickup gives weapon + full clip + reserve ammo
                    p.weapon = item.weaponType; 
                    p.ammo = WEAPONS[item.weaponType].clipSize; 
                    p.totalAmmo = WEAPONS[item.weaponType].clipSize * 3; // 3 extra clips worth
                    p.isReloading = false;
                    if (p.id === state.player.id) playPickupSound('Weapon');
                  }
                  if (consumed) state.loot.splice(i, 1);
                }
            }
        });
    };

    const checkZone = (state: any, now: number, dt: number) => {
        [state.player, state.bot].forEach((p: Player) => {
            const distFromCenter = getDistance(p.position, {x: MAP_SIZE/2, y: MAP_SIZE/2});
            if (distFromCenter > state.zoneRadius) {
                p.hp -= ZONE_DAMAGE_PER_SECOND * dt;
                p.lastDamageTime = now;
                p.regenTimer = 0;
            }
        });
    };

    animationFrameId = requestAnimationFrame(runGameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isReady]); // Depend on isReady

  // Helper to create cached background (grid + checkerboard with padding)
  const createBackgroundCache = (zoom: number) => {
    // Use tolerance to avoid cache invalidation for minor zoom changes
    const zoomChanged = !renderCache.current.lastZoom || 
                        Math.abs(renderCache.current.lastZoom - zoom) > 0.01;
    if (!renderCache.current.backgroundCanvas || zoomChanged) {
      const totalSize = MAP_SIZE + MAP_BOUNDARY_PADDING * 2;
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = totalSize;
      bgCanvas.height = totalSize;
      const bgCtx = bgCanvas.getContext('2d')!;
      
      // Fill entire canvas including padding with bright green
      bgCtx.fillStyle = '#22c55e';
      bgCtx.fillRect(0, 0, totalSize, totalSize);
      
      // Offset for padding, so the map grid starts at the right position
      bgCtx.save();
      bgCtx.translate(MAP_BOUNDARY_PADDING, MAP_BOUNDARY_PADDING);
      
      // Grid with darker green lines
      bgCtx.strokeStyle = '#16a34a'; 
      bgCtx.lineWidth = 2;
      bgCtx.beginPath();
      for (let x = 0; x <= MAP_SIZE; x += TILE_SIZE) { 
        bgCtx.moveTo(x, 0); 
        bgCtx.lineTo(x, MAP_SIZE); 
      }
      for (let y = 0; y <= MAP_SIZE; y += TILE_SIZE) { 
        bgCtx.moveTo(0, y); 
        bgCtx.lineTo(MAP_SIZE, y); 
      }
      bgCtx.stroke();
      
      // Enhanced checkerboard with lighter green tiles for depth
      for (let x = 0; x < MAP_SIZE; x += TILE_SIZE * 2) {
        for (let y = 0; y < MAP_SIZE; y += TILE_SIZE * 2) {
          // Alternate lighter green tiles for better depth
          bgCtx.fillStyle = 'rgba(134, 239, 172, 0.4)';
          bgCtx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          bgCtx.fillRect(x + TILE_SIZE, y + TILE_SIZE, TILE_SIZE, TILE_SIZE);
          
          // Add subtle texture variation with even lighter green
          bgCtx.fillStyle = 'rgba(187, 247, 208, 0.3)';
          bgCtx.fillRect(x + TILE_SIZE/4, y + TILE_SIZE/4, TILE_SIZE/2, TILE_SIZE/2);
          bgCtx.fillRect(x + TILE_SIZE + TILE_SIZE/4, y + TILE_SIZE + TILE_SIZE/4, TILE_SIZE/2, TILE_SIZE/2);
        }
      }
      
      bgCtx.restore();
      
      renderCache.current.backgroundCanvas = bgCanvas;
      renderCache.current.lastZoom = zoom;
    }
    return renderCache.current.backgroundCanvas;
  };

  // Render Function (optimized with caching)
  const render = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, state: any, now: number, zoom: number = ZOOM_LEVEL) => {
      const dpr = getOptimizedDPR();
      const isMobile = isMobileRef.current;
      const viewportW = canvas.width / dpr;
      const viewportH = canvas.height / dpr;
      
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.scale(zoom, zoom);
      ctx.translate(-state.camera.x, -state.camera.y);

      // Draw cached background (includes padding to prevent black corners)
      const bgCache = createBackgroundCache(zoom);
      ctx.drawImage(bgCache, -MAP_BOUNDARY_PADDING, -MAP_BOUNDARY_PADDING);
      
      // Safe Zone with enhanced rendering
      ctx.fillStyle = 'rgba(74, 222, 128, 0.08)'; 
      ctx.beginPath(); 
      ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius, 0, Math.PI * 2); 
      ctx.fill();
      
      // Inner safe zone highlight
      ctx.fillStyle = 'rgba(74, 222, 128, 0.03)'; 
      ctx.beginPath(); 
      ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius * 0.95, 0, Math.PI * 2); 
      ctx.fill();
      
      // Danger zone with dynamic pulsing
      const pulseIntensity = Math.sin(now / 400) * 0.06 + 0.28;
      ctx.beginPath(); 
      ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius, 0, Math.PI * 2, true);
      ctx.rect(-1000, -1000, MAP_SIZE + 2000, MAP_SIZE + 2000);
      ctx.fillStyle = `rgba(220, 38, 38, ${pulseIntensity})`; 
      ctx.fill();
      
      // Enhanced zone border with glow effect
      ctx.save();
      ctx.shadowBlur = isMobile ? 20 * MOBILE_SHADOW_BLUR_REDUCTION : 20;
      ctx.shadowColor = '#ef4444';
      ctx.strokeStyle = '#ef4444'; 
      ctx.lineWidth = 6; 
      ctx.beginPath(); 
      ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius, 0, Math.PI * 2); 
      ctx.stroke();
      
      // Inner border highlight
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(248, 113, 113, 0.6)'; 
      ctx.lineWidth = 3; 
      ctx.beginPath(); 
      ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius - 3, 0, Math.PI * 2); 
      ctx.stroke();
      ctx.restore();

      // Render Loot with REALISTIC 3D SPINNING VISUALS
      state.loot.forEach((item: LootItem) => { 
        ctx.save(); 
        ctx.translate(item.position.x, item.position.y);
        
        // 3D Rotation and Animation
        const bob = Math.sin(now / LOOT_BOB_SPEED) * LOOT_BOB_AMOUNT * 1.5; // More dramatic bob
        const rotationAngle = (now / 800) % (Math.PI * 2); // Continuous Y-axis rotation
        const pulse = Math.sin(now / LOOT_PULSE_SPEED) * LOOT_PULSE_AMOUNT + LOOT_BASE_SCALE;
        
        // Apply 3D perspective calculations
        const perspective = 600; // Perspective strength
        const rotationScale = Math.cos(rotationAngle); // Simulate depth with scale
        const sideFacing = Math.sin(rotationAngle); // Which side is facing viewer
        
        ctx.translate(0, bob);
        ctx.scale(pulse * (0.7 + Math.abs(rotationScale) * 0.3), pulse); // Compress X based on rotation
        
        // Enhanced glow effect with pulsing
        const glowColor = item.type === ItemType.Weapon ? WEAPONS[item.weaponType!]?.color || '#fbbf24' :
                         item.type === ItemType.Medkit ? '#ef4444' :
                         item.type === ItemType.MegaHealth ? '#ff00ff' :
                         item.type === ItemType.Shield ? '#3b82f6' : 
                         item.type === ItemType.SlowTrap ? '#8b00ff' :
                         item.type === ItemType.SpeedBoost ? '#00ff88' :
                         item.type === ItemType.InvincibilityShield ? '#ffd700' :
                         item.type === ItemType.DamageBoost ? '#ff4400' : '#22c55e';
        
        const glowPulse = 1 + Math.sin(now / 200) * 0.3;
        ctx.shadowBlur = (isMobile ? 30 * MOBILE_SHADOW_BLUR_REDUCTION : 40) * glowPulse;
        ctx.shadowColor = glowColor;
        
        // Outer glow rings - multiple layers for depth (optimized with rgba)
        const glowPulseAlpha = (1 + Math.sin(now / 150) * 0.3);
        for (let i = 3; i > 0; i--) {
          const alphaValue = (i * 20 * glowPulseAlpha) / 255;
          ctx.fillStyle = glowColor + Math.floor(alphaValue * 255).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.arc(0, 0, 50 * (i / 3), 0, Math.PI * 2);
          ctx.fill();
        }

        // 3D Item Rendering with realistic depth and shading
        if (item.type === ItemType.Weapon) { 
            const weaponColor = WEAPONS[item.weaponType!].color;
            
            // 3D Gun with depth - Shadow/back face
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(-22 + sideFacing * 3, -6 + 2, 48, 16);
            
            // Gun body with gradient for 3D effect
            const gunGradient = ctx.createLinearGradient(-24, -8, -24, 8);
            gunGradient.addColorStop(0, weaponColor);
            gunGradient.addColorStop(0.5, WEAPONS[item.weaponType!].color);
            gunGradient.addColorStop(1, '#000');
            ctx.fillStyle = gunGradient;
            ctx.fillRect(-24, -8, 48, 16); // Barrel
            
            // Gun highlights for shine
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(-24, -8, 48, 4);
            
            // Handle with depth
            ctx.fillStyle = '#2a2a2a';
            ctx.fillRect(-24, -8, 12, 24);
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(-22, -6, 8, 20);
            
            // Magazine with metallic effect
            ctx.fillStyle = '#404040';
            ctx.fillRect(0, 0, 16, 20);
            ctx.fillStyle = '#606060';
            ctx.fillRect(2, 2, 12, 16);
            
            // Outline for definition
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(-24, -8, 48, 16);
        } 
        else if (item.type === ItemType.Medkit || item.type === ItemType.MegaHealth) { 
            const isMega = item.type === ItemType.MegaHealth;
            const boxColor = isMega ? '#ff00ff' : '#fff';
            const crossColor = isMega ? '#ffd700' : '#ef4444';
            
            // 3D Box with shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(-22 + sideFacing * 4, -22 + 3, 48, 48);
            
            // Box with gradient for depth
            const boxGradient = ctx.createLinearGradient(-24, -24, 24, 24);
            boxGradient.addColorStop(0, boxColor);
            boxGradient.addColorStop(0.5, boxColor);
            boxGradient.addColorStop(1, isMega ? '#aa00aa' : '#ddd');
            ctx.fillStyle = boxGradient;
            ctx.fillRect(-24, -24, 48, 48);
            
            // 3D Edge highlights
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.fillRect(-24, -24, 48, 6);
            ctx.fillRect(-24, -24, 6, 48);
            
            // Cross with depth
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(-7, -15, 16, 32);
            ctx.fillRect(-15, -7, 32, 16);
            
            ctx.fillStyle = crossColor;
            ctx.fillRect(-8, -16, 16, 32);
            ctx.fillRect(-16, -8, 32, 16);
            
            // Cross highlights
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillRect(-8, -16, 6, 28);
            ctx.fillRect(-16, -8, 28, 6);
            
            // Outline
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(-24, -24, 48, 48);
        } 
        else if (item.type === ItemType.Shield) { 
            // 3D Shield with metallic effect and depth
            ctx.save();
            
            // Shield shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.beginPath();
            ctx.moveTo(0 + sideFacing * 4, 30);
            ctx.quadraticCurveTo(26, 12, 26, -14);
            ctx.lineTo(-22, -14);
            ctx.quadraticCurveTo(-22, 12, 0 + sideFacing * 4, 30);
            ctx.fill();
            
            // Shield gradient for metallic 3D effect
            const shieldGradient = ctx.createLinearGradient(-24, -16, 24, 28);
            shieldGradient.addColorStop(0, '#60a5fa');
            shieldGradient.addColorStop(0.5, '#3b82f6');
            shieldGradient.addColorStop(1, '#1e40af');
            ctx.fillStyle = shieldGradient;
            ctx.beginPath();
            ctx.moveTo(0, 28);
            ctx.quadraticCurveTo(24, 10, 24, -16);
            ctx.lineTo(-24, -16);
            ctx.quadraticCurveTo(-24, 10, 0, 28);
            ctx.fill();
            
            // Shield highlights for 3D depth
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.beginPath();
            ctx.moveTo(0, 28);
            ctx.quadraticCurveTo(24, 10, 24, -16);
            ctx.lineTo(0, -16);
            ctx.fill();
            
            // Reflection spots for metallic shine
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.arc(-8, -6, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(10, 8, 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Outline
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, 28);
            ctx.quadraticCurveTo(24, 10, 24, -16);
            ctx.lineTo(-24, -16);
            ctx.quadraticCurveTo(-24, 10, 0, 28);
            ctx.stroke();
            
            ctx.restore();
        } 
        else if (item.type === ItemType.Ammo) { 
            // 3D Ammo Box with depth
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(-18 + sideFacing * 3, -18 + 2, 40, 40);
            
            const ammoGradient = ctx.createLinearGradient(-20, -20, 20, 20);
            ammoGradient.addColorStop(0, '#16a34a');
            ammoGradient.addColorStop(0.5, '#15803d');
            ammoGradient.addColorStop(1, '#14532d');
            ctx.fillStyle = ammoGradient;
            ctx.fillRect(-20, -20, 40, 40);
            
            // 3D highlights
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(-20, -20, 40, 6);
            ctx.fillRect(-20, -20, 6, 40);
            
            // Bullets with metallic shine
            ctx.fillStyle = '#b8860b';
            ctx.fillRect(-10, -14, 6, 28);
            ctx.fillRect(-1, -14, 6, 28);
            ctx.fillRect(8, -14, 6, 28);
            
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(-9, -14, 4, 24);
            ctx.fillRect(0, -14, 4, 24);
            ctx.fillRect(9, -14, 4, 24);
            
            // Outline
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(-20, -20, 40, 40);
        }
        else if (item.type === ItemType.SlowTrap) {
            // 3D Slow Trap - Purple spiky mine
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.beginPath();
            ctx.arc(sideFacing * 3, 3, 22, 0, Math.PI * 2);
            ctx.fill();
            
            const trapGradient = ctx.createRadialGradient(-5, -5, 5, 0, 0, 22);
            trapGradient.addColorStop(0, '#a855f7');
            trapGradient.addColorStop(0.7, '#7c3aed');
            trapGradient.addColorStop(1, '#5b21b6');
            ctx.fillStyle = trapGradient;
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.fill();
            
            // Spikes
            ctx.fillStyle = '#6b21a8';
            for (let i = 0; i < 8; i++) {
              const angle = (i / 8) * Math.PI * 2;
              ctx.save();
              ctx.rotate(angle);
              ctx.fillRect(-3, -28, 6, 10);
              ctx.restore();
            }
            
            // Warning symbol
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 20px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('⚠', 0, 0);
        }
        else if (item.type === ItemType.SpeedBoost) {
            // 3D Speed Boost - Lightning bolt
            const speedGradient = ctx.createLinearGradient(-15, -20, 15, 20);
            speedGradient.addColorStop(0, '#6ee7b7');
            speedGradient.addColorStop(0.5, '#10b981');
            speedGradient.addColorStop(1, '#047857');
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.beginPath();
            ctx.moveTo(-8 + sideFacing * 2, -18 + 2);
            ctx.lineTo(2 + sideFacing * 2, -2 + 2);
            ctx.lineTo(-6 + sideFacing * 2, -2 + 2);
            ctx.lineTo(10 + sideFacing * 2, 20 + 2);
            ctx.lineTo(-2 + sideFacing * 2, 4 + 2);
            ctx.lineTo(6 + sideFacing * 2, 4 + 2);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = speedGradient;
            ctx.beginPath();
            ctx.moveTo(-8, -18);
            ctx.lineTo(2, -2);
            ctx.lineTo(-6, -2);
            ctx.lineTo(10, 20);
            ctx.lineTo(-2, 4);
            ctx.lineTo(6, 4);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.moveTo(-6, -16);
            ctx.lineTo(0, -4);
            ctx.lineTo(-4, -4);
            ctx.lineTo(6, 10);
            ctx.lineTo(0, 2);
            ctx.lineTo(4, 2);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        
        ctx.restore();
      });
      // Map Walls with BRICK TEXTURE for better visual clarity
      state.walls.forEach((wall: Wall) => {
        ctx.save();
        
        // Check if circular obstacle
        if (wall.isCircular) {
          // Draw circular obstacle (rock/boulder style)
          const gradient = ctx.createRadialGradient(
            wall.position.x - wall.radius * 0.3, wall.position.y - wall.radius * 0.3, wall.radius * 0.1,
            wall.position.x, wall.position.y, wall.radius
          );
          gradient.addColorStop(0, '#8b7355'); // Light stone
          gradient.addColorStop(0.6, '#6b5d4f'); // Medium stone
          gradient.addColorStop(1, '#4a4238'); // Dark stone edge
          
          // Shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.beginPath();
          ctx.arc(wall.position.x + 5, wall.position.y + 8, wall.radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Main boulder
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(wall.position.x, wall.position.y, wall.radius, 0, Math.PI * 2);
          ctx.fill();
          
          // Add texture with darker spots
          ctx.fillStyle = 'rgba(60, 52, 45, 0.3)';
          ctx.beginPath();
          ctx.arc(wall.position.x + wall.radius * 0.3, wall.position.y + wall.radius * 0.2, wall.radius * 0.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(wall.position.x - wall.radius * 0.2, wall.position.y - wall.radius * 0.3, wall.radius * 0.15, 0, Math.PI * 2);
          ctx.fill();
          
          // Highlight for 3D effect
          ctx.fillStyle = 'rgba(180, 160, 140, 0.4)';
          ctx.beginPath();
          ctx.arc(wall.position.x - wall.radius * 0.3, wall.position.y - wall.radius * 0.3, wall.radius * 0.3, 0, Math.PI * 2);
          ctx.fill();
          
          // Border
          ctx.strokeStyle = '#3d3530';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(wall.position.x, wall.position.y, wall.radius, 0, Math.PI * 2);
          ctx.stroke();
          
        } else {
          // Draw rectangular wall (brick style) - for boundary walls
          // Soft shadow for depth
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; 
          ctx.fillRect(wall.position.x + 8, wall.position.y + 14, wall.width, wall.height);
        
        // Base wall color (darker brick red-brown)
        ctx.fillStyle = '#7c2d12'; // Dark brick base
        ctx.fillRect(wall.position.x, wall.position.y, wall.width, wall.height);
        
        // Draw brick pattern for better visibility
        const brickWidth = BRICK_WIDTH;
        const brickHeight = BRICK_HEIGHT;
        const mortarWidth = MORTAR_WIDTH;
        
        ctx.fillStyle = '#a8523a'; // Brick color
        
        // Draw bricks in staggered pattern
        for (let y = 0; y < wall.height; y += brickHeight + mortarWidth) {
          // Alternate rows offset by half brick width
          const rowOffset = (Math.floor(y / (brickHeight + mortarWidth)) % 2) * (brickWidth / 2);
          
          for (let x = -brickWidth / 2; x < wall.width + brickWidth; x += brickWidth + mortarWidth) {
            const brickX = wall.position.x + x + rowOffset;
            const brickY = wall.position.y + y;
            
            // Only draw bricks that are within the wall bounds
            const drawX = Math.max(wall.position.x, brickX);
            const drawY = Math.max(wall.position.y, brickY);
            const drawWidth = Math.min(brickX + brickWidth, wall.position.x + wall.width) - drawX;
            const drawHeight = Math.min(brickY + brickHeight, wall.position.y + wall.height) - drawY;
            
            if (drawWidth > 0 && drawHeight > 0) {
              // Main brick
              ctx.fillStyle = '#a8523a';
              ctx.fillRect(drawX, drawY, drawWidth, drawHeight);
              
              // Brick highlight (top-left)
              ctx.fillStyle = '#c97a5f';
              ctx.fillRect(drawX, drawY, drawWidth, Math.min(4, drawHeight));
              ctx.fillRect(drawX, drawY, Math.min(4, drawWidth), drawHeight);
              
              // Brick shadow (bottom-right)
              ctx.fillStyle = '#7c2d12';
              if (drawHeight > 2) {
                ctx.fillRect(drawX, drawY + drawHeight - 3, drawWidth, 3);
              }
              if (drawWidth > 2) {
                ctx.fillRect(drawX + drawWidth - 3, drawY, 3, drawHeight);
              }
            }
          }
        }
        
        // Draw mortar lines (grout between bricks)
        ctx.strokeStyle = '#52211a'; // Dark mortar
        ctx.lineWidth = mortarWidth;
        
        // Horizontal mortar lines
        for (let y = brickHeight + mortarWidth / 2; y < wall.height; y += brickHeight + mortarWidth) {
          ctx.beginPath();
          ctx.moveTo(wall.position.x, wall.position.y + y);
          ctx.lineTo(wall.position.x + wall.width, wall.position.y + y);
          ctx.stroke();
        }
        
        // Vertical mortar lines (staggered)
        for (let y = 0; y < wall.height; y += brickHeight + mortarWidth) {
          const rowOffset = (Math.floor(y / (brickHeight + mortarWidth)) % 2) * (brickWidth / 2);
          for (let x = brickWidth + mortarWidth / 2; x < wall.width + brickWidth; x += brickWidth + mortarWidth) {
            const lineX = wall.position.x + x + rowOffset;
            if (lineX >= wall.position.x && lineX <= wall.position.x + wall.width) {
              ctx.beginPath();
              ctx.moveTo(lineX, wall.position.y + y);
              ctx.lineTo(lineX, wall.position.y + Math.min(y + brickHeight + mortarWidth, wall.height));
              ctx.stroke();
            }
          }
        }
        
        // Overall border for extra definition
        ctx.strokeStyle = '#52211a';
        ctx.lineWidth = 4;
        ctx.strokeRect(wall.position.x, wall.position.y, wall.width, wall.height);
        
        // Top highlight for 3D effect
        ctx.fillStyle = 'rgba(201, 122, 95, 0.3)';
        ctx.fillRect(wall.position.x, wall.position.y, wall.width, 8);
        
        // Bottom shadow for 3D effect
        ctx.fillStyle = 'rgba(82, 33, 26, 0.5)';
        ctx.fillRect(wall.position.x, wall.position.y + wall.height - 8, wall.width, 8);
        }
        
        ctx.restore();
      });
      // Enhanced Bullets with improved visuals and trails
      state.bullets.forEach((b: Bullet) => { 
        // Draw bullet trail with gradient (optimized for mobile)
        ctx.save();
        const trailLength = isMobile ? MOBILE_BULLET_TRAIL_LENGTH : 3;
        for (let i = 0; i < trailLength; i++) {
          const trailDist = (i + 1) * 0.015;
          const trailX = b.position.x - b.velocity.x * trailDist;
          const trailY = b.position.y - b.velocity.y * trailDist;
          const trailSize = b.radius * (1 - i * 0.25);
          const alphaValue = Math.max(0, Math.min(1, 0.6 - i * 0.2)); // Clamp to [0, 1]
          const trailAlpha = Math.floor(alphaValue * 255).toString(16).padStart(2, '0');
          
          ctx.fillStyle = b.color + trailAlpha;
          ctx.beginPath();
          ctx.arc(trailX, trailY, trailSize, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        
        // Main bullet with glow
        ctx.save();
        ctx.shadowBlur = isMobile ? 12 * MOBILE_SHADOW_BLUR_REDUCTION : 12; 
        ctx.shadowColor = b.color; 
        ctx.fillStyle = b.color;
        ctx.beginPath(); 
        ctx.arc(b.position.x, b.position.y, b.radius, 0, Math.PI * 2); 
        ctx.fill();
        
        // Bright core
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.position.x, b.position.y, b.radius * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Particles with optimized rendering
      state.particles.forEach((p: any) => {
        const alpha = p.life / p.maxLife;
        ctx.fillStyle = p.color + Math.floor(alpha * 255).toString(16).padStart(2, '0');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Enhanced Muzzle Flashes with better effects
      state.muzzleFlashes.forEach((flash: any) => {
        ctx.save();
        ctx.translate(flash.x, flash.y);
        ctx.rotate(flash.angle);
        const alpha = flash.life / 100;
        
        // Outer glow
        ctx.fillStyle = `rgba(255, 150, 0, ${alpha * 0.4})`;
        ctx.shadowBlur = isMobile ? 20 * MOBILE_SHADOW_BLUR_REDUCTION : 20;
        ctx.shadowColor = `rgba(255, 150, 0, ${alpha * 0.8})`;
        ctx.beginPath();
        ctx.moveTo(40, 0);
        ctx.lineTo(0, -16);
        ctx.lineTo(0, 16);
        ctx.closePath();
        ctx.fill();
        
        // Inner bright flash
        ctx.fillStyle = `rgba(255, 240, 100, ${alpha * 0.95})`;
        ctx.shadowBlur = isMobile ? 15 * MOBILE_SHADOW_BLUR_REDUCTION : 15;
        ctx.shadowColor = `rgba(255, 220, 50, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(30, 0);
        ctx.lineTo(0, -10);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        
        // Core bright spot
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(5, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      });

      // Hit Markers with improved animations
      state.hitMarkers.forEach((hit: any) => {
        const progress = hit.life / hit.maxLife;
        const alpha = progress;
        const scale = 1 + (1 - progress) * 0.5; // Scale up as fades out
        
        ctx.save();
        ctx.translate(hit.x, hit.y);
        
        // Enhanced crosshair with glow
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowColor = 'rgba(255, 100, 100, 0.8)';
        ctx.shadowBlur = 8 * alpha;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12 * scale, -12 * scale);
        ctx.lineTo(-5 * scale, -5 * scale);
        ctx.moveTo(12 * scale, -12 * scale);
        ctx.lineTo(5 * scale, -5 * scale);
        ctx.moveTo(-12 * scale, 12 * scale);
        ctx.lineTo(-5 * scale, 5 * scale);
        ctx.moveTo(12 * scale, 12 * scale);
        ctx.lineTo(5 * scale, 5 * scale);
        ctx.stroke();
        
        // Animated damage number with better styling
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
        
        // Color based on damage amount
        let damageColor = '#ffffff';
        if (hit.damage >= 40) damageColor = '#ff3333'; // High damage - red
        else if (hit.damage >= 20) damageColor = '#ffaa33'; // Medium damage - orange
        else damageColor = '#ffff99'; // Low damage - yellow
        
        ctx.fillStyle = `rgba(${parseInt(damageColor.slice(1, 3), 16)}, ${parseInt(damageColor.slice(3, 5), 16)}, ${parseInt(damageColor.slice(5, 7), 16)}, ${alpha})`;
        ctx.font = `bold ${20 * scale}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('-' + Math.ceil(hit.damage), 0, -25 * scale);
        
        ctx.restore();
      });

      // Enhanced Aim Snap Lock-On Indicator - VERY VISIBLE
      if (state.aimSnapTarget && state.aimSnapTarget.hp > 0) {
        ctx.save();
        ctx.translate(state.aimSnapTarget.position.x, state.aimSnapTarget.position.y);
        
        // Animated lock-on with very strong pulse and glow
        const pulse = Math.sin(now / 100) * 0.3 + 0.7; // Very fast, very strong pulse
        const bracketSize = 45; // Even larger brackets
        const bracketOffset = 55; // Further out for more visibility
        
        // Add very strong outer glow
        ctx.shadowColor = 'rgba(255, 0, 0, 0.9)';
        ctx.shadowBlur = 30;
        
        ctx.strokeStyle = `rgba(255, 0, 0, ${pulse})`;
        ctx.lineWidth = 5; // Very thick lines
        ctx.lineCap = 'round';
        
        // Top-left bracket
        ctx.beginPath();
        ctx.moveTo(-bracketOffset, -bracketOffset + bracketSize);
        ctx.lineTo(-bracketOffset, -bracketOffset);
        ctx.lineTo(-bracketOffset + bracketSize, -bracketOffset);
        ctx.stroke();
        
        // Top-right bracket
        ctx.beginPath();
        ctx.moveTo(bracketOffset, -bracketOffset + bracketSize);
        ctx.lineTo(bracketOffset, -bracketOffset);
        ctx.lineTo(bracketOffset - bracketSize, -bracketOffset);
        ctx.stroke();
        
        // Bottom-left bracket
        ctx.beginPath();
        ctx.moveTo(-bracketOffset, bracketOffset - bracketSize);
        ctx.lineTo(-bracketOffset, bracketOffset);
        ctx.lineTo(-bracketOffset + bracketSize, bracketOffset);
        ctx.stroke();
        
        // Bottom-right bracket
        ctx.beginPath();
        ctx.moveTo(bracketOffset, bracketOffset - bracketSize);
        ctx.lineTo(bracketOffset, bracketOffset);
        ctx.lineTo(bracketOffset - bracketSize, bracketOffset);
        ctx.stroke();
        
        // Center crosshair with strong glow
        ctx.shadowBlur = 20;
        ctx.strokeStyle = `rgba(255, 50, 50, ${pulse})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.lineTo(-6, 0);
        ctx.moveTo(20, 0);
        ctx.lineTo(6, 0);
        ctx.moveTo(0, -20);
        ctx.lineTo(0, -6);
        ctx.moveTo(0, 20);
        ctx.lineTo(0, 6);
        ctx.stroke();
        
        // Add rotating circle for extra visibility
        const rotateAngle = (now / 800) % (Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 0, 0, ${pulse * 0.7})`;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, 65, rotateAngle, rotateAngle + Math.PI * 1.5);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Add "LOCKED" text indicator with enhanced visibility
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.fillStyle = `rgba(255, 0, 0, ${pulse})`;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🎯 LOCKED', 0, -72);
        
        ctx.restore();
      }

      // Aiming Lasers - Draw before players
      [state.player, state.bot].forEach((p: Player) => {
        // Only show laser for player (not bot) when aiming
        if (p.id === state.player.id && !p.isBot) {
          const aimVec = inputRef.current?.aim || { x: 0, y: 0 };
          const aimMagnitude = Math.sqrt(aimVec.x**2 + aimVec.y**2);
          
          // Show laser when actively aiming
          if (aimMagnitude > 0.15) {
            ctx.save();
            
            // Calculate laser end point (check for wall collision)
            const laserLength = 1500; // Max laser length
            const endX = p.position.x + Math.cos(p.angle) * laserLength;
            const endY = p.position.y + Math.sin(p.angle) * laserLength;
            
            // Find actual end point by checking wall collisions
            let actualEndX = endX;
            let actualEndY = endY;
            let shortestDist = laserLength;
            
            for (const wall of state.walls) {
              // Ray-wall intersection check with configurable steps
              const laserDir = { x: Math.cos(p.angle), y: Math.sin(p.angle) };
              const steps = LASER_COLLISION_STEPS;
              for (let i = 1; i <= steps; i++) {
                const checkDist = (laserLength / steps) * i;
                const checkX = p.position.x + laserDir.x * checkDist;
                const checkY = p.position.y + laserDir.y * checkDist;
                
                if (checkWallCollision({ position: { x: checkX, y: checkY }, radius: LASER_COLLISION_CHECK_RADIUS }, wall)) {
                  if (checkDist < shortestDist) {
                    shortestDist = checkDist;
                    actualEndX = checkX;
                    actualEndY = checkY;
                  }
                  break;
                }
              }
            }
            
            // Check if snapped to target for special laser color
            const isSnapped = state.aimSnapTarget !== null;
            const laserColor = isSnapped ? '#ff0000' : '#00ff00';
            const laserAlpha = isSnapped ? 0.6 : 0.35;
            
            // Draw laser line with gradient
            const gradient = ctx.createLinearGradient(p.position.x, p.position.y, actualEndX, actualEndY);
            gradient.addColorStop(0, laserColor + Math.floor(laserAlpha * 255).toString(16).padStart(2, '0'));
            gradient.addColorStop(1, laserColor + '00');
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = isSnapped ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(p.position.x, p.position.y);
            ctx.lineTo(actualEndX, actualEndY);
            ctx.stroke();
            
            // Draw laser glow
            ctx.shadowBlur = isMobile ? 8 * MOBILE_SHADOW_BLUR_REDUCTION : 8;
            ctx.shadowColor = laserColor;
            ctx.strokeStyle = laserColor + Math.floor(laserAlpha * 128).toString(16).padStart(2, '0');
            ctx.lineWidth = isSnapped ? 6 : 4;
            ctx.stroke();
            
            // Draw laser dot at end
            ctx.shadowBlur = isMobile ? 15 * MOBILE_SHADOW_BLUR_REDUCTION : 15;
            ctx.fillStyle = laserColor;
            ctx.beginPath();
            ctx.arc(actualEndX, actualEndY, isSnapped ? 6 : 4, 0, Math.PI * 2);
            ctx.fill();
            
            // Snap indicator - pulsing ring around target
            if (isSnapped && state.aimSnapTarget) {
              const pulseScale = 1 + Math.sin(now / 200) * 0.2;
              ctx.strokeStyle = '#ff0000' + Math.floor(0.8 * 255).toString(16).padStart(2, '0');
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(state.aimSnapTarget.position.x, state.aimSnapTarget.position.y, 50 * pulseScale, 0, Math.PI * 2);
              ctx.stroke();
              
              // Inner ring
              ctx.strokeStyle = '#ff8800' + Math.floor(0.6 * 255).toString(16).padStart(2, '0');
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(state.aimSnapTarget.position.x, state.aimSnapTarget.position.y, 40 * pulseScale, 0, Math.PI * 2);
              ctx.stroke();
            }
            
            ctx.restore();
          }
        }
      });

      // Players
      [state.player, state.bot].forEach((p: Player) => {
        let isLocked = false;
        
        ctx.save();
        ctx.translate(p.position.x, p.position.y);
        ctx.rotate(p.angle);
        
        // Colors & State based on skin type
        const isEnemy = p.id === state.bot.id;
        
        // Define colors for each skin type
        let colors;
        if (p.skin === SkinType.Police) {
          // Police Officer - Blue uniform
          colors = { 
            pants: '#1e3a8a', // Dark blue pants
            shirt: '#1e40af', // Blue shirt
            vest: '#1d4ed8', // Police vest
            helmet: '#1e3a8a', // Dark blue helmet
            skin: '#ffdbac',
            badge: '#fbbf24' // Gold badge
          };
        } else if (p.skin === SkinType.Terrorist) {
          // Terrorist/Militia - Tactical/camo colors
          colors = { 
            pants: '#3f3f46', // Dark gray tactical pants
            shirt: '#27272a', // Black tactical shirt
            vest: '#52525b', // Gray tactical vest
            helmet: '#18181b', // Black helmet/mask
            skin: '#d4a373',
            badge: '#ef4444' // Red patch
          };
        } else {
          // Homeless - Ragged, dirty clothes
          colors = { 
            pants: '#78716c', // Brown/dirty pants
            shirt: '#a8a29e', // Gray/dirty shirt
            vest: '#57534e', // Brown vest/jacket
            helmet: '#44403c', // Brown beanie/cap
            skin: '#c19a6b',
            badge: '#000000' // No badge
          };
        }
            
        // More Human-like Animation System
        const speed = Math.sqrt(p.velocity.x**2 + p.velocity.y**2);
        const isMoving = speed > 20;
        const isSprinting = p.sprintTime > 0;
        const isDashing = p.dashTime > 0;
        const walkSpeed = isDashing ? 30 : (isSprinting ? 50 : 85); // Faster animation when dashing
        const walkCycle = Math.sin(now / walkSpeed) * (isMoving ? 1 : 0);
        
        // Natural body movements
        const bobAmount = isMoving ? Math.sin(now / (walkSpeed * 2)) * 3 : Math.sin(now / 1000) * 0.5; // Bob while moving, breathe while idle
        const sway = isMoving ? Math.sin(now / walkSpeed) * 0.05 : 0; // Body sway during movement
        const shoulderTilt = isMoving ? walkCycle * 0.08 : 0; // Shoulders rotate with steps

        // Enhanced sprint/dash effects with stronger visuals
        if (isDashing) {
          // Dash effect - strong cyan/electric blue glow with pulsing
          const dashPulse = 1 + Math.sin(now / 50) * 0.3;
          ctx.shadowBlur = (isMobile ? 20 * MOBILE_SHADOW_BLUR_REDUCTION : 20) * dashPulse; 
          ctx.shadowColor = isEnemy ? '#ff0000' : '#00ffff'; 
          
          // Add dash trail particles
          if (Math.random() < 0.3) {
            addParticle(state, {
              x: p.position.x - Math.cos(p.angle) * 20,
              y: p.position.y - Math.sin(p.angle) * 20,
              vx: (Math.random() - 0.5) * 100,
              vy: (Math.random() - 0.5) * 100,
              life: 300,
              maxLife: 300,
              color: isEnemy ? '#ff0000' : '#00ffff',
              size: 4 + Math.random() * 3
            });
          }
        } else if (isSprinting) { 
          // Sprint effect - blue glow with subtle pulse
          const sprintPulse = 1 + Math.sin(now / 100) * 0.15;
          ctx.shadowBlur = (isMobile ? 14 * MOBILE_SHADOW_BLUR_REDUCTION : 14) * sprintPulse; 
          ctx.shadowColor = isEnemy ? '#ff6b6b' : '#4a9eff'; 
          
          // Add sprint dust particles occasionally
          if (Math.random() < 0.15) {
            addParticle(state, {
              x: p.position.x - Math.cos(p.angle) * 15,
              y: p.position.y - Math.sin(p.angle) * 15,
              vx: (Math.random() - 0.5) * 50,
              vy: (Math.random() - 0.5) * 50,
              life: 400,
              maxLife: 400,
              color: '#aabbcc',
              size: 2 + Math.random() * 2
            });
          }
        }
        
        // Health bar above player
        const healthBarWidth = 50;
        const healthBarHeight = 6;
        const healthPercentage = p.hp / p.maxHp;
        
        ctx.save();
        ctx.rotate(-p.angle); // Keep health bar horizontal
        
        // Health bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(-healthBarWidth/2, -45, healthBarWidth, healthBarHeight);
        
        // Health bar fill
        const healthColor = healthPercentage > 0.6 ? '#22c55e' : healthPercentage > 0.3 ? '#f59e0b' : '#ef4444';
        ctx.fillStyle = healthColor;
        ctx.fillRect(-healthBarWidth/2, -45, healthBarWidth * healthPercentage, healthBarHeight);
        
        // Health bar border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-healthBarWidth/2, -45, healthBarWidth, healthBarHeight);
        
        // Armor bar if present
        if (p.armor > 0) {
          const armorPercentage = p.armor / 50;
          ctx.fillStyle = 'rgba(59, 130, 246, 0.8)';
          ctx.fillRect(-healthBarWidth/2, -52, healthBarWidth * armorPercentage, 4);
        }
        
        // Power-up indicators above health bar
        let indicatorY = -60;
        
        // Invulnerability shield indicator
        if (p.invulnerable > 0) {
          const shieldPulse = 1 + Math.sin(now / 100) * 0.2;
          ctx.fillStyle = '#ffd700';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('🛡️', 0, indicatorY);
          indicatorY -= 10;
          
          // Add shield particle ring around player occasionally
          if (Math.random() < 0.2) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 45 + Math.random() * 10;
            addParticle(state, {
              x: p.position.x + Math.cos(angle) * dist,
              y: p.position.y + Math.sin(angle) * dist,
              vx: Math.cos(angle) * 30,
              vy: Math.sin(angle) * 30,
              life: 500,
              maxLife: 500,
              color: '#ffd700',
              size: 3
            });
          }
        }
        
        // Speed boost indicator
        if (p.speedBoostUntil && p.speedBoostUntil > now) {
          ctx.fillStyle = '#00ff88';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('⚡', 0, indicatorY);
          indicatorY -= 10;
        }
        
        // Damage boost indicator
        if (p.damageBoostUntil && p.damageBoostUntil > now) {
          ctx.fillStyle = '#ff4444';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('💥', 0, indicatorY);
        }
        
        ctx.restore();

        // Invulnerability shield visual effect
        if (p.invulnerable > 0) {
          const shieldPulse = 1 + Math.sin(now / 150) * 0.15;
          const shieldRadius = 42 * shieldPulse;
          
          // Shield bubble with gradient
          const gradient = ctx.createRadialGradient(0, 0, shieldRadius * 0.7, 0, 0, shieldRadius);
          gradient.addColorStop(0, 'rgba(255, 215, 0, 0)');
          gradient.addColorStop(0.85, 'rgba(255, 215, 0, 0.3)');
          gradient.addColorStop(1, 'rgba(255, 215, 0, 0.6)');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
          ctx.fill();
          
          // Shield outline with glow
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 2;
          ctx.shadowBlur = isMobile ? 10 * MOBILE_SHADOW_BLUR_REDUCTION : 10;
          ctx.shadowColor = '#ffd700';
          ctx.beginPath();
          ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        
        // Apply natural body movement
        ctx.translate(0, bobAmount);
        ctx.rotate(sway); // Natural body sway
        
        // 1. Backpack
        ctx.fillStyle = '#171717'; // Almost black
        ctx.fillRect(-22, -12, 10, 24); // Block on back

        // 2. Enhanced Human-like Legs with natural walking motion
        ctx.fillStyle = colors.pants;
        const legStride = isMoving ? (isSprinting ? 12 : 9) : 0; // Longer stride when sprinting
        const legSwing = walkCycle * legStride;
        const legLift = Math.abs(walkCycle) * (isSprinting ? 5 : 4); // Higher leg lift when sprinting
        const kneeRotation = walkCycle * (isSprinting ? 0.4 : 0.35); // Natural knee bend
        
        // Right Leg (with thigh and calf sections for realism)
        ctx.save();
        ctx.translate(-5 - legSwing, 8);
        ctx.rotate(kneeRotation);
        
        // Thigh
        ctx.fillStyle = colors.pants;
        ctx.fillRect(-3, -8, 6, 12);
        
        // Knee joint
        ctx.beginPath();
        ctx.arc(0, 4, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Calf (lower leg)
        ctx.save();
        ctx.translate(0, 4);
        ctx.rotate(Math.abs(walkCycle) * 0.2); // Additional ankle movement
        ctx.fillRect(-2.5, 0, 5, 10);
        
        // Enhanced Foot/Shoe with 3D effect and detail - Right
        ctx.fillStyle = '#1a1a1a'; // Shoe body
        ctx.fillRect(-3, 10, 9, 5);
        ctx.fillStyle = '#404040'; // Shoe sole
        ctx.fillRect(-3, 14, 9, 1);
        ctx.fillStyle = '#2a2a2a'; // Highlight
        ctx.fillRect(-2, 10, 7, 2);
        ctx.fillStyle = '#555'; // Laces
        ctx.fillRect(-1, 11, 1, 2);
        ctx.fillRect(1, 11, 1, 2);
        
        ctx.restore();
        ctx.restore();
        
        // Left Leg (opposite motion)
        ctx.save();
        ctx.translate(-5 + legSwing, -8);
        ctx.rotate(-kneeRotation);
        
        // Thigh with gradient shading
        ctx.fillStyle = colors.pants;
        ctx.fillRect(-3, -8, 6, 12);
        // Add highlight for 3D effect
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(-3, -8, 3, 10);
        
        // Knee joint with shading
        ctx.fillStyle = colors.pants;
        ctx.beginPath();
        ctx.arc(0, 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(1, 5, 3, 0, Math.PI * 2);
        ctx.fill();
        
        // Calf (lower leg) with shading
        ctx.save();
        ctx.translate(0, 4);
        ctx.rotate(-Math.abs(walkCycle) * 0.2);
        ctx.fillStyle = colors.pants;
        ctx.fillRect(-2.5, 0, 5, 10);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(-2.5, 0, 2, 8);
        
        // Enhanced Foot/Shoe with 3D effect - Left
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(-3, 10, 9, 5);
        ctx.fillStyle = '#404040';
        ctx.fillRect(-3, 14, 9, 1);
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(-2, 10, 7, 2);
        ctx.fillStyle = '#555';
        ctx.fillRect(-1, 11, 1, 2);
        ctx.fillRect(1, 11, 1, 2);
        
        ctx.restore();
        ctx.restore();

        // 3. Body (Shirt) with realistic torso rotation
        ctx.save();
        ctx.rotate(shoulderTilt); // Shoulders rotate naturally during movement
        
        // Torso
        ctx.fillStyle = colors.shirt;
        ctx.beginPath(); 
        // More oval/human-like torso shape
        ctx.ellipse(0, 0, 16, 18, 0, 0, Math.PI * 2); 
        ctx.fill();
        
        // Body highlight for depth and volume
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath();
        ctx.ellipse(-4, -4, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Body shadow for depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(4, 4, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Skin-specific body details
        if (p.skin === SkinType.Police) {
          // Police badge on chest
          ctx.fillStyle = colors.badge;
          ctx.beginPath();
          ctx.arc(-8, -5, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#1e40af';
          ctx.beginPath();
          ctx.arc(-8, -5, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.skin === SkinType.Terrorist) {
          // Red patch/insignia
          ctx.fillStyle = colors.badge;
          ctx.fillRect(-10, -8, 6, 6);
          ctx.fillStyle = '#000';
          ctx.fillRect(-9, -7, 4, 4);
        } else if (p.skin === SkinType.Homeless) {
          // Patches/tears on shirt
          ctx.fillStyle = '#57534e';
          ctx.fillRect(-6, 2, 4, 3);
          ctx.fillRect(4, -6, 3, 4);
        }

        // 4. Vest (Armor) with better placement
        if (p.armor > 0) {
            ctx.fillStyle = '#334155'; // Dark strap
            ctx.fillRect(-5, -18, 4, 36);
            ctx.fillStyle = colors.vest;
            // Armor plate with more detail
            ctx.beginPath();
            ctx.moveTo(9, -12);
            ctx.lineTo(9, 12);
            ctx.lineTo(-5, 14);
            ctx.lineTo(-5, -14);
            ctx.closePath();
            ctx.fill();
            // Armor highlights
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(-3, -10, 8, 3);
        }
        
        ctx.restore();

        // 5. Head with natural position
        ctx.save();
        // Slight head tilt during movement for realism
        const headTilt = isMoving ? walkCycle * 0.03 : Math.sin(now / 2000) * 0.02; // Subtle breathing motion
        ctx.rotate(headTilt);
        
        // Neck
        ctx.fillStyle = colors.skin;
        ctx.fillRect(-4, -8, 8, 8);
        
        // Head
        ctx.fillStyle = colors.skin;
        ctx.beginPath(); 
        ctx.ellipse(0, -5, 11, 12, 0, 0, Math.PI * 2); // More realistic head shape
        ctx.fill();
        
        // Helmet/Headgear with skin-specific style
        ctx.fillStyle = colors.helmet;
        ctx.beginPath(); 
        ctx.ellipse(-2, -6, 11, 12, 0, 0, Math.PI * 2); 
        ctx.fill();
        
        // Skin-specific headgear details
        if (p.skin === SkinType.Police) {
          // Police helmet visor
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(4, -8, 6, 11);
          ctx.fillStyle = '#38bdf8'; // Glass reflection
          ctx.fillRect(6, -6, 2, 4);
          // Visor frame
          ctx.strokeStyle = '#1e293b';
          ctx.lineWidth = 1;
          ctx.strokeRect(4, -8, 6, 11);
        } else if (p.skin === SkinType.Terrorist) {
          // Tactical mask/balaclava
          ctx.fillStyle = '#0a0a0a';
          ctx.fillRect(3, -9, 7, 12);
          // Eye holes
          ctx.fillStyle = colors.skin;
          ctx.fillRect(4, -7, 2, 3);
          ctx.fillRect(7, -7, 2, 3);
        } else if (p.skin === SkinType.Homeless) {
          // Beanie/old cap with no visor
          ctx.fillStyle = colors.helmet;
          ctx.fillRect(-10, -12, 18, 6);
          // Worn/dirty texture
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.fillRect(-8, -11, 3, 3);
          ctx.fillRect(-2, -10, 4, 2);
        }
        
        ctx.restore();

        ctx.shadowBlur = 0; 
        
        // Draw Weapon with improved recoil animation
        const timeSince = now - p.lastFired;
        const stats = WEAPONS[p.weapon];
        const duration = Math.min(stats.fireRate * 0.7, 120); 
        let recoil = 0;
        let recoilRotation = 0;
        if (timeSince < duration) {
             const t = timeSince / duration;
             const kick = 8;
             // Smooth easing function for recoil
             if (t < 0.15) {
               recoil = lerp(0, kick, t / 0.15);
               recoilRotation = lerp(0, 0.08, t / 0.15);
             } else {
               recoil = lerp(kick, 0, (t - 0.15) / 0.85);
               recoilRotation = lerp(0.08, 0, (t - 0.15) / 0.85);
             }
        }
        
        ctx.save();
        ctx.rotate(-recoilRotation); // Add slight rotation to recoil

        // Enhanced weapon rendering with more detail
        // Gun shadow for depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(13 - recoil, -2, 33, 6);
        
        // Main gun body with metallic effect
        ctx.fillStyle = '#1f1f1f'; // Gun body
        ctx.fillRect(12 - recoil, -3, 32, 6);
        
        // Gun highlight for 3D effect
        ctx.fillStyle = '#3a3a3a';
        ctx.fillRect(12 - recoil, -3, 32, 2);
        
        // Gun barrel - longer and more detailed
        ctx.fillStyle = '#050505';
        ctx.fillRect(36 - recoil, -2, 12, 4);
        
        // Barrel opening
        ctx.fillStyle = '#000000';
        ctx.fillRect(46 - recoil, -1.5, 2, 3);
        
        // Barrel highlight
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(36 - recoil, -2, 12, 1);
        
        // Gun grip/handle
        ctx.fillStyle = '#2d2d2d'; 
        ctx.fillRect(16 - recoil, -1, 8, 4);
        ctx.fillRect(14 - recoil, 2, 4, 6);
        
        // Magazine detail
        ctx.fillStyle = '#404040'; 
        ctx.fillRect(20 - recoil, -2, 6, 5);
        
        // Weapon-specific color accent (larger and more visible)
        ctx.fillStyle = stats.color;
        ctx.fillRect(18 - recoil, -2, 5, 2);
        
        // Trigger guard
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(22 - recoil, 3, 3, 0, Math.PI);
        ctx.stroke();
        
        // Weapon glow effect
        ctx.shadowBlur = isMobile ? 6 * MOBILE_SHADOW_BLUR_REDUCTION : 6;
        ctx.shadowColor = stats.color;
        ctx.fillStyle = stats.color;
        ctx.fillRect(18 - recoil, -2, 5, 2);
        ctx.shadowBlur = 0;
        
        ctx.restore();

        // Enhanced Arms with natural swing motion
        const armSwing = isMoving ? walkCycle * 0.15 : 0;
        
        // Right arm (weapon holding)
        ctx.save();
        ctx.translate(8, 8);
        ctx.rotate(armSwing - recoilRotation);
        
        // Upper arm
        ctx.strokeStyle = colors.shirt;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(6 - recoil, 4);
        ctx.stroke();
        
        // Forearm
        ctx.beginPath();
        ctx.moveTo(6 - recoil, 4);
        ctx.lineTo(12 - recoil, 6);
        ctx.stroke();
        
        // Right hand (trigger)
        ctx.fillStyle = '#374151'; // Dark gloves
        ctx.beginPath(); 
        ctx.arc(12 - recoil, 6, 5, 0, Math.PI*2); 
        ctx.fill();
        // Finger detail
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(13 - recoil, 5, 3, 2);
        
        ctx.restore();
        
        // Left arm (support hand)
        ctx.save();
        ctx.translate(8, -8);
        ctx.rotate(-armSwing * 0.7);
        
        // Upper arm
        ctx.strokeStyle = colors.shirt;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12 - recoil, -2);
        ctx.stroke();
        
        // Forearm
        ctx.beginPath();
        ctx.moveTo(12 - recoil, -2);
        ctx.lineTo(20 - recoil, -4);
        ctx.stroke();
        
        // Left hand (barrel support)
        ctx.fillStyle = '#374151';
        ctx.beginPath(); 
        ctx.arc(20 - recoil, -4, 5, 0, Math.PI*2); 
        ctx.fill();
        
        ctx.restore();

        ctx.restore();
        
        // HP Bar
        ctx.fillStyle = '#000'; ctx.fillRect(p.position.x - 24, p.position.y - 50, 48, 6);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(p.position.x - 24, p.position.y - 50, 48 * (p.hp / p.maxHp), 6);
        if (p.armor > 0) { ctx.fillStyle = '#3b82f6'; ctx.fillRect(p.position.x - 24, p.position.y - 58, 48 * (p.armor / 50), 4); }
        if (p.isReloading) { ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.fillText('RELOADING', p.position.x - 24, p.position.y - 65); }
      });

      // Render Zombies in Survival Mode
      if (state.zombies) {
        state.zombies.forEach((zombie: Player) => {
          ctx.save();
          ctx.translate(zombie.position.x, zombie.position.y);
          ctx.rotate(zombie.angle);
          
          // Zombie appearance with enhanced variety based on type, wave, and skin variant
          const zombieType = zombie.zombieType || 'normal';
          const waveNumber = state.currentWave;
          const skinVariant = zombie.zombieSkinVariant || 0;
          
          // Skin variant hue adjustments for visual variety (0-4)
          const hueVariations = [0, 20, 40, -15, -30]; // Different hue shifts
          const hueShift = hueVariations[skinVariant % 5];
          
          // Different colors and sizes for different zombie types with wave-based intensity
          let zombieColors;
          let sizeMultiplier = 1.0;
          let glowIntensity = 10;
          
          if (zombieType === 'fast') {
            // Fast zombies: Varied greens/yellows with yellow eyes, smaller and more agile looking
            const baseHue = 142 + hueShift; // Green shifted by variant
            zombieColors = { 
              body: `hsl(${baseHue}, ${Math.min(40 + waveNumber * 2, 80)}%, ${Math.min(35 + waveNumber, 65)}%)`, 
              limbs: `hsl(${baseHue}, ${Math.min(50 + waveNumber * 2, 85)}%, ${Math.min(25 + waveNumber, 55)}%)`, 
              eyes: skinVariant % 2 === 0 ? '#fef08a' : '#facc15', // Alternate eye colors
              glow: `hsl(${baseHue}, 70%, 50%)` 
            };
            sizeMultiplier = 0.85;
            glowIntensity = 15;
          } else if (zombieType === 'tank') {
            // Tank zombies: Bright varied colors with red eyes, much larger and intimidating
            const baseHue = 142 + hueShift;
            zombieColors = { 
              body: `hsl(${baseHue}, ${Math.min(50 + waveNumber * 3, 90)}%, ${Math.min(50 + waveNumber * 2, 75)}%)`, 
              limbs: `hsl(${baseHue}, ${Math.min(60 + waveNumber * 3, 95)}%, ${Math.min(40 + waveNumber * 2, 65)}%)`, 
              eyes: skinVariant % 3 === 0 ? '#dc2626' : skinVariant % 3 === 1 ? '#b91c1c' : '#7f1d1d', // Varied red eyes
              glow: `hsl(${baseHue + 20}, 80%, 50%)` 
            };
            sizeMultiplier = 1.4;
            glowIntensity = 20;
          } else {
            // Normal zombies: Varied greens with different eye colors
            const baseHue = 142 + hueShift;
            zombieColors = { 
              body: `hsl(${baseHue}, ${Math.min(45 + waveNumber * 2, 85)}%, ${Math.min(40 + waveNumber, 70)}%)`, 
              limbs: `hsl(${baseHue}, ${Math.min(55 + waveNumber * 2, 90)}%, ${Math.min(30 + waveNumber, 60)}%)`, 
              eyes: skinVariant % 4 === 0 ? '#ef4444' : skinVariant % 4 === 1 ? '#f59e0b' : skinVariant % 4 === 2 ? '#fef08a' : '#dc2626',
              glow: `hsl(${baseHue}, 65%, 45%)` 
            };
            sizeMultiplier = Math.min(1.0 + (waveNumber * 0.02), 1.4); // Gradually larger with cap
            glowIntensity = Math.min(10 + waveNumber, 25);
          }
          
          // Zombie glow effect (increases with wave number)
          ctx.shadowBlur = isMobile ? glowIntensity * MOBILE_SHADOW_BLUR_REDUCTION : glowIntensity;
          ctx.shadowColor = zombieColors.glow;
          
          // Animation
          const speed = Math.sqrt(zombie.velocity.x**2 + zombie.velocity.y**2);
          const isMoving = speed > 20;
          const walkCycle = Math.sin(now / (zombieType === 'fast' ? 80 : 120)) * (isMoving ? 1 : 0.3);
          const bobAmount = isMoving ? Math.sin(now / (zombieType === 'fast' ? 160 : 240)) * 2 : 0;
          
          ctx.translate(0, bobAmount);
          
          // Scale based on type
          ctx.scale(sizeMultiplier, sizeMultiplier);
          
          // Body (with slight variations)
          ctx.fillStyle = zombieColors.body;
          if (zombieType === 'tank') {
            // Tank zombies have a wider, more muscular body
            ctx.fillRect(-15, -20, 30, 35);
          } else {
            ctx.fillRect(-12, -20, 24, 32);
          }
          
          // Head (size varies by type)
          ctx.fillStyle = zombieColors.body;
          ctx.beginPath();
          const headSize = zombieType === 'tank' ? 16 : zombieType === 'fast' ? 12 : 14;
          ctx.arc(0, -26, headSize, 0, Math.PI * 2);
          ctx.fill();
          
          // Eyes (glowing, intensity varies)
          ctx.shadowBlur = isMobile ? (glowIntensity * 0.8) * MOBILE_SHADOW_BLUR_REDUCTION : glowIntensity * 0.8;
          ctx.shadowColor = zombieColors.eyes;
          ctx.fillStyle = zombieColors.eyes;
          ctx.beginPath();
          const eyeSize = zombieType === 'tank' ? 4 : 3;
          const eyeSpacing = zombieType === 'tank' ? 6 : 5;
          ctx.arc(-eyeSpacing, -28, eyeSize, 0, Math.PI * 2);
          ctx.arc(eyeSpacing, -28, eyeSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          
          // Arms (thickness varies by type)
          ctx.strokeStyle = zombieColors.limbs;
          ctx.lineWidth = zombieType === 'tank' ? 7 : zombieType === 'fast' ? 4 : 5;
          ctx.lineCap = 'round';
          
          // Left arm
          ctx.beginPath();
          ctx.moveTo(-12, -12);
          ctx.lineTo(-18 + walkCycle * 8, 5 + walkCycle * 6);
          ctx.stroke();
          
          // Right arm
          ctx.beginPath();
          ctx.moveTo(12, -12);
          ctx.lineTo(18 - walkCycle * 8, 5 - walkCycle * 6);
          ctx.stroke();
          
          // Legs
          ctx.lineWidth = 6;
          
          // Left leg
          ctx.beginPath();
          ctx.moveTo(-6, 12);
          ctx.lineTo(-8 + walkCycle * 10, 28);
          ctx.stroke();
          
          // Right leg
          ctx.beginPath();
          ctx.moveTo(6, 12);
          ctx.lineTo(8 - walkCycle * 10, 28);
          ctx.stroke();
          
          ctx.restore();
          
          // HP Bar (green for zombies)
          ctx.fillStyle = '#000';
          ctx.fillRect(zombie.position.x - 24, zombie.position.y - 50, 48, 6);
          ctx.fillStyle = '#22c55e';
          ctx.fillRect(zombie.position.x - 24, zombie.position.y - 50, 48 * (zombie.hp / zombie.maxHp), 6);
          
          // Zombie type indicator
          if (zombieType !== 'normal') {
            ctx.fillStyle = zombieType === 'fast' ? '#fef08a' : '#ef4444';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(zombieType.toUpperCase(), zombie.position.x, zombie.position.y - 60);
          }
        });
      }

      ctx.restore();
  };

  if (!isReady) {
      return (
          <div className="absolute inset-0 bg-green-500 flex items-center justify-center text-white">
              <div className="animate-pulse text-2xl font-bold">Loading Game...</div>
          </div>
      );
  }

  return <canvas ref={canvasRef} className="block bg-green-500 w-full h-full" />;
};
