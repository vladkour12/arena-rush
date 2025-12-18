import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { Wall, Player, LootItem, Vector2 } from '../types';
import { MAP_SIZE, PLAYER_RADIUS } from '../constants';
import { getTextureManager } from '../utils/textureManager';
import { isMobileDevice } from '../utils/gameUtils';

/**
 * Create an animated 3D character model
 */
function createAnimatedCharacter(player: Player, textureManager: ReturnType<typeof getTextureManager>, isMobile: boolean): THREE.Group {
  const group = new THREE.Group();
  const segments = isMobile ? 6 : 12;
  
  // Body (main cylinder)
  const bodyGeometry = new THREE.CylinderGeometry(PLAYER_RADIUS * 0.8, PLAYER_RADIUS * 0.9, 80, segments);
  const bodyColor = player.skin === 'Police' ? 0x4169E1 : player.skin === 'Terrorist' ? 0xDC143C : 0x808080;
  const bodyMaterial = textureManager.createMaterial('player', { color: bodyColor });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 40;
  body.userData.type = 'body';
  group.add(body);
  
  // Head (sphere on top)
  const headGeometry = new THREE.SphereGeometry(PLAYER_RADIUS * 0.6, segments, segments);
  const headMaterial = textureManager.createMaterial('player', { color: 0xFFDBB3 }); // Skin color
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 90;
  head.userData.type = 'head';
  group.add(head);
  
  // Arms (for animation)
  const armGeometry = new THREE.CylinderGeometry(PLAYER_RADIUS * 0.2, PLAYER_RADIUS * 0.2, 50, 6);
  const armMaterial = textureManager.createMaterial('player', { color: bodyColor });
  
  const leftArm = new THREE.Mesh(armGeometry, armMaterial);
  leftArm.position.set(-PLAYER_RADIUS * 0.9, 50, 0);
  leftArm.rotation.z = 0.3;
  leftArm.userData.type = 'leftArm';
  leftArm.userData.baseRotation = 0.3;
  group.add(leftArm);
  
  const rightArm = new THREE.Mesh(armGeometry, armMaterial);
  rightArm.position.set(PLAYER_RADIUS * 0.9, 50, 0);
  rightArm.rotation.z = -0.3;
  rightArm.userData.type = 'rightArm';
  rightArm.userData.baseRotation = -0.3;
  group.add(rightArm);
  
  // Legs (for walking animation)
  const legGeometry = new THREE.CylinderGeometry(PLAYER_RADIUS * 0.25, PLAYER_RADIUS * 0.25, 60, 6);
  const legMaterial = textureManager.createMaterial('player', { color: 0x2A2A2A }); // Dark pants
  
  const leftLeg = new THREE.Mesh(legGeometry, legMaterial);
  leftLeg.position.set(-PLAYER_RADIUS * 0.4, 0, 0);
  leftLeg.userData.type = 'leftLeg';
  group.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeometry, legMaterial);
  rightLeg.position.set(PLAYER_RADIUS * 0.4, 0, 0);
  rightLeg.userData.type = 'rightLeg';
  group.add(rightLeg);
  
  // Weapon (simple gun model)
  const weaponGeometry = new THREE.BoxGeometry(40, 8, 8);
  const weaponMaterial = textureManager.createMaterial('weapon', { color: 0x1A1A1A });
  const weapon = new THREE.Mesh(weaponGeometry, weaponMaterial);
  weapon.position.set(PLAYER_RADIUS * 1.2, 60, 0);
  weapon.rotation.z = -0.2;
  weapon.userData.type = 'weapon';
  group.add(weapon);
  
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
  cameraPosition: Vector2;
  cameraAngle: number;
  zoom: number;
  enabled?: boolean;
}

/**
 * 3D Renderer Component that renders textured 3D objects
 * This component creates a WebGL canvas overlay for 3D elements
 */
