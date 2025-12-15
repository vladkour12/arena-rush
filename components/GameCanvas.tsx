import React, { useEffect, useRef, useState } from 'react';
import { Player, Bullet, LootItem, Wall, WeaponType, Vector2, ItemType, NetworkMsgType, InitPackage, InputPackage, StatePackage } from '../types';
import { WEAPONS, MAP_SIZE, TILE_SIZE, PLAYER_RADIUS, PLAYER_SPEED, BOT_SPEED, INITIAL_ZONE_RADIUS, SHRINK_START_TIME, SHRINK_DURATION, MIN_ZONE_RADIUS, LOOT_SPAWN_INTERVAL, ZOOM_LEVEL, CAMERA_LERP, SPRINT_MULTIPLIER, SPRINT_DURATION, SPRINT_COOLDOWN, MOVE_ACCEL, MOVE_DECEL, MOVE_TURN_ACCEL, STICK_AIM_TURN_SPEED, AUTO_FIRE_THRESHOLD } from '../constants';
import { getDistance, getAngle, checkCircleCollision, checkWallCollision, randomRange, lerp, lerpAngle } from '../utils/gameUtils';
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
    
    // Multiplayer specific
    remoteInput: {
        move: { x: 0, y: 0 },
        aim: { x: 0, y: 0 },
        sprint: false,
        fire: false,
        angle: 0
    } as InputPackage
  });

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

    // Host or Single Player -> Generate Map
    const walls: Wall[] = [];
    for(let i=0; i<25; i++) {
      walls.push({
        id: `wall-${i}`,
        position: { x: randomRange(200, MAP_SIZE-200), y: randomRange(200, MAP_SIZE-200) },
        width: randomRange(80, 200),
        height: randomRange(80, 200),
        radius: 0
      });
    }
    for(let i=0; i<15; i++) {
        walls.push({
            id: `crate-${i}`,
            position: { x: randomRange(200, MAP_SIZE-200), y: randomRange(200, MAP_SIZE-200) },
            width: 80,
            height: 80,
            radius: 0
        });
    }
    walls.push({ id: 'b-top', position: { x: -100, y: -100 }, width: MAP_SIZE + 200, height: 100, radius: 0 });
    walls.push({ id: 'b-bottom', position: { x: -100, y: MAP_SIZE }, width: MAP_SIZE + 200, height: 100, radius: 0 });
    walls.push({ id: 'b-left', position: { x: -100, y: 0 }, width: 100, height: MAP_SIZE, radius: 0 });
    walls.push({ id: 'b-right', position: { x: MAP_SIZE, y: 0 }, width: 100, height: MAP_SIZE, radius: 0 });

    state.walls = walls;
    state.startTime = Date.now();
    state.lastTime = Date.now();

    // Spawn Safe Check
    const isSafe = (pos: Vector2) => {
        const dummy: any = { position: pos, radius: PLAYER_RADIUS + 20 }; 
        for(const w of walls) if (checkWallCollision(dummy, w)) return false;
        return true;
    };

    let pPos = { x: MAP_SIZE / 4, y: MAP_SIZE / 2 };
    let bPos = { x: MAP_SIZE * 0.75, y: MAP_SIZE / 2 };
    
    // Retry spawns
    while(!isSafe(pPos)) pPos = { x: randomRange(100, MAP_SIZE/3), y: randomRange(100, MAP_SIZE-100) };
    while(!isSafe(bPos)) bPos = { x: randomRange(MAP_SIZE*0.66, MAP_SIZE-100), y: randomRange(100, MAP_SIZE-100) };

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
      if (now - state.lastLootTime > LOOT_SPAWN_INTERVAL) {
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
      
      // Regen
      if (entity.hp < entity.maxHp && entity.hp > 0) {
          entity.regenTimer += dt * 1000;
          if (entity.regenTimer >= 5000) {
              entity.hp = Math.min(entity.hp + 1, entity.maxHp);
              entity.regenTimer = 0;
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

      // Collision
      let testX = entity.position.x + entity.velocity.x * dt;
      let hitWallX = false;
      for (const wall of state.walls) {
         if (checkWallCollision({ ...entity, position: { x: testX, y: entity.position.y } }, wall)) {
             hitWallX = true;
             entity.velocity.x = 0;
             break;
         }
      }
      if (!hitWallX) entity.position.x = testX;

      let testY = entity.position.y + entity.velocity.y * dt;
      let hitWallY = false;
      for (const wall of state.walls) {
         if (checkWallCollision({ ...entity, position: { x: entity.position.x, y: testY } }, wall)) {
             hitWallY = true;
             entity.velocity.y = 0;
             break;
         }
      }
      if (!hitWallY) entity.position.y = testY;

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
      const dt = Math.min((now - state.lastTime) / 1000, 0.1);
      state.lastTime = now;
      const elapsed = now - state.startTime;
      const { move, aim, sprint, fire, angle } = inputRef.current; // Local Input

      // Check for Resize
      const dpr = window.devicePixelRatio || 1;
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
          
          // Simple Bot AI ... (Same as before)
          const isLowHealth = bot.hp < 40;
          if (isLowHealth && distToPlayer < 600) {
              const fleeAngle = angleToPlayer + Math.PI + (Math.sin(now / 300) * 0.5); 
              botMove = { x: Math.cos(fleeAngle), y: Math.sin(fleeAngle) };
          } else {
              const strafeDir = Math.sin(now / 1500) > 0 ? 1 : -1;
              if (distToPlayer > weaponRange * 0.8) {
                 botMove = { x: Math.cos(angleToPlayer), y: Math.sin(angleToPlayer) };
              } else if (distToPlayer < weaponRange * 0.3) {
                 botMove = { x: -Math.cos(angleToPlayer), y: -Math.sin(angleToPlayer) };
              } else {
                 const strafeAngle = angleToPlayer + (Math.PI / 2 * strafeDir);
                 botMove = { x: Math.cos(strafeAngle), y: Math.sin(strafeAngle) };
              }
          }
          const currentSpeed = Math.sqrt(bot.velocity.x**2 + bot.velocity.y**2);
          if (currentSpeed < 20 && (Math.abs(botMove.x) > 0.1 || Math.abs(botMove.y) > 0.1)) {
               const escapeAngle = (now / 500) * Math.PI * 2; 
               botMove = { x: Math.cos(escapeAngle), y: Math.sin(escapeAngle) };
          }
          bot.angle = angleToPlayer; 
          const botFireRateMod = bot.weapon === WeaponType.Pistol ? 2.5 : 1.2; 
          if (distToPlayer < weaponRange * 1.2 && !bot.isReloading) {
            if (now - bot.lastFired > WEAPONS[bot.weapon].fireRate * botFireRateMod) p2Fire = true; 
          }
          updateEntity(bot, botMove, null, isLowHealth && bot.sprintCooldown <= 0, null, dt, now);
      }

      if (p2Fire && !bot.isReloading) {
           fireWeapon(bot, now);
      }

      // Bullets
      updateBullets(state, dt, now);

      // Loot & Zone
      updateLoot(state);
      checkZone(state, now);

      // Game Over Check
      if (state.player.hp <= 0) { state.gameOver = true; onGameOver('Bot'); if(network) network.send(NetworkMsgType.GameOver, 'Bot'); } 
      else if (state.bot.hp <= 0) { state.gameOver = true; onGameOver('Player'); if(network) network.send(NetworkMsgType.GameOver, 'Player'); }

      // Sync State to Client
      // 30Hz Tick Rate (approx 33ms) to prevent flooding
      if (network && isHost && now - (state.lastNetworkSync || 0) > 33) {
          (state as any).lastNetworkSync = now;
          network.send(NetworkMsgType.State, {
              players: [state.player, state.bot],
              bullets: state.bullets,
              loot: state.loot,
              zoneRadius: state.zoneRadius,
              timeRemaining: Math.max(0, SHRINK_START_TIME + SHRINK_DURATION - elapsed)
          } as StatePackage);
      }

      // Update UI
      onUpdateStats(
          Math.ceil(state.player.hp), 
          state.player.ammo, 
          state.player.weapon, 
          Math.ceil(state.player.armor), 
          Math.max(0, SHRINK_START_TIME + SHRINK_DURATION - elapsed),
          Math.max(0, state.player.sprintCooldown)
      );

      // Render
      const viewportW = canvas.width / dpr;
      const viewportH = canvas.height / dpr;
      const visibleW = viewportW / ZOOM_LEVEL;
      const visibleH = viewportH / ZOOM_LEVEL;
      const lookAheadX = state.player.velocity.x * 0.5;
      const lookAheadY = state.player.velocity.y * 0.5;
      const targetCamX = (state.player.position.x + lookAheadX) - visibleW / 2;
      const targetCamY = (state.player.position.y + lookAheadY) - visibleH / 2;
      state.camera.x += (targetCamX - state.camera.x) * CAMERA_LERP;
      state.camera.y += (targetCamY - state.camera.y) * CAMERA_LERP;
      state.camera.x = Math.max(-100, Math.min(state.camera.x, MAP_SIZE + 100 - visibleW));
      state.camera.y = Math.max(-100, Math.min(state.camera.y, MAP_SIZE + 100 - visibleH));

      render(canvas, ctx, state, now);
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
        for(const w of state.walls) { if (checkWallCollision(b, w)) remove = true; }
        const target = b.ownerId === state.player.id ? state.bot : state.player;
        if (!remove && checkCircleCollision(b, target)) {
          if (target.armor > 0) target.armor = Math.max(0, target.armor - b.damage);
          else target.hp -= b.damage;
          target.lastDamageTime = now;
          target.regenTimer = 0; 
          
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

    const checkZone = (state: any, now: number) => {
        [state.player, state.bot].forEach((p: Player) => {
            const distFromCenter = getDistance(p.position, {x: MAP_SIZE/2, y: MAP_SIZE/2});
            if (distFromCenter > state.zoneRadius) {
                if (now % 60 === 0) { p.hp -= 0.5; p.lastDamageTime = now; p.regenTimer = 0; }
            }
        });
    };

    animationFrameId = requestAnimationFrame(runGameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isReady]); // Depend on isReady

  // Render Function (extracted for cleanliness)
  const render = (canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, state: any, now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const viewportW = canvas.width / dpr;
      const viewportH = canvas.height / dpr;
      
      ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, viewportW, viewportH);
      ctx.save();
      ctx.scale(dpr, dpr); // Fix blur
      ctx.scale(ZOOM_LEVEL, ZOOM_LEVEL);
      ctx.translate(-state.camera.x, -state.camera.y);

      // Grid & Zone
      ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.beginPath();
      for (let x = 0; x <= MAP_SIZE; x += TILE_SIZE) { ctx.moveTo(x, 0); ctx.lineTo(x, MAP_SIZE); }
      for (let y = 0; y <= MAP_SIZE; y += TILE_SIZE) { ctx.moveTo(0, y); ctx.lineTo(MAP_SIZE, y); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(74, 222, 128, 0.1)'; ctx.beginPath(); ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius, 0, Math.PI * 2, true);
      ctx.rect( -1000, -1000, MAP_SIZE + 2000, MAP_SIZE + 2000);
      ctx.fillStyle = 'rgba(120, 0, 0, 0.3)'; ctx.fill();
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(MAP_SIZE/2, MAP_SIZE/2, state.zoneRadius, 0, Math.PI * 2); ctx.stroke();

      // Render Objects
      state.loot.forEach((item: LootItem) => { 
        ctx.save(); 
        ctx.translate(item.position.x, item.position.y);
        
        // Bobbing & Rotation Animation
        const bob = Math.sin(now / 300) * 3;
        const spin = now / 800; // Slow spin
        ctx.translate(0, bob);
        ctx.rotate(spin);
        
        ctx.shadowBlur = 15; 
        ctx.shadowColor = 'rgba(255,255,255,0.3)';

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
      // Map Walls
      state.walls.forEach((wall: Wall) => {
        ctx.fillStyle = '#334155'; ctx.fillRect(wall.position.x, wall.position.y + 10, wall.width, wall.height);
        ctx.fillStyle = '#475569'; ctx.fillRect(wall.position.x, wall.position.y, wall.width, wall.height);
        ctx.fillStyle = '#64748b'; ctx.fillRect(wall.position.x, wall.position.y, wall.width, 6);
        if (wall.width === 80 && wall.height === 80) {
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2; ctx.beginPath();
            ctx.moveTo(wall.position.x, wall.position.y); ctx.lineTo(wall.position.x + 80, wall.position.y + 80);
            ctx.moveTo(wall.position.x + 80, wall.position.y); ctx.lineTo(wall.position.x, wall.position.y + 80);
            ctx.stroke(); ctx.strokeRect(wall.position.x + 10, wall.position.y + 10, 60, 60);
        }
      });
      state.bullets.forEach((b: Bullet) => { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.position.x, b.position.y, b.radius, 0, Math.PI * 2); ctx.fill(); });

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
            
        // Animation
        const speed = Math.sqrt(p.velocity.x**2 + p.velocity.y**2);
        const walkCycle = Math.sin(now / 80) * (speed > 10 ? 1 : 0);

        if (p.sprintTime > 0) { ctx.shadowBlur = 15; ctx.shadowColor = isEnemy ? '#ef4444' : '#3b82f6'; }

        // 1. Backpack
        ctx.fillStyle = '#171717'; // Almost black
        ctx.fillRect(-22, -12, 10, 24); // Block on back

        // 2. Legs (Pants)
        ctx.fillStyle = colors.pants;
        // Right Leg
        ctx.save();
        ctx.translate(-4 - walkCycle * 6, 10);
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        // Left Leg
        ctx.save();
        ctx.translate(-4 + walkCycle * 6, -10);
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        // 3. Body (Shirt)
        ctx.fillStyle = colors.shirt;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI * 2); ctx.fill();

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
        
        // Draw Weapon
        const timeSince = now - p.lastFired;
        const stats = WEAPONS[p.weapon];
        const duration = Math.min(stats.fireRate * 0.8, 150); 
        let recoil = 0;
        if (timeSince < duration) {
             const t = timeSince / duration;
             const kick = 6;
             if (t < 0.2) recoil = lerp(0, kick, t / 0.2); else recoil = lerp(kick, 0, (t - 0.2) / 0.8);
        }

        ctx.fillStyle = '#000'; // Gun body
        ctx.fillRect(12 - recoil, -3, 32, 6); 
        ctx.fillStyle = '#374151'; // Detail
        ctx.fillRect(16 - recoil, -3, 8, 6);

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
          <div className="absolute inset-0 bg-slate-900 flex items-center justify-center text-white">
              <div className="animate-pulse text-2xl font-bold">Loading Game...</div>
          </div>
      );
  }

  return <canvas ref={canvasRef} className="block bg-slate-900 w-full h-full" />;
};
