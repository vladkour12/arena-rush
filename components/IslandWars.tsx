import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as Phaser from 'phaser';
import { PreloadScene } from '../game/scenes/PreloadScene';
import { IslandWarsScene } from '../game/scenes/IslandWarsScene';
import type { IslandWarsCallbacks } from '../game/scenes/IslandWarsScene';

interface Props {
  onGameEnd: (winner: 'player' | 'bot', reason: string) => void;
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function IslandWars({ onGameEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  const [gold, setGold] = useState(50);
  const [wood, setWood] = useState(50);
  const [timer, setTimer] = useState(600);
  const [bridgeOpen, setBridgeOpen] = useState(false);
  const [trainQueue, setTrainQueue] = useState<string[]>([]);
  const [buildMode, setBuildMode] = useState<string | null>(null);

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

  const enqueueUnit = (type: string) => {
    const scene = getScene();
    if (scene) (scene as any).enqueueUnit(type);
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

  return (
    <div className="tk-game-wrapper">
      <div ref={containerRef} className="tk-canvas-container" />

      {/* Top HUD */}
      <div className="tk-hud tk-hud-top">
        <div className="tk-resource-bar">
          <span className="tk-resource-icon">🪙</span>
          <span className="tk-resource-value">{gold}</span>
        </div>
        <div className="tk-resource-bar">
          <span className="tk-resource-icon">🪵</span>
          <span className="tk-resource-value">{wood}</span>
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

        <div className="tk-game-title">TINY KINGDOMS</div>
      </div>

      {/* Bottom HUD */}
      <div className="tk-hud tk-hud-bottom">
        {/* Build panel */}
        <div className="tk-panel">
          <div className="tk-panel-title">Build</div>
          <div className="tk-btn-row">
            <button
              className={`tk-btn ${buildMode === 'barracks' ? 'tk-btn-active' : ''}`}
              onClick={() => enterBuildMode('barracks')}
              title="Barracks — 50 wood"
            >
              🏚 Barracks<br /><span className="tk-cost">50🪵</span>
            </button>
            <button
              className={`tk-btn ${buildMode === 'tower' ? 'tk-btn-active' : ''}`}
              onClick={() => enterBuildMode('tower')}
              title="Tower — 75 wood"
            >
              🗼 Tower<br /><span className="tk-cost">75🪵</span>
            </button>
            <button
              className={`tk-btn ${buildMode === 'house' ? 'tk-btn-active' : ''}`}
              onClick={() => enterBuildMode('house')}
              title="House — 30 wood"
            >
              🏠 House<br /><span className="tk-cost">30🪵</span>
            </button>
          </div>
          {buildMode && (
            <button className="tk-btn tk-btn-cancel" onClick={() => enterBuildMode(buildMode!)}>
              ✕ Cancel
            </button>
          )}
        </div>

        {/* Train panel */}
        <div className="tk-panel">
          <div className="tk-panel-title">Train</div>
          <div className="tk-btn-row">
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('warrior')}
              title="Warrior — 25 gold"
            >
              ⚔ Warrior<br /><span className="tk-cost">25🪙</span>
            </button>
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('archer')}
              title="Archer — 40 gold"
            >
              🏹 Archer<br /><span className="tk-cost">40🪙</span>
            </button>
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('monk')}
              title="Monk — 55 gold"
            >
              ✨ Monk<br /><span className="tk-cost">55🪙</span>
            </button>
            <button
              className="tk-btn"
              onClick={() => enqueueUnit('pawn')}
              title="Pawn — 10 gold"
            >
              🧍 Pawn<br /><span className="tk-cost">10🪙</span>
            </button>
          </div>
          {/* Train queue display */}
          {trainQueue.length > 0 && (
            <div className="tk-train-queue">
              Queue: {trainQueue.map((t, i) => (
                <span key={i} className="tk-queue-item">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
