import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ARMOR_LOOT_COUNT,
  CHARACTERS,
  DARKNESS_RADIUS,
  MAZE_HEIGHT,
  MAZE_SEED,
  MAZE_WIDTH,
  WEAPON_LOOT_COUNT,
} from '../constants';
import { LootItem, Player } from '../types';

interface Arena3DProps {
  player1Character: string;
  player2Character: string;
  onGameEnd: (winner: 1 | 2, scores: { player1: number; player2: number }, duration: number) => void;
  isBotMode?: boolean;
}

type MapCell = 0 | 1;

interface SpawnPoint {
  x: number;
  y: number;
}

interface WorldLoot {
  item: LootItem;
  mesh: THREE.Mesh;
  position: { x: number; y: number };
}

const PLAYER_RADIUS = 0.32;
const PICKUP_RADIUS = 0.95;
const CAMERA_HEIGHT = 24;
const CAMERA_VIEW = 10;

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const shuffle = <T,>(arr: T[], rng: () => number): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const createMaze = (width: number, height: number, seed: number): MapCell[][] => {
  const w = width;
  const h = height;
  const maze: MapCell[][] = Array.from({ length: h }, () => Array.from({ length: w }, () => 1));
  const rng = createRng(seed);
  const stack: Array<{ x: number; y: number }> = [{ x: 1, y: 1 }];
  maze[1][1] = 0;

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = shuffle(
      [
        { x: current.x + 2, y: current.y },
        { x: current.x - 2, y: current.y },
        { x: current.x, y: current.y + 2 },
        { x: current.x, y: current.y - 2 },
      ],
      rng,
    ).filter((p) => p.x > 0 && p.y > 0 && p.x < w - 1 && p.y < h - 1 && maze[p.y][p.x] === 1);

    if (neighbors.length === 0) {
      stack.pop();
      continue;
    }

    const next = neighbors[0];
    maze[next.y][next.x] = 0;
    maze[(next.y + current.y) / 2][(next.x + current.x) / 2] = 0;
    stack.push(next);
  }

  // Carve extra loops to avoid overly linear routes.
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      if (rng() > 0.74) {
        maze[y][x] = 0;
      }
    }
  }

  return maze;
};

const clearSpawnZone = (map: MapCell[][], cx: number, cy: number, radius: number) => {
  for (let y = Math.max(1, cy - radius); y <= Math.min(map.length - 2, cy + radius); y += 1) {
    for (let x = Math.max(1, cx - radius); x <= Math.min(map[0].length - 2, cx + radius); x += 1) {
      map[y][x] = 0;
    }
  }
};

const worldFromCell = (col: number, row: number, cols: number, rows: number) => ({
  x: col - Math.floor(cols / 2),
  y: -(row - Math.floor(rows / 2)),
});

const cellFromWorld = (x: number, y: number, cols: number, rows: number) => ({
  col: Math.round(x + Math.floor(cols / 2)),
  row: Math.round(-y + Math.floor(rows / 2)),
});

const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

/** BFS through maze cells, returns world-space waypoints from start cell to target cell. */
const bfsMazePath = (
  map: MapCell[][],
  startCol: number, startRow: number,
  endCol: number, endRow: number,
  cols: number, rows: number,
): Array<{ x: number; y: number }> => {
  if (map[startRow]?.[startCol] !== 0 || map[endRow]?.[endCol] !== 0) return [];
  const visited = new Uint8Array(rows * cols);
  const parent = new Int32Array(rows * cols).fill(-1);
  const queue: number[] = [];
  const startIdx = startRow * cols + startCol;
  const endIdx = endRow * cols + endCol;
  visited[startIdx] = 1;
  queue.push(startIdx);
  const dirs = [-cols, cols, -1, 1];
  let found = false;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head]; head += 1;
    if (cur === endIdx) { found = true; break; }
    for (const d of dirs) {
      const nb = cur + d;
      if (nb < 0 || nb >= rows * cols) continue;
      const nbRow = Math.floor(nb / cols);
      const nbCol = nb % cols;
      if (Math.abs(nbRow - Math.floor(cur / cols)) + Math.abs(nbCol - (cur % cols)) !== 1) continue;
      if (!visited[nb] && map[nbRow]?.[nbCol] === 0) {
        visited[nb] = 1;
        parent[nb] = cur;
        queue.push(nb);
      }
    }
  }
  if (!found) return [];
  const path: Array<{ x: number; y: number }> = [];
  let cur = endIdx;
  while (cur !== -1) {
    const r = Math.floor(cur / cols);
    const c = cur % cols;
    path.unshift(worldFromCell(c, r, cols, rows));
    cur = parent[cur];
  }
  return path;
};

