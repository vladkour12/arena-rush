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

  // Create arena floor
  const createArena = (scene: THREE.Scene) => {
    // Floor
    const floorGeom = new THREE.PlaneGeometry(12, 10);
    const floorMat = new THREE.MeshStandardMaterial({ 
      color: 0x1a2a4a, 
      metalness: 0.1,
      roughness: 0.8
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Boundary walls (visual only)
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a6aff, metalness: 0.5 });
    
    // Front wall
    const frontWall = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 0.2), wallMat);
    frontWall.position.set(0, 1, -5.5);
    frontWall.castShadow = true;
    scene.add(frontWall);

    // Back wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 0.2), wallMat);
    backWall.position.set(0, 1, 5.5);
    backWall.castShadow = true;
    scene.add(backWall);

    // Left wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 10), wallMat);
    leftWall.position.set(-6, 1, 0);
    leftWall.castShadow = true;
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 10), wallMat);
    rightWall.position.set(6, 1, 0);
    rightWall.castShadow = true;
    scene.add(rightWall);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e27);
    scene.fog = new THREE.Fog(0x0a0e27, 50, 100);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 8, 8);
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

    // Create arena
    createArena(scene);

    // Load/create player models
    const loader = new GLTFLoader();
    let modelsLoaded = 0;

    const loadPlayerModel = (playerNum: 1 | 2, startPos: { x: number; z: number }, rotation: number) => {
      const fallback = createFallbackModel(playerNum === 1 ? 0x00ff88 : 0xff4466);
      fallback.position.set(startPos.x, -1.5, startPos.z);
      fallback.rotation.y = rotation;
      scene.add(fallback);
      meshesRef.current[playerNum] = fallback;

      // Try to load real model
      loader.load(
        '/characters/character1/Meshy_AI_Animation_Walking_withSkin.glb',
        (gltf) => {
          const model = playerNum === 1 ? gltf.scene : gltf.scene.clone();
          model.scale.set(0.35, 0.35, 0.35);
          model.position.set(startPos.x, -1.5, startPos.z);
          model.rotation.y = rotation;
          model.castShadow = true;
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          // Remove fallback and add real model
          scene.remove(fallback);
          scene.add(model);
          meshesRef.current[playerNum] = model;

          // Setup animations
          const mixer = new THREE.AnimationMixer(model);
          mixersRef.current[playerNum] = mixer;
          
          if (gltf.animations.length > 0) {
            gltf.animations.forEach(clip => mixer.clipAction(clip).play());
          }

          modelsLoaded++;
          if (modelsLoaded === 2) setLoading(false);
        },
        undefined,
        () => {
          // Error: use fallback
          modelsLoaded++;
          if (modelsLoaded === 2) setLoading(false);
        }
      );
    };

    loadPlayerModel(1, { x: -3, z: 0 }, 0);
    loadPlayerModel(2, { x: 3, z: 0 }, Math.PI);

    setTimeout(() => setLoading(false), 5000); // Fallback timeout

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
      const getInput = (keys: Set<string>, joyInput: { x: number; y: number }): { x: number; y: number } => {
        let x = 0, y = 0;
        
        if (keys.has('w') || keys.has('arrowup')) y += 1;
        if (keys.has('s') || keys.has('arrowdown')) y -= 1;
        if (keys.has('a') || keys.has('arrowleft')) x -= 1;
        if (keys.has('d') || keys.has('arrowright')) x += 1;

        // Add joystick input
        if (Math.abs(joyInput.x) > 0.1 || Math.abs(joyInput.y) > 0.1) {
          x += joyInput.x;
          y += joyInput.y;
        }

        // Normalize
        const len = Math.sqrt(x * x + y * y);
        if (len > 0) {
          x /= len;
          y /= len;
        }

        return { x, y };
      };

      const p1Input = getInput(keysRef.current, joystickRef.current);
      const p2Input = isBotMode ? getBotInput() : getInput(new Set(['i', 'k', 'j', 'l'].filter(k => keysRef.current.has(k))), { x: 0, y: 0 });

      // Move players
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

        // Clamp to arena
        player.position.x = Math.max(-5.5, Math.min(5.5, player.position.x));
        player.position.y = Math.max(-4.5, Math.min(4.5, player.position.y));

        // Rotate to face direction
        if (input.x !== 0 || input.y !== 0) {
          player.angle = Math.atan2(input.y, input.x);
          mesh.rotation.y = player.angle + Math.PI / 2;
        }

        // Update mesh position
        mesh.position.x = player.position.x;
        mesh.position.z = player.position.y;
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

      movePlayer(1, p1Input, player1Character);
      movePlayer(2, p2Input, player2Character);

      // Update camera to follow player 1
      const p1Pos = playersRef.current[1];
      camera.position.x = p1Pos.position.x;
      camera.position.z = p1Pos.position.y + 8;
      camera.lookAt(p1Pos.position.x, 0, p1Pos.position.y);

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
      {loading && <div className="game-loading">⏳ Loading Arena...</div>}

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
            joystickRef.current.x = Math.min(1, dx / max);
            joystickRef.current.y = Math.min(1, dy / max);
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
