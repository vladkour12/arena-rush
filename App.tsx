import React, { Suspense, useCallback, useRef, useState } from 'react';
import { MainMenu } from './components/MainMenu';
import { RefreshCw, Trophy } from 'lucide-react';
import type { Vector2 } from './types';

enum AppState {
  Menu,
  Playing,
  GameOver
}

const loadPlayingScreen = () => import('./components/PlayingScreen');
const PlayingScreen = React.lazy(loadPlayingScreen);

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.Menu);
  const [winner, setWinner] = useState<'Player' | 'Bot' | null>(null);

  // Controls Reference (Mutable for performance, avoids re-renders)
  const inputRef = useRef({
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 }, // Right stick vector
      sprint: false
  });

  const handleGameOver = useCallback((win: 'Player' | 'Bot') => {
    setWinner(win);
    setAppState(AppState.GameOver);
  }, []);

  const startGame = useCallback(() => {
    setWinner(null);
    setAppState(AppState.Playing);
  }, []);

  return (
    <div className="w-full h-screen bg-slate-900 overflow-hidden relative font-sans select-none touch-none">

      {appState === AppState.Menu && <MainMenu onStart={startGame} onStartIntent={loadPlayingScreen} />}

      {appState === AppState.Playing && (
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-slate-400">
              Loading match…
            </div>
          }
        >
          <PlayingScreen onGameOver={handleGameOver} inputRef={inputRef} />
        </Suspense>
      )}

      {appState === AppState.GameOver && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="text-center p-8 bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl max-w-sm w-full mx-4 transform animate-bounce-in">
            {winner === 'Player' ? (
                <div className="flex flex-col items-center gap-4 mb-6">
                    <Trophy className="w-20 h-20 text-yellow-400 fill-yellow-400 animate-pulse" />
                    <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 uppercase">Victory!</h2>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4 mb-6">
                    <div className="text-6xl">💀</div>
                    <h2 className="text-5xl font-black text-red-600 uppercase">Defeat</h2>
                </div>
            )}
            <p className="text-slate-400 mb-8">{winner === 'Player' ? "You survived!" : "Better luck next time."}</p>
            <button onClick={() => setAppState(AppState.Menu)} className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition">
                <RefreshCw size={20} /> <span>Play Again</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}