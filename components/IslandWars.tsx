import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Phaser from 'phaser';
import { PreloadScene } from '../game/scenes/PreloadScene';
import { IslandWarsScene } from '../game/scenes/IslandWarsScene';
import type { IslandWarsCallbacks, TrainQueueDisplayItem } from '../game/scenes/IslandWarsScene';
import type { ProductionAvailability } from '../game/scenes/IslandWarsScene';
import type { Difficulty } from '../game/systems/AISystem';
import { TRAIN_QUEUE_MAX } from '../game/config/units';
import { GAME_DURATION_SECS, MAP_W, MAP_H } from '../game/config/map';

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

export default function IslandWars({ onGameEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const isMobileRef = useRef(false);

  const [gold, setGold] = useState(50);
  const [wood, setWood] = useState(50);
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

  // Scout notification toasts
  const notifIdRef = useRef(0);
  const [notifications, setNotifications] = useState<Array<{ id: number; msg: string }>>([]);

  // Minimap canvas
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const minimapTerrainLayerRef = useRef<HTMLCanvasElement | null>(null);
  const minimapFogLayerRef = useRef<HTMLCanvasElement | null>(null);
  const minimapTrailLayerRef = useRef<HTMLCanvasElement | null>(null);
  const minimapLastUnitPosRef = useRef<Map<number, { x: number; y: number; faction: 'p1' | 'p2' }>>(new Map());
  const minimapLastExploredRef = useRef<Uint8Array | null>(null);
  const minimapLastTerrainRef = useRef<string[][] | null>(null);
  const minimapLastFogEnabledRef = useRef<boolean | null>(null);
  const MM_W = 200; // canvas pixels
  const MM_H = 120;  // ~5:3 ratio, close to map aspect 160:96
  const MM_MAP_COLS = 160;
  const MM_MAP_ROWS = 96;
  const minimapTop = 8;
  const minimapRight = 10;
  const adminBtnTop = minimapTop + MM_H + 24;
  const adminPanelTop = adminBtnTop + 30;

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
        antialias: !isMobileDevice,
        roundPixels: isMobileDevice,
        pixelArt: isMobileDevice,
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

      // Rebuild fog layer only when needed; then update incrementally as exploration expands.
      const fogLayerNeedsReset =
        !minimapFogLayerRef.current ||
        minimapLastFogEnabledRef.current !== fogEnabled ||
        minimapLastTerrainRef.current !== terrainGrid;

      if (fogLayerNeedsReset) {
        const fogLayer = document.createElement('canvas');
        fogLayer.width = MM_W;
        fogLayer.height = MM_H;
        const fogCtx = fogLayer.getContext('2d');
        if (!fogCtx) return;

        fogCtx.clearRect(0, 0, MM_W, MM_H);
        if (fogEnabled && exploredGrid) {
          fogCtx.fillStyle = '#0a1420';
          for (let ty = 0; ty < MM_MAP_ROWS; ty++) {
            for (let tx = 0; tx < MM_MAP_COLS; tx++) {
              if (exploredGrid[ty * MM_MAP_COLS + tx] === 0) {
                fogCtx.fillRect(tx * scaleX, ty * scaleY, scaleX, scaleY);
              }
            }
          }
          minimapLastExploredRef.current = new Uint8Array(exploredGrid);
        } else {
          minimapLastExploredRef.current = exploredGrid ? new Uint8Array(exploredGrid) : null;
        }

        minimapFogLayerRef.current = fogLayer;
        minimapLastFogEnabledRef.current = fogEnabled;
      } else if (fogEnabled && exploredGrid && minimapFogLayerRef.current) {
        const lastExplored = minimapLastExploredRef.current;
        const fogCtx = minimapFogLayerRef.current.getContext('2d');
        if (lastExplored && fogCtx) {
          // Clear fog only for newly explored tiles.
          for (let i = 0; i < exploredGrid.length; i++) {
            if (lastExplored[i] === 0 && exploredGrid[i] === 1) {
              const tx = i % MM_MAP_COLS;
              const ty = Math.floor(i / MM_MAP_COLS);
              fogCtx.clearRect(tx * scaleX, ty * scaleY, scaleX, scaleY);
            }
          }
          minimapLastExploredRef.current = new Uint8Array(exploredGrid);
        }
      }

      if (minimapTerrainLayerRef.current) {
        ctx.drawImage(minimapTerrainLayerRef.current, 0, 0);
      }
      if (fogEnabled && minimapFogLayerRef.current) {
        ctx.drawImage(minimapFogLayerRef.current, 0, 0);
      }

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
        trailCtx.fillStyle = 'rgba(0, 0, 0, 0.03)';
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
              trailCtx.strokeStyle = faction === 'p2' ? 'rgba(251,146,60,0.38)' : 'rgba(103,232,249,0.22)';
              trailCtx.lineWidth = faction === 'p2' ? 1.4 : 1.1;
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
  }, [refreshProductionAvailability, getScene, MM_W, MM_H, MM_MAP_COLS, MM_MAP_ROWS, MAP_W, MAP_H]);

  const enqueueUnit = (type: string) => {
    const scene = getScene();
    if (scene) (scene as any).enqueueUnit(type);
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

    if (buildMode === type) {
      (scene as any).cancelBuildMode();
      setBuildMode(null);
    } else {
      (scene as any).enterBuildMode(type);
      setBuildMode(type);
    }
  };

  const timerColor = timer < 60 ? '#ffaa00' : '#ffe066';

  // ── Admin helpers ──────────────────────────────────────────────────────
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

  const abtn: React.CSSProperties = { background: '#1f2937', border: '1px solid #374151', color: '#d1d5db', borderRadius: 3, padding: '1px 6px', margin: '0 1px', cursor: 'pointer', fontSize: 11 };

  const productionLocked = false;
  const canBuildBarracks = wood >= 50;
  const canBuildTower = wood >= 75;
  const canBuildHouse = wood >= 40;
  const canBuildFort = wood >= 120;
  const canBuildWorkshop = wood >= 65;
  const canTrainWarrior = gold >= 25;
  const canTrainArcher = gold >= 40;
  const canTrainMonk = gold >= 55;
  const canTrainPawn = gold >= 8;
  const canTrainPawnIron = gold >= 22;
  const canTrainPawnGold = gold >= 38;
  const canTrainKnight = gold >= 48;
  const canTrainSlinger = gold >= 75;
  const queueFull = trainQueue.length >= TRAIN_QUEUE_MAX;
  const popFull = pop >= popCap;
  const hasHouse = productionAvailability.house;
  const hasBarracks = productionAvailability.barracks;
  const hasFort = productionAvailability.fort;
  const hasWorkshop = productionAvailability.workshop;

  const canProduceWarrior = hasBarracks;
  const canProduceKnight = hasBarracks;
  const canProduceSlinger = hasBarracks;
  const canProduceArcher = hasFort;
  const canProduceMonk = hasWorkshop;
  const canProducePawn = hasHouse;
  const canProducePawnIron = hasBarracks;
  const canProducePawnGold = hasBarracks;

  const getQueuedCount = (type: string) => trainQueue.filter((item) => item.type === type).length;
  const getActiveQueueItem = (type: string) => trainQueue.find((item) => item.type === type && item.active);

  return (
    <div className="tk-game-wrapper">
      <div ref={containerRef} className="tk-canvas-container" />

      {/* Top HUD */}
      <div className="tk-hud tk-hud-top">
        <div className="tk-hud-cluster tk-hud-cluster-left">
          <div className="tk-resource-bar">
            <span className="tk-resource-icon tk-resource-icon-gold" aria-hidden="true" />
            <span className="tk-resource-value">{gold}</span>
          </div>
          <div className="tk-resource-bar">
            <span className="tk-resource-icon tk-resource-icon-wood" aria-hidden="true" />
            <span className="tk-resource-value">{wood}</span>
          </div>
          <div className={`tk-resource-bar tk-pop-bar${popFull ? ' tk-pop-full' : ''}`} title="Population: units / cap. Build Houses to raise your cap (+4 each).">
            <span className="tk-resource-icon tk-resource-icon-pop" aria-hidden="true" />
            <span className="tk-resource-value">{pop}<span className="tk-pop-sep">/</span>{popCap}</span>
          </div>
        </div>

        <div className="tk-timer-block">
          <div className="tk-timer" style={{ color: timerColor }}>
            {formatTime(timer)}
          </div>
        </div>

        <div className="tk-hud-cluster tk-hud-cluster-right">
          <div className="tk-game-title">Tiny Kingdoms</div>
          {isMobile && <div className="tk-zoom-hint">Drag to move · Pinch to zoom · Double-tap to reset</div>}
        </div>
      </div>


      {/* Scout report notifications */}
      {notifications.length > 0 && (
        <div style={{ position: 'fixed', top: 56, left: '50%', transform: 'translateX(-50%)', zIndex: 9990, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
          {notifications.map(n => (
            <div key={n.id} style={{ background: 'rgba(10,20,40,0.92)', border: '1px solid #60a5fa', borderRadius: 8, padding: '6px 16px', color: '#bfdbfe', fontSize: 13, fontWeight: 600, boxShadow: '0 3px 14px #0008', display: 'flex', alignItems: 'center', gap: 8, letterSpacing: 0.3 }}>
              <span style={{ fontSize: 16 }}>🔭</span>
              {n.msg}
            </div>
          ))}
        </div>
      )}

      {/* Admin button — top-right corner */}
      <button
        onClick={() => setAdminOpen(v => !v)}
        style={{ position: 'fixed', top: adminBtnTop, right: minimapRight, zIndex: 9999, background: adminOpen ? '#7c3aed' : '#1f2937', color: '#c4b5fd', border: '1px solid #4b5563', borderRadius: 5, padding: '2px 9px', fontSize: 11, cursor: 'pointer', opacity: 0.9 }}
        title="Toggle admin / debug panel"
      >
        🔧
      </button>

      {/* Minimap — top-right corner */}
      <div style={{ position: 'fixed', top: minimapTop, right: minimapRight, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, pointerEvents: 'none' }}>
        <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7dd3fc', textShadow: '0 0 8px rgba(100,180,255,0.6)', marginBottom: 2 }}>Map</div>
        <canvas
          ref={minimapRef}
          width={MM_W}
          height={MM_H}
          style={{ display: 'block', border: '2px solid rgba(56,152,220,0.75)', borderRadius: 4, background: '#08131f', boxShadow: '0 0 10px rgba(0,0,0,0.75)' }}
          title="Minimap — Shows actual terrain, buildings, units, and camera view (white box)"
        />
      </div>

      {/* Admin panel */}
      {adminOpen && (
        <div style={{ position: 'fixed', top: adminPanelTop, right: minimapRight, zIndex: 9998, background: 'rgba(15,20,30,0.97)', border: '1px solid #374151', borderRadius: 8, padding: '8px 10px', color: '#e5e7eb', fontSize: 11, width: 310, boxShadow: '0 6px 24px #000c' }}>

          {/* Camera */}
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>Zoom:</span>
            {[0.05, 0.10, 0.15, 0.25, 0.38, 0.55, 1.0].map(z => (
              <button key={z} onClick={() => adminZoom(z)} style={abtn}>{Math.round(z * 100)}%</button>
            ))}
            <button onClick={() => adminGoto('blue')} style={{ ...abtn, color: '#93c5fd' }}>P1</button>
            <button onClick={() => adminGoto('red')}  style={{ ...abtn, color: '#fca5a5' }}>P2</button>
          </div>

          {/* View */}
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>View:</span>
            <button onClick={adminToggleFog} style={{ ...abtn, color: adminFogOn ? '#d1d5db' : '#34d399', border: adminFogOn ? '1px solid #374151' : '1px solid #34d399' }}>
              {adminFogOn ? '🌫 Fog ON' : '👁 Fog OFF'}
            </button>
          </div>

          {/* Difficulty */}
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>AI:</span>
            {(['easy', 'normal', 'hard'] as const).map((d) => (
              <button key={d} onClick={() => setGameDifficulty(d)} style={{ ...abtn, color: difficulty === d ? '#fde68a' : '#d1d5db', border: difficulty === d ? '1px solid #fde68a' : '1px solid #374151' }}>
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>

          {/* Resources */}
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#6b7280', marginRight: 4 }}>Res:</span>
            <button onClick={() => adminGold(500)}  style={abtn}>+500g</button>
            <button onClick={() => adminWood(500)}  style={abtn}>+500w</button>
            <button onClick={() => { adminGold(9999); adminWood(9999); }} style={{ ...abtn, color: '#fde68a' }}>Max</button>
          </div>

          {/* Spawn units */}
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#93c5fd', marginRight: 4 }}>+Unit P1:</span>
            {(['warrior','archer','knight','monk','pawn','pawn_iron','pawn_gold','slinger'] as const).map(t => (
              <button key={t} onClick={() => adminUnit(t, 'blue')} style={abtn}>{t[0].toUpperCase() + t.slice(1,5)}</button>
            ))}
          </div>
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#fca5a5', marginRight: 4 }}>+Unit P2:</span>
            {(['warrior','archer','knight','monk','pawn','pawn_iron','pawn_gold','slinger'] as const).map(t => (
              <button key={t} onClick={() => adminUnit(t, 'red')} style={{ ...abtn, color: '#fca5a5' }}>{t[0].toUpperCase() + t.slice(1,5)}</button>
            ))}
          </div>

          {/* Buildings */}
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#93c5fd', marginRight: 4 }}>+Bld P1:</span>
            {(['castle','barracks','house','fort','workshop','tower'] as const).map(b => (
              <button key={b} onClick={() => adminBld(b, 'blue')} style={abtn}>{b[0].toUpperCase() + b.slice(1,3)}</button>
            ))}
          </div>
          <div>
            <span style={{ color: '#fca5a5', marginRight: 4 }}>+Bld P2:</span>
            {(['castle','barracks','house','fort','workshop','tower'] as const).map(b => (
              <button key={b} onClick={() => adminBld(b, 'red')} style={{ ...abtn, color: '#fca5a5' }}>{b[0].toUpperCase() + b.slice(1,3)}</button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom HUD */}
      <div className="tk-hud tk-hud-bottom">        <div className="tk-hud-side-slot tk-hud-side-slot-left">
          {/* Build panel */}
          <div className="tk-panel tk-panel-build">
            <div className="tk-panel-title">Build</div>
            <div className="tk-btn-row tk-btn-row-build">
              <button
                className={`tk-btn ${buildMode === 'barracks' ? 'tk-btn-active' : ''}`}
                onClick={() => enterBuildMode('barracks')}
                disabled={productionLocked || !canBuildBarracks}
                title="Barracks — 50 wood"
              >
                <span className="tk-btn-icon tk-btn-icon-barracks" aria-hidden="true" />
                <span className="tk-btn-label">Barracks</span>
                <span className="tk-cost">50 Wood</span>
              </button>
              <button
                className={`tk-btn ${buildMode === 'tower' ? 'tk-btn-active' : ''}`}
                onClick={() => enterBuildMode('tower')}
                disabled={productionLocked || !canBuildTower}
                title="Tower — 75 wood"
              >
                <span className="tk-btn-icon tk-btn-icon-tower" aria-hidden="true" />
                <span className="tk-btn-label">Tower</span>
                <span className="tk-cost">75 Wood</span>
              </button>
              <button
                className={`tk-btn ${buildMode === 'house' ? 'tk-btn-active' : ''}`}
                onClick={() => enterBuildMode('house')}
                disabled={productionLocked || !canBuildHouse}
                title="House — 40 wood (+4 pop cap)"
              >
                <span className="tk-btn-icon tk-btn-icon-house" aria-hidden="true" />
                <span className="tk-btn-label">House</span>
                <span className="tk-cost">30 Wood · +2g/5s</span>
              </button>
              <button
                className={`tk-btn ${buildMode === 'fort' ? 'tk-btn-active' : ''}`}
                onClick={() => enterBuildMode('fort')}
                disabled={productionLocked || !canBuildFort}
                title="Fort — 120 wood"
              >
                <span className="tk-btn-icon tk-btn-icon-tower" aria-hidden="true" />
                <span className="tk-btn-label">Fort</span>
                <span className="tk-cost">120 Wood</span>
              </button>
              <button
                className={`tk-btn ${buildMode === 'workshop' ? 'tk-btn-active' : ''}`}
                onClick={() => enterBuildMode('workshop')}
                disabled={productionLocked || !canBuildWorkshop}
                title="Workshop — 65 wood"
              >
                <span className="tk-btn-icon tk-btn-icon-house" aria-hidden="true" />
                <span className="tk-btn-label">Workshop</span>
                <span className="tk-cost">65 Wood · +2w/5s</span>
              </button>
            </div>
            <div className="tk-build-hint">
              {productionLocked
                ? 'Battle started: building and training are locked.'
                : isMobile
                  ? 'Tap map to build, tap Cancel to stop.'
                  : 'Left-click to build, right-click or Esc to cancel.'}
            </div>
            {buildMode && !productionLocked && (
              <button className="tk-btn tk-btn-cancel" onClick={() => enterBuildMode(buildMode!)}>
                ✕ Cancel
              </button>
            )}
          </div>
        </div>

        <div className="tk-hud-side-slot tk-hud-side-slot-right">
          {/* Train + Queue panel */}
          <div className="tk-panel tk-panel-train">
            <div className="tk-panel-title">Train Units</div>

            <div className="tk-btn-row tk-btn-row-train">
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('warrior')}
                disabled={productionLocked || !canProduceWarrior || !canTrainWarrior || queueFull || popFull}
                title={!canProduceWarrior ? 'Warrior — requires Barracks' : popFull ? 'Population cap reached — build more Houses' : 'Warrior — 25 gold'}
              >
                {getQueuedCount('warrior') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('warrior')}</span>}
                {getActiveQueueItem('warrior') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('warrior')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-warrior" aria-hidden="true" />
                <span className="tk-btn-label">Warrior</span>
                <span className="tk-cost">25 Gold</span>
              </button>
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('archer')}
                disabled={productionLocked || !canProduceArcher || !canTrainArcher || queueFull || popFull}
                title={!canProduceArcher ? 'Archer — requires Fort' : popFull ? 'Population cap reached — build more Houses' : 'Archer — 40 gold'}
              >
                {getQueuedCount('archer') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('archer')}</span>}
                {getActiveQueueItem('archer') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('archer')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-archer" aria-hidden="true" />
                <span className="tk-btn-label">Archer</span>
                <span className="tk-cost">40 Gold</span>
              </button>
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('monk')}
                disabled={productionLocked || !canProduceMonk || !canTrainMonk || queueFull || popFull}
                title={!canProduceMonk ? 'Monk — requires Workshop' : popFull ? 'Population cap reached — build more Houses' : 'Monk — 55 gold'}
              >
                {getQueuedCount('monk') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('monk')}</span>}
                {getActiveQueueItem('monk') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('monk')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-monk" aria-hidden="true" />
                <span className="tk-btn-label">Monk</span>
                <span className="tk-cost">55 Gold</span>
              </button>
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('pawn')}
                disabled={productionLocked || !canProducePawn || !canTrainPawn || queueFull || popFull}
                title={!canProducePawn ? 'Wood Pawn — requires House' : popFull ? 'Population cap reached — build more Houses' : 'Wood Pawn — 8 gold · gathers resources'}
              >
                {getQueuedCount('pawn') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('pawn')}</span>}
                {getActiveQueueItem('pawn') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('pawn')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-pawn" aria-hidden="true" />
                <span className="tk-btn-label">Wood Pawn</span>
                <span className="tk-cost">8 Gold</span>
              </button>
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('pawn_iron')}
                disabled={productionLocked || !canProducePawnIron || !canTrainPawnIron || queueFull || popFull}
                title={!canProducePawnIron ? 'Iron Pawn — requires Barracks' : popFull ? 'Population cap reached' : 'Iron Pawn — 22 gold · tougher fighter'}
              >
                {getQueuedCount('pawn_iron') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('pawn_iron')}</span>}
                {getActiveQueueItem('pawn_iron') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('pawn_iron')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-pawn" aria-hidden="true" style={{ filter: 'hue-rotate(200deg) brightness(0.9)' }} />
                <span className="tk-btn-label">Iron Pawn</span>
                <span className="tk-cost">22 Gold</span>
              </button>
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('pawn_gold')}
                disabled={productionLocked || !canProducePawnGold || !canTrainPawnGold || queueFull || popFull}
                title={!canProducePawnGold ? 'Gold Pawn — requires Barracks' : popFull ? 'Population cap reached' : 'Gold Pawn — 38 gold · heavy brawler'}
              >
                {getQueuedCount('pawn_gold') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('pawn_gold')}</span>}
                {getActiveQueueItem('pawn_gold') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('pawn_gold')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-pawn" aria-hidden="true" style={{ filter: 'sepia(1) saturate(4) hue-rotate(10deg)' }} />
                <span className="tk-btn-label">Gold Pawn</span>
                <span className="tk-cost">38 Gold</span>
              </button>
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('knight')}
                disabled={productionLocked || !canProduceKnight || !canTrainKnight || queueFull || popFull}
                title={!canProduceKnight ? 'Knight — requires Barracks' : popFull ? 'Population cap reached — build more Houses' : 'Knight — 48 gold'}
              >
                {getQueuedCount('knight') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('knight')}</span>}
                {getActiveQueueItem('knight') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('knight')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-warrior" aria-hidden="true" />
                <span className="tk-btn-label">Knight</span>
                <span className="tk-cost">48 Gold</span>
              </button>
              <button
                className="tk-btn"
                onClick={() => enqueueUnit('slinger')}
                disabled={productionLocked || !canProduceSlinger || !canTrainSlinger || queueFull || popFull || slingerCount >= 3}
                title={
                  !canProduceSlinger ? 'Scout — requires Barracks' :
                  slingerCount >= 3  ? 'Scout limit reached (3/3) — scouts auto-explore and report enemy positions' :
                  popFull            ? 'Population cap reached — build more Houses' :
                  'Scout — 75 gold · auto-explores map · reports enemy discoveries · max 3'
                }
              >
                {slingerCount > 0 && <span className="tk-btn-queue-badge">{slingerCount}/3</span>}
                {getActiveQueueItem('slinger') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('slinger')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-pawn" aria-hidden="true" style={{ filter: 'hue-rotate(270deg) brightness(1.2)' }} />
                <span className="tk-btn-label">Scout</span>
                <span className="tk-cost">75 Gold</span>
              </button>
            </div>

            {productionLocked && <div className="tk-build-hint">Battle started: production locked.</div>}
            {!productionLocked && queueFull && <div className="tk-build-hint">Queue full — wait for a unit to finish.</div>}
            {!productionLocked && !queueFull && (!hasBarracks || !hasFort || !hasWorkshop || !hasHouse) && (
              <div className="tk-build-hint">
                Missing producers: {!hasHouse ? 'House ' : ''}{!hasBarracks ? 'Barracks ' : ''}{!hasFort ? 'Fort ' : ''}{!hasWorkshop ? 'Workshop' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
