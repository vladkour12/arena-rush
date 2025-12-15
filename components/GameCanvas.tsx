import React, { useEffect, useRef } from 'react';
import { Player, Bullet, LootItem, Wall, WeaponType, Vector2, ItemType } from '../types';
import { WEAPONS, MAP_SIZE, TILE_SIZE, PLAYER_RADIUS, PLAYER_SPEED, BOT_SPEED, INITIAL_ZONE_RADIUS, SHRINK_START_TIME, SHRINK_DURATION, MIN_ZONE_RADIUS, LOOT_SPAWN_INTERVAL, ZOOM_LEVEL, CAMERA_LERP, SPRINT_MULTIPLIER, SPRINT_DURATION, SPRINT_COOLDOWN, MOVE_ACCEL, MOVE_DECEL, MOVE_TURN_ACCEL, STICK_AIM_TURN_SPEED, AUTO_FIRE_THRESHOLD } from '../constants';
import { getDistance, getAngle, checkCircleCollision, checkWallCollision, randomRange, lerp, lerpAngle } from '../utils/gameUtils';

interface GameCanvasProps {
  onGameOver: (winner: 'Player' | 'Bot') => void;
  onUpdateStats: (hp: number, ammo: number, weapon: WeaponType, armor: number, time: number, sprint: number) => void;
  inputRef: React.MutableRefObject<{ move: Vector2; aim: Vector2; sprint: boolean }>;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ 
  onGameOver, 
  onUpdateStats, 
  inputRef
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    bot: {
      id: 'bot1',
      position: { x: MAP_SIZE * 0.75, y: MAP_SIZE / 2 },
      radius: PLAYER_RADIUS,
      hp: 100,
      maxHp: 100,
      armor: 0,
      velocity: { x: 0, y: 0 },
      angle: Math.PI,
      weapon: WeaponType.SMG,
      ammo: WEAPONS[WeaponType.SMG].clipSize,
      isReloading: false,
      reloadTimer: 0,
      lastFired: 0,
      speedMultiplier: 1,
      invulnerable: 0,
      isBot: true,
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
    camera: { x: 0, y: 0 }
  });

  // Initialize Map
  useEffect(() => {
    const walls: Wall[] = [];
    // Generate Random Obstacles - More dense
    for(let i=0; i<25; i++) {
      walls.push({
        id: `wall-${i}`,
        position: { x: randomRange(200, MAP_SIZE-200), y: randomRange(200, MAP_SIZE-200) },
        width: randomRange(80, 200),
        height: randomRange(80, 200),
        radius: 0
      });
    }
    // Generate smaller crate-like obstacles
    for(let i=0; i<15; i++) {
        walls.push({
            id: `crate-${i}`,
            position: { x: randomRange(200, MAP_SIZE-200), y: randomRange(200, MAP_SIZE-200) },
            width: 80,
            height: 80,
            radius: 0
        });
    }
    // Map Boundaries
    walls.push({ id: 'b-top', position: { x: -100, y: -100 }, width: MAP_SIZE + 200, height: 100, radius: 0 });
    walls.push({ id: 'b-bottom', position: { x: -100, y: MAP_SIZE }, width: MAP_SIZE + 200, height: 100, radius: 0 });
    walls.push({ id: 'b-left', position: { x: -100, y: 0 }, width: 100, height: MAP_SIZE, radius: 0 });
    walls.push({ id: 'b-right', position: { x: MAP_SIZE, y: 0 }, width: 100, height: MAP_SIZE, radius: 0 });

    gameState.current.walls = walls;
    gameState.current.startTime = Date.now();
    gameState.current.lastTime = Date.now();

    // --- SAFETY CHECK FOR SPAWNS ---
    const isSafe = (pos: Vector2) => {
        // Use a temporary larger radius to ensure clear spawn
        const dummy: any = { position: pos, radius: PLAYER_RADIUS + 20 }; 
        for(const w of walls) {
            if (checkWallCollision(dummy, w)) return false;
        }
        return true;
    };

    // Fix Player Spawn
    let pPos = gameState.current.player.position;
    let attempts = 0;
    while(!isSafe(pPos) && attempts < 100) {
         pPos = { x: randomRange(100, MAP_SIZE/3), y: randomRange(100, MAP_SIZE-100) };
         attempts++;
    }
    gameState.current.player.position = pPos;

    // Fix Bot Spawn
    let bPos = gameState.current.bot.position;
    attempts = 0;
    while(!isSafe(bPos) && attempts < 100) {
         bPos = { x: randomRange(MAP_SIZE*0.66, MAP_SIZE-100), y: randomRange(100, MAP_SIZE-100) };
         attempts++;
    }
    gameState.current.bot.position = bPos;

    // Initialize Camera
    const { width: viewportWidth, height: viewportHeight } = getViewportSize();
    gameState.current.camera = { 
        x: gameState.current.player.position.x - (viewportWidth / ZOOM_LEVEL) / 2, 
        y: gameState.current.player.position.y - (viewportHeight / ZOOM_LEVEL) / 2 
    };
  }, []);

  // Main Loop
  useEffect(() => {
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
        
        // Find safe loot spot
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

    const updateEntity = (entity: Player, moveVec: Vector2, aimVec: Vector2 | null, wantSprint: boolean, dt: number, now: number) => {
      const state = gameState.current;
      
      // -- PASSIVE REGEN --
      if (entity.hp < entity.maxHp && entity.hp > 0) {
          entity.regenTimer += dt * 1000;
          if (entity.regenTimer >= 5000) {
              entity.hp = Math.min(entity.hp + 1, entity.maxHp);
              entity.regenTimer = 0;
          }
      } else {
          entity.regenTimer = 0;
      }
      
      // -- SPRINT LOGIC --
      if (entity.sprintTime > 0) entity.sprintTime -= dt * 1000;
      if (entity.sprintCooldown > 0) entity.sprintCooldown -= dt * 1000;

      if (wantSprint && entity.sprintCooldown <= 0 && entity.sprintTime <= 0) {
        entity.sprintTime = SPRINT_DURATION;
        entity.sprintCooldown = SPRINT_COOLDOWN;
      }
      
      const isSprinting = entity.sprintTime > 0;
      entity.speedMultiplier = isSprinting ? SPRINT_MULTIPLIER : 1;

      // -- MOVEMENT PHYSICS (Tuned for Responsiveness) --
      const maxSpeed = (entity.isBot ? BOT_SPEED : PLAYER_SPEED) * entity.speedMultiplier;
      const targetVx = moveVec.x * maxSpeed;
      const targetVy = moveVec.y * maxSpeed;

      // Physics (Smoother)
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

      // Snap to 0 if very low to prevent micro-sliding
      if (Math.abs(entity.velocity.x) < 10) entity.velocity.x = 0;
      if (Math.abs(entity.velocity.y) < 10) entity.velocity.y = 0;

      // -- COLLISION (Sequential Axis Resolution) --
      // Resolve X
      let testX = entity.position.x + entity.velocity.x * dt;
      let hitWallX = false;
      for (const wall of state.walls) {
         if (checkWallCollision({ ...entity, position: { x: testX, y: entity.position.y } }, wall)) {
             hitWallX = true;
             entity.velocity.x = 0;
             break;
         }
      }
      if (!hitWallX) {
          entity.position.x = testX;
      }

      // Resolve Y (using new X position for cleaner corner sliding)
      let testY = entity.position.y + entity.velocity.y * dt;
      let hitWallY = false;
      for (const wall of state.walls) {
         if (checkWallCollision({ ...entity, position: { x: entity.position.x, y: testY } }, wall)) {
             hitWallY = true;
             entity.velocity.y = 0;
             break;
         }
      }
      if (!hitWallY) {
          entity.position.y = testY;
      }

      // -- AIMING & FIRING --
      let firing = false;
      
      if (!entity.isBot && aimVec) {
         const aimMagnitude = Math.sqrt(aimVec.x**2 + aimVec.y**2);
         if (aimMagnitude > 0.1) {
             let desiredAngle = Math.atan2(aimVec.y, aimVec.x);
             
             // Aim Assist
             const target = state.bot;
             if (target.hp > 0) {
                const angleToTarget = getAngle(entity.position, target.position);
                const distToTarget = getDistance(entity.position, target.position);
                
                if (distToTarget < 1200) {
                    let diff = angleToTarget - desiredAngle;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    if (Math.abs(diff) < 0.45) {
                        desiredAngle = angleToTarget;
                    }
                }
             }
             entity.angle = lerpAngle(entity.angle, desiredAngle, dt * STICK_AIM_TURN_SPEED);
             if (aimMagnitude > AUTO_FIRE_THRESHOLD) firing = true;
         } else if (Math.abs(moveVec.x) > 0.1 || Math.abs(moveVec.y) > 0.1) {
             const moveAngle = Math.atan2(moveVec.y, moveVec.x);
             entity.angle = lerpAngle(entity.angle, moveAngle, dt * 10);
         }
      } else if (entity.isBot && aimVec) {
          // Bot uses external logic
      }

      // Reloading
      if (entity.isReloading) {
        if (now > entity.reloadTimer) {
          entity.isReloading = false;
          entity.ammo = WEAPONS[entity.weapon].clipSize;
        }
      }

      // Shooting
      if (firing && !entity.isReloading && now - entity.lastFired > WEAPONS[entity.weapon].fireRate) {
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

          if (entity.ammo === 0) {
            entity.isReloading = true;
            entity.reloadTimer = now + weapon.reloadTime;
          }
        } else {
            entity.isReloading = true;
            entity.reloadTimer = now + WEAPONS[entity.weapon].reloadTime;
        }
      }

      // Loot & Zone
      for (let i = state.loot.length - 1; i >= 0; i--) {
        const item = state.loot[i];
        if (checkCircleCollision(entity, item)) {
          let consumed = true;
          if (item.type === ItemType.Medkit) {
            if (entity.hp < entity.maxHp) entity.hp = Math.min(entity.hp + item.value, entity.maxHp);
            else consumed = false;
          } else if (item.type === ItemType.Shield) {
            entity.armor = Math.min(entity.armor + 50, 50);
          } else if (item.type === ItemType.Ammo) {
            entity.ammo = WEAPONS[entity.weapon].clipSize;
            entity.isReloading = false;
          } else if (item.type === ItemType.Weapon && item.weaponType) {
            entity.weapon = item.weaponType;
            entity.ammo = WEAPONS[item.weaponType].clipSize;
            entity.isReloading = false;
          }
          if (consumed) state.loot.splice(i, 1);
        }
      }
      const distFromCenter = getDistance(entity.position, {x: MAP_SIZE/2, y: MAP_SIZE/2});
      if (distFromCenter > state.zoneRadius) {
         if (now % 60 === 0) {
             entity.hp -= 0.5;
             entity.lastDamageTime = now;
             entity.regenTimer = 0; 
         }
      }
    };

    const runGameLoop = () => {
      const state = gameState.current;
      if (state.gameOver) return;
      
      const now = Date.now();
      const dt = Math.min((now - state.lastTime) / 1000, 0.1);
      state.lastTime = now;
      const elapsed = now - state.startTime;
      const { move, aim, sprint } = inputRef.current;
      
      if (elapsed > SHRINK_START_TIME) {
        const shrinkProgress = Math.min((elapsed - SHRINK_START_TIME) / SHRINK_DURATION, 1);
        state.zoneRadius = INITIAL_ZONE_RADIUS - (INITIAL_ZONE_RADIUS - MIN_ZONE_RADIUS) * shrinkProgress;
      }

      spawnLoot(now);
      
      updateEntity(state.player, move, aim, sprint, dt, now);

      // --- BOT AI ---
      const bot = state.bot;
      const player = state.player;
      const distToPlayer = getDistance(bot.position, player.position);
      const angleToPlayer = getAngle(bot.position, player.position);
      const weaponRange = WEAPONS[bot.weapon].range;
      
      let botMove = { x: 0, y: 0 };
      const isLowHealth = bot.hp < 40;
      const wantsSprint = isLowHealth && bot.sprintCooldown <= 0;

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
             const rangeAdjust = distToPlayer > weaponRange * 0.6 ? 0.3 : -0.3;
             botMove = { 
                 x: Math.cos(strafeAngle) + Math.cos(angleToPlayer) * rangeAdjust, 
                 y: Math.sin(strafeAngle) + Math.sin(angleToPlayer) * rangeAdjust 
             };
          }
      }

      const currentSpeed = Math.sqrt(bot.velocity.x**2 + bot.velocity.y**2);
      if (currentSpeed < 20 && (Math.abs(botMove.x) > 0.1 || Math.abs(botMove.y) > 0.1)) {
           const escapeAngle = (now / 500) * Math.PI * 2; 
           botMove = { x: Math.cos(escapeAngle), y: Math.sin(escapeAngle) };
      }

      bot.angle = angleToPlayer; 

      let botFire = false;
      // Bots are slightly slower to fire than humans to feel fair
      const botFireRateMod = bot.weapon === WeaponType.Pistol ? 2.5 : 1.2; 
      if (distToPlayer < weaponRange * 1.2 && !bot.isReloading) {
        if (now - bot.lastFired > WEAPONS[bot.weapon].fireRate * botFireRateMod) botFire = true; 
      }
      
      updateEntity(bot, botMove, null, wantsSprint, dt, now);
      
      if (botFire && !bot.isReloading) {
           bot.lastFired = now;
           bot.ammo--;
           const weapon = WEAPONS[bot.weapon];
           const finalAngle = bot.angle + (Math.random() - 0.5) * weapon.spread;
           state.bullets.push({
              id: `b-${bot.id}-${now}`,
              ownerId: bot.id,
              position: { ...bot.position },
              radius: 4,
              velocity: { x: Math.cos(finalAngle)*weapon.speed, y: Math.sin(finalAngle)*weapon.speed },
              damage: weapon.damage,
              rangeRemaining: weapon.range,
              color: weapon.color
           });
           if(bot.ammo <= 0) { bot.isReloading = true; bot.reloadTimer = now + weapon.reloadTime; }
      }

      // Bullets
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
          
          if (target.isBot) {
              if (Math.random() < 0.15) {
                   const dropTypes = [ItemType.Medkit, ItemType.Ammo];
                   const dropType = dropTypes[Math.floor(Math.random() * dropTypes.length)];
                   state.loot.push({
                        id: `loot-drop-${now}-${i}`,
                        position: { 
                            x: target.position.x + randomRange(-30, 30), 
                            y: target.position.y + randomRange(-30, 30) 
                        },
                        radius: 15,
                        type: dropType,
                        value: dropType === ItemType.Medkit ? 25 : 0
                   });
              }
          }
          remove = true;
        }
        if (b.rangeRemaining <= 0) remove = true;
        if (remove) state.bullets.splice(i, 1);
      }

      if (state.player.hp <= 0) { state.gameOver = true; onGameOver('Bot'); } 
      else if (state.bot.hp <= 0) { state.gameOver = true; onGameOver('Player'); }

      onUpdateStats(
          Math.ceil(state.player.hp), 
          state.player.ammo, 
          state.player.weapon, 
          Math.ceil(state.player.armor), 
          Math.max(0, SHRINK_START_TIME + SHRINK_DURATION - elapsed),
          Math.max(0, state.player.sprintCooldown)
      );

      // --- RENDER ---
      const viewportW = canvas.width;
      const viewportH = canvas.height;
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

      ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, viewportW, viewportH);
      ctx.save();
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
      state.loot.forEach(item => { 
        ctx.save(); ctx.translate(item.position.x, item.position.y); ctx.shadowBlur = 10; ctx.shadowColor = '#fbbf24';
        if (item.type === ItemType.Weapon) { ctx.fillStyle = WEAPONS[item.weaponType!].color; ctx.fillRect(-10, -10, 20, 20); } 
        else if (item.type === ItemType.Medkit) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(0,0, 10, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-3, -7, 6, 14); ctx.fillRect(-7, -3, 14, 6); } 
        else if (item.type === ItemType.Shield) { ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(0,0, 12, 0, Math.PI*2); ctx.fill(); } 
        else if (item.type === ItemType.Ammo) { ctx.fillStyle = '#10b981'; ctx.fillRect(-8, -8, 16, 16); }
        ctx.restore();
      });
      // Map Walls with "3D" look
      state.walls.forEach(wall => {
        // Shadow/Side
        ctx.fillStyle = '#334155'; 
        ctx.fillRect(wall.position.x, wall.position.y + 10, wall.width, wall.height);
        
        // Top Face
        ctx.fillStyle = '#475569'; 
        ctx.fillRect(wall.position.x, wall.position.y, wall.width, wall.height);
        
        // Highlight edge
        ctx.fillStyle = '#64748b'; 
        ctx.fillRect(wall.position.x, wall.position.y, wall.width, 6);
        
        // Decoration (Crates)
        if (wall.width === 80 && wall.height === 80) {
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(wall.position.x, wall.position.y);
            ctx.lineTo(wall.position.x + 80, wall.position.y + 80);
            ctx.moveTo(wall.position.x + 80, wall.position.y);
            ctx.lineTo(wall.position.x, wall.position.y + 80);
            ctx.stroke();
            ctx.strokeRect(wall.position.x + 10, wall.position.y + 10, 60, 60);
        }
      });
      state.bullets.forEach(b => { ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.position.x, b.position.y, b.radius, 0, Math.PI * 2); ctx.fill(); });

      // Calculate Recoil Offset Helper
      const getRecoilOffset = (weapon: WeaponType, lastFired: number) => {
        const timeSince = now - lastFired;
        const stats = WEAPONS[weapon];
        const duration = Math.min(stats.fireRate * 0.8, 150); 
        
        if (timeSince > duration) return 0;
        const t = timeSince / duration;
        
        // Weapon specific kick distance
        let kick = 5;
        if (weapon === WeaponType.Sniper) kick = 20;
        else if (weapon === WeaponType.Shotgun) kick = 15;
        else if (weapon === WeaponType.Rocket) kick = 15;
        else if (weapon === WeaponType.Pistol) kick = 8;
        else if (weapon === WeaponType.SMG) kick = 4;
        
        // Sharp kick back (20%), smooth return (80%)
        if (t < 0.2) return lerp(0, kick, t / 0.2);
        return lerp(kick, 0, (t - 0.2) / 0.8);
      };

      // Players & Visuals
      [state.player, state.bot].forEach(p => {
        let isLocked = false;
        
        const aimVec = !p.isBot ? aim : null;
        const showLaser = !p.isBot && aimVec && (aimVec.x !== 0 || aimVec.y !== 0);

        if (showLaser) {
            const range = WEAPONS[p.weapon].range;
            const target = state.bot;
            if (target.hp > 0) {
               const angleToTarget = getAngle(p.position, target.position);
               const distToTarget = getDistance(p.position, target.position);
               if (distToTarget < 1200) {
                   let diff = angleToTarget - p.angle;
                   while (diff < -Math.PI) diff += Math.PI * 2;
                   while (diff > Math.PI) diff -= Math.PI * 2;
                   if (Math.abs(diff) < 0.1) isLocked = true;
               }
            }

            ctx.save();
            ctx.translate(p.position.x, p.position.y);
            ctx.rotate(p.angle);
            
            // Aim Cone
            ctx.fillStyle = isLocked ? 'rgba(255, 50, 50, 0.1)' : 'rgba(255, 255, 255, 0.05)';
            ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, range, -0.2, 0.2); ctx.fill();

            // Laser Line
            const gradient = ctx.createLinearGradient(0, 0, range, 0);
            gradient.addColorStop(0, isLocked ? 'rgba(255, 50, 50, 0.8)' : 'rgba(255, 255, 255, 0.5)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            
            ctx.strokeStyle = gradient; ctx.lineWidth = isLocked ? 2 : 1;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(range, 0); ctx.stroke();
            
            ctx.restore();
            
            if (isLocked) {
                ctx.save();
                ctx.translate(target.position.x, target.position.y);
                const time = Date.now() / 150; 
                ctx.rotate(time);
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 4;
                ctx.beginPath();
                for(let i=0; i<4; i++) {
                    ctx.rotate(Math.PI/2);
                    ctx.moveTo(35, 35);
                    ctx.lineTo(50, 35);
                    ctx.lineTo(50, 20);
                }
                ctx.stroke();
                ctx.restore();
            }
        }

        ctx.save();
        ctx.translate(p.position.x, p.position.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.isBot ? '#dc2626' : '#3b82f6';
        
        if (p.sprintTime > 0) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#00ffff';
        }
        
        // Draw Player Body (More Real)
        
        // Legs Animation
        const speed = Math.sqrt(p.velocity.x**2 + p.velocity.y**2);
        const legOffset = Math.sin(Date.now() / 100) * (speed > 10 ? 10 : 0);
        
        ctx.fillStyle = '#0f172a'; // Darker pants
        ctx.beginPath(); ctx.arc(-8, 8 + legOffset, 7, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(8, -8 - legOffset, 7, 0, Math.PI*2); ctx.fill();

        // Body (Vest)
        ctx.fillStyle = p.isBot ? '#7f1d1d' : '#1e3a8a'; // Darker base
        ctx.beginPath(); ctx.arc(0, 0, p.radius, 0, Math.PI * 2); ctx.fill();
        
        // Vest Detail
        ctx.fillStyle = p.isBot ? '#ef4444' : '#3b82f6';
        ctx.beginPath(); ctx.arc(0, 0, p.radius - 6, 0, Math.PI*2); ctx.fill();
        
        // Helmet / Head
        ctx.fillStyle = p.isBot ? '#b91c1c' : '#2563eb';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill();
        
        // Shoulders
        ctx.fillStyle = p.isBot ? '#991b1b' : '#1d4ed8';
        ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(0, 16, 8, 0, Math.PI*2); ctx.fill();

        ctx.shadowBlur = 0; 
        
        // Draw Weapon with Recoil
        const recoil = getRecoilOffset(p.weapon, p.lastFired);
        ctx.fillStyle = '#111827'; // Black gun
        // Apply recoil as negative X translation (backwards relative to rotation)
        ctx.fillRect(-recoil + 10, -4, 40, 8); 
        
        // Hands
        ctx.fillStyle = '#d4d4d8'; // Gloves
        ctx.beginPath(); ctx.arc(15 - (recoil * 0.5), 10, 6, 0, Math.PI*2); ctx.fill(); 
        ctx.beginPath(); ctx.arc(15 - (recoil * 0.5), -10, 6, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        
        // HP Bar
        ctx.fillStyle = '#000'; ctx.fillRect(p.position.x - 20, p.position.y - 40, 40, 6);
        ctx.fillStyle = '#22c55e'; ctx.fillRect(p.position.x - 20, p.position.y - 40, 40 * (p.hp / p.maxHp), 6);
        if (p.armor > 0) { ctx.fillStyle = '#3b82f6'; ctx.fillRect(p.position.x - 20, p.position.y - 48, 40 * (p.armor / 50), 4); }
        if (p.isReloading) { ctx.fillStyle = '#fff'; ctx.font = '12px Arial'; ctx.fillText('RELOAD', p.position.x - 20, p.position.y - 55); }
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(runGameLoop);
    };

    animationFrameId = requestAnimationFrame(runGameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, []); 

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const { width, height } = getViewportSize();
      canvas.width = width;
      canvas.height = height;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="block bg-slate-900 w-full h-full" />;
};