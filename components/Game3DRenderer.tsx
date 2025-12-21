import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Wall, Player, LootItem, Vector2, Bullet, WeaponType } from '../types';
import { MAP_SIZE, PLAYER_RADIUS, WEAPONS } from '../constants';
import { getTextureManager } from '../utils/textureManager';
import { isMobileDevice } from '../utils/gameUtils';
import { createParticlePool, updateParticles, emitParticles, createBulletTrail, createExplosion, ParticlePool, disposeParticlePool } from '../utils/particleSystem';
import { getCachedPlayerModel, getCachedBotModel, getCachedBotAnimations, getCachedPlayerAnimations } from '../utils/modelCache';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Create an animated 3D character model
 */
function createAnimatedCharacter(player: Player, textureManager: ReturnType<typeof getTextureManager>, isMobile: boolean): THREE.Group {
  const group = new THREE.Group();
  // This will be replaced with the loaded model
  
  // Higher segment count on desktop for smoother characters
  const segments = isMobile ? 6 : 16;
  
  // Body (main cylinder) - fallback if model fails to load
  const bodyGeometry = new THREE.CylinderGeometry(PLAYER_RADIUS * 0.8, PLAYER_RADIUS * 0.9, 80, segments);
  const bodyColor = player.skin === 'Police' ? 0x4169E1 : player.skin === 'Terrorist' ? 0xDC143C : 0x808080;
  const bodyMaterial = new THREE.MeshPhongMaterial({ 
    color: bodyColor,
    shininess: 100 // More reflective for character visibility
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 40;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.type = 'body';
  group.add(body);
  
  return group;
}

/**
 * Animate character based on movement state
 */
function animateCharacter(characterGroup: THREE.Group, isMoving: boolean, time: number): void {
  const walkSpeed = 0.02;
  const armSwing = 0.4;
  const legSwing = 0.3;
  
  characterGroup.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.type) {
      const type = child.userData.type;
      
      if (isMoving) {
        // Walking animation
        if (type === 'leftArm') {
          child.rotation.z = child.userData.baseRotation + Math.sin(time * walkSpeed) * armSwing;
        } else if (type === 'rightArm') {
          child.rotation.z = child.userData.baseRotation - Math.sin(time * walkSpeed) * armSwing;
        } else if (type === 'leftLeg') {
          child.rotation.x = Math.sin(time * walkSpeed) * legSwing;
        } else if (type === 'rightLeg') {
          child.rotation.x = -Math.sin(time * walkSpeed) * legSwing;
        } else if (type === 'body') {
          // Slight bobbing
          child.position.y = 40 + Math.sin(time * walkSpeed * 2) * 2;
        }
      } else {
        // Idle animation (subtle breathing)
        if (type === 'body') {
          child.position.y = 40 + Math.sin(time * 0.005) * 1;
        }
        // Reset limbs to default
        if (type === 'leftArm') child.rotation.z = child.userData.baseRotation;
        if (type === 'rightArm') child.rotation.z = child.userData.baseRotation;
        if (type === 'leftLeg') child.rotation.x = 0;
        if (type === 'rightLeg') child.rotation.x = 0;
      }
    }
  });
}

interface Game3DRendererProps {
  walls: Wall[];
  players: Player[];
  lootItems: LootItem[];
  bullets: Bullet[];
  zombies?: Player[]; // Zombie enemies for survival mode
  damageNumbers?: Array<{ x: number; y: number; damage: number; life: number; maxLife: number; vy: number; color: string }>;
  cameraPosition: Vector2;
  cameraAngle: number;
  zoom: number;
  enabled?: boolean;
  onParticlePoolReady?: (pool: ParticlePool | null) => void;
}

/**
 * 3D Renderer Component that renders textured 3D objects
 * This component creates a WebGL canvas overlay for 3D elements
 */
