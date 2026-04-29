import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { PreloadScene } from '../game/scenes/PreloadScene';
import { ArenaScene } from '../game/scenes/ArenaScene';
import type { ArenaCallbacks } from '../game/scenes/ArenaScene';

interface Props {
  onGameEnd: (winner: 'player' | 'bot' | 'draw', reason: string) => void;
}

function formatTime(secs: number): string {
  const safeSecs = Math.max(0, Math.floor(secs));
  const m = Math.floor(safeSecs / 60);
  const s = safeSecs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ArenaBattle({ onGameEnd }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [timer, setTimer] = useState(180);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    const callbacks: ArenaCallbacks = {
      onTimerUpdate: (secs) => setTimer(secs),
      onGameEnd,
    };

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#2d1a0e',
      parent: containerRef.current,
      scene: [PreloadScene, ArenaScene],
      audio: { noAudio: true },
      physics: { default: 'arcade', arcade: { debug: false } },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    game.registry.set('startScene', 'ArenaScene');
    game.registry.set('callbacks', callbacks);
    gameRef.current = game;

    return () => {
      game.destroy(true);
      gameRef.current = null;
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

  const timerColor = timer <= 30 ? '#ff4444' : timer <= 60 ? '#ffaa00' : '#ffe066';

  return (
    <div className="tk-game-wrapper">
      <div ref={containerRef} className="tk-canvas-container" />

      {/* Minimal top HUD */}
      <div className="tk-hud tk-hud-top tk-arena-hud">
        <div className="tk-arena-label tk-arena-player">⚔ PLAYER</div>
        <div className="tk-timer tk-arena-timer" style={{ color: timerColor }}>
          {formatTime(timer)}
        </div>
        <div className="tk-arena-label tk-arena-bot">BOT 🤖</div>
      </div>

      <div className="tk-zoom-hint">
        {isMobile ? 'Touch: drag to move, pinch to zoom, double tap to reset' : 'Zoom: mouse wheel or +/- keys'}
      </div>
    </div>
  );
}
