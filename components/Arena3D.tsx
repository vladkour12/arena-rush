import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CHARACTERS, ARENA_WIDTH, ARENA_HEIGHT, ARENA_CENTER } from '../constants';
import { GameState, Player } from '../types';

interface Arena3DProps {
  player1Character: string;
  player2Character: string;
  onGameEnd: (winner: 1 | 2, scores: { player1: number; player2: number }, duration: number) => void;
  isBotMode?: boolean;
}

interface LoadedModel {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

const Arena3D: React.FC<Arena3DProps> = ({ player1Character, player2Character, onGameEnd, isBotMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const gameStartTimeRef = useRef<number>(Date.now());

  // Game state
  const [gameTime, setGameTime] = useState(0);
  const [player1Health, setPlayer1Health] = useState(CHARACTERS[player1Character].maxHealth);
  const [player2Health, setPlayer2Health] = useState(CHARACTERS[player2Character].maxHealth);
  const [player1Mana, setPlayer1Mana] = useState(CHARACTERS[player1Character].maxMana);
  const [player2Mana, setPlayer2Mana] = useState(CHARACTERS[player2Character].maxMana);
  const [mobileJoystick, setMobileJoystick] = useState({ x: 0, y: 0, active: false });
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const joystickInputRef = useRef({ x: 0, y: 0, active: false });
  const joystickRef = useRef<{ startX: number; startY: number } | null>(null);
  const botAIRef = useRef<{ lastDecisionTime: number; moveDirection: { x: number; y: number } }>({
    lastDecisionTime: Date.now(),
    moveDirection: { x: 0, y: 0 }
  });

  // Players state
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

  const player1MeshRef = useRef<THREE.Group | null>(null);
  const player2MeshRef = useRef<THREE.Group | null>(null);
  
  // Separate 3D position tracking
  const player3DPositionsRef = useRef<{ [key: number]: { x: number; y: number; z: number } }>({
    1: { x: -3, y: -1.5, z: 0 },
    2: { x: 3, y: -1.5, z: 0 }
  });

  const modelsRef = useRef<{ [key: number]: { loaded: boolean; mixer: THREE.AnimationMixer | null; idleAction: THREE.AnimationAction | null; runAction: THREE.AnimationAction | null; currentAction: THREE.AnimationAction | null } }>({
    1: { loaded: false, mixer: null, idleAction: null, runAction: null, currentAction: null },
    2: { loaded: false, mixer: null, idleAction: null, runAction: null, currentAction: null }
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e27);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Top-down-ish view
    camera.position.set(0, 12, 0.01);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Arena model (replaces placeholder floor/walls)
    const arenaLoader = new GLTFLoader();
    arenaLoader.load('/models/arena/arena.glb', (gltf) => {
      const arena = gltf.scene;
      arena.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      arena.position.set(0, 0, 0);
      arena.scale.set(1, 1, 1);
      scene.add(arena);
    });

    // Load character models
    const loader = new GLTFLoader();
    let player1Model: LoadedModel | null = null;
    let player2Model: LoadedModel | null = null;
    let modelsLoaded = 0;

    const onModelLoaded = (playerNum: 1 | 2) => {
      modelsRef.current[playerNum].loaded = true;
      modelsLoaded++;
    };

    // Load player 1 model (idle pose from walking animation)
    loader.load('/characters/character1/Meshy_AI_Animation_Walking_withSkin.glb', (gltf) => {
      console.log('[Arena3D] Player 1 model loaded', gltf);
      player1Model = gltf;
      const model = gltf.scene;
      model.scale.set(0.35, 0.35, 0.35);
      model.position.set(-3, -1.5, 0);
      model.castShadow = true;
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(model);
      player1MeshRef.current = model;
      console.log('[Arena3D] Player 1 mesh ref set:', player1MeshRef.current);

      const mixer = new THREE.AnimationMixer(model);
      modelsRef.current[1].mixer = mixer;
      
      // Setup animations: typically first is idle, second is run
      let idleAction: THREE.AnimationAction | null = null;
      let runAction: THREE.AnimationAction | null = null;
      
      if (gltf.animations.length >= 2) {
        idleAction = mixer.clipAction(gltf.animations[0]);
        runAction = mixer.clipAction(gltf.animations[1]);
      } else if (gltf.animations.length === 1) {
        // If only one animation, use it for both idle and run
        idleAction = mixer.clipAction(gltf.animations[0]);
        runAction = idleAction;
      }
      
      modelsRef.current[1].idleAction = idleAction;
      modelsRef.current[1].runAction = runAction;
      modelsRef.current[1].currentAction = idleAction;
      
      // Start with idle
      if (idleAction) {
        idleAction.play();
      }
      
      onModelLoaded(1);
    });

    // Load player 2 model
    loader.load('/characters/character1/Meshy_AI_Animation_Walking_withSkin.glb', (gltf) => {
      console.log('[Arena3D] Player 2 model loaded', gltf);
      player2Model = gltf;
      const model = gltf.scene.clone();
      model.scale.set(0.35, 0.35, 0.35);
      model.position.set(3, -1.5, 0);
      model.rotation.y = Math.PI; // Face opposite direction
      model.castShadow = true;
      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(model);
      player2MeshRef.current = model;
      console.log('[Arena3D] Player 2 mesh ref set:', player2MeshRef.current);

      const mixer = new THREE.AnimationMixer(model);
      modelsRef.current[2].mixer = mixer;
      
      // Setup animations: typically first is idle, second is run
      let idleAction: THREE.AnimationAction | null = null;
      let runAction: THREE.AnimationAction | null = null;
      
      if (gltf.animations.length >= 2) {
        idleAction = mixer.clipAction(gltf.animations[0]);
        runAction = mixer.clipAction(gltf.animations[1]);
      } else if (gltf.animations.length === 1) {
        // If only one animation, use it for both idle and run
        idleAction = mixer.clipAction(gltf.animations[0]);
        runAction = idleAction;
      }
      
      modelsRef.current[2].idleAction = idleAction;
      modelsRef.current[2].runAction = runAction;
      modelsRef.current[2].currentAction = idleAction;
      
      // Start with idle
      if (idleAction) {
        idleAction.play();
      }
      
      onModelLoaded(2);
    });

    // Input handling
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Animation loop
    let lastTime = Date.now();
    const animate = () => {
      requestAnimationFrame(animate);

      const now = Date.now();
      const deltaTime = (now - lastTime) / 1000;
      lastTime = now;

      setGameTime((Date.now() - gameStartTimeRef.current) / 1000);

      // Update animation mixers
      if (modelsRef.current[1].mixer) modelsRef.current[1].mixer.update(deltaTime);
      if (modelsRef.current[2].mixer) modelsRef.current[2].mixer.update(deltaTime);

      // Update player positions
      const players = playersRef.current;

      // Player 1 controls (keyboard + mobile joystick)
      const p1Move = { x: 0, y: 0 };
      if (keysRef.current['w'] || keysRef.current['arrowup']) p1Move.y += 1;
      if (keysRef.current['s'] || keysRef.current['arrowdown']) p1Move.y -= 1;
      if (keysRef.current['a'] || keysRef.current['arrowleft']) p1Move.x -= 1;
      if (keysRef.current['d'] || keysRef.current['arrowright']) p1Move.x += 1;
      
      // Add mobile joystick input (with deadzone)
      if (joystickInputRef.current.active && (Math.abs(joystickInputRef.current.x) > 0.1 || Math.abs(joystickInputRef.current.y) > 0.1)) {
        p1Move.x += joystickInputRef.current.x;
        p1Move.y += joystickInputRef.current.y;
      }

      // Debug: Log P1 input state every frame
      if (p1Move.x !== 0 || p1Move.y !== 0) {
        console.log(`[AnimLoop] P1 input detected! p1Move:`, p1Move, "keyboard:", keysRef.current, "joystick:", joystickInputRef.current);
      }

      // Player 2 controls or Bot AI
      let p2Move = { x: 0, y: 0 };
      
      if (isBotMode) {
        // Bot AI Logic
        const botAI = botAIRef.current;
        const now = Date.now();
        
        // Make new decision every 1-2 seconds
        if (now - botAI.lastDecisionTime > 1000 + Math.random() * 1000) {
          botAI.lastDecisionTime = now;
          
          const player2Pos = player3DPositionsRef.current[2];
          const player1Pos = player3DPositionsRef.current[1];
          
          // 60% chance to move toward player, 40% chance random movement
          if (Math.random() < 0.6) {
            // Move toward player 1
            const dx = player1Pos.x - player2Pos.x;
            const dz = player1Pos.z - player2Pos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            if (distance > 0.5) {
              botAI.moveDirection = { x: dx / distance, y: dz / distance };
            } else {
              botAI.moveDirection = { x: 0, y: 0 };
            }
          } else {
            // Random movement
            botAI.moveDirection = {
              x: (Math.random() - 0.5) * 2,
              y: (Math.random() - 0.5) * 2
            };
          }
        }
        
        p2Move = botAI.moveDirection;
      } else {
        // Player 2 human controls (only in PvP mode, not bot mode)
        if (keysRef.current['i']) p2Move.y += 1;
        if (keysRef.current['k']) p2Move.y -= 1;
        if (keysRef.current['j']) p2Move.x -= 1;
        if (keysRef.current['l']) p2Move.x += 1;
      }

      const movePlayer = (player: Player, moveVec: any, charId: string, mesh: THREE.Group | null, playerNum: 1 | 2) => {
        const speed = CHARACTERS[charId].stats.movementSpeed / 100; // Scale for 3D world
        const magnitude = Math.sqrt(moveVec.x ** 2 + moveVec.y ** 2);
        const pos3D = player3DPositionsRef.current[player.playerNumber];
        const modelData = modelsRef.current[playerNum];

        if (magnitude > 0 && mesh) {
          player.velocity.x = (moveVec.x / magnitude) * speed;
          player.velocity.y = (moveVec.y / magnitude) * speed;
          player.angle = Math.atan2(moveVec.y, moveVec.x);
          mesh.rotation.y = player.angle + Math.PI / 2;
          
          // Switch to run animation if not already running
          if (modelData.runAction && modelData.currentAction !== modelData.runAction) {
            if (modelData.currentAction) {
              modelData.currentAction.fadeOut(0.2);
            }
            modelData.runAction.reset().fadeIn(0.2).play();
            modelData.currentAction = modelData.runAction;
          }
          
          console.log(`[P${player.playerNumber}] Moving! moveVec:`, moveVec, "magnitude:", magnitude.toFixed(2), "speed:", speed, "velocity:", player.velocity);
        } else {
          player.velocity.x = 0;
          player.velocity.y = 0;
          
          // Switch to idle animation if not already idle
          if (modelData.idleAction && modelData.currentAction !== modelData.idleAction) {
            if (modelData.currentAction) {
              modelData.currentAction.fadeOut(0.2);
            }
            modelData.idleAction.reset().fadeIn(0.2).play();
            modelData.currentAction = modelData.idleAction;
          }
          
          if (magnitude === 0) {
            console.log(`[P${player.playerNumber}] No input, vel = 0`);
          } else if (!mesh) {
            console.log(`[P${player.playerNumber}] Mesh not loaded yet!`);
          }
        }

        // Update 3D position
        pos3D.x += player.velocity.x * deltaTime;
        pos3D.z += player.velocity.y * deltaTime;

        // Clamp to arena
        pos3D.x = Math.max(-5.5, Math.min(5.5, pos3D.x));
        pos3D.z = Math.max(-4.5, Math.min(4.5, pos3D.z));

        if (mesh) {
          mesh.position.set(pos3D.x, pos3D.y, pos3D.z);
        }
      };

      movePlayer(players[1], p1Move, player1Character, player1MeshRef.current, 1);
      movePlayer(players[2], p2Move, player2Character, player2MeshRef.current, 2);

      // Update camera to follow player 1
      const player1Pos = player3DPositionsRef.current[1];
      camera.position.set(player1Pos.x, 5, player1Pos.z + 0.01);
      camera.lookAt(player1Pos.x, 0, player1Pos.z);

      // Regenerate mana
      players[1].mana = Math.min(CHARACTERS[player1Character].maxMana, players[1].mana + 15 / 60);
      players[2].mana = Math.min(CHARACTERS[player2Character].maxMana, players[2].mana + 15 / 60);

      setPlayer1Health(players[1].health);
      setPlayer2Health(players[2].health);
      setPlayer1Mana(players[1].mana);
      setPlayer2Mana(players[2].mana);

      // Check win condition
      if (players[1].health <= 0) {
        onGameEnd(2, { player1: 0, player2: 100 }, gameTime);
        return;
      }
      if (players[2].health <= 0) {
        onGameEnd(1, { player1: 100, player2: 0 }, gameTime);
        return;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [player1Character, player2Character, onGameEnd, isBotMode]);

  return (
    <div className="arena-3d-container" ref={containerRef}>
      {/* Top HUD - Mobile Optimized */}
      <div className="arena-mobile-hud">
        {/* Left HP Bar - Player */}
        <div className="mobile-hp-section mobile-hp-left">
          <div className="mobile-hp-label">HP</div>
          <div className="mobile-hp-bar">
            <div 
              className="mobile-hp-fill"
              style={{
                width: `${(player1Health / CHARACTERS[player1Character].maxHealth) * 100}%`,
                background: 'linear-gradient(90deg, #00ff88, #00cc66)'
              }}
            />
          </div>
          <div className="mobile-hp-value">{Math.floor(player1Health)}</div>
        </div>

        {/* Center Timer */}
        <div className="mobile-timer">{Math.floor(gameTime)}s</div>

        {/* Right HP Bar - Opponent */}
        <div className="mobile-hp-section mobile-hp-right">
          <div className="mobile-hp-value">{Math.floor(player2Health)}</div>
          <div className="mobile-hp-bar">
            <div 
              className="mobile-hp-fill mobile-hp-fill-right"
              style={{
                width: `${(player2Health / CHARACTERS[player2Character].maxHealth) * 100}%`,
                background: 'linear-gradient(90deg, #ff4466, #cc2244)'
              }}
            />
          </div>
          <div className="mobile-hp-label">HP</div>
        </div>
      </div>

      {/* Ability Buttons - Right Side */}
      <div className="ability-buttons-panel">
        {/* Main Attack Button */}
        <button className="ability-btn-main ability-attack-main">
          <span className="ability-icon-main">⚔️</span>
        </button>
        
        {/* Side Abilities */}
        <div className="ability-buttons-side">
          <button className="ability-btn-small ability-dash">
            <span className="ability-icon-small">💨</span>
          </button>
          <button className="ability-btn-small ability-special">
            <span className="ability-icon-small">✨</span>
          </button>
          <button className="ability-btn-small ability-ultimate">
            <span className="ability-icon-small">🔥</span>
          </button>
        </div>
      </div>

      {/* Back Button - Bottom Left */}
      <button className="mobile-back-btn" onClick={onGameEnd.bind(null, 2, { player1: 0, player2: 0 }, gameTime)}>
        ←
      </button>

      {/* Mobile Joystick */}
      <div className="mobile-joystick-container"
        onTouchStart={(e) => {
          const touch = e.touches[0];
          joystickRef.current = { startX: touch.clientX, startY: touch.clientY };
          joystickInputRef.current = { x: 0, y: 0, active: true };
          setMobileJoystick({ x: 0, y: 0, active: true });
        }}
        onTouchMove={(e) => {
          if (!joystickRef.current) return;
          const touch = e.touches[0];
          const deltaX = touch.clientX - joystickRef.current.startX;
          const deltaY = touch.clientY - joystickRef.current.startY;
          const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), 50);
          const angle = Math.atan2(deltaY, deltaX);
          const joyX = Math.cos(angle) * distance / 50;
          const joyY = Math.sin(angle) * distance / 50;
          joystickInputRef.current = {
            x: joyX,
            y: joyY,
            active: true
          };
          setMobileJoystick({
            x: joyX,
            y: joyY,
            active: true
          });
        }}
        onTouchEnd={() => {
          joystickRef.current = null;
          joystickInputRef.current = { x: 0, y: 0, active: false };
          setMobileJoystick({ x: 0, y: 0, active: false });
        }}
      >
        <div className="joystick-base">
          <div 
            className="joystick-stick"
            style={{
              transform: `translate(${mobileJoystick.x * 50}px, ${mobileJoystick.y * 50}px)`,
              opacity: mobileJoystick.active ? 1 : 0.5
            }}
          />
        </div>
      </div>

    </div>
  );
};

export default Arena3D;