export const Game3DRenderer: React.FC<Game3DRendererProps> = ({
  walls,
  players,
  lootItems,
  bullets,
  zombies = [],
  damageNumbers = [],
  cameraPosition,
  cameraAngle,
  zoom,
  enabled = true,
  onParticlePoolReady
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const textureManagerRef = useRef(getTextureManager());
  const isMobile = isMobileDevice();
  const particlePoolRef = useRef<ParticlePool | null>(null);
  
  // Store meshes in refs to persist across renders
  const wallMeshesRef = useRef<THREE.Mesh[]>([]);
  const playerMeshesRef = useRef<THREE.Group[]>([]); // Changed to Group for animated characters
  const lootMeshesRef = useRef<THREE.Mesh[]>([]);
  const bulletMeshesRef = useRef<THREE.Mesh[]>([]); // 3D bullets
  const zombieMeshesRef = useRef<THREE.Group[]>([]); // Zombie meshes with health bars
  const botMixersRef = useRef<THREE.AnimationMixer[]>([]); // Animation mixers for bot models
  const playerMixersRef = useRef<THREE.AnimationMixer[]>([]); // Animation mixers for player models
  const damageNumberMeshesRef = useRef<THREE.Sprite[]>([]); // Floating damage numbers
  const isInitializedRef = useRef(false);
  const animationTimeRef = useRef(0); // For animation timing
  const playerModelRef = useRef<THREE.Group | null>(null); // Cached 3D model
  
  // Store latest props in refs for animation loop
  const propsRef = useRef({ walls, players, lootItems, bullets, zombies, damageNumbers, cameraPosition, cameraAngle, zoom });
  useEffect(() => {
    propsRef.current = { walls, players, lootItems, bullets, zombies, damageNumbers, cameraPosition, cameraAngle, zoom };
  }, [walls, players, lootItems, bullets, zombies, damageNumbers, cameraPosition, cameraAngle, zoom]);

  // Use cached player model - check whenever component updates or model might be ready
  useEffect(() => {
    const checkForModel = () => {
      const cachedModel = getCachedPlayerModel();
      if (cachedModel && !playerModelRef.current) {
        playerModelRef.current = cachedModel;
        console.log('✓ Player 3D model loaded:', cachedModel);
      }
    };
    
    checkForModel();
    // Poll for model every 100ms during loading (will stop once found)
    const timer = setInterval(checkForModel, 100);
    return () => clearInterval(timer);
  }, [enabled]);

  // Initialize scene only once
  useEffect(() => {
    if (!enabled || !containerRef.current || isInitializedRef.current) return;
    
    isInitializedRef.current = true;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Create camera (perspective for 3D effect)
    // Force landscape dimensions
    const rawWidth = window.innerWidth;
    const rawHeight = window.innerHeight;
    const viewportWidth = Math.max(rawWidth, rawHeight);
    const viewportHeight = Math.min(rawWidth, rawHeight);
    const aspect = viewportWidth / viewportHeight;
    
    const camera = new THREE.PerspectiveCamera(
      60, // FOV
      aspect,
      0.1,
      10000
    );
    cameraRef.current = camera;

    // Create renderer with opaque background for proper 3D ground display
    const renderer = new THREE.WebGLRenderer({
      alpha: false, // Opaque background so scene.background shows properly
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(viewportWidth, viewportHeight);
    // Higher pixel ratio on desktop for better visual quality
    const pixelRatio = isMobile ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2);
    renderer.setPixelRatio(pixelRatio);
    // Enable shadows for improved graphics
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; // Better shadow quality with PCF filtering
    renderer.shadowMap.autoUpdate = false; // Manual update to prevent flickering
    
    // Style the canvas to fill container - use absolute positioning
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    


    // Add enhanced lighting setup
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional light with shadows (sunlight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(2000, 1500, 1500); // Position light from above and to the side
    directionalLight.castShadow = true;
    
    // Configure shadow map for better quality
    directionalLight.shadow.mapSize.width = isMobile ? 1024 : 2048;
    directionalLight.shadow.mapSize.height = isMobile ? 1024 : 2048;
    directionalLight.shadow.camera.left = -3000;
    directionalLight.shadow.camera.right = 3000;
    directionalLight.shadow.camera.top = 3000;
    directionalLight.shadow.camera.bottom = -3000;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 5000;
    directionalLight.shadow.bias = -0.001; // Adjusted to prevent flickering
    scene.add(directionalLight);

    // Add a point light near the camera for weapon glows and items
    const pointLight = new THREE.PointLight(0xffcc88, 0.5, 5000);
    pointLight.castShadow = true;
    scene.add(pointLight);

    // Add fog for depth perception and better visual appeal
    const fogColor = new THREE.Color(0x87CEEB); // Sky blue
    scene.fog = new THREE.Fog(fogColor, 6000, 10000);
    scene.background = fogColor; // Match fog color

    // Create particle system for Phase 2 graphics
    const particlePool = createParticlePool(isMobile ? 2000 : 5000);
    scene.add(particlePool.mesh);
    particlePoolRef.current = particlePool;
    
    // Notify parent component that particle pool is ready
    if (onParticlePoolReady) {
      onParticlePoolReady(particlePool);
    }

    // Create 3D ground plane with grass texture
    const groundSegments = isMobile ? 1 : 4; // More segments on desktop for smoother terrain
    const groundGeometry = new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2, groundSegments, groundSegments);
    
    // Use PhongMaterial for better lighting response
    const groundMaterial = new THREE.MeshPhongMaterial({
      color: 0x2D5016,
      shininess: 10
    });
    
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    ground.receiveShadow = true; // Ground receives shadows
    ground.castShadow = false;
    scene.add(ground);

    // Animation loop - updates everything from propsRef
    // Added proper throttling to prevent freeze after 5 seconds
    let lastAnimateTime = Date.now();
    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !enabled) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }

      // Throttle based on device - 30FPS for mobile, 60FPS for desktop
      const targetFrameTime = isMobile ? 33 : 16;
      const now = Date.now();
      const timeSinceLastFrame = now - lastAnimateTime;
      if (timeSinceLastFrame < targetFrameTime) {
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }
      lastAnimateTime = now;

      const { walls, players, lootItems, bullets, zombies, damageNumbers, cameraPosition, cameraAngle, zoom } = propsRef.current;
      const deltaSeconds = timeSinceLastFrame / 1000;

      // Update camera position to match 2D canvas view
      // cameraPosition is the top-left corner of the viewport in game coordinates
      // We need to convert this to the center point for the 3D camera
        // Force landscape aspect ratio
        const rawWidth = window.innerWidth;
        const rawHeight = window.innerHeight;
        const landscapeWidth = Math.max(rawWidth, rawHeight);
        const landscapeHeight = Math.min(rawWidth, rawHeight);
        
        const aspect = landscapeWidth / landscapeHeight;
        const dpr = window.devicePixelRatio || 1;
        const viewportW = (landscapeWidth / dpr) / zoom;
        const viewportH = (landscapeHeight / dpr) / zoom;
      
      // Calculate center of viewport in game world coordinates
      const centerX = cameraPosition.x + viewportW / 2;
      const centerY = cameraPosition.y + viewportH / 2;
      

      
      // Position camera for top-down view
      // Camera height scales with zoom to maintain consistent view
      const baseHeight = 800;
      const cameraHeight = baseHeight / zoom;
      
      // Position camera directly above the center point (top-down)
      cameraRef.current.position.set(
        centerX,
        cameraHeight,
        centerY
      );
      
      // Look straight down at the center of the viewport
      cameraRef.current.lookAt(centerX, 0, centerY);
      
      // Adjust FOV based on zoom (higher zoom = narrower FOV)
      cameraRef.current.fov = Math.max(30, Math.min(75, 60 / zoom));
      cameraRef.current.aspect = aspect;
      cameraRef.current.updateProjectionMatrix();

      // Update walls
      const wallMeshes = wallMeshesRef.current;
      while (wallMeshes.length < walls.length) {
        const wall = walls[wallMeshes.length];
        const textureManager = textureManagerRef.current;
        let mesh: THREE.Mesh;

        // Use PhongMaterial for better lighting and shadow response
        const wallMaterial = new THREE.MeshPhongMaterial({
          color: 0x8B4513,
          shininess: 30
        });

        if (wall.isCircular) {
          // More segments on desktop for smoother cylinders
          const segments = isMobile ? 8 : 24;
          const geometry = new THREE.CylinderGeometry(wall.radius, wall.radius, 200, segments);
          mesh = new THREE.Mesh(geometry, wallMaterial);
          mesh.castShadow = true; // Walls cast shadows
          mesh.receiveShadow = true; // Walls receive shadows
        } else {
          const geometry = new THREE.BoxGeometry(wall.width, 200, wall.height);
          mesh = new THREE.Mesh(geometry, wallMaterial);
          mesh.castShadow = true; // Walls cast shadows
          mesh.receiveShadow = true; // Walls receive shadows
        }
        mesh.position.set(wall.position.x, 100, wall.position.y);
        sceneRef.current.add(mesh);
        wallMeshes.push(mesh);
      }
      
      // Update wall positions
      walls.forEach((wall, index) => {
        if (wallMeshes[index]) {
          wallMeshes[index].position.set(wall.position.x, 100, wall.position.y);
        }
      });
      
      // Remove extra walls
      while (wallMeshes.length > walls.length) {
        const mesh = wallMeshes.pop()!;
        sceneRef.current.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }

      // Update animation time
      animationTimeRef.current += Math.min(timeSinceLastFrame, 50); // Cap delta time to prevent large jumps

      // Update particle system (Phase 2)
      if (particlePoolRef.current) {
        updateParticles(particlePoolRef.current, timeSinceLastFrame);
      }
      
      // Update player meshes with animation
      const playerMeshes = playerMeshesRef.current;
      const cachedPlayerAnimations = getCachedPlayerAnimations() || [];
      // Poll player model in case it loads after scene init
      if (!playerModelRef.current) {
        const cached = getCachedPlayerModel();
        if (cached) {
          playerModelRef.current = cached;
          console.log('✓ Got player model from cache:', cached);
        }
      }
      
      players.forEach((player, index) => {
        if (!playerMeshes[index]) {
          // Use loaded 3D model if available, otherwise use fallback
          let characterGroup: THREE.Group;
          
          if (playerModelRef.current) {
            // Use SkeletonUtils.clone for skinned models, fallback to .clone()
            characterGroup = skeletonClone ? skeletonClone(playerModelRef.current) : playerModelRef.current.clone();
            characterGroup.traverse((child: any) => {
              if (child instanceof THREE.Mesh) {
                child.visible = true;
                child.frustumCulled = false;
              }
            });
            
            // Create animation mixer if animations exist
            if (cachedPlayerAnimations.length > 0) {
              const mixer = new THREE.AnimationMixer(characterGroup);
              // Prefer Idle/Walk/Run animations
              const idleClip = cachedPlayerAnimations.find(c => /(idle|breath|stand|pose|still)/i.test(c.name));
              const walkClip = cachedPlayerAnimations.find(c => /(walk|run|move)/i.test(c.name));
              const clipToPlay = idleClip || walkClip || cachedPlayerAnimations[0];
              if (clipToPlay) {
                const action = mixer.clipAction(clipToPlay);
                action.play();
              }
              playerMixersRef.current[index] = mixer;
              console.log('✓ Player mixer created with animations:', cachedPlayerAnimations.map(a => a.name));
            }
            
            console.log('✓ Cloned player model for index', index);
          } else {
            // Use fallback character
            characterGroup = createAnimatedCharacter(player, textureManagerRef.current, isMobile);
            characterGroup.userData.needsModelSwap = true;
            console.log('⚠ Using fallback character for index', index);
          }
          
          sceneRef.current!.add(characterGroup);
          playerMeshes.push(characterGroup);
        }
        
        const characterGroup = playerMeshes[index];
        
        // Replace fallback with loaded model when available (only once)
        if (characterGroup.userData.needsModelSwap && playerModelRef.current) {
          sceneRef.current!.remove(characterGroup);
          
          // Dispose old fallback
          characterGroup.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (Array.isArray(child.material)) {
                child.material.forEach(m => m.dispose());
              } else if (child.material) {
                child.material.dispose();
              }
            }
          });
          
          // Create new character with loaded model
          const newCharacter = playerModelRef.current.clone();
          sceneRef.current!.add(newCharacter);
          playerMeshes[index] = newCharacter;
          delete characterGroup.userData.needsModelSwap;
        }
        
        const currentGroup = playerMeshes[index];
        currentGroup.position.set(player.position.x, 0, player.position.y);
        currentGroup.rotation.y = player.angle;
        
        // Update player animations
        const playerMixer = playerMixersRef.current[index];
        if (playerMixer) {
          playerMixer.update(deltaSeconds);
          const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
          const isMoving = speed > 10;
          
          // Blend between idle and walk based on movement
          const walkClip = cachedPlayerAnimations.find(c => /(walk|run|move)/i.test(c.name));
          const idleClip = cachedPlayerAnimations.find(c => /(idle|breath|stand|pose|still)/i.test(c.name));
          if (walkClip && idleClip) {
            const idleAction = playerMixer.existingAction(idleClip);
            const walkAction = playerMixer.existingAction(walkClip) || playerMixer.clipAction(walkClip);
            const movingWeight = isMoving ? 1 : 0;
            if (idleAction) idleAction.setEffectiveWeight(1 - movingWeight).play();
            if (walkAction) walkAction.setEffectiveWeight(movingWeight).play();
          }
        }
        
        // Animate character based on movement (only for fallback characters)
        if (currentGroup.userData.needsModelSwap) {
          const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
          const isMoving = speed > 10;
          animateCharacter(currentGroup, isMoving, animationTimeRef.current);
        }
      });

      // Remove extra player meshes
      while (playerMeshes.length > players.length) {
        const group = playerMeshes.pop()!;
        sceneRef.current!.remove(group);
        // Dispose all children
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      }

      // Update loot meshes in 3D
      const lootMeshes = lootMeshesRef.current;
      lootItems.forEach((loot, index) => {
        if (!lootMeshes[index]) {
          const textureManager = textureManagerRef.current;
          let mesh: THREE.Mesh;
          
          // Create better 3D models for different item types
          if (loot.type === 'Weapon') {
            // Create a 3D weapon model (gun shape)
            const weaponGroup = new THREE.Group();
            // Gun body with glow
            const gunBody = new THREE.Mesh(
              new THREE.BoxGeometry(35, 8, 8),
              new THREE.MeshPhongMaterial({ 
                color: 0x1A1A1A,
                emissive: 0x444444, // Glow effect
                shininess: 100
              })
            );
            gunBody.castShadow = true;
            gunBody.receiveShadow = true;
            gunBody.position.set(0, 0, 0);
            weaponGroup.add(gunBody);
            // Gun barrel
            const gunBarrel = new THREE.Mesh(
              new THREE.CylinderGeometry(3, 3, 20, 8),
              new THREE.MeshPhongMaterial({ 
                color: 0x0A0A0A,
                emissive: 0x222222,
                shininess: 80
              })
            );
            gunBarrel.castShadow = true;
            gunBarrel.receiveShadow = true;
            gunBarrel.rotation.z = Math.PI / 2;
            gunBarrel.position.set(25, 0, 0);
            weaponGroup.add(gunBarrel);
            // Store as dummy mesh with group reference
            mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)); // Dummy for positioning
            mesh.userData.group = weaponGroup;
            mesh.userData.type = 'weapon';
            sceneRef.current!.add(weaponGroup);
          } else if (loot.type === 'Medkit' || loot.type === 'MegaHealth') {
            // Create 3D medkit (box with cross)
            const medkitGroup = new THREE.Group();
            const boxColor = loot.type === 'MegaHealth' ? 0xFF00FF : 0xEF4444;
            // Main box with glow
            const box = new THREE.Mesh(
              new THREE.BoxGeometry(25, 25, 25),
              new THREE.MeshPhongMaterial({ 
                color: boxColor,
                emissive: boxColor,
                emissiveIntensity: 0.3, // Healing items glow
                shininess: 60
              })
            );
            box.castShadow = true;
            box.receiveShadow = true;
            medkitGroup.add(box);
            // Cross on top
            const cross1 = new THREE.Mesh(
              new THREE.BoxGeometry(15, 5, 1),
              new THREE.MeshPhongMaterial({ 
                color: 0xFFFFFF,
                emissive: 0xFFFFFF,
                emissiveIntensity: 0.4,
                shininess: 100
              })
            );
            cross1.castShadow = true;
            cross1.receiveShadow = true;
            cross1.position.set(0, 13, 0);
            medkitGroup.add(cross1);
            const cross2 = new THREE.Mesh(
              new THREE.BoxGeometry(5, 15, 1),
              textureManager.createMaterial('loot', { color: 0xFFFFFF })
            );
            cross2.position.set(0, 13, 0);
            medkitGroup.add(cross2);
            mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
            mesh.userData.group = medkitGroup;
            mesh.userData.type = 'medkit';
            sceneRef.current!.add(medkitGroup);
          } else if (loot.type === 'Shield') {
            // Create 3D shield (circular)
            const geometry = new THREE.CylinderGeometry(15, 15, 5, 16);
            const material = textureManager.createMaterial('loot', { color: 0x3B82F6 });
            mesh = new THREE.Mesh(geometry, material);
            sceneRef.current!.add(mesh);
          } else if (loot.type === 'Ammo') {
            // Create 3D ammo box
            const geometry = new THREE.BoxGeometry(20, 15, 20);
            const material = textureManager.createMaterial('loot', { color: 0xFFA500 });
            mesh = new THREE.Mesh(geometry, material);
            sceneRef.current!.add(mesh);
          } else {
            // Default loot (golden box)
            const geometry = new THREE.BoxGeometry(20, 20, 20);
            const material = textureManager.createMaterial('loot', { color: 0xFFD700 });
            mesh = new THREE.Mesh(geometry, material);
            sceneRef.current!.add(mesh);
          }
          
          mesh.castShadow = false; // Disabled for performance
          lootMeshes.push(mesh);
        }
        const mesh = lootMeshes[index];
        // Add floating and rotating animation
        const bob = Math.sin(animationTimeRef.current / 800 + index) * 5;
        const rotationSpeed = 0.02;
        
        if (mesh.userData.group) {
          // For grouped items (weapons, medkits)
          mesh.userData.group.position.set(loot.position.x, 15 + bob, loot.position.y);
          mesh.userData.group.rotation.y += rotationSpeed;
          // Add pulsing scale animation
          const pulse = 1 + Math.sin(animationTimeRef.current / 600 + index) * 0.1;
          mesh.userData.group.scale.set(pulse, pulse, pulse);
        } else {
          // For simple meshes
          mesh.position.set(loot.position.x, 15 + bob, loot.position.y);
          mesh.rotation.y += rotationSpeed;
          // Add pulsing scale animation
          const pulse = 1 + Math.sin(animationTimeRef.current / 600 + index) * 0.1;
          mesh.scale.set(pulse, pulse, pulse);
        }
      });

      // Remove extra loot meshes
      while (lootMeshes.length > lootItems.length) {
        const mesh = lootMeshes.pop()!;
        if (mesh.userData.group) {
          // Remove grouped items
          sceneRef.current!.remove(mesh.userData.group);
          mesh.userData.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material instanceof THREE.Material) {
                child.material.dispose();
              }
            }
          });
        } else {
          sceneRef.current!.remove(mesh);
          mesh.geometry.dispose();
          if (mesh.material instanceof THREE.Material) {
            mesh.material.dispose();
          }
        }
      }

      // Update bullet meshes in 3D with different graphics per weapon type
      const bulletMeshes = bulletMeshesRef.current;
      bullets.forEach((bullet, index) => {
        if (!bulletMeshes[index]) {
          // Create different bullet types based on weapon
          let geometry: THREE.BufferGeometry;
          let material: THREE.MeshPhongMaterial;
          const weaponType = bullet.weaponType || WeaponType.Pistol;
          
          // Get weapon color
          const weaponColor = new THREE.Color(bullet.color || '#ffff00');
          const emissiveColor = weaponColor.clone().multiplyScalar(0.8);
          
          switch (weaponType) {
            case WeaponType.Rocket:
              // Large rocket projectile
              geometry = new THREE.ConeGeometry(8, 30, 8);
              material = new THREE.MeshPhongMaterial({
                color: 0xff3300,
                emissive: 0xff6600,
                emissiveIntensity: 2,
                shininess: 100
              });
              break;
            case WeaponType.Sniper:
              // Long thin tracer
              geometry = new THREE.CylinderGeometry(2, 2, 40, 6);
              material = new THREE.MeshPhongMaterial({
                color: 0x00ff88,
                emissive: 0x00ff44,
                emissiveIntensity: 3,
                shininess: 150
              });
              break;
            case WeaponType.Shotgun:
              // Small pellets
              geometry = new THREE.SphereGeometry(4, 6, 6);
              material = new THREE.MeshPhongMaterial({
                color: 0xaaaaaa,
                emissive: 0x666666,
                emissiveIntensity: 1,
                shininess: 80
              });
              break;
            case WeaponType.SMG:
            case WeaponType.Minigun:
              // Small fast bullets
              geometry = new THREE.SphereGeometry(5, 6, 6);
              material = new THREE.MeshPhongMaterial({
                color: 0x00aaff,
                emissive: 0x0066ff,
                emissiveIntensity: 2,
                shininess: 100
              });
              break;
            case WeaponType.AK47:
            case WeaponType.BurstRifle:
              // Medium rifle bullets
              geometry = new THREE.CylinderGeometry(3, 3, 20, 6);
              material = new THREE.MeshPhongMaterial({
                color: 0xffaa00,
                emissive: 0xff8800,
                emissiveIntensity: 2,
                shininess: 100
              });
              break;
            default:
              // Default pistol bullets
              geometry = new THREE.SphereGeometry(bullet.radius * 1.5, 8, 8);
              material = new THREE.MeshPhongMaterial({
                color: weaponColor,
                emissive: emissiveColor,
                emissiveIntensity: 2,
                shininess: 100
              });
          }
          
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          mesh.userData.weaponType = weaponType;
          sceneRef.current!.add(mesh);
          bulletMeshes.push(mesh);
        }
        
        const mesh = bulletMeshes[index];
        mesh.position.set(bullet.position.x, 40, bullet.position.y);
        
        // Rotate bullet to face direction of travel
        const angle = Math.atan2(bullet.velocity.y, bullet.velocity.x);
        mesh.rotation.y = -angle;
        
        // Special rotation for cylinder/cone shapes
        const wType = bullet.weaponType || WeaponType.Pistol;
        if (wType === WeaponType.Sniper || wType === WeaponType.AK47 || wType === WeaponType.BurstRifle) {
          mesh.rotation.z = Math.PI / 2;
        } else if (wType === WeaponType.Rocket) {
          mesh.rotation.x = Math.PI / 2;
        }
        
        // Add pulsing glow effect
        const scale = 1 + Math.sin(animationTimeRef.current * 0.05) * 0.3;
        mesh.scale.set(scale, scale, scale);
      });

      // Remove extra bullet meshes
      while (bulletMeshes.length > bullets.length) {
        const mesh = bulletMeshes.pop()!;
        sceneRef.current!.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }

      // Update zombie meshes with health bars and animations
      const zombieMeshes = zombieMeshesRef.current;
      const cachedBotModel = getCachedBotModel();
      const cachedBotAnimations = getCachedBotAnimations() || [];
      
      zombies.forEach((zombie, index) => {
        if (!zombieMeshes[index]) {
          // Use bot model if available, otherwise create fallback
          const zombieGroup = new THREE.Group();
          
          if (cachedBotModel) {
            const clonedBotModel = skeletonClone ? skeletonClone(cachedBotModel) : cachedBotModel.clone();
            clonedBotModel.position.y = 0;
            zombieGroup.add(clonedBotModel);

            // Create animation mixer if animations exist
            if (cachedBotAnimations.length > 0) {
              const mixer = new THREE.AnimationMixer(clonedBotModel);
              // Prefer common idle/walk/run names if present
              const idleClip = cachedBotAnimations.find(c => /(idle|breath|stand|pose|still)/i.test(c.name));
              const walkClip = cachedBotAnimations.find(c => /(walk|run|move)/i.test(c.name));
              const clipToPlay = idleClip || walkClip || cachedBotAnimations[0];
              const action = mixer.clipAction(clipToPlay);
              action.play();
              botMixersRef.current[index] = mixer;
            }
          } else {
            // Fallback character while model loads
            const segments = isMobile ? 6 : 12;
            
            // Zombie body (green/gray tint)
            const bodyGeometry = new THREE.CylinderGeometry(PLAYER_RADIUS * 0.85, PLAYER_RADIUS * 0.95, 75, segments);
            const zombieColor = zombie.zombieType === 'tank' ? 0x445544 : zombie.zombieType === 'fast' ? 0x558855 : 0x446644;
            const bodyMaterial = new THREE.MeshPhongMaterial({
              color: zombieColor,
              shininess: 30
            });
            const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
            body.position.y = 37;
            body.castShadow = true;
            zombieGroup.add(body);
            
            // Zombie head (pale/gray)
            const headGeometry = new THREE.SphereGeometry(PLAYER_RADIUS * 0.55, segments, segments);
            const headMaterial = new THREE.MeshPhongMaterial({
              color: 0x889988,
              shininess: 20
            });
            const head = new THREE.Mesh(headGeometry, headMaterial);
            head.position.y = 85;
            head.castShadow = true;
            zombieGroup.add(head);
          }
          
          // Health bar background (red)
          const healthBarBgGeometry = new THREE.PlaneGeometry(60, 8);
          const healthBarBgMaterial = new THREE.MeshBasicMaterial({
            color: 0x440000,
            side: THREE.DoubleSide
          });
          const healthBarBg = new THREE.Mesh(healthBarBgGeometry, healthBarBgMaterial);
          healthBarBg.position.y = 120;
          healthBarBg.rotation.x = -Math.PI / 2;
          healthBarBg.userData.isHealthBarBg = true;
          zombieGroup.add(healthBarBg);
          
          // Health bar foreground (green)
          const healthBarFgGeometry = new THREE.PlaneGeometry(58, 6);
          const healthBarFgMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide
          });
          const healthBarFg = new THREE.Mesh(healthBarFgGeometry, healthBarFgMaterial);
          healthBarFg.position.y = 121;
          healthBarFg.rotation.x = -Math.PI / 2;
          healthBarFg.userData.isHealthBar = true;
          zombieGroup.add(healthBarFg);
          
          sceneRef.current!.add(zombieGroup);
          zombieMeshes.push(zombieGroup);
        }
        
        const zombieGroup = zombieMeshes[index];
        zombieGroup.position.set(zombie.position.x, 0, zombie.position.y);
        zombieGroup.rotation.y = zombie.angle;
        
        // Update health bar
        const healthPercent = Math.max(0, zombie.hp / zombie.maxHp);
        zombieGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData.isHealthBar) {
            child.scale.x = healthPercent;
            child.position.x = -29 * (1 - healthPercent); // Offset to keep left-aligned
            // Change color based on health
            const mat = child.material as THREE.MeshBasicMaterial;
            if (healthPercent > 0.6) {
              mat.color.setHex(0x00ff00); // Green
            } else if (healthPercent > 0.3) {
              mat.color.setHex(0xffff00); // Yellow
            } else {
              mat.color.setHex(0xff0000); // Red
            }
          }
        });
        
        // Walking animation for zombies
        const speed = Math.sqrt(zombie.velocity.x ** 2 + zombie.velocity.y ** 2);
        const isMoving = speed > 10;
        if (isMoving) {
          const wobble = Math.sin(animationTimeRef.current * 0.015) * 0.1;
          zombieGroup.rotation.z = wobble;
        } else {
          zombieGroup.rotation.z = 0;
        }

        // If we have a mixer for this zombie and a walk clip, adjust speed
        const mixer = botMixersRef.current[index];
        if (mixer) {
          mixer.update(deltaSeconds);
          // Optionally blend to walk when moving (if walk clip exists)
          const walkClip = cachedBotAnimations.find(c => /(walk|run|move)/i.test(c.name));
          const idleClip = cachedBotAnimations.find(c => /(idle|breath|stand|pose|still)/i.test(c.name));
          if (walkClip && idleClip) {
            const idleAction = mixer.existingAction(idleClip);
            const walkAction = mixer.existingAction(walkClip) || mixer.clipAction(walkClip);
            const movingWeight = isMoving ? 1 : 0;
            if (idleAction) idleAction.setEffectiveWeight(1 - movingWeight).play();
            if (walkAction) walkAction.setEffectiveWeight(movingWeight).play();
          }
        }
      });
      
      // Remove extra zombie meshes
      while (zombieMeshes.length > zombies.length) {
        const group = zombieMeshes.pop()!;
        sceneRef.current!.remove(group);
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
        botMixersRef.current.pop();
      }

      // Update floating damage numbers
      const dmgNumMeshes = damageNumberMeshesRef.current;
      damageNumbers.forEach((dmgNum, index) => {
        if (!dmgNumMeshes[index]) {
          // Create damage number sprite
          const canvas = document.createElement('canvas');
          canvas.width = 128;
          canvas.height = 64;
          const ctx = canvas.getContext('2d')!;
          ctx.font = 'bold 48px Arial';
          ctx.fillStyle = dmgNum.color || '#ffff00';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 4;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeText(dmgNum.damage.toString(), 64, 32);
          ctx.fillText(dmgNum.damage.toString(), 64, 32);
          
          const texture = new THREE.CanvasTexture(canvas);
          const spriteMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false
          });
          const sprite = new THREE.Sprite(spriteMaterial);
          sprite.scale.set(80, 40, 1);
          sceneRef.current!.add(sprite);
          dmgNumMeshes.push(sprite);
        }
        
        const sprite = dmgNumMeshes[index];
        sprite.position.set(dmgNum.x, 100 + (dmgNum.maxLife - dmgNum.life) * 0.1, dmgNum.y);
        
        // Fade out based on life
        const opacity = dmgNum.life / dmgNum.maxLife;
        (sprite.material as THREE.SpriteMaterial).opacity = opacity;
      });
      
      // Remove extra damage number meshes
      while (dmgNumMeshes.length > damageNumbers.length) {
        const sprite = dmgNumMeshes.pop()!;
        sceneRef.current!.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        sprite.material.dispose();
      }

      try {
        // Update shadow map manually before render to prevent flickering
        if (rendererRef.current.shadowMap.enabled) {
          rendererRef.current.shadowMap.needsUpdate = true;
        }
        // Render scene directly
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        

      } catch (e) {
        console.error('WebGL render error:', e);
      }
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      rendererRef.current.setSize(width, height);
      if (cameraRef.current instanceof THREE.PerspectiveCamera) {
        cameraRef.current.aspect = width / height;
        cameraRef.current.updateProjectionMatrix();
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      isInitializedRef.current = false;
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      if (rendererRef.current) {
        // Properly dispose of WebGL context
        rendererRef.current.dispose();
        if (containerRef.current && rendererRef.current.domElement.parentNode === containerRef.current) {
          containerRef.current.removeChild(rendererRef.current.domElement);
        }
        rendererRef.current = null;
      }
      // Dispose all meshes
      wallMeshesRef.current.forEach(mesh => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      playerMeshesRef.current.forEach(group => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      });
      lootMeshesRef.current.forEach(mesh => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      bulletMeshesRef.current.forEach(mesh => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      // Dispose zombie meshes
      zombieMeshesRef.current.forEach(group => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      });
      botMixersRef.current = [];
      playerMeshesRef.current.forEach(group => {
        group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) {
              child.material.dispose();
            }
          }
        });
      });
      playerMixersRef.current = [];
      // Dispose damage number sprites
      damageNumberMeshesRef.current.forEach(sprite => {
        (sprite.material as THREE.SpriteMaterial).map?.dispose();
        sprite.material.dispose();
      });
      // Dispose particle system
      if (particlePoolRef.current) {
        try {
          if (particlePoolRef.current) {
            disposeParticlePool(particlePoolRef.current);
          }
        } catch (e) { /* ignore */ }
        particlePoolRef.current = null;
        if (onParticlePoolReady) {
          onParticlePoolReady(null);
        }
      }
      wallMeshesRef.current = [];
      playerMeshesRef.current = [];
      lootMeshesRef.current = [];
      bulletMeshesRef.current = [];
      zombieMeshesRef.current = [];
      damageNumberMeshesRef.current = [];
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [enabled, isMobile]); // Only re-run when enabled changes

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        overflow: 'hidden'
      }}
    />
  );
};

