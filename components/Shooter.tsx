import React, { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { ShooterPreloadScene } from '../game/shooter/scenes/ShooterPreloadScene';
import { ShooterScene } from '../game/shooter/scenes/ShooterScene';
import { ShooterClient } from '../game/shooter/net/ShooterClient';
import type { SnapMsg } from '../game/shooter/net/protocol';

interface Props {
  code: string;
  playerId: string;
  playerName: string;
  wsUrl: string;
  onLeave: () => void;
}

interface KillFeed { killer: string; victim: string; weapon: string; ts: number; }

export default function Shooter({ code, playerId, playerName, wsUrl, onLeave }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const clientRef = useRef<ShooterClient | null>(null);

  const [hp, setHp] = useState(100);
  const [enemyHp, setEnemyHp] = useState(100);
  const [enemyWeapon, setEnemyWeapon] = useState('pistol');
  const [weapon, setWeapon] = useState('pistol');
  const [ammo, setAmmo] = useState(12);
  const [score, setScore] = useState({ A: 0, B: 0 });
  const [timeLeft, setTimeLeft] = useState(5 * 60 * 1000);
  const [feed, setFeed] = useState<KillFeed[]>([]);
  const [matchEnd, setMatchEnd] = useState<{ winner: string; reason: string; finalScore: { A: number; B: number } } | null>(null);
  const [dead, setDead] = useState(false);
  const [connected, setConnected] = useState(false);
  const [firstSnap, setFirstSnap] = useState(false);

  useEffect(() => {
    const client = new ShooterClient({ url: wsUrl, code, playerId, name: playerName });
    clientRef.current = client;

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current!,
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#0a0a14',
      pixelArt: false,
      physics: { default: 'arcade' },
      scene: [ShooterPreloadScene, ShooterScene],
    });
    gameRef.current = game;
    game.registry.set('shooterContext', { client, localPlayerId: playerId });

    client.on('open', () => setConnected(true));
    client.on('close', () => setConnected(false));
    client.on('snap', (snap: SnapMsg) => {
      setFirstSnap(true);
      const me = snap.players.find(p => p.id === playerId);
      const enemy = snap.players.find(p => p.id !== playerId);
      if (me) {
        setHp(me.hp);
        setWeapon(me.weapon);
        setAmmo(me.ammo);
        setDead(me.dead);
      }
      if (enemy) {
        setEnemyHp(enemy.hp);
        setEnemyWeapon(enemy.weapon);
      }
      setScore({ A: snap.score.A ?? 0, B: snap.score.B ?? 0 });
      setTimeLeft(snap.timeLeftMs);
    });
    client.on('kill', (msg: any) => {
      setFeed(prev => [...prev, { killer: msg.killer, victim: msg.victim, weapon: msg.weapon, ts: Date.now() }].slice(-3));
    });
    client.on('matchEnd', (msg: any) => setMatchEnd(msg));
    client.on('matchStart', () => setMatchEnd(null));
    client.connect();

    return () => {
      client.disconnect();
      gameRef.current?.destroy(true);
    };
  }, [code, playerId, playerName, wsUrl]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setFeed(prev => prev.filter(k => now - k.ts < 4000));
    }, 500);
    return () => clearInterval(id);
  }, []);

  const mm = Math.floor(timeLeft / 60000);
  const ss = Math.floor((timeLeft % 60000) / 1000).toString().padStart(2, '0');

  return (
    <div className="tk-shooter">
      <div ref={containerRef} className="tk-shooter-canvas" />

      <div className="tk-shooter-hud-tl">
        <div className="tk-hp-bar">
          <div className="tk-hp-fill" style={{ width: `${hp}%` }} />
          <div className="tk-hp-text">{hp} HP</div>
        </div>
        <div className="tk-weapon-row">
          <div className="tk-weapon-icon">{weapon[0].toUpperCase()}</div>
          <div className="tk-ammo">{ammo}</div>
        </div>
      </div>

      <div className="tk-shooter-hud-tc">
        <span>{playerName}</span> <strong>{score.A}</strong> &mdash; <strong>{score.B}</strong> <span>Opponent</span>
        <div className="tk-shooter-timer">{mm}:{ss}</div>
      </div>

      <div className="tk-shooter-hud-tr">
        <div className="tk-shooter-enemy-hp">
          <div className="tk-shooter-enemy-label">ENEMY</div>
          <div className="tk-hp-bar tk-hp-bar-enemy">
            <div className="tk-hp-fill tk-hp-fill-enemy" style={{ width: `${enemyHp}%` }} />
            <div className="tk-hp-text">{enemyHp} HP</div>
          </div>
          <div className="tk-shooter-enemy-weapon">{enemyWeapon[0].toUpperCase()}</div>
        </div>
        {feed.map((k, i) => (
          <div key={i} className="tk-kill-line">{k.killer.slice(0,6)} ▶ {k.weapon} ▶ {k.victim.slice(0,6)}</div>
        ))}
      </div>

      {dead && !matchEnd && <div className="tk-shooter-dead">You died — respawning…</div>}

      {!firstSnap && !matchEnd && (
        <div className="tk-shooter-connecting">
          <div className="tk-shooter-connecting-box">
            <div className="tk-shooter-spinner" />
            <div>{connected ? 'Waiting for match…' : 'Waking server… (this can take 30–60s on first connect)'}</div>
            <button className="tk-shooter-cancel" onClick={() => { clientRef.current?.sendLeave(); onLeave(); }}>Cancel</button>
          </div>
        </div>
      )}

      {matchEnd && (
        <div className="tk-shooter-end">
          <div className="tk-shooter-end-box">
            <div className={`tk-shooter-result ${matchEnd.winner === playerId ? 'win' : 'loss'}`}>
              {matchEnd.winner === playerId ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="tk-shooter-final">Final: {matchEnd.finalScore?.A ?? 0} — {matchEnd.finalScore?.B ?? 0}</div>
            <div className="tk-shooter-end-buttons">
              <button onClick={() => { clientRef.current?.sendRematch(); }}>Rematch</button>
              <button onClick={() => { clientRef.current?.sendLeave(); onLeave(); }}>Back to Menu</button>
            </div>
          </div>
        </div>
      )}

      <button
        className="tk-shooter-swap-mobile"
        onClick={() => window.dispatchEvent(new CustomEvent('shooter-swap'))}
      >SWAP</button>
    </div>
  );
}
