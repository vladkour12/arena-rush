import { useEffect } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER_RADIUS } from '../constants';
import { isMobileDevice } from '../utils/gameUtils';
import { setCachedPlayerModel, setCachedBotModel, setPlayerLoadingPromise, setBotLoadingPromise, setCachedBotAnimations, setCachedPlayerAnimations } from '../utils/modelCache';

interface ModelPreloaderProps {
  onProgress: (progress: number, message: string) => void;
}

export function ModelPreloader({ onProgress }: ModelPreloaderProps) {
  useEffect(() => {
    onProgress(5, 'Loading models...');
    
    const mtlLoader = new MTLLoader();
    const objLoader = new OBJLoader();
    const gltfLoader = new GLTFLoader();
    let playerDone = false;
    let botDone = false;
    const isMobile = isMobileDevice();
    const tryFinish = () => {
      if (playerDone) {
        onProgress(100, 'Ready!');
      }
    };

    // Mobile fast-path: skip heavy OBJ/MTL and start with lightweight fallback meshes.
    // We still lazy-load the GLB in the background so it can swap in later without blocking startup.
    if (isMobile) {
      onProgress(50, 'Skipping heavy models on mobile...');
      setCachedBotModel(null);
      setCachedBotAnimations([]);
      setBotLoadingPromise(Promise.resolve(null));
      setCachedPlayerModel(null);
      setCachedPlayerAnimations([]);
      setPlayerLoadingPromise(Promise.resolve(null));
      playerDone = true;
      botDone = true;
      tryFinish();
      // Lazy-load player GLB without affecting initial load progress
      gltfLoader.load(
        '/models/bot-luna.glb',
        (gltf) => {
          const botObject = gltf.scene;
          const botAnimations = gltf.animations || [];
          const botBox = new THREE.Box3().setFromObject(botObject);
          const botSize = botBox.getSize(new THREE.Vector3());
          const botMaxDim = Math.max(botSize.x, botSize.y, botSize.z);
          const botScale = (PLAYER_RADIUS * 2 * 5) / botMaxDim;
          botObject.scale.set(botScale, botScale, botScale);
          botObject.traverse((child: any) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              child.frustumCulled = false;
              child.visible = true;
            }
          });
          setCachedPlayerModel(botObject);
          setCachedPlayerAnimations(botAnimations);
          console.log('✓ Luna GLB loaded in background for mobile');
        },
        undefined,
        (error) => {
          console.error('✗ Failed to background-load Luna GLB (mobile):', error);
        }
      );
      return;
    }
    
    // Load Alien Scout model (ZOMBIES/BOTS) in background so it doesn't block ready state
    mtlLoader.load(
      '/models/Meshy_AI_A_Scout_from_an_alien_1221020812_texture_obj/Meshy_AI_A_Scout_from_an_alien_1221020812_texture.mtl',
      (materials) => {
        onProgress(15, 'Loading bot textures...');
        materials.preload();
        objLoader.setMaterials(materials);
        
        objLoader.load(
          '/models/Meshy_AI_A_Scout_from_an_alien_1221020812_texture_obj/Meshy_AI_A_Scout_from_an_alien_1221020812_texture.obj',
          (playerObject) => {
            onProgress(40, 'Processing bot model...');
            // Center and scale model
            const box = new THREE.Box3().setFromObject(playerObject);
            const center = box.getCenter(new THREE.Vector3());
            playerObject.position.sub(center);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            const scale = (PLAYER_RADIUS * 2 * 5) / maxDim;
            playerObject.scale.set(scale, scale, scale);
            playerObject.position.y = 0;
            playerObject.traverse((child: any) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });
            // Store Alien Scout as the BOT model (for zombies)
            setCachedBotModel(playerObject);
            setBotLoadingPromise(Promise.resolve(playerObject));
            botDone = true;
            console.log('✓ Bot model loaded in background');
          },
          undefined,
          (error) => {
            console.error('Failed to load bot model:', error);
            setBotLoadingPromise(Promise.resolve(null));
            botDone = true;
          }
        );
      },
      undefined,
      (error) => {
        console.error('Failed to load bot textures:', error);
        setBotLoadingPromise(Promise.resolve(null));
        botDone = true;
      }
    );

    // Load Luna Snow GLB (will be used for PLAYER CHARACTER)
    onProgress(50, 'Loading player model...');
    console.log('🔄 Starting Luna GLB load...');
    gltfLoader.load(
      '/models/bot-luna.glb',
      (gltf) => {
        console.log('✓ Luna GLB loaded successfully', gltf);
        const botObject = gltf.scene;
        const botAnimations = gltf.animations || [];
        
        console.log('Luna scene children:', botObject.children.length);
        console.log('Luna animations:', botAnimations.map(a => a.name));
        
        // Scale player model
        const botBox = new THREE.Box3().setFromObject(botObject);
        const botSize = botBox.getSize(new THREE.Vector3());
        const botMaxDim = Math.max(botSize.x, botSize.y, botSize.z);
        const botScale = (PLAYER_RADIUS * 2 * 5) / botMaxDim;
        botObject.scale.set(botScale, botScale, botScale);
        
        // Ensure all meshes are visible
        botObject.traverse((child: any) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            child.visible = true;
            console.log('Luna mesh:', child.name, 'visible:', child.visible);
          }
        });
        
        // Store Luna GLB as the PLAYER model
        setCachedPlayerModel(botObject);
        setCachedPlayerAnimations(botAnimations);
        setPlayerLoadingPromise(Promise.resolve(botObject));
        console.log('✓ Luna stored in cache as player model');
        onProgress(90, 'Player model ready');
        playerDone = true;
        tryFinish();
      },
      (xhr) => {
        const percentComplete = (xhr.loaded / xhr.total) * 100;
        console.log('📥 Luna GLB loading progress:', percentComplete.toFixed(0) + '%');
      },
      (error) => {
        console.error('✗ Failed to load Luna GLB:', error);
        console.error('Error details:', (error as any).message || error);
        setCachedBotAnimations([]);
        setPlayerLoadingPromise(Promise.resolve(null));
        botDone = true;
        tryFinish();
      }
    );
  }, [onProgress]);

  return null; // This component doesn't render anything
}
