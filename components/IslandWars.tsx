import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Phaser from 'phaser';
import { PreloadScene } from '../game/scenes/PreloadScene';
import { IslandWarsScene } from '../game/scenes/IslandWarsScene';
import type { IslandWarsCallbacks, TrainQueueDisplayItem } from '../game/scenes/IslandWarsScene';
import { TRAIN_QUEUE_MAX } from '../game/config/units';

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

export default function IslandWars({ onGameEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const [gold, setGold] = useState(50);
  const [wood, setWood] = useState(50);
  const [timer, setTimer] = useState(600);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [trainQueue, setTrainQueue] = useState<TrainQueueDisplayItem[]>([]);
  const [buildMode, setBuildMode] = useState<string | null>(null);
  const [hudCollapsed, setHudCollapsed] = useState(false);

  // Keep stable ref for callbacks so the scene doesn't capture stale closures
  const sceneRef = useRef<IslandWarsScene | null>(null);

  const getScene = useCallback((): IslandWarsScene | null => {
    return sceneRef.current;
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const callbacks: IslandWarsCallbacks = {
      onResourcesUpdate: (g, w) => {
        setGold(g);
        setWood(w);
      },
      onTimerUpdate: (remaining, open) => {
        setTimer(remaining);
        setBridgeOpen(open);
      },
      onGameEnd,
      onTrainQueueUpdate: (q) => setTrainQueue([...q]),
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      antialias: true,
      pixelArt: false,
      roundPixels: false,
      backgroundColor: '#1a3a5c',
      parent: containerRef.current,
      scene: [PreloadScene, IslandWarsScene],
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: {
        mode: Phaser.Scale.FIT,
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

  const enqueueUnit = (type: string) => {
    const scene = getScene();
    if (scene) (scene as any).enqueueUnit(type);
  };

  const cancelQueuedUnit = (index: number) => {
    const scene = getScene();
    if (scene) (scene as any).cancelQueuedUnit(index);
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

  const timerColor = bridgeOpen ? '#ff4444' : timer < 60 ? '#ffaa00' : '#ffe066';
  const canBuildBarracks = wood >= 50;
  const canBuildTower = wood >= 75;
  const canBuildHouse = wood >= 30;
  const canTrainWarrior = gold >= 25;
  const canTrainArcher = gold >= 40;
  const canTrainMonk = gold >= 55;
  const canTrainPawn = gold >= 10;
  const queueFull = trainQueue.length >= TRAIN_QUEUE_MAX;

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
        </div>

        <div className="tk-timer-block">
          <div className="tk-timer" style={{ color: timerColor }}>
            {formatTime(timer)}
          </div>
          {!bridgeOpen && (
            <div className="tk-bridge-hint">Bridge in {formatTime(Math.max(0, timer - 300))}</div>
          )}
          {bridgeOpen && <div className="tk-bridge-open">⚔ WAR PHASE ⚔</div>}
        </div>

        <div className="tk-hud-cluster tk-hud-cluster-right">
          <div className="tk-game-title">Tiny Kingdoms</div>
          <div className="tk-zoom-hint">
            {isMobile ? 'Touch: drag to move, pinch to zoom, double tap to reset' : 'Zoom: mouse wheel or +/- keys'}
          </div>
        </div>
      </div>

      <button
        className="tk-hud-toggle"
        onClick={() => setHudCollapsed((v) => !v)}
        title={hudCollapsed ? 'Show controls' : 'Hide controls'}
      >
        {hudCollapsed ? '▲ HUD' : '▼ HUD'}
      </button>

      {/* Bottom HUD */}
      <div className={`tk-hud tk-hud-bottom ${hudCollapsed ? 'tk-hud-bottom-collapsed' : ''}`}>
        {/* Build panel */}
        <div className="tk-panel tk-panel-build">
          <div className="tk-panel-title">Build</div>
          <div className="tk-btn-row tk-btn-row-build">
            <button
              className={`tk-btn ${buildMode === 'barracks' ? 'tk-btn-active' : ''}`}
              onClick={() => enterBuildMode('barracks')}
              disabled={!canBuildBarracks}
              title="Barracks — 50 wood"
            >
              <span className="tk-btn-icon tk-btn-icon-barracks" aria-hidden="true" />
              <span className="tk-btn-label">Barracks</span>
              <span className="tk-cost">50 Wood</span>
            </button>
            <button
              className={`tk-btn ${buildMode === 'tower' ? 'tk-btn-active' : ''}`}
              onClick={() => enterBuildMode('tower')}
              disabled={!canBuildTower}
              title="Tower — 75 wood"
            >
              <span className="tk-btn-icon tk-btn-icon-tower" aria-hidden="true" />
              <span className="tk-btn-label">Tower</span>
              <span className="tk-cost">75 Wood</span>
            </button>
            <button
              className={`tk-btn ${buildMode === 'house' ? 'tk-btn-active' : ''}`}
              onClick={() => enterBuildMode('house')}
              disabled={!canBuildHouse}
              title="House — 30 wood"
            >
              <span className="tk-btn-icon tk-btn-icon-house" aria-hidden="true" />
              <span className="tk-btn-label">House</span>
              <span className="tk-cost">30 Wood</span>
            </button>
          </div>
          <div className="tk-build-hint">
            {isMobile
              ? 'Place mode: tap map to build repeatedly, tap Cancel to stop.'
              : 'Place mode: left click to build repeatedly, right click or Esc to cancel.'}
          </div>
          {buildMode && (
            <button className="tk-btn tk-btn-cancel" onClick={() => enterBuildMode(buildMode!)}>
              ✕ Cancel
            </button>
          )}
        </div>

        {/* Train panel */}
        <div className="tk-panel tk-panel-train">
          <div className="tk-panel-title">Train</div>
          <div className="tk-btn-row tk-btn-row-train">
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('warrior')}
              disabled={!canTrainWarrior || queueFull}
              title="Warrior — 25 gold"
            >
              <span className="tk-btn-icon tk-btn-icon-warrior" aria-hidden="true" />
              <span className="tk-btn-label">Warrior</span>
              <span className="tk-cost">25 Gold</span>
            </button>
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('archer')}
              disabled={!canTrainArcher || queueFull}
              title="Archer — 40 gold"
            >
              <span className="tk-btn-icon tk-btn-icon-archer" aria-hidden="true" />
              <span className="tk-btn-label">Archer</span>
              <span className="tk-cost">40 Gold</span>
            </button>
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('monk')}
              disabled={!canTrainMonk || queueFull}
              title="Monk — 55 gold"
            >
              <span className="tk-btn-icon tk-btn-icon-monk" aria-hidden="true" />
              <span className="tk-btn-label">Monk</span>
              <span className="tk-cost">55 Gold</span>
            </button>
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('pawn')}
              disabled={!canTrainPawn || queueFull}
              title="Pawn — 10 gold"
            >
              <span className="tk-btn-icon tk-btn-icon-pawn" aria-hidden="true" />
              <span className="tk-btn-label">Pawn</span>
              <span className="tk-cost">10 Gold</span>
            </button>
          </div>
          {/* Train queue display */}
          {trainQueue.length > 0 && (
            <div className="tk-train-queue-wrap">
              <div className="tk-train-queue-header">
                <span className="tk-train-queue-title">Queue</span>
                <span className="tk-train-queue-count">{trainQueue.length}/{TRAIN_QUEUE_MAX}</span>
              </div>
              <div className="tk-train-queue">
                {trainQueue.map((item, i) => (
                  <button
                    key={`${item.type}-${i}`}
                    type="button"
                    className={`tk-queue-item ${item.active ? 'tk-queue-item-next' : ''}`}
                    onClick={() => cancelQueuedUnit(i)}
                    title={`Remove ${item.type} from queue and refund gold`}
                  >
                    <span className="tk-queue-item-label">{item.active ? `Next: ${item.type}` : item.type}</span>
                    <span className="tk-queue-item-time">{formatQueueTime(item.remainingMs)}</span>
                  </button>
                ))}
              </div>
              <div className="tk-queue-hint">Click a queued unit to remove it and refund its gold.</div>
            </div>
          )}
          {queueFull && <div className="tk-build-hint">Training queue full. Wait for a unit to finish.</div>}
        </div>
      </div>

    </div>
  );
}