const Arena3D: React.FC<Arena3DProps> = ({ player1Character, player2Character, onGameEnd, isBotMode = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const gameStartTimeRef = useRef<number>(Date.now());
  const animationFrameRef = useRef<number | null>(null);

  // Game state
  const [gameTime, setGameTime] = useState(0);
  const [player1Health, setPlayer1Health] = useState(CHARACTERS[player1Character].maxHealth);
  const [player2Health, setPlayer2Health] = useState(CHARACTERS[player2Character].maxHealth);
  const [loading, setLoading] = useState(true);
  const [mobileJoystick, setMobileJoystick] = useState({ x: 0, y: 0 });
  const [hudTick, setHudTick] = useState(0);

  // Input tracking
  const keysRef = useRef<Set<string>>(new Set());
  const joystickRef = useRef({ x: 0, y: 0, active: false });
  const joystickStartRef = useRef<{ x: number; y: number } | null>(null);

  // Player tracking
  const playersRef = useRef<{ [key: number]: Player }>({
    1: {
      playerNumber: 1,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      angle: 0,
      health: CHARACTERS[player1Character].maxHealth,
      mana: CHARACTERS[player1Character].maxMana,
      dodging: false,
      dodgeEndTime: 0,
      inventory: [],
      equipment: { weapon: null, armor: null },
    },
    2: {
      playerNumber: 2,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      angle: Math.PI,
      health: CHARACTERS[player2Character].maxHealth,
      mana: CHARACTERS[player2Character].maxMana,
      dodging: false,
      dodgeEndTime: 0,
      inventory: [],
      equipment: { weapon: null, armor: null },
    }
  });

  const meshesRef = useRef<{ [key: number]: THREE.Group | THREE.Mesh }>({});
  const mixersRef = useRef<{ [key: number]: THREE.AnimationMixer }>({});
  const mazeRef = useRef<MapCell[][]>([]);
  const mazeSizeRef = useRef({ rows: 0, cols: 0 });
  const lootRef = useRef<Record<string, WorldLoot>>({});
  const localVisionLightRef = useRef<THREE.PointLight | null>(null);
  const tryPickupRef = useRef<((playerNum: 1 | 2) => void) | null>(null);
  const botPathRef = useRef<Array<{ x: number; y: number }>>([]);
  const botPathTimerRef = useRef<number>(0);

  // Create player capsule model
  const createPlayerModel = (color: number): THREE.Group => {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.4, emissive: color, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), bodyMat);
    head.position.y = 1.6;
    head.castShadow = true;
    group.add(head);
    return group;
  };

  const createArena = (scene: THREE.Scene, map: MapCell[][]) => {
    const tl = new THREE.TextureLoader();
    const loadTile = (file: string) => {
      const t = tl.load(`/kenney_tinyDungeon/Tiles/${file}`);
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestFilter;
      return t;
    };

    const floorMat = new THREE.MeshLambertMaterial({ map: loadTile('tile_0048.png') });
    const altFloorMat = new THREE.MeshLambertMaterial({ map: loadTile('tile_0049.png') });
    const wallMat = new THREE.MeshLambertMaterial({ map: loadTile('tile_0036.png') });

    const cols = map[0].length;
    const rows = map.length;
    const flatGeom = new THREE.PlaneGeometry(1, 1);
    const boxGeom = new THREE.BoxGeometry(1, 1.35, 1);

    // Count instances for each type
    let floorEvenCount = 0;
    let floorOddCount = 0;
    let wallCount = 0;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (map[row][col] === 0) {
          if ((row + col) % 2 === 0) floorEvenCount += 1;
          else floorOddCount += 1;
        } else {
          wallCount += 1;
        }
      }
    }

    // Create instanced meshes — 3 draw calls for the entire maze
    const floorEven = new THREE.InstancedMesh(flatGeom, floorMat, floorEvenCount);
    const floorOdd = new THREE.InstancedMesh(flatGeom, altFloorMat, floorOddCount);
    const walls = new THREE.InstancedMesh(boxGeom, wallMat, wallCount);

    floorEven.receiveShadow = true;
    floorOdd.receiveShadow = true;
    walls.castShadow = !IS_MOBILE;
    walls.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let ei = 0;
    let oi = 0;
    let wi = 0;

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const wp = worldFromCell(col, row, cols, rows);
        if (map[row][col] === 0) {
          dummy.position.set(wp.x, 0, -wp.y);
          dummy.rotation.set(-Math.PI / 2, 0, 0);
          dummy.updateMatrix();
          if ((row + col) % 2 === 0) {
            floorEven.setMatrixAt(ei, dummy.matrix);
            ei += 1;
          } else {
            floorOdd.setMatrixAt(oi, dummy.matrix);
            oi += 1;
          }
        } else {
          dummy.position.set(wp.x, 0.675, -wp.y);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          walls.setMatrixAt(wi, dummy.matrix);
          wi += 1;
        }
      }
    }

    floorEven.instanceMatrix.needsUpdate = true;
    floorOdd.instanceMatrix.needsUpdate = true;
    walls.instanceMatrix.needsUpdate = true;

    // InstancedMesh can't auto-compute a bounding sphere, so Three.js would
    // frustum-cull the entire mesh as off-screen. Disable culling for all tiles.
    floorEven.frustumCulled = false;
    floorOdd.frustumCulled = false;
    walls.frustumCulled = false;

    scene.add(floorEven);
    scene.add(floorOdd);
    scene.add(walls);
  };

  const createLootItem = (id: string, type: 'weapon' | 'armor'): LootItem => {
    // Tiers: common (1), uncommon (2), rare (3) — higher tier = rarer
    const rng = createRng(id.charCodeAt(id.length - 1) * 31 + id.charCodeAt(0));
    const tier = rng() < 0.55 ? 1 : rng() < 0.75 ? 2 : 3;
    if (type === 'weapon') {
      const tierNames = ['Iron', 'Steel', 'Obsidian'];
      const attacks = [8, 16, 28];
      const spreads = [4, 6, 8];
      return {
        id,
        type,
        name: `${tierNames[tier - 1]} Sword`,
        attackBonus: attacks[tier - 1] + Math.floor(rng() * spreads[tier - 1]),
        defenseBonus: 0,
      };
    }
    const tierNames = ['Leather', 'Chain', 'Plate'];
    const defenses = [6, 14, 24];
    const spreads = [4, 6, 8];
    return {
      id,
      type,
      name: `${tierNames[tier - 1]} Armor`,
      attackBonus: 0,
      defenseBonus: defenses[tier - 1] + Math.floor(rng() * spreads[tier - 1]),
    };
  };

  const spawnLoot = (scene: THREE.Scene, map: MapCell[][], seed: number) => {
    const rng = createRng(seed + 21);
    const cols = map[0].length;
    const rows = map.length;
    const floorCells: Array<{ col: number; row: number }> = [];

    for (let row = 1; row < rows - 1; row += 1) {
      for (let col = 1; col < cols - 1; col += 1) {
        if (map[row][col] === 0) {
          floorCells.push({ col, row });
        }
      }
    }

    const selected = shuffle(floorCells, rng).slice(0, WEAPON_LOOT_COUNT + ARMOR_LOOT_COUNT);
    const weaponGeom = new THREE.OctahedronGeometry(0.3, 0);
    const armorGeom = new THREE.BoxGeometry(0.42, 0.42, 0.42);
    const weaponMat = new THREE.MeshStandardMaterial({ color: 0xf5d142, emissive: 0x7a5a00, emissiveIntensity: 0.4 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x69d4ff, emissive: 0x00395a, emissiveIntensity: 0.45 });

    selected.forEach((cell, index) => {
      const type = index < WEAPON_LOOT_COUNT ? 'weapon' : 'armor';
      const id = `${type}-${index}`;
      const wp = worldFromCell(cell.col, cell.row, cols, rows);
      const mesh = new THREE.Mesh(type === 'weapon' ? weaponGeom : armorGeom, type === 'weapon' ? weaponMat : armorMat);
      mesh.position.set(wp.x, 0.6, -wp.y);
      mesh.castShadow = true;
      scene.add(mesh);

      lootRef.current[id] = {
        item: createLootItem(id, type),
        mesh,
        position: { x: wp.x, y: wp.y },
      };
    });
  };

  const equipFirst = (playerNum: 1 | 2, type: 'weapon' | 'armor') => {
    const player = playersRef.current[playerNum];
    const item = player.inventory.find((entry) => entry.type === type);
    if (!item) {
      return;
    }
    player.equipment[type] = item;
    setHudTick((v) => v + 1);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const generatedMap = createMaze(MAZE_WIDTH, MAZE_HEIGHT, MAZE_SEED);
    clearSpawnZone(generatedMap, 2, 2, 2);
    clearSpawnZone(generatedMap, generatedMap[0].length - 3, generatedMap.length - 3, 2);
    mazeRef.current = generatedMap;
    mazeSizeRef.current = { rows: generatedMap.length, cols: generatedMap[0].length };

    const pickSpawnCell = (startCol: number, startRow: number, colStep: number, rowStep: number) => {
      const cols = generatedMap[0].length;
      const rows = generatedMap.length;
      for (let row = startRow; row > 0 && row < rows - 1; row += rowStep) {
        for (let col = startCol; col > 0 && col < cols - 1; col += colStep) {
          if (generatedMap[row][col] === 0) {
            return { col, row };
          }
        }
      }
      return { col: 1, row: 1 };
    };

    const spawn1Cell = pickSpawnCell(2, 2, 1, 1);
    const spawn2Cell = pickSpawnCell(generatedMap[0].length - 3, generatedMap.length - 3, -1, -1);
    const spawn1 = worldFromCell(spawn1Cell.col, spawn1Cell.row, generatedMap[0].length, generatedMap.length);
    const spawn2 = worldFromCell(spawn2Cell.col, spawn2Cell.row, generatedMap[0].length, generatedMap.length);

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x040609);
    // No THREE.Fog: it measures camera→fragment distance (camera is 24 units up),
    // so every tile would be at depth ≥24 > old fog.far 18.2 → completely black.
    // Darkness bubble is created by the PointLight that follows P1 below.
    sceneRef.current = scene;

    const makeCamera = (w: number, h: number) => {
      const aspect = w / h;
      const cam = new THREE.OrthographicCamera(
        -CAMERA_VIEW * aspect,
        CAMERA_VIEW * aspect,
        CAMERA_VIEW,
        -CAMERA_VIEW,
        0.1,
        200,
      );
      cam.position.set(spawn1.x, CAMERA_HEIGHT, -spawn1.y);
      cam.up.set(0, 0, -1);
      cam.lookAt(spawn1.x, 0, -spawn1.y);
      return cam;
    };
    const camera = makeCamera(window.innerWidth, window.innerHeight);
    cameraRef.current = camera;

    // Renderer — reduce quality on mobile for performance
    const renderer = new THREE.WebGLRenderer({ antialias: !IS_MOBILE, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(IS_MOBILE ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = !IS_MOBILE;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lights
    // Very dim ambient so areas outside the player's light pool are nearly black
    const ambientLight = new THREE.AmbientLight(0x1a2030, 0.4);
    scene.add(ambientLight);

    const halfMap = Math.max(generatedMap[0].length, generatedMap.length) / 2;
    const directionalLight = new THREE.DirectionalLight(0xbad7ff, 0.33);
    directionalLight.position.set(0, 34, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 120;
    directionalLight.shadow.camera.left = -halfMap;
    directionalLight.shadow.camera.right = halfMap;
    directionalLight.shadow.camera.top = halfMap;
    directionalLight.shadow.camera.bottom = -halfMap;
    scene.add(directionalLight);

    // Main vision light — illuminates a circle around P1; quadratic decay means
    // edges fall off naturally to the dark background.
    const localVisionLight = new THREE.PointLight(0xfff0cf, 5.5, DARKNESS_RADIUS * 2.8, 2.0);
    localVisionLight.position.set(spawn1.x, 2.4, -spawn1.y);
    scene.add(localVisionLight);
    localVisionLightRef.current = localVisionLight;

    createArena(scene, generatedMap);
    spawnLoot(scene, generatedMap, MAZE_SEED);

    playersRef.current[1].position = { x: spawn1.x, y: spawn1.y };
    playersRef.current[2].position = { x: spawn2.x, y: spawn2.y };
    playersRef.current[1].inventory = [];
    playersRef.current[2].inventory = [];
    playersRef.current[1].equipment = { weapon: null, armor: null };
    playersRef.current[2].equipment = { weapon: null, armor: null };

    const p1 = createPlayerModel(0x00ff88);
    p1.position.set(spawn1.x, 0, -spawn1.y);
    scene.add(p1);
    meshesRef.current[1] = p1;

    const p2 = createPlayerModel(0xff4466);
    p2.position.set(spawn2.x, 0, -spawn2.y);
    scene.add(p2);
    meshesRef.current[2] = p2;

    setLoading(false);

    const tryPickup = (playerNum: 1 | 2) => {
      const player = playersRef.current[playerNum];
      const entries = Object.entries(lootRef.current);
      if (entries.length === 0) {
        return;
      }

      let closest: { id: string; dist: number } | null = null;
      entries.forEach(([id, loot]) => {
        const dist = Math.hypot(player.position.x - loot.position.x, player.position.y - loot.position.y);
        if (dist <= PICKUP_RADIUS && (!closest || dist < closest.dist)) {
          closest = { id, dist };
        }
      });

      if (!closest) {
        return;
      }

      const loot = lootRef.current[closest.id];
      if (!loot) {
        return;
      }

      player.inventory.push(loot.item);
      if (player.inventory.length > 10) {
        player.inventory.shift();
      }

      scene.remove(loot.mesh);
      delete lootRef.current[closest.id];
      setHudTick((v) => v + 1);
    };

    tryPickupRef.current = tryPickup;

    // Input handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isFirstPress = !keysRef.current.has(key);
      keysRef.current.add(key);

      if (!isFirstPress) {
        return;
      }

      if (key === 'e') {
        tryPickup(1);
      } else if (key === 'o' && !isBotMode) {
        tryPickup(2);
      } else if (key === '1') {
        equipFirst(1, 'weapon');
      } else if (key === '2') {
        equipFirst(1, 'armor');
      } else if (key === '8' && !isBotMode) {
        equipFirst(2, 'weapon');
      } else if (key === '9' && !isBotMode) {
        equipFirst(2, 'armor');
      }
    };

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

      // Update mixers (empty until models are added)
      (Object.values(mixersRef.current) as THREE.AnimationMixer[]).forEach(mixer => mixer.update(deltaTime));

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
        const map = mazeRef.current;
        const { rows, cols } = mazeSizeRef.current;
        if (!map.length) return { x: 0, y: 0 };

        // Auto-pickup nearby loot as bot
        tryPickupRef.current?.(2);
        // Auto-equip best loot
        equipFirst(2, 'weapon');
        equipFirst(2, 'armor');

        const dx = p1.position.x - p2.position.x;
        const dy = p1.position.y - p2.position.y;
        const distToP1 = Math.hypot(dx, dy);

        // When close enough, charge directly
        if (distToP1 < 5) {
          const len = distToP1;
          return len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
        }

        // Decide target: nearest loot if bot has no weapon/armor, else P1
        botPathTimerRef.current -= deltaTime;
        if (botPathRef.current.length === 0 || botPathTimerRef.current <= 0) {
          botPathTimerRef.current = 3.0; // recompute path every 3s
          const botCell = cellFromWorld(p2.position.x, p2.position.y, cols, rows);

          // Find nearest uncollected loot
          const hasWeapon = !!p2.equipment.weapon;
          const hasArmor = !!p2.equipment.armor;
          let targetCell: { col: number; row: number } | null = null;

          if (!hasWeapon || !hasArmor) {
            let bestDist = Infinity;
            Object.values(lootRef.current).forEach((loot) => {
              if ((!hasWeapon && loot.item.type === 'weapon') || (!hasArmor && loot.item.type === 'armor')) {
                const lCell = cellFromWorld(loot.position.x, loot.position.y, cols, rows);
                const d = Math.abs(lCell.col - botCell.col) + Math.abs(lCell.row - botCell.row);
                if (d < bestDist) { bestDist = d; targetCell = lCell; }
              }
            });
          }

          if (!targetCell) {
            // Target P1
            targetCell = cellFromWorld(p1.position.x, p1.position.y, cols, rows);
          }

          botPathRef.current = bfsMazePath(
            map,
            botCell.col, botCell.row,
            targetCell.col, targetCell.row,
            cols, rows,
          );
          // Drop first waypoint (current cell)
          if (botPathRef.current.length > 1) botPathRef.current.shift();
        }

        // Follow current waypoint
        if (botPathRef.current.length > 0) {
          const wp = botPathRef.current[0];
          const wdx = wp.x - p2.position.x;
          const wdy = wp.y - p2.position.y;
          const wdist = Math.hypot(wdx, wdy);
          if (wdist < 0.45) botPathRef.current.shift(); // reached waypoint
          if (wdist > 0) return { x: wdx / wdist, y: wdy / wdist };
        }

        return { x: 0, y: 0 };
      };

      const isBlocked = (x: number, y: number): boolean => {
        const map = mazeRef.current;
        if (!map.length) {
          return false;
        }
        const { rows, cols } = mazeSizeRef.current;
        const samples: Array<{ x: number; y: number }> = [
          { x: x + PLAYER_RADIUS, y },
          { x: x - PLAYER_RADIUS, y },
          { x, y: y + PLAYER_RADIUS },
          { x, y: y - PLAYER_RADIUS },
        ];

        return samples.some((sample) => {
          const cell = cellFromWorld(sample.x, sample.y, cols, rows);
          if (cell.col < 0 || cell.row < 0 || cell.col >= cols || cell.row >= rows) {
            return true;
          }
          return map[cell.row][cell.col] !== 0;
        });
      };

      const movePlayer = (playerNum: 1 | 2, input: { x: number; y: number }, charId: string) => {
        const player = playersRef.current[playerNum];
        const mesh = meshesRef.current[playerNum];
        if (!mesh) return;

        const equippedWeaponBonus = player.equipment.weapon?.attackBonus ?? 0;
        const speed = CHARACTERS[charId].stats.movementSpeed / 100 + equippedWeaponBonus * 0.003;
        player.velocity.x = input.x * speed;
        player.velocity.y = input.y * speed;

        const nextX = player.position.x + player.velocity.x * deltaTime;
        const nextY = player.position.y + player.velocity.y * deltaTime;

        if (!isBlocked(nextX, player.position.y)) {
          player.position.x = nextX;
        }
        if (!isBlocked(player.position.x, nextY)) {
          player.position.y = nextY;
        }

        if (input.x !== 0 || input.y !== 0) {
          mesh.rotation.y = Math.atan2(input.x, -input.y);
        }

        mesh.position.x = player.position.x;
        mesh.position.z = -player.position.y;
      };

      const p1Input = getInput(keysRef.current, ['w', 'arrowup'], ['s', 'arrowdown'], ['a', 'arrowleft'], ['d', 'arrowright'], joystickRef.current);
      const p2Input = isBotMode ? getBotInput() : getInput(keysRef.current, ['i'], ['k'], ['j'], ['l'], { x: 0, y: 0 });

      movePlayer(1, p1Input, player1Character);
      movePlayer(2, p2Input, player2Character);

      // Animate pickups and maintain nearby darkness reveal.
      Object.values(lootRef.current).forEach((loot, index) => {
        loot.mesh.rotation.y += deltaTime * 1.5;
        loot.mesh.position.y = 0.58 + Math.sin(now * 0.003 + index) * 0.08;
      });

      const localPlayer = playersRef.current[1];
      camera.position.x += (localPlayer.position.x - camera.position.x) * 0.12;
      camera.position.z += (-localPlayer.position.y - camera.position.z) * 0.12;
      camera.lookAt(localPlayer.position.x, 0, -localPlayer.position.y);

      if (localVisionLightRef.current) {
        localVisionLightRef.current.position.x = localPlayer.position.x;
        localVisionLightRef.current.position.z = -localPlayer.position.y;
      }

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

    // Resize handler for orthographic camera
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const aspect = w / h;
      camera.left = -CAMERA_VIEW * aspect;
      camera.right = CAMERA_VIEW * aspect;
      camera.top = CAMERA_VIEW;
      camera.bottom = -CAMERA_VIEW;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      Object.values(lootRef.current).forEach((loot) => scene.remove(loot.mesh));
      lootRef.current = {};
      localVisionLightRef.current = null;
      mazeRef.current = [];
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [player1Character, player2Character, onGameEnd, isBotMode]);

  const playerOne = playersRef.current[1];
  const playerTwo = playersRef.current[2];

  return (
    <div className="arena-3d-container" ref={containerRef} data-hud-tick={hudTick}>
      {loading && <div className="game-loading">Loading Arena...</div>}

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

      <div className="arena-inventory-hud">
        <div className="inv-title">Exploration</div>
        {!IS_MOBILE && <div className="inv-keys">E pickup &middot; 1 weapon &middot; 2 armor</div>}
        {!IS_MOBILE && !isBotMode && <div className="inv-keys">O pickup &middot; 8 weapon &middot; 9 armor</div>}
        <div className="inv-row"><span className="inv-label">P1 inv</span><span className="inv-val">{playerOne.inventory.length}/10</span></div>
        <div className="inv-row"><span className="inv-icon">⚔️</span><span className="inv-val inv-equip">{playerOne.equipment.weapon ? `${playerOne.equipment.weapon.name} +${playerOne.equipment.weapon.attackBonus}` : <em>none</em>}</span></div>
        <div className="inv-row"><span className="inv-icon">🛡️</span><span className="inv-val inv-equip">{playerOne.equipment.armor ? `${playerOne.equipment.armor.name} +${playerOne.equipment.armor.defenseBonus}` : <em>none</em>}</span></div>
        {!isBotMode && (
          <>
            <div className="inv-divider" />
            <div className="inv-row"><span className="inv-label">P2 inv</span><span className="inv-val">{playerTwo.inventory.length}/10</span></div>
            <div className="inv-row"><span className="inv-icon">⚔️</span><span className="inv-val inv-equip">{playerTwo.equipment.weapon ? `${playerTwo.equipment.weapon.name} +${playerTwo.equipment.weapon.attackBonus}` : <em>none</em>}</span></div>
            <div className="inv-row"><span className="inv-icon">🛡️</span><span className="inv-val inv-equip">{playerTwo.equipment.armor ? `${playerTwo.equipment.armor.name} +${playerTwo.equipment.armor.defenseBonus}` : <em>none</em>}</span></div>
          </>
        )}
      </div>

      <div className="ability-buttons-panel">
        <button
          className="ability-btn-main ability-attack-main"
          onTouchEnd={(e) => { e.preventDefault(); tryPickupRef.current?.(1); }}
        ><span className="ability-icon-main">🎒</span></button>
        <div className="ability-buttons-side">
          <button
            className="ability-btn-small ability-dash"
            onTouchEnd={(e) => { e.preventDefault(); equipFirst(1, 'weapon'); }}
          ><span className="ability-icon-small">⚔️</span></button>
          <button
            className="ability-btn-small ability-special"
            onTouchEnd={(e) => { e.preventDefault(); equipFirst(1, 'armor'); }}
          ><span className="ability-icon-small">🛡️</span></button>
          <button
            className="ability-btn-small ability-ultimate"
            onTouchEnd={(e) => { e.preventDefault(); tryPickupRef.current?.(1); }}
          ><span className="ability-icon-small">🔥</span></button>
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
