import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTERS } from '../constants';
import { Player } from '../types';

interface Arena3DProps {
  player1Character: string;
  player2Character: string;
  onGameEnd: (winner: 1 | 2, scores: { player1: number; player2: number }, duration: number) => void;
  isBotMode?: boolean;
}

const Arena3D: React.FC<Arena3DProps> = ({ player1Character, player2Character, onGameEnd, isBotMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const gameStartTimeRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | null>(null);

  // Game state
  const [gameTime, setGameTime] = useState(0);
  const [player1Health, setPlayer1Health] = useState(CHARACTERS[player1Character].maxHealth);
  const [player2Health, setPlayer2Health] = useState(CHARACTERS[player2Character].maxHealth);
  const [loading, setLoading] = useState(true);
  const [mobileJoystick, setMobileJoystick] = useState({ x: 0, y: 0 });

  // Input tracking
  const keysRef = useRef<Set<string>>(new Set());
  const joystickRef = useRef({ x: 0, y: 0, active: false });
  const joystickStartRef = useRef<{ x: number; y: number } | null>(null);

  // Player tracking
  const playersRef = useRef<{ [key: number]: Player }>({
    1: {
      playerNumber: 1,
      position: { x: -3, y: 0 },
      velocity: { x: 0, y: 0 },
      angle: 0,
      health: CHARACTERS[player1Character].maxHealth,
      mana: CHARACTERS[player1Character].maxMana,
      dodging: false,
      dodgeEndTime: 0
    },
    2: {
      playerNumber: 2,
      position: { x: 3, y: 0 },
      velocity: { x: 0, y: 0 },
      angle: Math.PI,
      health: CHARACTERS[player2Character].maxHealth,
      mana: CHARACTERS[player2Character].maxMana,
      dodging: false,
      dodgeEndTime: 0
    }
  });

  const meshesRef = useRef<{ [key: number]: THREE.Group | THREE.Mesh }>({});
  const mixersRef = useRef<{ [key: number]: THREE.AnimationMixer }>({});
  const arenaModelRef = useRef<THREE.Group | null>(null);
  const arenaBoundsRef = useRef<{ width: number; depth: number }>({ width: 12, depth: 10 });

  // Create fallback geometry
  const createFallbackModel = (color: number): THREE.Group => {
    const group = new THREE.Group();
    
    // Body
    const bodyGeom = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = 0.6;
    group.add(body);

    // Head
    const headGeom = new THREE.SphereGeometry(0.3, 32, 32);
    const head = new THREE.Mesh(headGeom, bodyMat);
    head.castShadow = true;
    head.receiveShadow = true;
    head.position.y = 1.6;
    group.add(head);

    group.scale.set(0.35, 0.35, 0.35);
    return group;
  };

  // Create procedural arena as fallback
  const createFallbackArena = (scene: THREE.Scene) => {
    const floorGeom = new THREE.PlaneGeometry(12, 10);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, metalness: 0.1, roughness: 0.8 });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a6aff, metalness: 0.5 });
    const walls = [
      { size: [12, 2, 0.2] as [number, number, number], pos: [0, 1, -5.5] as [number, number, number] },
      { size: [12, 2, 0.2] as [number, number, number], pos: [0, 1, 5.5] as [number, number, number] },
      { size: [0.2, 2, 10] as [number, number, number], pos: [-6, 1, 0] as [number, number, number] },
      { size: [0.2, 2, 10] as [number, number, number], pos: [6, 1, 0] as [number, number, number] },
    ];
    walls.forEach(w => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(...w.size), wallMat);
      wall.position.set(...w.pos);
      wall.castShadow = true;
      scene.add(wall);
    });
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e27);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 14, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
    directionalLight.position.set(8, 15, 8);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.far = 50;
    scene.add(directionalLight);

    // Load arena model (fallback to procedural)
    const loader = new GLTFLoader();
    let pendingLoads = 3; // arena + 2 players
    const checkAllLoaded = () => {
      pendingLoads--;
      if (pendingLoads <= 0) setLoading(false);
    };

    loader.load(
      '/models/arena/arena.glb',
      (gltf) => {
        const arenaModel = gltf.scene;
        
        // Compute bounding box to auto-scale/center
        const box = new THREE.Box3().setFromObject(arenaModel);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        // Scale arena to fit game space (~12 units wide)
        const targetWidth = 12;
        const maxDim = Math.max(size.x, size.z);
        const scale = targetWidth / maxDim;
        arenaModel.scale.setScalar(scale);
        
        // Recalculate after scaling
        box.setFromObject(arenaModel);
        box.getCenter(center);
        box.getSize(size);
        
        // Center on origin, sit on y=0
        arenaModel.position.sub(center);
        arenaModel.position.y = -box.min.y * scale + arenaModel.position.y;
        
        // Enable shadows
        arenaModel.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(arenaModel);
        arenaModelRef.current = arenaModel;
        
        // Update arena bounds for collision
        arenaBoundsRef.current = { width: size.x, depth: size.z };
        
        // Adjust camera height to see full arena
        const camHeight = Math.max(size.x, size.z) * 0.9;
        camera.position.set(0, camHeight, 0);
        camera.lookAt(0, 0, 0);

        console.log('Arena model loaded, size:', size, 'scale:', scale);
        checkAllLoaded();
      },
      undefined,
      (err) => {
        console.warn('Arena model failed to load, using fallback:', err);
        createFallbackArena(scene);
        checkAllLoaded();
      }
    );

    // Load character models
    const loadPlayerModel = (playerNum: 1 | 2, startPos: { x: number; z: number }, rotation: number) => {
      const fallback = createFallbackModel(playerNum === 1 ? 0x00ff88 : 0xff4466);
      fallback.position.set(startPos.x, 0, startPos.z);
      fallback.rotation.y = rotation;
      scene.add(fallback);
      meshesRef.current[playerNum] = fallback;

      loader.load(
        '/characters/character1/Meshy_AI_Animation_Walking_withSkin.glb',
        (gltf) => {
          const model = gltf.scene.clone();
          
          // Auto-scale character to ~1 unit tall
          const charBox = new THREE.Box3().setFromObject(model);
          const charSize = new THREE.Vector3();
          charBox.getSize(charSize);
          const charScale = 1.0 / charSize.y;
          model.scale.setScalar(charScale);
          
          // Recalculate after scaling
          const scaledBox = new THREE.Box3().setFromObject(model);
          
          model.position.set(startPos.x, -scaledBox.min.y, startPos.z);
          model.rotation.y = rotation;
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Tint P2 red to distinguish from P1
          if (playerNum === 2) {
            model.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.material) {
                  const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
                  mat.color.multiplyScalar(0.6);
                  mat.color.add(new THREE.Color(0.4, 0, 0));
                  mesh.material = mat;
                }
              }
            });
          }

          scene.remove(fallback);
          scene.add(model);
          meshesRef.current[playerNum] = model;

          // Setup walking animation
          const mixer = new THREE.AnimationMixer(model);
          mixersRef.current[playerNum] = mixer;
          if (gltf.animations.length > 0) {
            gltf.animations.forEach(clip => mixer.clipAction(clip).play());
          }

          console.log(`Player ${playerNum} model loaded, height: ${charSize.y}, scale: ${charScale}`);
          checkAllLoaded();
        },
        undefined,
        () => {
          console.warn(`Player ${playerNum} model failed, using fallback`);
          checkAllLoaded();
        }
      );
    };

    loadPlayerModel(1, { x: -3, z: 0 }, 0);
    loadPlayerModel(2, { x: 3, z: 0 }, Math.PI);

    setTimeout(() => setLoading(false), 30000); // Fallback timeout (arena is 134MB)

    // Input handlers
    const handleKeyDown = (e: KeyboardEvent) => keysRef.current.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Animation loop
    let lastTime = Date.now();
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);

      const now = Date.now();
      const deltaTime = Math.min((now - lastTime) / 1000, 0.05); // Cap at 50ms
      lastTime = now;

      setGameTime((Date.now() - gameStartTimeRef.current) / 1000);

      // Update mixers
      Object.values(mixersRef.current).forEach(mixer => mixer.update(deltaTime));

      // Get input
      const getInput = (
        keys: Set<string>,
        upKeys: string[],
        downKeys: string[],
        leftKeys: string[],
        rightKeys: string[],
        joyInput: { x: number; y: number }
      ): { x: number; y: number } => {
        let x = 0, y = 0;

        if (upKeys.some(k => keys.has(k))) y += 1;
        if (downKeys.some(k => keys.has(k))) y -= 1;
        if (leftKeys.some(k => keys.has(k))) x -= 1;
        if (rightKeys.some(k => keys.has(k))) x += 1;

        if (Math.abs(joyInput.x) > 0.1 || Math.abs(joyInput.y) > 0.1) {
          x += joyInput.x;
          y += joyInput.y;
        }

        const len = Math.sqrt(x * x + y * y);
        if (len > 0) { x /= len; y /= len; }
        return { x, y };
      };

      const getBotInput = (): { x: number; y: number } => {
        const p1 = playersRef.current[1];
        const p2 = playersRef.current[2];
        const dx = p1.position.x - p2.position.x;
        const dy = p1.position.y - p2.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 8 && Math.random() > 0.3) {
          return { x: dx / dist, y: dy / dist };
        }
        return { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2 };
      };

      const movePlayer = (playerNum: 1 | 2, input: { x: number; y: number }, charId: string) => {
        const player = playersRef.current[playerNum];
        const mesh = meshesRef.current[playerNum];
        if (!mesh) return;

        const speed = CHARACTERS[charId].stats.movementSpeed / 100;
        player.velocity.x = input.x * speed;
        player.velocity.y = input.y * speed;

        // Update position
        player.position.x += player.velocity.x * deltaTime;
        player.position.y += player.velocity.y * deltaTime;

        // Clamp to arena bounds
        const halfW = arenaBoundsRef.current.width / 2 - 0.5;
        const halfD = arenaBoundsRef.current.depth / 2 - 0.5;
        player.position.x = Math.max(-halfW, Math.min(halfW, player.position.x));
        player.position.y = Math.max(-halfD, Math.min(halfD, player.position.y));

        // Rotate to face movement direction (top-down)
        if (input.x !== 0 || input.y !== 0) {
          mesh.rotation.y = Math.atan2(input.x, -input.y);
        }

        // Update mesh position (game Y maps to -Z for top-down view)
        // Keep mesh.position.y as-is (set during load for ground offset)
        mesh.position.x = player.position.x;
        mesh.position.z = -player.position.y;
      };

      const p1Input = getInput(keysRef.current, ['w', 'arrowup'], ['s', 'arrowdown'], ['a', 'arrowleft'], ['d', 'arrowright'], joystickRef.current);
      const p2Input = isBotMode ? getBotInput() : getInput(keysRef.current, ['i'], ['k'], ['j'], ['l'], { x: 0, y: 0 });

      movePlayer(1, p1Input, player1Character);
      movePlayer(2, p2Input, player2Character);

      // Fixed top-down camera

      // Update health/mana
      setPlayer1Health(playersRef.current[1].health);
      setPlayer2Health(playersRef.current[2].health);

      // Win condition
      if (playersRef.current[1].health <= 0) {
        onGameEnd(2, { player1: 0, player2: 100 }, gameTime);
        return;
      }
      if (playersRef.current[2].health <= 0) {
        onGameEnd(1, { player1: 100, player2: 0 }, gameTime);
        return;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize handler
    const handleResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [player1Character, player2Character, onGameEnd, isBotMode]);

  return (
    <div className="arena-3d-container" ref={containerRef}>
      {loading && <div className="game-loading">Loading Arena & Characters...</div>}

      <div className="arena-mobile-hud">
        <div className="mobile-hp-section mobile-hp-left">
          <div className="mobile-hp-label">HP</div>
          <div className="mobile-hp-bar">
            <div className="mobile-hp-fill" style={{ width: `${(player1Health / CHARACTERS[player1Character].maxHealth) * 100}%` }} />
          </div>
          <div className="mobile-hp-value">{Math.floor(player1Health)}</div>
        </div>

        <div className="mobile-timer">{Math.floor(gameTime)}s</div>

        <div className="mobile-hp-section mobile-hp-right">
          <div className="mobile-hp-value">{Math.floor(player2Health)}</div>
          <div className="mobile-hp-bar">
            <div className="mobile-hp-fill mobile-hp-fill-right" style={{ width: `${(player2Health / CHARACTERS[player2Character].maxHealth) * 100}%` }} />
          </div>
          <div className="mobile-hp-label">HP</div>
        </div>
      </div>

      <div className="ability-buttons-panel">
        <button className="ability-btn-main ability-attack-main"><span className="ability-icon-main">⚔️</span></button>
        <div className="ability-buttons-side">
          <button className="ability-btn-small ability-dash"><span className="ability-icon-small">💨</span></button>
          <button className="ability-btn-small ability-special"><span className="ability-icon-small">✨</span></button>
          <button className="ability-btn-small ability-ultimate"><span className="ability-icon-small">🔥</span></button>
        </div>
      </div>

      <button className="mobile-back-btn" onClick={() => onGameEnd(1, { player1: 0, player2: 0 }, gameTime)}>←</button>

      <div className="mobile-joystick-container"
        onTouchStart={(e) => {
          const touch = e.touches[0];
          joystickStartRef.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchMove={(e) => {
          if (!joystickStartRef.current) return;
          const touch = e.touches[0];
          const dx = touch.clientX - joystickStartRef.current.x;
          const dy = touch.clientY - joystickStartRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const max = 60;
          
          if (dist > 0) {
            joystickRef.current.x = Math.max(-1, Math.min(1, dx / max));
            joystickRef.current.y = Math.max(-1, Math.min(1, -dy / max));
          }
          setMobileJoystick(joystickRef.current);
        }}
        onTouchEnd={() => {
          joystickStartRef.current = null;
          joystickRef.current = { x: 0, y: 0, active: false };
          setMobileJoystick({ x: 0, y: 0 });
        }}
      >
        <div className="joystick-base">
          <div className="joystick-stick" style={{ transform: `translate(${mobileJoystick.x * 40}px, ${mobileJoystick.y * 40}px)` }} />
        </div>
      </div>
    </div>
  );
};

export default Arena3D;
