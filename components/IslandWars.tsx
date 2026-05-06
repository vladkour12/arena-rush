import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Phaser from 'phaser';
import { PreloadScene } from '../game/scenes/PreloadScene';
import { IslandWarsScene } from '../game/scenes/IslandWarsScene';
import type { IslandWarsCallbacks, TrainQueueDisplayItem, SelectedUnitInfo } from '../game/scenes/IslandWarsScene';
import type { ProductionAvailability } from '../game/scenes/IslandWarsScene';
import type { Difficulty } from '../game/systems/AISystem';
import { TRAIN_QUEUE_MAX } from '../game/config/units';
import {
  GAME_DURATION_SECS,
  MAP_W,
  MAP_H,
  P1_TERRITORY_MAX_X,
  P2_TERRITORY_MIN_X,
  P1_STAGING_MAX_X,
  P2_STAGING_MIN_X,
  type MatchStageId,
} from '../game/config/map';
import { initAudio, playButtonSound } from '../utils/sounds';

interface Props {
  onGameEnd: (winner: 'player' | 'bot', reason: string) => void;
}

function formatTime(secs: number): string {
  const safeSecs = Math.max(0, Math.floor(secs));
  const m = Math.floor(safeSecs / 60);
  const s = safeSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatQueueTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const DEFAULT_PRODUCTION_AVAILABILITY: ProductionAvailability = {
  house: false,
  barracks: false,
  fort: false,
  workshop: false,
  pop: 0,
  popCap: 5,
};

const STAGE_META: Record<MatchStageId, { title: string; shortTitle: string; detail: string }> = {
  economy: {
    title: 'Stage 1: Economy',
    shortTitle: 'I Economy',
    detail: 'Gather wood and gold, build houses, and grow your worker base.',
  },
  prepare: {
    title: 'Stage 2: Preparation',
    shortTitle: 'II Prepare',
    detail: 'Scout the enemy, move armies to the front, and set your formation.',
  },
  war: {
    title: 'Stage 3: War',
    shortTitle: 'III War',
    detail: 'Full combat is active. Break the enemy castle before time runs out.',
  },
};

export default function IslandWars({ onGameEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);

  const [gold, setGold] = useState(30);
  const [wood, setWood] = useState(30);
  const [pop, setPop] = useState(0);
  const [popCap, setPopCap] = useState(5);
  const [timer, setTimer] = useState(GAME_DURATION_SECS);
  const [trainQueue, setTrainQueue] = useState<TrainQueueDisplayItem[]>([]);
  const [buildMode, setBuildMode] = useState<string | null>(null);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [productionAvailability, setProductionAvailability] = useState<ProductionAvailability>(DEFAULT_PRODUCTION_AVAILABILITY);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminFogOn, setAdminFogOn] = useState(true);
  const [slingerCount, setSlingerCount] = useState(0);
  const [castleHp, setCastleHp] = useState<{ p1Pct: number; p2Pct: number }>({ p1Pct: 1, p2Pct: 1 });
  const [matchStage, setMatchStage] = useState<MatchStageId>('economy');
  const [stageRemaining, setStageRemaining] = useState(600);
  const [warStarted, setWarStarted] = useState(false);
  const [activeTab, setActiveTab] = useState<'build' | 'train'>('build');
  const [selectedUnit, setSelectedUnit] = useState<SelectedUnitInfo | null>(null);

  // Scout notification toasts
  const notifIdRef = useRef(0);
  const [notifications, setNotifications] = useState<Array<{ id: number; msg: string }>>([]);

  // Minimap canvas
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const minimapTerrainLayerRef = useRef<HTMLCanvasElement | null>(null);
  const minimapTrailLayerRef = useRef<HTMLCanvasElement | null>(null);
  const minimapFogLayerRef = useRef<HTMLCanvasElement | null>(null);
  const minimapLastUnitPosRef = useRef<Map<number, { x: number; y: number; faction: 'p1' | 'p2' }>>(new Map());
  const minimapLastTerrainRef = useRef<string[][] | null>(null);
  const MM_W = 140; // canvas pixels
  const MM_H = 84;  // ~5:3 ratio, close to map aspect 160:96
  const MM_MAP_COLS = 160;
  const MM_MAP_ROWS = 96;
  const minimapTop = 8;
  const minimapRight = 4;
  const adminBtnTop = minimapTop + MM_H + 8;
  const adminPanelTop = adminBtnTop + 30;
  const adminPanelWidth: number | string = isMobile ? 'min(88vw, 260px)' : 272;
  const adminPanelMaxHeight = `calc(100vh - ${adminPanelTop + 8}px)`;

  // Keep stable ref for callbacks so the scene doesn't capture stale closures
  const sceneRef = useRef<IslandWarsScene | null>(null);

  const getScene = useCallback((): IslandWarsScene | null => {
    return sceneRef.current;
  }, []);

  const refreshProductionAvailability = useCallback(() => {
    const scene = getScene();
    if (!scene) return;
    setProductionAvailability(scene.getProductionAvailability());
  }, [getScene]);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    // Initialise audio context — must happen after user-gesture mount.
    initAudio();

    const callbacks: IslandWarsCallbacks = {
      onResourcesUpdate: (g, w) => {
        setGold(g);
        setWood(w);
      },
      onTimerUpdate: (remaining) => {
        setTimer(remaining);
      },
      onGameEnd,
      onTrainQueueUpdate: (q) => setTrainQueue([...q]),
      onScoutReport: (msg) => {
        const id = ++notifIdRef.current;
        setNotifications(n => [...n.slice(-4), { id, msg }]);
        // Auto-dismiss after 7 seconds
        setTimeout(() => setNotifications(n => n.filter(x => x.id !== id)), 7000);
      },
      onWarBegin: () => {
        setWarStarted(true);
        const id = ++notifIdRef.current;
        setNotifications(n => [...n.slice(-4), { id, msg: 'WAR HAS BEGUN — armies advance!' }]);
        setTimeout(() => setNotifications(n => n.filter(x => x.id !== id)), 6000);
      },
      onSelectedUnitUpdate: (unit) => {
        setSelectedUnit(unit);
      },
    };

    const isMobileDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#1a3a5c',
      parent: containerRef.current,
      scene: [PreloadScene, IslandWarsScene],
      audio: { noAudio: true },
      physics: { default: 'arcade', arcade: { debug: false } },
      render: {
        // Enable anti-aliasing for smooth rendering on mobile and desktop
        antialias: true,
        antialiasGL: true,
        smoothPixelArt: true,
        // Disable aggressive pixel-rounding on mobile to prevent pixelation
        roundPixels: false,
        pixelArt: false,
        powerPreference: 'high-performance',
        batchSize: isMobileDevice ? 512 : 2048,
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    game.registry.set('startScene', 'IslandWarsScene');
    game.registry.set('callbacks', callbacks);
    gameRef.current = game;

    // Grab scene reference once it's ready
    game.events.on('ready', () => {
      const scene = game.scene.getScene('IslandWarsScene') as IslandWarsScene;
      sceneRef.current = scene;
      setProductionAvailability(scene.getProductionAvailability());
    });

    // Prevent the browser context menu from appearing on right-click so
    // Phaser right-click events can be used for unit move commands.
    game.events.on('ready', () => {
      game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [onGameEnd]);

  useEffect(() => {
    const detectMobile = () => {
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      const mobile = coarsePointer || window.innerWidth <= 900;
      setIsMobile(mobile);
      isMobileRef.current = mobile;
    };
    detectMobile();
    window.addEventListener('resize', detectMobile);
    return () => window.removeEventListener('resize', detectMobile);
  }, []);

  useEffect(() => {
    refreshProductionAvailability();
    const intervalId = window.setInterval(() => {
      const scene = getScene();
      if (!scene) return;
      const avail = scene.getProductionAvailability();

      setProductionAvailability((prev) => {
        if (
          prev.house === avail.house &&
          prev.barracks === avail.barracks &&
          prev.fort === avail.fort &&
          prev.workshop === avail.workshop &&
          prev.pop === avail.pop &&
          prev.popCap === avail.popCap
        ) {
          return prev;
        }
        return avail;
      });
      setPop(avail.pop);
      setPopCap(avail.popCap);
      setSlingerCount((scene as any).getPlayerSlingerCount() ?? 0);

      const nextStage = (scene as any).getMatchStage?.() as MatchStageId | undefined;
      if (nextStage) {
        setMatchStage(prev => prev === nextStage ? prev : nextStage);
        setWarStarted(nextStage === 'war');
      }

      const remainingInStage = (scene as any).getMatchStageRemaining?.() as number | undefined;
      if (typeof remainingInStage === 'number') {
        const rounded = Math.ceil(remainingInStage);
        setStageRemaining(prev => prev === rounded ? prev : rounded);
      }

      // Castle HP polling (cheap)
      const hp = (scene as any).getCastleHp?.() as
        | { p1: { hp: number; maxHp: number } | null; p2: { hp: number; maxHp: number } | null }
        | undefined;
      if (hp) {
        const p1Pct = hp.p1 ? Math.max(0, hp.p1.hp / hp.p1.maxHp) : 0;
        const p2Pct = hp.p2 ? Math.max(0, hp.p2.hp / hp.p2.maxHp) : 0;
        setCastleHp(prev => {
          if (Math.abs(prev.p1Pct - p1Pct) < 0.005 && Math.abs(prev.p2Pct - p2Pct) < 0.005) return prev;
          return { p1Pct, p2Pct };
        });
      }

      // Draw minimap with actual terrain
      const canvas = minimapRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const mm = (scene as any).getMinimapData();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, MM_W, MM_H);
      if (!mm) return;

      const scaleX = MM_W / MAP_W;
      const scaleY = MM_H / MAP_H;
      const terrainGrid = mm.terrainGrid as string[][];
      const exploredGrid = mm.exploredGrid as Uint8Array | null;
      const visibleGrid = mm.visibleGrid as Uint8Array | null;
      const fogEnabled = mm.fogEnabled as boolean;

      // Terrain color palette matching actual game
      const terrainColors: Record<string, string> = {
        water: '#1a3d5a',
        flat: '#2d6b3e',
        beach: '#8b7d6b',
        elevated: '#4a8f4e',
        summit: '#6db06d',
        stair: '#5a8f5a',
        cave: '#3a3a3a',
        sand: '#a0956b',
        bridge: '#9e6830',
      };

      // Rebuild static terrain layer only when the map changes.
      if (!minimapTerrainLayerRef.current || minimapLastTerrainRef.current !== terrainGrid) {
        const terrainLayer = document.createElement('canvas');
        terrainLayer.width = MM_W;
        terrainLayer.height = MM_H;
        const terrainCtx = terrainLayer.getContext('2d');
        if (!terrainCtx) return;

        for (let ty = 0; ty < MM_MAP_ROWS; ty++) {
          for (let tx = 0; tx < MM_MAP_COLS; tx++) {
            const tileKind = terrainGrid[ty]?.[tx] ?? 'water';
            terrainCtx.fillStyle = terrainColors[tileKind] ?? terrainColors.water;
            terrainCtx.fillRect(tx * scaleX, ty * scaleY, scaleX, scaleY);
          }
        }

        minimapTerrainLayerRef.current = terrainLayer;
        minimapLastTerrainRef.current = terrainGrid;
        minimapTrailLayerRef.current = null;
        minimapLastUnitPosRef.current.clear();
      }

      if (minimapTerrainLayerRef.current) {
        ctx.drawImage(minimapTerrainLayerRef.current, 0, 0);
      }
      // Minimap fog overlay completely removed — show full map terrain
      // This allows players to see distances and NPC movement without obstructions

      if (!minimapTrailLayerRef.current) {
        const trailLayer = document.createElement('canvas');
        trailLayer.width = MM_W;
        trailLayer.height = MM_H;
        minimapTrailLayerRef.current = trailLayer;
      }

      const p1Units = mm.p1Units as Array<{ id: number; x: number; y: number }>;
      const p2Units = mm.p2Units as Array<{ id: number; x: number; y: number }>;
      const trailCtx = minimapTrailLayerRef.current.getContext('2d');
      if (trailCtx) {
        // Slow fade keeps recent movement readable without permanently cluttering the minimap.
        trailCtx.fillStyle = 'rgba(0, 0, 0, 0.02)';
        trailCtx.fillRect(0, 0, MM_W, MM_H);

        const aliveIds = new Set<number>();
        const previousPositions = minimapLastUnitPosRef.current;
        const drawTrailFor = (unit: { id: number; x: number; y: number }, faction: 'p1' | 'p2') => {
          aliveIds.add(unit.id);
          const prev = previousPositions.get(unit.id);
          if (prev) {
            const dx = unit.x - prev.x;
            const dy = unit.y - prev.y;
            if (dx * dx + dy * dy >= 64) {
              // Bright, thick trails for NPC visibility
              trailCtx.strokeStyle = faction === 'p2' ? 'rgba(251,146,60,0.65)' : 'rgba(103,232,249,0.55)';
              trailCtx.lineWidth = faction === 'p2' ? 2.0 : 1.8;
              trailCtx.lineCap = 'round';
              trailCtx.lineJoin = 'round';
              trailCtx.beginPath();
              trailCtx.moveTo(prev.x * scaleX, prev.y * scaleY);
              trailCtx.lineTo(unit.x * scaleX, unit.y * scaleY);
              trailCtx.stroke();
            }
          }
          previousPositions.set(unit.id, { x: unit.x, y: unit.y, faction });
        };

        for (const unit of p1Units) drawTrailFor(unit, 'p1');
        for (const unit of p2Units) drawTrailFor(unit, 'p2');

        for (const [id] of previousPositions) {
          if (!aliveIds.has(id)) previousPositions.delete(id);
        }
        ctx.drawImage(minimapTrailLayerRef.current, 0, 0);
      }

      // P1 buildings (blue)
      for (const b of mm.p1Buildings as Array<{ x: number; y: number; type: string }>) {
        const bx = Math.round(b.x * scaleX);
        const by = Math.round(b.y * scaleY);
        ctx.fillStyle = b.type === 'castle' ? '#60a5fa' : '#2563eb';
        ctx.fillRect(bx - 2, by - 2, 5, 5);
        ctx.strokeStyle = '#bfdbfe';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx - 2, by - 2, 5, 5);
      }

      // P2 buildings (red, fog-filtered)
      for (const b of mm.p2Buildings as Array<{ x: number; y: number; type: string }>) {
        const bx = Math.round(b.x * scaleX);
        const by = Math.round(b.y * scaleY);
        ctx.fillStyle = b.type === 'castle' ? '#fca5a5' : '#ef4444';
        ctx.fillRect(bx - 2, by - 2, 5, 5);
        ctx.strokeStyle = '#fecaca';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(bx - 2, by - 2, 5, 5);
      }

      // P1 units (cyan)
      ctx.fillStyle = '#67e8f9';
      for (const u of p1Units) {
        ctx.fillRect(Math.round(u.x * scaleX) - 0.5, Math.round(u.y * scaleY) - 0.5, 2, 2);
      }

      // P2 units (orange, fog-filtered)
      ctx.fillStyle = '#fb923c';
      for (const u of p2Units) {
        ctx.fillRect(Math.round(u.x * scaleX) - 0.5, Math.round(u.y * scaleY) - 0.5, 2, 2);
      }

      // Territory clamp overlays (pre-war only) for map readability.
      if (matchStage !== 'war') {
        const leftClamp = matchStage === 'economy' ? P1_TERRITORY_MAX_X : P1_STAGING_MAX_X;
        const rightClamp = matchStage === 'economy' ? P2_TERRITORY_MIN_X : P2_STAGING_MIN_X;

        ctx.fillStyle = matchStage === 'economy' ? 'rgba(127,29,29,0.18)' : 'rgba(139,90,16,0.16)';
        ctx.fillRect(leftClamp * scaleX, 0, Math.max(0, (rightClamp - leftClamp) * scaleX), MM_H);

        ctx.strokeStyle = 'rgba(240,208,96,0.82)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(leftClamp * scaleX) + 0.5, 0);
        ctx.lineTo(Math.round(leftClamp * scaleX) + 0.5, MM_H);
        ctx.moveTo(Math.round(rightClamp * scaleX) + 0.5, 0);
        ctx.lineTo(Math.round(rightClamp * scaleX) + 0.5, MM_H);
        ctx.stroke();
      }

      // Camera viewport
      const vx = Math.round(mm.camScrollX * scaleX);
      const vy = Math.round(mm.camScrollY * scaleY);
      const vw = Math.round(mm.camViewW * scaleX);
      const vh = Math.round(mm.camViewH * scaleY);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(vx + 0.5, vy + 0.5, Math.max(1, vw), Math.max(1, vh));
    }, isMobileRef.current ? 500 : 250);
    return () => window.clearInterval(intervalId);
  }, [refreshProductionAvailability, getScene, MM_W, MM_H, MM_MAP_COLS, MM_MAP_ROWS, MAP_W, MAP_H, matchStage]);

  const enqueueUnit = (type: string) => {
    const scene = getScene();
    if (scene) {
      playButtonSound();
      (scene as any).enqueueUnit(type);
    }
  };

  const cancelQueuedUnit = (index: number) => {
    const scene = getScene();
    if (scene) (scene as any).cancelQueuedUnit(index);
  };

  const setGameDifficulty = (d: Difficulty) => {
    setDifficulty(d);
    const scene = getScene();
    if (scene) scene.setDifficulty(d);
  };

  const enterBuildMode = (type: string) => {
    const scene = getScene();
    if (!scene) return;
    playButtonSound();
    if (buildMode === type) {
      (scene as any).cancelBuildMode();
      setBuildMode(null);
    } else {
      (scene as any).enterBuildMode(type);
      setBuildMode(type);
    }
  };

  const timerColor = timer < 60 ? '#ffaa00' : '#ffe066';
  const stageMeta = STAGE_META[matchStage];

  // Get phase/stage info for display
  const getPhaseInfo = () => {
    const stagePhases: Record<MatchStageId, { phase: string; color: string; income: number; damage: number; castleDamage: number; combat: boolean }> = {
      economy: { phase: '🛡️ DEPLOYMENT', color: '#3b82f6', income: 0.75, damage: 0, castleDamage: 0, combat: false },
      prepare: { phase: '⚔️ EARLY GAME', color: '#eab308', income: 1.0, damage: 0.9, castleDamage: 0.5, combat: true },
      war: { phase: '💥 LATE GAME', color: '#ef4444', income: 2.0, damage: 1.3, castleDamage: 1.5, combat: true },
    };
    return stagePhases[matchStage] || stagePhases.economy;
  };
  const phaseInfo = getPhaseInfo();

  // â”€â”€ Admin helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const adminCmd = (fn: (s: any) => void) => { const s = getScene(); if (s) fn(s); };
  const adminZoom = (z: number) => adminCmd(s => s.adminSetZoom(z));
  const adminGold = (n: number) => adminCmd(s => s.adminAddResources(n, 0));
  const adminWood = (n: number) => adminCmd(s => s.adminAddResources(0, n));
  const adminUnit = (type: string, faction: string) => adminCmd(s => s.adminSpawnUnit(type, faction));
  const adminBld  = (type: string, faction: string) => adminCmd(s => s.adminPlaceBuilding(type, faction));
  const adminGoto = (faction: string) => adminCmd(s => s.adminTeleportCamera(faction));
  const adminToggleFog = () => adminCmd(s => {
    s.adminToggleFog();
    setAdminFogOn(s.adminIsFogEnabled());
  });

  // ── Unit Upgrade helpers ───────────────────────────────────────────────────
  const upgradeSelectedUnit = (stat: 'hp' | 'damage') => {
    const scene = getScene();
    if (scene) scene.upgradeUnit(stat);
  };

  const abtn: React.CSSProperties = {
    background: '#1f2937',
    border: '1px solid #374151',
    color: '#d1d5db',
    borderRadius: 4,
    padding: isMobile ? '1px 4px' : '1px 5px',
    minHeight: isMobile ? 20 : 22,
    minWidth: isMobile ? 34 : 38,
    margin: '0 1px 1px 0',
    cursor: 'pointer',
    fontSize: isMobile ? 9 : 10,
    lineHeight: 1,
  };

  const productionLocked = false;
  const canBuildBarracks = wood >= 60;
  const canBuildTower = wood >= 90;
  const canBuildHouse = wood >= 60;
  const canBuildFort = wood >= 140;
  const canBuildWorkshop = wood >= 80;
  const canTrainWarrior = gold >= 35;
  const canTrainArcher = gold >= 55;
  const canTrainMonk = gold >= 70;
  const canTrainPawn = gold >= 12;
  const canTrainSlinger = gold >= 95;
  const queueFull = trainQueue.length >= TRAIN_QUEUE_MAX;
  const popFull = pop >= popCap;
  const hasHouse = productionAvailability.house;
  const hasBarracks = productionAvailability.barracks;
  const hasFort = productionAvailability.fort;
  const hasWorkshop = productionAvailability.workshop;

  const canProduceWarrior = hasBarracks;
  const canProduceSlinger = hasBarracks;
  const canProduceArcher = hasFort;
  const canProduceMonk = hasWorkshop;
  const canProducePawn = hasHouse;

  const getQueuedCount = (type: string) => trainQueue.filter((item) => item.type === type).length;
  const getActiveQueueItem = (type: string) => trainQueue.find((item) => item.type === type && item.active);

  return (
    <div className="tk-game-wrapper">
      <div ref={containerRef} className="tk-canvas-container" />

      {/* â”€â”€ TOP BAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <header className="tkr-topbar">
        <div className="tkr-res-stack">
          <div className="tkr-res-group tkr-res-group-main">
            <div className="tkr-chip">
              <span className="tkr-chip-icon tk-resource-icon-gold" aria-hidden="true" />
              <span className="tkr-chip-val">{gold}</span>
            </div>
            <div className="tkr-chip">
              <span className="tkr-chip-icon tk-resource-icon-wood" aria-hidden="true" />
              <span className="tkr-chip-val">{wood}</span>
            </div>
            <div className={`tkr-chip${popFull ? ' tkr-chip-full' : ''}`} title={`Population ${pop}/${popCap} — build Houses for +4 cap`}>
              <span className="tkr-chip-icon-pop" aria-hidden="true">·</span>
              <span className="tkr-chip-val">{pop}<span className="tkr-chip-sep">/</span>{popCap}</span>
            </div>
            <div className="tkr-chip tkr-chip-stage" title={stageMeta.detail}>
              <span className="tkr-chip-label">Stage</span>
              <span className="tkr-chip-val-left">{stageMeta.shortTitle} {formatTime(stageRemaining)}</span>
            </div>
          </div>

          <div className="tkr-res-group tkr-res-group-sub">
            <div className="tkr-chip tkr-chip-phase">
              <span className="tkr-chip-label">Phase</span>
              <span className="tkr-chip-val-left">{phaseInfo.phase}</span>
            </div>
          </div>

          <div className="tkr-res-group tkr-res-group-rules">
            <div className="tkr-chip tkr-chip-mini" title="Income multiplier in this phase">
              <span className="tkr-chip-label">Income</span>
              <span className="tkr-chip-val-left">{phaseInfo.income}x</span>
            </div>
            <div className="tkr-chip tkr-chip-mini" title="Unit damage multiplier in this phase">
              <span className="tkr-chip-label">Unit</span>
              <span className="tkr-chip-val-left">{phaseInfo.damage > 0 ? `${phaseInfo.damage}x` : 'OFF'}</span>
            </div>
            <div className="tkr-chip tkr-chip-mini" title="Castle damage multiplier in this phase">
              <span className="tkr-chip-label">Castle</span>
              <span className="tkr-chip-val-left">{phaseInfo.castleDamage > 0 ? `${phaseInfo.castleDamage}x` : 'OFF'}</span>
            </div>
            <div className="tkr-chip tkr-chip-mini" title="Whether direct combat is currently enabled">
              <span className="tkr-chip-label">Combat</span>
              <span className="tkr-chip-val-left">{phaseInfo.combat ? 'ON' : 'OFF'}</span>
            </div>
          </div>
        </div>

        <div className="tkr-center">
          <div className="tkr-timer" style={{ color: timerColor }}>{formatTime(timer)}</div>
          <div className="tkr-castles">
            <span className="tkr-castle-label">P1</span>
            <div className="tkr-castle-bar" title={`Your castle: ${Math.round(castleHp.p1Pct * 100)}%`}>
              <div className="tkr-castle-fill tkr-castle-fill-p1" style={{ width: `${Math.round(castleHp.p1Pct * 100)}%` }} />
            </div>
            <span className="tkr-castle-vs">vs</span>
            <div className="tkr-castle-bar" title={`Enemy castle: ${Math.round(castleHp.p2Pct * 100)}%`}>
              <div className="tkr-castle-fill tkr-castle-fill-p2" style={{ width: `${Math.round(castleHp.p2Pct * 100)}%` }} />
            </div>
            <span className="tkr-castle-label">P2</span>
          </div>
        </div>

      </header>

      {/* NOTIFICATIONS */}
      {notifications.length > 0 && (
        <div className="tkr-notifications">
          {notifications.map(n => (
            <div key={n.id} className="tkr-notif">
              <span className="tkr-notif-icon">!</span>
              {n.msg}
            </div>
          ))}
        </div>
      )}

      {/* MINIMAP (top-right) */}
      <div style={{ position: 'fixed', top: minimapTop, right: minimapRight, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, pointerEvents: 'none' }}>
        <canvas
          ref={minimapRef}
          width={MM_W}
          height={MM_H}
          style={{ display: 'block', border: '1px solid rgba(56,130,190,0.6)', borderTop: '2px solid rgba(80,170,240,0.8)', borderRadius: 5, background: '#06101a', boxShadow: '0 4px 14px rgba(0,0,0,0.85)' }}
          title="Minimap — terrain, units, buildings, camera view"
        />
      </div>

      {/* â”€â”€ ADMIN button â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div style={{ position: 'fixed', top: adminBtnTop, right: minimapRight, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 4 }}>
        <button
          onClick={() => setAdminOpen(v => !v)}
          style={{ background: adminOpen ? '#7c3aed' : '#1f2937', color: '#c4b5fd', border: '1px solid #4b5563', borderRadius: 5, padding: isMobile ? '1px 5px' : '1px 7px', minHeight: isMobile ? 24 : 26, minWidth: isMobile ? 38 : 44, fontSize: isMobile ? 9 : 10, lineHeight: 1, cursor: 'pointer', opacity: 0.9 }}
          title="Toggle admin / debug panel"
        >Cfg</button>
      </div>

      {/* â”€â”€ ADMIN PANEL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {adminOpen && (
        <div style={{ position: 'fixed', top: adminPanelTop, right: minimapRight, zIndex: 9998, background: 'rgba(15,20,30,0.97)', border: '1px solid #374151', borderRadius: 8, padding: isMobile ? '6px 7px' : '7px 8px', color: '#e5e7eb', fontSize: isMobile ? 9 : 10, width: adminPanelWidth, maxHeight: adminPanelMaxHeight, overflowY: 'auto', overscrollBehavior: 'contain', boxShadow: '0 6px 24px #000c' }}>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>Zoom:</span>
            {[0.05, 0.10, 0.15, 0.25, 0.38, 0.55, 1.0].map(z => (
              <button key={z} onClick={() => adminZoom(z)} style={abtn}>{Math.round(z * 100)}%</button>
            ))}
            <button onClick={() => adminGoto('blue')} style={{ ...abtn, color: '#93c5fd' }}>P1</button>
            <button onClick={() => adminGoto('red')}  style={{ ...abtn, color: '#fca5a5' }}>P2</button>
          </div>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>View:</span>
            <button onClick={adminToggleFog} style={{ ...abtn, color: adminFogOn ? '#d1d5db' : '#34d399', border: adminFogOn ? '1px solid #374151' : '1px solid #34d399' }}>
              {adminFogOn ? 'Fog ON' : 'Fog OFF'}
            </button>
          </div>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>AI:</span>
            {(['easy', 'normal', 'hard'] as const).map((d) => (
              <button key={d} onClick={() => setGameDifficulty(d)} style={{ ...abtn, color: difficulty === d ? '#fde68a' : '#d1d5db', border: difficulty === d ? '1px solid #fde68a' : '1px solid #374151' }}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>Res:</span>
            <button onClick={() => adminGold(500)}  style={abtn}>+500g</button>
            <button onClick={() => adminWood(500)}  style={abtn}>+500w</button>
            <button onClick={() => { adminGold(9999); adminWood(9999); }} style={{ ...abtn, color: '#fde68a' }}>Max</button>
          </div>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#93c5fd', marginRight: 4 }}>+Unit P1:</span>
            {(['warrior','archer','monk','pawn','slinger'] as const).map(t => (
              <button key={t} onClick={() => adminUnit(t, 'blue')} style={abtn}>{t[0].toUpperCase() + t.slice(1,5)}</button>
            ))}
          </div>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#fca5a5', marginRight: 4 }}>+Unit P2:</span>
            {(['warrior','archer','monk','pawn','slinger'] as const).map(t => (
              <button key={t} onClick={() => adminUnit(t, 'red')} style={{ ...abtn, color: '#fca5a5' }}>{t[0].toUpperCase() + t.slice(1,5)}</button>
            ))}
          </div>
          <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#93c5fd', marginRight: 4 }}>+Bld P1:</span>
            {(['castle','barracks','house','fort','workshop','tower'] as const).map(b => (
              <button key={b} onClick={() => adminBld(b, 'blue')} style={abtn}>{b[0].toUpperCase() + b.slice(1,3)}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: '#fca5a5', marginRight: 4 }}>+Bld P2:</span>
            {(['castle','barracks','house','fort','workshop','tower'] as const).map(b => (
              <button key={b} onClick={() => adminBld(b, 'red')} style={{ ...abtn, color: '#fca5a5' }}>{b[0].toUpperCase() + b.slice(1,3)}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── SELECTED UNIT PANEL ──────────────────────────────────────────────────── */}
      {selectedUnit && (
        <div style={{ position: 'fixed', bottom: 10, left: 10, zIndex: 9900, background: 'linear-gradient(180deg, rgba(24,17,10,0.98) 0%, rgba(14,10,6,0.97) 100%)', border: '1px solid rgba(170,125,20,0.72)', borderRadius: 7, padding: '8px 9px', color: '#f0e0b0', fontSize: 10, width: 'min(168px, calc(100vw - 24px))', boxShadow: '0 5px 18px rgba(0,0,0,0.78), inset 0 1px 0 rgba(200,155,20,0.10)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ color: '#f0d060', fontWeight: 'bold', letterSpacing: 0.2 }}>{selectedUnit.type.toUpperCase()}</span>
            <span style={{ fontSize: 8, color: '#a09070' }}>Lvl {selectedUnit.level}</span>
          </div>
          <div style={{ marginBottom: 5, paddingBottom: 5, borderBottom: '1px solid rgba(120,90,15,0.45)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, marginBottom: 2 }}>
              <span style={{ color: '#d8b860' }}>HP:</span>
              <span>{Math.round(selectedUnit.hp)}/{Math.round(selectedUnit.maxHp)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9 }}>
              <span style={{ color: '#d8b860' }}>State:</span>
              <span style={{ textTransform: 'capitalize' }}>{selectedUnit.state}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
            <button onClick={() => upgradeSelectedUnit('hp')} style={{ background: 'rgba(26,19,10,0.95)', border: '1px solid rgba(24,173,120,0.78)', color: '#66e2bf', borderRadius: 3, padding: '3px 4px', fontSize: 9, cursor: 'pointer', fontWeight: 'bold' }}>
              ↑ HP (50g)
            </button>
            <button onClick={() => upgradeSelectedUnit('damage')} style={{ background: 'rgba(26,19,10,0.95)', border: '1px solid rgba(220,120,40,0.82)', color: '#f3ba82', borderRadius: 3, padding: '3px 4px', fontSize: 9, cursor: 'pointer', fontWeight: 'bold' }}>
              ↑ DMG (50g)
            </button>
            <button onClick={() => {
              const scene = getScene();
              if (scene) scene.clearSelection();
            }} style={{ background: 'rgba(26,19,10,0.95)', border: '1px solid rgba(140,105,15,0.60)', color: '#c8b080', borderRadius: 3, padding: '3px 4px', fontSize: 9, cursor: 'pointer', gridColumn: '1 / -1' }}>
              Deselect
            </button>
          </div>
          <div style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid rgba(120,90,15,0.45)', fontSize: 8, color: '#9a8a68', lineHeight: 1.2 }}>
            💡 {isMobile ? 'Tap map to move' : 'Right-click map to move'}
          </div>
        </div>
      )}

      {!hudCollapsed && (
        <div className="tkr-dock">
          {/* Tab switcher */}
          <div className="tkr-tabs">
            <button
              className={`tkr-tab${activeTab === 'build' ? ' tkr-tab-active' : ''}`}
              onClick={() => setActiveTab('build')}
            >Build</button>
            <button
              className="tkr-hud-toggle tkr-tab-toggle"
              onClick={() => setHudCollapsed(true)}
              title="Hide HUD"
            >
              ▼
            </button>
            <button
              className={`tkr-tab${activeTab === 'train' ? ' tkr-tab-active' : ''}`}
              onClick={() => setActiveTab('train')}
            >Train</button>
          </div>

          {/* â”€â”€ Build tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeTab === 'build' && (
            <div className="tkr-panel-content">
              <div className="tkr-btn-scroll">
                <button className={`tkr-btn${buildMode === 'barracks' ? ' tkr-btn-active' : ''}`} onClick={() => enterBuildMode('barracks')} disabled={productionLocked || !canBuildBarracks} title="Barracks — 60 wood · trains warriors and scouts">
                  <span className="tkr-btn-icon tk-btn-icon-barracks" aria-hidden="true" />
                  <span className="tkr-btn-label">Barracks</span>
                  <span className="tkr-btn-cost">60w</span>
                </button>
                <button className={`tkr-btn${buildMode === 'house' ? ' tkr-btn-active' : ''}`} onClick={() => enterBuildMode('house')} disabled={productionLocked || !canBuildHouse} title="House - 60 wood - +4 pop cap - small tax income">
                  <span className="tkr-btn-icon tk-btn-icon-house" aria-hidden="true" />
                  <span className="tkr-btn-label">House</span>
                  <span className="tkr-btn-cost">60w</span>
                </button>
                <button className={`tkr-btn${buildMode === 'tower' ? ' tkr-btn-active' : ''}`} onClick={() => enterBuildMode('tower')} disabled={productionLocked || !canBuildTower} title="Tower — 90 wood · auto-attacks enemies">
                  <span className="tkr-btn-icon tk-btn-icon-tower" aria-hidden="true" />
                  <span className="tkr-btn-label">Tower</span>
                  <span className="tkr-btn-cost">90w</span>
                </button>
                <button className={`tkr-btn${buildMode === 'fort' ? ' tkr-btn-active' : ''}`} onClick={() => enterBuildMode('fort')} disabled={productionLocked || !canBuildFort} title="Archery Range — 140 wood · trains archers">
                  <span className="tkr-btn-icon tk-btn-icon-tower" aria-hidden="true" />
                  <span className="tkr-btn-label">Archery</span>
                  <span className="tkr-btn-cost">140w</span>
                </button>
                <button className={`tkr-btn${buildMode === 'workshop' ? ' tkr-btn-active' : ''}`} onClick={() => enterBuildMode('workshop')} disabled={productionLocked || !canBuildWorkshop} title="Church - 80 wood - trains monks - small lumber income">
                  <span className="tkr-btn-icon tk-btn-icon-house" aria-hidden="true" />
                  <span className="tkr-btn-label">Church</span>
                  <span className="tkr-btn-cost">80w</span>
                </button>
              </div>
              <div className="tkr-hint">
                {productionLocked
                  ? 'Battle started: building is locked'
                  : buildMode
                    ? (isMobile ? 'Tap the map to place · ' : 'Click map to place · Esc to cancel')
                    : (isMobile ? 'Tap a building then tap the map to place' : 'Select a building then click the map to place')}
              </div>
              {buildMode && !productionLocked && (
                <div className="tkr-build-legend" aria-label="Build placement legend">
                  <span className="tkr-build-legend-item" title="Empty tile: valid build space.">
                    <span className="tkr-build-legend-swatch tkr-build-legend-ok" aria-hidden="true" />
                    Empty
                  </span>
                  <span className="tkr-build-legend-item" title="Tree tile: blocked until the tree is harvested.">
                    <span className="tkr-build-legend-swatch tkr-build-legend-tree" aria-hidden="true" />
                    Tree
                  </span>
                  <span className="tkr-build-legend-item" title="Resource tile (like a mine): cannot build here.">
                    <span className="tkr-build-legend-swatch tkr-build-legend-resource" aria-hidden="true" />
                    Resource
                  </span>
                  <span className="tkr-build-legend-item" title="Blocked by terrain, building footprint, or map limits.">
                    <span className="tkr-build-legend-swatch tkr-build-legend-blocked" aria-hidden="true" />
                    Blocked
                  </span>
                </div>
              )}
              {buildMode && !productionLocked && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 4 }}>
                  <button className="tkr-cancel-btn" onClick={() => enterBuildMode(buildMode!)}>x Cancel</button>
                </div>
              )}
            </div>
          )}

          {/* â”€â”€ Train tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          {activeTab === 'train' && (
            <div className="tkr-panel-content">
              <div className="tkr-btn-scroll">
                <button className="tkr-btn" onClick={() => enqueueUnit('warrior')} disabled={productionLocked || !canProduceWarrior || !canTrainWarrior || queueFull || popFull} title={!canProduceWarrior ? 'Requires Barracks' : 'Warrior — 35 gold'}>
                  {getQueuedCount('warrior') > 0 && <span className="tkr-btn-badge">Q{getQueuedCount('warrior')}</span>}
                  {getActiveQueueItem('warrior') && <span className="tkr-btn-timer">{formatQueueTime(getActiveQueueItem('warrior')!.remainingMs)}</span>}
                  <span className="tkr-btn-icon tk-btn-icon-warrior" aria-hidden="true" />
                  <span className="tkr-btn-label">Warrior</span>
                  <span className="tkr-btn-cost">35g</span>
                </button>
                <button className="tkr-btn" onClick={() => enqueueUnit('archer')} disabled={productionLocked || !canProduceArcher || !canTrainArcher || queueFull || popFull} title={!canProduceArcher ? 'Requires Archery Range' : 'Archer — 55 gold'}>
                  {getQueuedCount('archer') > 0 && <span className="tkr-btn-badge">Q{getQueuedCount('archer')}</span>}
                  {getActiveQueueItem('archer') && <span className="tkr-btn-timer">{formatQueueTime(getActiveQueueItem('archer')!.remainingMs)}</span>}
                  <span className="tkr-btn-icon tk-btn-icon-archer" aria-hidden="true" />
                  <span className="tkr-btn-label">Archer</span>
                  <span className="tkr-btn-cost">55g</span>
                </button>
                <button className="tkr-btn" onClick={() => enqueueUnit('monk')} disabled={productionLocked || !canProduceMonk || !canTrainMonk || queueFull || popFull} title={!canProduceMonk ? 'Requires Church' : 'Monk — 70 gold'}>
                  {getQueuedCount('monk') > 0 && <span className="tkr-btn-badge">Q{getQueuedCount('monk')}</span>}
                  {getActiveQueueItem('monk') && <span className="tkr-btn-timer">{formatQueueTime(getActiveQueueItem('monk')!.remainingMs)}</span>}
                  <span className="tkr-btn-icon tk-btn-icon-monk" aria-hidden="true" />
                  <span className="tkr-btn-label">Monk</span>
                  <span className="tkr-btn-cost">70g</span>
                </button>
                <button className="tkr-btn" onClick={() => enqueueUnit('pawn')} disabled={productionLocked || !canProducePawn || !canTrainPawn || queueFull || popFull} title={!canProducePawn ? 'Requires House' : 'Pawn — 12 gold · gathers resources'}>
                  {getQueuedCount('pawn') > 0 && <span className="tkr-btn-badge">Q{getQueuedCount('pawn')}</span>}
                  {getActiveQueueItem('pawn') && <span className="tkr-btn-timer">{formatQueueTime(getActiveQueueItem('pawn')!.remainingMs)}</span>}
                  <span className="tkr-btn-icon tk-btn-icon-pawn" aria-hidden="true" />
                  <span className="tkr-btn-label">Pawn</span>
                  <span className="tkr-btn-cost">12g</span>
                </button>
                <button className="tkr-btn" onClick={() => enqueueUnit('slinger')} disabled={productionLocked || !canProduceSlinger || !canTrainSlinger || queueFull || popFull || slingerCount >= 3} title={!canProduceSlinger ? 'Requires Barracks' : slingerCount >= 3 ? 'Scout limit (3/3)' : 'Scout — 95 gold · auto-explores · max 3'}>
                  {slingerCount > 0 && <span className="tkr-btn-badge">{slingerCount}/3</span>}
                  {getActiveQueueItem('slinger') && <span className="tkr-btn-timer">{formatQueueTime(getActiveQueueItem('slinger')!.remainingMs)}</span>}
                  <span className="tkr-btn-icon tk-btn-icon-pawn" aria-hidden="true" style={{ filter: 'hue-rotate(270deg) brightness(1.2)' }} />
                  <span className="tkr-btn-label">Scout</span>
                  <span className="tkr-btn-cost">95g</span>
                </button>
              </div>
              <div className="tkr-hint">
                {productionLocked ? 'Battle started: training locked' :
                 queueFull ? 'Queue full — wait for a unit to finish' :
                 popFull ? 'Pop cap reached — build Houses for more' :
                 (!hasBarracks && !hasFort && !hasWorkshop && !hasHouse) ? 'Build a Barracks or House to unlock units' :
                 'Tap a unit to queue it · units train one by one'}
              </div>
            </div>
          )}
        </div>
      )}

      {hudCollapsed && (
        <button
          className="tkr-hud-toggle tkr-hud-toggle-collapsed"
          onClick={() => setHudCollapsed(false)}
          title="Show HUD"
        >
          ▲
        </button>
      )}

    </div>
  );
}
