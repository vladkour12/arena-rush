import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Phaser from 'phaser';
import { PreloadScene } from '../game/scenes/PreloadScene';
import { IslandWarsScene } from '../game/scenes/IslandWarsScene';
import type { IslandWarsCallbacks, TrainQueueDisplayItem } from '../game/scenes/IslandWarsScene';
import type { ProductionAvailability } from '../game/scenes/IslandWarsScene';
import type { Difficulty } from '../game/systems/AISystem';
import { TRAIN_QUEUE_MAX } from '../game/config/units';
import { GAME_DURATION_SECS } from '../game/config/map';

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
        antialias: true,
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

    return () => {
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [onGameEnd]);

  useEffect(() => {
    const detectMobile = () => {
      const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
      setIsMobile(coarsePointer || window.innerWidth <= 900);
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
      setProductionAvailability(avail);
      setPop(avail.pop);
      setPopCap(avail.popCap);
    }, 250);
    return () => window.clearInterval(intervalId);
  }, [refreshProductionAvailability, getScene]);

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
  const canTrainPawn = gold >= 10;
  const canTrainKnight = gold >= 48;
  const canTrainSlinger = gold >= 32;
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





      {/* Admin button */}
      <button
        onClick={() => setAdminOpen(v => !v)}
        style={{ position: 'fixed', top: 8, right: 10, zIndex: 9999, background: adminOpen ? '#7c3aed' : '#1f2937', color: '#c4b5fd', border: '1px solid #4b5563', borderRadius: 5, padding: '2px 9px', fontSize: 11, cursor: 'pointer', opacity: 0.9 }}
        title="Toggle admin / debug panel"
      >
        🔧
      </button>

      {/* Admin panel */}
      {adminOpen && (
        <div style={{ position: 'fixed', top: 32, right: 10, zIndex: 9998, background: 'rgba(15,20,30,0.97)', border: '1px solid #374151', borderRadius: 8, padding: '8px 10px', color: '#e5e7eb', fontSize: 11, width: 310, boxShadow: '0 6px 24px #000c' }}>

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
            {(['warrior','archer','knight','monk','pawn','slinger'] as const).map(t => (
              <button key={t} onClick={() => adminUnit(t, 'blue')} style={abtn}>{t[0].toUpperCase() + t.slice(1,3)}</button>
            ))}
          </div>
          <div style={{ marginBottom: 5 }}>
            <span style={{ color: '#fca5a5', marginRight: 4 }}>+Unit P2:</span>
            {(['warrior','archer','knight','monk','pawn','slinger'] as const).map(t => (
              <button key={t} onClick={() => adminUnit(t, 'red')} style={{ ...abtn, color: '#fca5a5' }}>{t[0].toUpperCase() + t.slice(1,3)}</button>
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
                title={!canProducePawn ? 'Pawn — requires House' : popFull ? 'Population cap reached — build more Houses' : 'Pawn — 10 gold'}
              >
                {getQueuedCount('pawn') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('pawn')}</span>}
                {getActiveQueueItem('pawn') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('pawn')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-pawn" aria-hidden="true" />
                <span className="tk-btn-label">Pawn</span>
                <span className="tk-cost">10 Gold</span>
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
                disabled={productionLocked || !canProduceSlinger || !canTrainSlinger || queueFull || popFull}
                title={!canProduceSlinger ? 'Slinger — requires Barracks' : popFull ? 'Population cap reached — build more Houses' : 'Slinger — 32 gold'}
              >
                {getQueuedCount('slinger') > 0 && <span className="tk-btn-queue-badge">Q {getQueuedCount('slinger')}</span>}
                {getActiveQueueItem('slinger') && <span className="tk-btn-queue-timer">{formatQueueTime(getActiveQueueItem('slinger')!.remainingMs)}</span>}
                <span className="tk-btn-icon tk-btn-icon-pawn" aria-hidden="true" />
                <span className="tk-btn-label">Slinger</span>
                <span className="tk-cost">32 Gold</span>
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
