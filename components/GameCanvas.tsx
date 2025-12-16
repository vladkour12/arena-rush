import React, { useEffect, useRef, useState } from 'react';
import { Player, Bullet, LootItem, Wall, WeaponType, Vector2, ItemType, NetworkMsgType, InitPackage, InputPackage, StatePackage } from '../types';
import { WEAPONS, MAP_SIZE, TILE_SIZE, PLAYER_RADIUS, PLAYER_SPEED, BOT_SPEED, INITIAL_ZONE_RADIUS, SHRINK_START_TIME, SHRINK_DURATION, MIN_ZONE_RADIUS, LOOT_SPAWN_INTERVAL, ZOOM_LEVEL, CAMERA_LERP, SPRINT_MULTIPLIER, SPRINT_DURATION, SPRINT_COOLDOWN, MOVE_ACCEL, MOVE_DECEL, MOVE_TURN_ACCEL, STICK_AIM_TURN_SPEED, AUTO_FIRE_THRESHOLD, MAX_LOOT_ITEMS, BOT_MIN_SEPARATION_DISTANCE, BOT_ACCURACY, BOT_LOOT_SEARCH_RADIUS, ZONE_DAMAGE_PER_SECOND, HEALTH_REGEN_DELAY, HEALTH_REGEN_RATE, MUZZLE_FLASH_DURATION, BOT_LEAD_FACTOR, BOT_LEAD_MULTIPLIER, TARGET_FPS, MOBILE_SHADOW_BLUR_REDUCTION, MOBILE_MAX_PARTICLES, DESKTOP_MAX_PARTICLES, MOBILE_BULLET_TRAIL_LENGTH } from '../constants';
import { getDistance, getAngle, checkCircleCollision, checkWallCollision, randomRange, lerp, lerpAngle, isMobileDevice, getOptimizedDPR } from '../utils/gameUtils';
import { NetworkManager } from '../utils/network';

