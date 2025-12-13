import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { UI } from './components/UI';
import { Joystick } from './components/Joystick';
import { MainMenu } from './components/MainMenu';
import { InputState, WeaponType } from './types';
import { RefreshCw, Trophy, Smartphone, Zap } from 'lucide-react';

enum AppState {
  Menu,
  Playing,
  GameOver
}

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.Menu);
  const [winner, setWinner] = useState<'Player' | 'Bot' | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  
  // Game Stats for UI
  const [stats, setStats] = useState({
    hp: 100,
    ammo: 8,
    weapon: WeaponType.Pistol,
    armor: 0,
    timeLeft: 0,
    sprintCooldown: 0
  });

  // Controls Reference (Mutable for performance, avoids re-renders)
  const inputRef = useRef<InputState>({
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 }, // Right stick vector (mobile)
    sprint: false,
    fire: false, // mouse click (desktop)
    pointer: { x: 0, y: 0 }, // screen pixels
    isPointerAiming: false
  });

  // Check orientation
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // Desktop: PUBG-like movement (WASD + Shift sprint)
  useEffect(() => {
    if (appState !== AppState.Playing) return;
    const keys = { w: false, a: false, s: false, d: false };
    
    const updateInputs = () => {
      // Move (WASD)
      const mx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const my = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      const mLen = Math.sqrt(mx*mx + my*my);
      inputRef.current.move = mLen > 0 ? { x: mx/mLen, y: my/mLen } : { x: 0, y: 0 };
    };

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const key = e.key;
      const lower = key.toLowerCase();
      
      // Map WASD
      if (['w','a','s','d'].includes(lower)) { keys[lower as keyof typeof keys] = isDown; updateInputs(); }

      if (lower === 'shift') {
        inputRef.current.sprint = isDown;
      }
    };

    const down = (e: KeyboardEvent) => handleKey(e, true);
    const up = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [appState]);

  // Desktop: mouse aim + click to fire (PUBG-style)
  useEffect(() => {
    if (appState !== AppState.Playing) return;

    const onMouseMove = (e: MouseEvent) => {
      inputRef.current.pointer = { x: e.clientX, y: e.clientY };
      inputRef.current.isPointerAiming = true;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      inputRef.current.fire = true;
      inputRef.current.isPointerAiming = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button !== 0) return;
      inputRef.current.fire = false;
    };
    const onBlur = () => {
      inputRef.current.fire = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [appState]);

  const handleGameOver = useCallback((win: 'Player' | 'Bot') => {
    setWinner(win);
    setAppState(AppState.GameOver);
  }, []);

  const handleUpdateStats = useCallback((hp: number, ammo: number, weapon: WeaponType, armor: number, time: number, sprint: number) => {
      setStats({ hp, ammo, weapon, armor, timeLeft: time, sprintCooldown: sprint });
  }, []);

  const setSprint = (isSprinting: boolean) => {
    inputRef.current.sprint = isSprinting;
  };

  return (
    <div className="w-full h-screen bg-slate-900 overflow-hidden relative font-sans select-none touch-none">
      
      {isPortrait && appState === AppState.Playing && (
        <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center text-white p-8 text-center backdrop-blur-sm">
          <Smartphone className="w-24 h-24 mb-6 animate-pulse rotate-90" />
          <h2 className="text-3xl font-bold mb-2">Rotate Your Device</h2>
          <p className="text-slate-400">Arena Rush is best played sideways!</p>
          <button onClick={() => setIsPortrait(false)} className="mt-8 px-6 py-2 bg-slate-800 rounded-full text-sm text-slate-500 hover:text-white">I'm on desktop / Dismiss</button>
        </div>
      )}

      {appState === AppState.Menu && <MainMenu onStart={() => setAppState(AppState.Playing)} />}

      {appState === AppState.Playing && (
        <>
          <GameCanvas 
            onGameOver={handleGameOver}
            onUpdateStats={handleUpdateStats}
            inputRef={inputRef} // Pass the mutable ref
          />
          
          <UI {...stats} />

          {/* Controls Layer */}
          <div className="absolute inset-0 flex z-10 pointer-events-none">
            {/* Left: Move Joystick */}
            <div className="w-1/2 h-full relative pointer-events-auto">
                <Joystick 
                    onMove={(vec) => {
                      inputRef.current.move = vec;
                    }}
                    color="bg-cyan-400" 
                    className="w-full h-full" 
                />
                <div className="absolute bottom-8 left-8 text-white/10 text-sm font-bold uppercase pointer-events-none">Move</div>
            </div>

            {/* Right: Aim/Fire Joystick */}
            <div className="w-1/2 h-full relative pointer-events-auto">
                <Joystick 
                    onMove={(vec) => {
                      inputRef.current.aim = vec;
                      inputRef.current.isPointerAiming = false;
                      inputRef.current.fire = false;
                    }}
                    color="bg-red-500" 
                    className="w-full h-full"
                    threshold={0.5} // Visual ring for firing
                />
                <div className="absolute bottom-8 right-8 text-white/10 text-sm font-bold uppercase pointer-events-none">Aim / Fire</div>
            </div>
          </div>

          {/* Sprint Button Overlay */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
            <button 
                onTouchStart={() => setSprint(true)}
                onTouchEnd={() => setSprint(false)}
                onMouseDown={() => setSprint(true)}
                onMouseUp={() => setSprint(false)}
                onMouseLeave={() => setSprint(false)}
                className="w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-xl transition-all bg-yellow-500 border-yellow-300 active:scale-95"
            >
                <Zap className="w-8 h-8 text-white fill-white" />
            </button>
          </div>
        </>
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