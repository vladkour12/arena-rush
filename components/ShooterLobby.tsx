import React, { useEffect, useState } from 'react';
import { getApiUrl } from '../utils/api';

type Difficulty = 'easy' | 'normal' | 'hard';

interface Props {
  onMatchReady: (code: string, playerId: string, playerName: string, wsUrl: string) => void;
  onBack: () => void;
}

function makePlayerId(): string {
  let id = localStorage.getItem('shooterPlayerId');
  if (!id) {
    id = 'p_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('shooterPlayerId', id);
  }
  return id;
}

function getWsUrl(): string {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return `ws://${host}:3001`;
  return 'wss://arena-rush-backend.onrender.com';
}

export default function ShooterLobby({ onMatchReady, onBack }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('shooterPlayerName') || '');
  const [screen, setScreen] = useState<'menu' | 'hosting' | 'joining' | 'difficulty'>('menu');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hosting, setHosting] = useState(false);
  const playerId = makePlayerId();

  useEffect(() => { localStorage.setItem('shooterPlayerName', name); }, [name]);

  const wsUrl = getWsUrl();

  const create = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    setError(null); setHosting(true);
    try {
      const res = await fetch(getApiUrl('/api/shooter/rooms'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostId: playerId, hostName: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'create failed');
      const data = await res.json();
      setCode(data.code);
      setScreen('hosting');
      onMatchReady(data.code, playerId, name.trim(), wsUrl);
    } catch (e: any) { setError(e.message); setHosting(false); }
  };

  const join = async () => {
    if (!name.trim()) { setError('Enter a name'); return; }
    if (!joinCode.match(/^[A-Z]{4}$/)) { setError('4-letter code, A–Z (no I/O)'); return; }
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/shooter/rooms/${joinCode}/join`), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ guestId: playerId, guestName: name.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'join failed');
      onMatchReady(joinCode, playerId, name.trim(), wsUrl);
    } catch (e: any) { setError(e.message); }
  };

  const practice = async (difficulty: Difficulty) => {
    if (!name.trim()) { setError('Enter a name'); return; }
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/shooter/practice'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostId: playerId, hostName: name.trim(), difficulty }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'practice failed');
      const data = await res.json();
      onMatchReady(data.code, playerId, name.trim(), wsUrl);
    } catch (e: any) { setError(e.message); }
  };

  const addBotNow = async () => {
    try {
      await fetch(getApiUrl(`/api/shooter/rooms/${code}/bot`), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ difficulty: 'normal' }),
      });
    } catch {}
  };

  return (
    <div className="tk-shooter-lobby">
      <h1>1v1 Top-Down Shooter</h1>
      <input
        className="tk-input"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 20))}
      />
      {error && <div className="tk-error">{error}</div>}

      {screen === 'menu' && (
        <div className="tk-lobby-buttons">
          <button onClick={create} disabled={hosting}>Create Room</button>
          <button onClick={() => setScreen('joining')}>Join Room</button>
          <button onClick={() => setScreen('difficulty')}>Practice vs Bot</button>
          <button className="tk-btn-secondary" onClick={onBack}>Back</button>
        </div>
      )}

      {screen === 'hosting' && (
        <div className="tk-hosting">
          <p>Share this code with your friend:</p>
          <div className="tk-code-display">{code}</div>
          <button onClick={() => navigator.clipboard.writeText(code)}>Copy code</button>
          <button onClick={addBotNow}>Add Bot Now</button>
          <p className="tk-muted">Bot will fill the slot automatically after 30s.</p>
        </div>
      )}

      {screen === 'joining' && (
        <div className="tk-joining">
          <input
            className="tk-input tk-input-code"
            placeholder="CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
          />
          <button onClick={join}>Join</button>
          <button className="tk-btn-secondary" onClick={() => setScreen('menu')}>Back</button>
        </div>
      )}

      {screen === 'difficulty' && (
        <div className="tk-difficulty">
          <p>Choose bot difficulty:</p>
          <button onClick={() => practice('easy')}>Easy</button>
          <button onClick={() => practice('normal')}>Normal</button>
          <button onClick={() => practice('hard')}>Hard</button>
          <button className="tk-btn-secondary" onClick={() => setScreen('menu')}>Back</button>
        </div>
      )}
    </div>
  );
}