export const Game3DRenderer: React.FC<Game3DRendererProps> = ({
  walls,
  players,
  lootItems,
  cameraPosition,
  cameraAngle,
  zoom,
  enabled = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const textureManagerRef = useRef(getTextureManager());
  const isMobile = isMobileDevice();
  
  // Store meshes in refs to persist across renders
  const wallMeshesRef = useRef<THREE.Mesh[]>([]);
  const playerMeshesRef = useRef<THREE.Group[]>([]); // Changed to Group for animated characters
  const lootMeshesRef = useRef<THREE.Mesh[]>([]);
  const isInitializedRef = useRef(false);
  const animationTimeRef = useRef(0); // For animation timing
  
  // Store latest props in refs for animation loop
  const propsRef = useRef({ walls, players, lootItems, cameraPosition, cameraAngle, zoom });
  useEffect(() => {
    propsRef.current = { walls, players, lootItems, cameraPosition, cameraAngle, zoom };
  }, [walls, players, lootItems, cameraPosition, cameraAngle, zoom]);

  // Initialize scene only once
  useEffect(() => {
    if (!enabled || !containerRef.current || isInitializedRef.current) return;
    
    isInitializedRef.current = true;

    // Initialize Three.js scene
    const scene = new THREE.Scene();
    scene.background = null; // Transparent background
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

    // Create renderer (optimized for mobile)
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: !isMobile,
      powerPreference: 'high-performance'
    });
    renderer.setSize(viewportWidth, viewportHeight);
    // Further reduce pixel ratio for better performance
    renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 1.5));
    // Disable shadows completely for better performance
    renderer.shadowMap.enabled = false;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Using MeshBasicMaterial doesn't require lighting, but we keep minimal lights for compatibility
    // Reduced intensity for better performance
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // Create 3D ground plane with grass texture
    const groundSegments = isMobile ? 1 : 2;
    const groundGeometry = new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2, groundSegments, groundSegments);
    const groundMaterial = textureManagerRef.current.createMaterial('grass', {
      color: 0x2D5016,
      roughness: 1.0
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(MAP_SIZE / 2, 0, MAP_SIZE / 2);
    ground.receiveShadow = false; // Disabled for performance
    scene.add(ground);

    // Animation loop - updates everything from propsRef
    // Removed frame rate limiting for smoother gameplay
    const animate = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current || !enabled) {
        return;
      }

      const { walls, players, lootItems, cameraPosition, cameraAngle, zoom } = propsRef.current;

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
      
      // Position camera for isometric 3D view
      // Camera height and distance scale with zoom to maintain consistent view
      const baseHeight = 1800;
      const baseDistance = 2200;
      const cameraHeight = baseHeight / zoom;
      const cameraDistance = baseDistance / zoom;
      
      // Position camera above and behind the center point
      cameraRef.current.position.set(
        centerX,
        cameraHeight,
        centerY + cameraDistance
      );
      
      // Look at the center of the viewport
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

        if (wall.isCircular) {
          const segments = isMobile ? 8 : 16; // Reduced polygons for performance
          const geometry = new THREE.CylinderGeometry(wall.radius, wall.radius, 200, segments);
          const material = textureManager.createMaterial('brick', {
            color: 0x8B4513,
            roughness: 0.8
          });
          mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = false; // Disabled for performance
          mesh.receiveShadow = false;
        } else {
          const geometry = new THREE.BoxGeometry(wall.width, 200, wall.height);
          const material = textureManager.createMaterial('brick', {
            color: 0x8B4513,
            roughness: 0.8
          });
          mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = false; // Disabled for performance
          mesh.receiveShadow = false;
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
      animationTimeRef.current += 16; // Approximate frame time
      
      // Update player meshes with animation
      const playerMeshes = playerMeshesRef.current;
      players.forEach((player, index) => {
        if (!playerMeshes[index]) {
          // Create animated 3D character
          const characterGroup = createAnimatedCharacter(player, textureManagerRef.current, isMobile);
          sceneRef.current!.add(characterGroup);
          playerMeshes.push(characterGroup);
        }
        const characterGroup = playerMeshes[index];
        characterGroup.position.set(player.position.x, 0, player.position.y);
        characterGroup.rotation.y = player.angle;
        
        // Animate character based on movement
        const speed = Math.sqrt(player.velocity.x ** 2 + player.velocity.y ** 2);
        const isMoving = speed > 10;
        animateCharacter(characterGroup, isMoving, animationTimeRef.current);
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
            // Gun body
            const gunBody = new THREE.Mesh(
              new THREE.BoxGeometry(35, 8, 8),
              textureManager.createMaterial('weapon', { color: 0x1A1A1A })
            );
            gunBody.position.set(0, 0, 0);
            weaponGroup.add(gunBody);
            // Gun barrel
            const gunBarrel = new THREE.Mesh(
              new THREE.CylinderGeometry(3, 3, 20, 8),
              textureManager.createMaterial('weapon', { color: 0x0A0A0A })
            );
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
            // Main box
            const box = new THREE.Mesh(
              new THREE.BoxGeometry(25, 25, 25),
              textureManager.createMaterial('loot', { color: boxColor })
            );
            medkitGroup.add(box);
            // Cross on top
            const cross1 = new THREE.Mesh(
              new THREE.BoxGeometry(15, 5, 1),
              textureManager.createMaterial('loot', { color: 0xFFFFFF })
            );
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

      rendererRef.current.render(sceneRef.current, cameraRef.current);
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
      wallMeshesRef.current = [];
      playerMeshesRef.current = [];
      lootMeshesRef.current = [];
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
        zIndex: 0, // Behind 2D canvas so 3D is the base layer
        mixBlendMode: 'normal'
      }}
    />
  );
};