interface GameCanvasProps {
  onGameOver: (winner: 'Player' | 'Bot') => void;
  onUpdateStats: (hp: number, ammo: number, weapon: WeaponType, armor: number, time: number, sprint: number) => void;
  inputRef: React.MutableRefObject<{ move: Vector2; aim: Vector2; sprint: boolean }>;
  network?: NetworkManager | null;
  isHost?: boolean;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  onGameOver, 
  onUpdateStats, 
  inputRef,
  network,
  isHost = false
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
      position: { x: MAP_SIZE / 4, y: MAP_SIZE / 2 },
      radius: PLAYER_RADIUS,
      hp: 100,
      maxHp: 100,
      armor: 0,
      velocity: { x: 0, y: 0 },
      angle: 0,
      weapon: WeaponType.Pistol,
      ammo: WEAPONS[WeaponType.Pistol].clipSize,
      isReloading: false,
      reloadTimer: 0,
      lastFired: 0,
      speedMultiplier: 1,
      invulnerable: 0,
      isBot: false,
      sprintTime: 0,
      sprintCooldown: 0,
      lastDamageTime: 0,
      regenTimer: 0
    } as Player,
    bot: { // Used as Opponent (Bot or Player 2)
      id: 'p2',
      position: { x: MAP_SIZE * 0.75, y: MAP_SIZE / 2 },
      radius: PLAYER_RADIUS,
      hp: 100,
      maxHp: 100,
      armor: 0,
      velocity: { x: 0, y: 0 },
      angle: Math.PI,
      weapon: isHost || !network ? WeaponType.SMG : WeaponType.Pistol, // Bot starts with SMG, Human with Pistol
      ammo: WEAPONS[WeaponType.SMG].clipSize,
      isReloading: false,
      reloadTimer: 0,
      lastFired: 0,
      speedMultiplier: 1,
      invulnerable: 0,
      isBot: !network, // True if singleplayer
      sprintTime: 0,
      sprintCooldown: 0,
      lastDamageTime: 0,
      regenTimer: 0
    } as Player,
    bullets: [] as Bullet[],
    loot: [] as LootItem[],
    walls: [] as Wall[],
    zoneRadius: INITIAL_ZONE_RADIUS,
    startTime: Date.now(),
    lastTime: Date.now(), 
    lastLootTime: 0,
    gameOver: false,
    camera: { x: 0, y: 0 },
    
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

    // Host or Single Player -> Generate Map with improved layout
    const walls: Wall[] = [];
    
    // Create more varied combat zones with better tactical positioning
    const zones = [
      { centerX: 400, centerY: 400, type: 'urban' },      // Top-left: Dense cover
      { centerX: 1600, centerY: 400, type: 'open' },      // Top-right: Open area with sparse cover
      { centerX: 400, centerY: 1600, type: 'bunker' },    // Bottom-left: Large structures
      { centerX: 1600, centerY: 1600, type: 'scattered' },// Bottom-right: Scattered crates
      { centerX: 1000, centerY: 1000, type: 'central' }   // Center: Mixed tactical cover
    ];
    
    // Add structured cover with guaranteed spacing and variety
    const minWallDistance = 150; // Minimum distance between walls to prevent stuck
    zones.forEach((zone, zoneIdx) => {
      let wallsInZone = zone.type === 'urban' ? 7 : zone.type === 'open' ? 3 : 5;
      
      for(let i=0; i<wallsInZone; i++) {
        let attempts = 0;
        let wallPos = { x: 0, y: 0 };
        let isValid = false;
        
        while(!isValid && attempts < 30) {
          const spread = zone.type === 'urban' ? 150 : zone.type === 'open' ? 300 : 200;
          wallPos = {
            x: zone.centerX + randomRange(-spread, spread),
            y: zone.centerY + randomRange(-spread, spread)
          };
          
          // Check distance from all existing walls
          isValid = walls.every(w => {
            const dx = wallPos.x - w.position.x;
            const dy = wallPos.y - w.position.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            return dist >= minWallDistance;
          });
          
          attempts++;
        }
        
        if(isValid) {
          // Vary wall sizes based on zone type
          let width, height;
          if (zone.type === 'bunker') {
            width = randomRange(140, 220);
            height = randomRange(140, 220);
          } else if (zone.type === 'urban') {
            width = randomRange(120, 180);
            height = randomRange(120, 180);
          } else {
            width = randomRange(100, 160);
            height = randomRange(100, 160);
          }
          
          walls.push({
            id: `wall-${zoneIdx}-${i}`,
            position: wallPos,
            width,
            height,
            radius: 0
          });
        }
      }
    });
    
    // Add more varied scattered crates with different sizes
    for(let i=0; i<15; i++) {
      let attempts = 0;
      let cratePos = { x: 0, y: 0 };
      let isValid = false;
      
      while(!isValid && attempts < 30) {
        cratePos = {
          x: randomRange(200, MAP_SIZE-200),
          y: randomRange(200, MAP_SIZE-200)
        };
        
        isValid = walls.every(w => {
          const dx = cratePos.x - w.position.x;
          const dy = cratePos.y - w.position.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          return dist >= minWallDistance;
        });
        
        attempts++;
      }
      
      if(isValid) {
        // Vary crate sizes for visual interest
        const size = i % 3 === 0 ? 100 : i % 3 === 1 ? 70 : 80;
        walls.push({
          id: `crate-${i}`,
          position: cratePos,
          width: size,
          height: size,
          radius: 0
        });
      }
    }
    
    // Map boundaries with proper padding
    walls.push({ id: 'b-top', position: { x: -100, y: -100 }, width: MAP_SIZE + 200, height: 100, radius: 0 });
    walls.push({ id: 'b-bottom', position: { x: -100, y: MAP_SIZE }, width: MAP_SIZE + 200, height: 100, radius: 0 });
    walls.push({ id: 'b-left', position: { x: -100, y: 0 }, width: 100, height: MAP_SIZE, radius: 0 });
    walls.push({ id: 'b-right', position: { x: MAP_SIZE, y: 0 }, width: 100, height: MAP_SIZE, radius: 0 });

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
          radius: 20,
          type,
          weaponType,
          value: type === ItemType.Medkit ? 30 : 0
        });
      }
    };

    // Shared update logic
    const updateEntity = (entity: Player, moveVec: Vector2, aimVec: Vector2 | null, wantSprint: boolean, inputAngle: number | null, dt: number, now: number) => {
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
      entity.speedMultiplier = isSprinting ? SPRINT_MULTIPLIER : 1;

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
      
      // Unstuck mechanism: if player is stuck in multiple walls, find average push direction
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
            totalPushX += dx / dist;
            totalPushY += dy / dist;
            collisionCount++;
          }
        }
      }
      
      // Apply averaged push if stuck
      if (collisionCount > 0) {
        const pushStrength = 5;
        entity.position.x += (totalPushX / collisionCount) * pushStrength;
        entity.position.y += (totalPushY / collisionCount) * pushStrength;
      }

      // Aiming
      let firing = false;
      
      // If Human (Local or Remote P2)
      if (!entity.isBot) {
          if (aimVec) {
             const aimMagnitude = Math.sqrt(aimVec.x**2 + aimVec.y**2);
             if (aimMagnitude > 0.1) {
                 let desiredAngle = Math.atan2(aimVec.y, aimVec.x);
                 // Aim Assist (Only for Local P1 in singleplayer/host? Or both? Let's keep it simple)
                 // Just normal aim
                 entity.angle = lerpAngle(entity.angle, desiredAngle, dt * STICK_AIM_TURN_SPEED);
                 if (aimMagnitude > AUTO_FIRE_THRESHOLD) firing = true;
             } else if (Math.abs(moveVec.x) > 0.1 || Math.abs(moveVec.y) > 0.1) {
                 const moveAngle = Math.atan2(moveVec.y, moveVec.x);
                 entity.angle = lerpAngle(entity.angle, moveAngle, dt * 10);
             }
          } 
          // Remote players might send explicit angle
          if (inputAngle !== null) {
              entity.angle = inputAngle; // Use authoritative angle from client or host
          }
      }

      // Reloading
      if (entity.isReloading) {
        if (now > entity.reloadTimer) {
          entity.isReloading = false;
          entity.ammo = WEAPONS[entity.weapon].clipSize;
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
      const { move, aim, sprint, fire, angle } = inputRef.current; // Local Input

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
      
      // Update Player 1 (Me)
      const p1Fire = updateEntity(state.player, move, aim, sprint, null, dt, now);
      if ((p1Fire || fire) && !state.player.isReloading && now - state.player.lastFired > WEAPONS[state.player.weapon].fireRate) {
          fireWeapon(state.player, now);
      }

      // Update Player 2 (Bot or Client)
      const bot = state.bot;
      let p2Fire = false;

      if (network && isHost) {
          // Multiplayer Opponent
          const remote = state.remoteInput;
          // Apply remote inputs
          p2Fire = updateEntity(bot, remote.move, remote.aim, remote.sprint, remote.angle, dt, now);
          if (remote.fire) p2Fire = true;
      } else {
          // Bot Logic
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
          
          updateEntity(bot, botMove, null, (isLowHealth || distToPlayer > 600) && bot.sprintCooldown <= 0, null, dt, now);
      }

      if (p2Fire && !bot.isReloading) {
           fireWeapon(bot, now);
      }

      // Bullets
      updateBullets(state, dt, now);

      // Update Visual Effects
      updateVisualEffects(state, dt);

      // Loot & Zone
      updateLoot(state);
      checkZone(state, now, dt);

      // Game Over Check
      if (state.player.hp <= 0) { state.gameOver = true; onGameOver('Bot'); if(network) network.send(NetworkMsgType.GameOver, 'Bot'); } 
      else if (state.bot.hp <= 0) { state.gameOver = true; onGameOver('Player'); if(network) network.send(NetworkMsgType.GameOver, 'Player'); }

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
            state.player.weapon, 
            Math.ceil(state.player.armor), 
            Math.max(0, SHRINK_START_TIME + SHRINK_DURATION - elapsed),
            Math.max(0, state.player.sprintCooldown)
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
              radius: 4,
              velocity: {
                x: Math.cos(pAngle) * weapon.speed,
                y: Math.sin(pAngle) * weapon.speed
              },
              damage: weapon.damage,
              rangeRemaining: weapon.range,
              color: weapon.color
            });
          }
          if (entity.ammo === 0) { entity.isReloading = true; entity.reloadTimer = now + weapon.reloadTime; }
        } else {
            entity.isReloading = true; entity.reloadTimer = now + WEAPONS[entity.weapon].reloadTime;
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
        
        const target = b.ownerId === state.player.id ? state.bot : state.player;
        if (!remove && checkCircleCollision(b, target)) {
          if (target.armor > 0) target.armor = Math.max(0, target.armor - b.damage);
          else target.hp -= b.damage;
          target.lastDamageTime = now;
          target.regenTimer = 0; 
          
          // Add hit marker
          state.hitMarkers.push({
            x: b.position.x,
            y: b.position.y,
            life: 500,
            damage: b.damage
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
        state.hitMarkers[i].life -= dt * 1000;
        if (state.hitMarkers[i].life <= 0) state.hitMarkers.splice(i, 1);
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
                    if (p.hp < p.maxHp) p.hp = Math.min(p.hp + item.value, p.maxHp); else consumed = false;
                  } else if (item.type === ItemType.Shield) {
                    p.armor = Math.min(p.armor + 50, 50);
                  } else if (item.type === ItemType.Ammo) {
                    p.ammo = WEAPONS[p.weapon].clipSize; p.isReloading = false;
                  } else if (item.type === ItemType.Weapon && item.weaponType) {
                    p.weapon = item.weaponType; p.ammo = WEAPONS[item.weaponType].clipSize; p.isReloading = false;
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

  // Helper to create cached background (grid + checkerboard)
  const createBackgroundCache = (zoom: number) => {
    // Use tolerance to avoid cache invalidation for minor zoom changes
    const zoomChanged = !renderCache.current.lastZoom || 
                        Math.abs(renderCache.current.lastZoom - zoom) > 0.01;
    if (!renderCache.current.backgroundCanvas || zoomChanged) {
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = MAP_SIZE;
      bgCanvas.height = MAP_SIZE;
      const bgCtx = bgCanvas.getContext('2d')!;
      
      // Base bright green fill
      bgCtx.fillStyle = '#22c55e';
      bgCtx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
      
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

      // Fill entire visible area with bright green (extended beyond map boundaries)
      const padding = 500; // Extra padding to ensure no black corners
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(-padding, -padding, MAP_SIZE + padding * 2, MAP_SIZE + padding * 2);

      // Draw cached background
      const bgCache = createBackgroundCache(zoom);
      ctx.drawImage(bgCache, 0, 0);
      
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

      // Render Loot with improved visuals
      state.loot.forEach((item: LootItem) => { 
        ctx.save(); 
        ctx.translate(item.position.x, item.position.y);
        
        // Smooth bobbing & rotation animation
        const bob = Math.sin(now / 350) * 5;
        const spin = now / 1000;
        const pulse = Math.sin(now / 250) * 0.12 + 1; // Smooth pulsing
        ctx.translate(0, bob);
        ctx.rotate(spin);
        ctx.scale(pulse, pulse);
        
        // Optimized glow effect (reduced blur for performance)
        const glowColor = item.type === ItemType.Weapon ? WEAPONS[item.weaponType!]?.color || '#fbbf24' :
                         item.type === ItemType.Medkit ? '#ef4444' :
                         item.type === ItemType.Shield ? '#3b82f6' : '#22c55e';
        ctx.shadowBlur = isMobile ? 15 * MOBILE_SHADOW_BLUR_REDUCTION : 15; 
        ctx.shadowColor = glowColor;

        if (item.type === ItemType.Weapon) { 
            // Draw Gun Silhouette
            ctx.fillStyle = WEAPONS[item.weaponType!].color; 
            ctx.fillRect(-12, -4, 24, 8); // Barrel
            ctx.fillRect(-12, -4, 6, 12); // Handle
            ctx.fillRect(0, 0, 8, 10); // Mag
        } 
        else if (item.type === ItemType.Medkit) { 
            // Medkit Box
            ctx.fillStyle = '#fff';
            ctx.fillRect(-12, -12, 24, 24);
            // Red Cross
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(-4, -8, 8, 16);
            ctx.fillRect(-8, -4, 16, 8);
            // Outline
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 1;
            ctx.strokeRect(-12, -12, 24, 24);
        } 
        else if (item.type === ItemType.Shield) { 
            // Shield Shape
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.moveTo(0, 14);
            ctx.quadraticCurveTo(12, 5, 12, -8);
            ctx.lineTo(-12, -8);
            ctx.quadraticCurveTo(-12, 5, 0, 14);
            ctx.fill();
            // Highlight
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.beginPath();
            ctx.moveTo(0, 14);
            ctx.quadraticCurveTo(12, 5, 12, -8);
            ctx.lineTo(0, -8);
            ctx.fill();
        } 
        else if (item.type === ItemType.Ammo) { 
            // Ammo Box
            ctx.fillStyle = '#15803d'; // Green box
            ctx.fillRect(-10, -10, 20, 20);
            ctx.fillStyle = '#facc15'; // Gold bullets detail
            ctx.fillRect(-4, -6, 8, 12);
        }
        ctx.restore();
      });
      // Map Walls with improved 3D effect and better performance
      state.walls.forEach((wall: Wall) => {
        ctx.save();
        
        // Soft shadow for depth
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'; 
        ctx.fillRect(wall.position.x + 6, wall.position.y + 12, wall.width, wall.height);
        
        // Base wall with simplified gradient for performance
        ctx.fillStyle = '#475569';
        ctx.fillRect(wall.position.x, wall.position.y, wall.width, wall.height);
        
        // Top highlight (3D effect)
        ctx.fillStyle = '#64748b'; 
        ctx.fillRect(wall.position.x, wall.position.y, wall.width, 10);
        
        // Left edge highlight
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(wall.position.x, wall.position.y, 5, wall.height);
        
        // Right edge shadow
        ctx.fillStyle = '#334155';
        ctx.fillRect(wall.position.x + wall.width - 5, wall.position.y, 5, wall.height);
        
        // Bottom shadow
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(wall.position.x, wall.position.y + wall.height - 8, wall.width, 8);
        
        // Crate details for small walls
        if (wall.width === 80 && wall.height === 80) {
            // Wood planks effect
            ctx.strokeStyle = '#334155'; 
            ctx.lineWidth = 2; 
            ctx.beginPath();
            ctx.moveTo(wall.position.x, wall.position.y); 
            ctx.lineTo(wall.position.x + 80, wall.position.y + 80);
            ctx.moveTo(wall.position.x + 80, wall.position.y); 
            ctx.lineTo(wall.position.x, wall.position.y + 80);
            ctx.stroke();
            
            // Inner box detail
            ctx.strokeStyle = '#64748b';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(wall.position.x + 15, wall.position.y + 15, 50, 50);
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

      // Hit Markers
      state.hitMarkers.forEach((hit: any) => {
        const alpha = hit.life / 500;
        ctx.save();
        ctx.translate(hit.x, hit.y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(-5, -5);
        ctx.moveTo(10, -10);
        ctx.lineTo(5, -5);
        ctx.moveTo(-10, 10);
        ctx.lineTo(-5, 5);
        ctx.moveTo(10, 10);
        ctx.lineTo(5, 5);
        ctx.stroke();
        
        // Damage number
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(Math.ceil(hit.damage).toString(), 0, -15);
        ctx.restore();
      });

      // Players
      [state.player, state.bot].forEach((p: Player) => {
        let isLocked = false;
        // Laser Logic (Visual Only)
        const aimVec = !p.isBot ? state.remoteInput?.aim || null : null; // simplified aim check
        // Note: Laser rendering code removed for brevity/cleanup or simplified below if needed
        // For now, let's keep the focus on the character model
        
        ctx.save();
        ctx.translate(p.position.x, p.position.y);
        ctx.rotate(p.angle);
        
        // Colors & State
        const isEnemy = p.id === state.bot.id;
        const colors = isEnemy 
            ? { pants: '#292524', shirt: '#7f1d1d', vest: '#b91c1c', helmet: '#450a0a', skin: '#eac086' } 
            : { pants: '#172554', shirt: '#1e3a8a', vest: '#2563eb', helmet: '#1e40af', skin: '#ffdbac' };
            
        // Improved Animation
        const speed = Math.sqrt(p.velocity.x**2 + p.velocity.y**2);
        const isMoving = speed > 20;
        const walkSpeed = p.sprintTime > 0 ? 60 : 90; // Faster animation when sprinting
        const walkCycle = Math.sin(now / walkSpeed) * (isMoving ? 1 : 0);
        
        // Enhanced movement effect
        const bobAmount = isMoving ? Math.sin(now / (walkSpeed * 2)) * 2 : 0;

        // Optimized sprint effect (reduced blur for performance)
        if (p.sprintTime > 0) { 
          ctx.shadowBlur = isMobile ? 12 * MOBILE_SHADOW_BLUR_REDUCTION : 12; 
          ctx.shadowColor = isEnemy ? '#ef4444' : '#3b82f6'; 
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
        
        ctx.restore();

        // Apply subtle body bobbing
        ctx.translate(0, bobAmount);
        
        // 1. Backpack
        ctx.fillStyle = '#171717'; // Almost black
        ctx.fillRect(-22, -12, 10, 24); // Block on back

        // 2. Improved Legs (Pants) with better animation
        ctx.fillStyle = colors.pants;
        const legOffset = walkCycle * 8;
        const legLift = Math.abs(walkCycle) * 3;
        
        // Right Leg
        ctx.save();
        ctx.translate(-4 - legOffset, 10);
        ctx.rotate(walkCycle * 0.3);
        ctx.translate(0, -legLift);
        ctx.beginPath(); 
        ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI*2); 
        ctx.fill();
        // Shoe detail
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(2, 0, 4, 3, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
        
        // Left Leg
        ctx.save();
        ctx.translate(-4 + legOffset, -10);
        ctx.rotate(-walkCycle * 0.3);
        ctx.translate(0, legLift);
        ctx.beginPath(); 
        ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI*2); 
        ctx.fill();
        // Shoe detail
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(2, 0, 4, 3, 0, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();

        // 3. Body (Shirt) with better shading
        ctx.fillStyle = colors.shirt;
        ctx.beginPath(); 
        ctx.arc(0, 0, 16, 0, Math.PI * 2); 
        ctx.fill();
        
        // Body highlight for depth
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.arc(-3, -3, 8, 0, Math.PI * 2);
        ctx.fill();

        // 4. Vest (Armor)
        if (p.armor > 0) {
            ctx.fillStyle = '#334155'; // Dark strap
            ctx.fillRect(-5, -16, 4, 32);
            ctx.fillStyle = colors.vest;
            // Armor plate
            ctx.beginPath();
            ctx.moveTo(8, -10);
            ctx.lineTo(8, 10);
            ctx.lineTo(-4, 12);
            ctx.lineTo(-4, -12);
            ctx.fill();
        }

        // 5. Head
        ctx.fillStyle = colors.skin; // Neck/Skin
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI*2); ctx.fill();
        
        // Helmet
        ctx.fillStyle = colors.helmet;
        ctx.beginPath(); ctx.arc(-2, 0, 11, 0, Math.PI*2); ctx.fill();
        // Visor/Goggles
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(4, -5, 6, 10);
        ctx.fillStyle = '#38bdf8'; // Glass reflection
        ctx.fillRect(6, -3, 2, 3);

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

        // Gun body with better detail
        ctx.fillStyle = '#1a1a1a'; // Gun body
        ctx.fillRect(12 - recoil, -3, 32, 6); 
        
        // Gun barrel
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(36 - recoil, -2, 8, 4);
        
        // Gun detail/magazine
        ctx.fillStyle = '#374151'; 
        ctx.fillRect(16 - recoil, -2, 10, 5);
        
        // Weapon color accent
        ctx.fillStyle = stats.color;
        ctx.fillRect(14 - recoil, -1, 3, 2);
        
        ctx.restore();

        // Hands (Gloves)
        ctx.fillStyle = '#374151'; // Dark gloves
        // Right hand (trigger)
        ctx.beginPath(); ctx.arc(10 - recoil, 8, 5, 0, Math.PI*2); ctx.fill();
        // Left hand (barrel)
        ctx.beginPath(); ctx.arc(28 - recoil, 4, 5, 0, Math.PI*2); ctx.fill(); 
        
        // Arms (connecting body to hands)
        ctx.strokeStyle = colors.shirt;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        // Right arm
        ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(10 - recoil, 8); ctx.stroke();
        // Left arm
        ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(28 - recoil, 4); ctx.stroke(); // Holding under barrel

        ctx.restore();
        
        // HP Bar
        ctx.fillStyle = '#000'; ctx.fillRect(p.position.x - 24, p.position.y - 50, 48, 6);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(p.position.x - 24, p.position.y - 50, 48 * (p.hp / p.maxHp), 6);
        if (p.armor > 0) { ctx.fillStyle = '#3b82f6'; ctx.fillRect(p.position.x - 24, p.position.y - 58, 48 * (p.armor / 50), 4); }
        if (p.isReloading) { ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.fillText('RELOADING', p.position.x - 24, p.position.y - 65); }
      });

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
