import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Smartphone, Zap } from 'lucide-react';
import { GameCanvas } from './GameCanvas';
import { Joystick } from './Joystick';
import { UI } from './UI';
import { WeaponType, type Vector2 } from '../types';

interface PlayingScreenProps {
  inputRef: React.MutableRefObject<{ move: Vector2; aim: Vector2; sprint: boolean }>;
  onGameOver: (winner: 'Player' | 'Bot') => void;
}

export default function PlayingScreen({ inputRef, onGameOver }: PlayingScreenProps) {
  const [isPortrait, setIsPortrait] = useState(false);
  const [stats, setStats] = useState(() => ({
    hp: 100,
    ammo: 8,
    weapon: WeaponType.Pistol,
    armor: 0,
    timeLeft: 0,
    sprintCooldown: 0,
  }));

  // Only attach resize listeners while playing.
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // Keyboard controls (desktop debugging) – only while playing.
  useEffect(() => {
    const keys = {
      w: false,
      a: false,
      s: false,
      d: false,
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
    };

    const updateInputs = () => {
      const mx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
      const my = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
      const mLen = Math.sqrt(mx * mx + my * my);
      inputRef.current.move = mLen > 0 ? { x: mx / mLen, y: my / mLen } : { x: 0, y: 0 };

      const ax = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0);
      const ay = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
      const aLen = Math.sqrt(ax * ax + ay * ay);
      inputRef.current.aim = aLen > 0 ? { x: ax / aLen, y: ay / aLen } : { x: 0, y: 0 };
    };

    const handleKey = (e: KeyboardEvent, isDown: boolean) => {
      const key = e.key;
      const lower = key.toLowerCase();

      if (['w', 'a', 's', 'd'].includes(lower)) {
        keys[lower as keyof typeof keys] = isDown;
        updateInputs();
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
        keys[key as keyof typeof keys] = isDown;
        updateInputs();
      }
      if (lower === 'shift') inputRef.current.sprint = isDown;
    };

    const down = (e: KeyboardEvent) => handleKey(e, true);
    const up = (e: KeyboardEvent) => handleKey(e, false);

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [inputRef]);

  const handleUpdateStats = useCallback(
    (hp: number, ammo: number, weapon: WeaponType, armor: number, timeLeft: number, sprintCooldown: number) => {
      setStats({ hp, ammo, weapon, armor, timeLeft, sprintCooldown });
    },
    []
  );

  const sprintTimeoutRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (sprintTimeoutRef.current) window.clearTimeout(sprintTimeoutRef.current);
    };
  }, []);

  const triggerSprint = useCallback(() => {
    inputRef.current.sprint = true;
    if (sprintTimeoutRef.current) window.clearTimeout(sprintTimeoutRef.current);
    sprintTimeoutRef.current = window.setTimeout(() => {
      inputRef.current.sprint = false;
    }, 200);
  }, [inputRef]);

  const sprintDisabled = stats.sprintCooldown > 0;
  const sprintCooldownLabel = useMemo(() => (stats.sprintCooldown / 1000).toFixed(1), [stats.sprintCooldown]);

  return (
    <>
      {isPortrait && (
        <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center text-white p-8 text-center backdrop-blur-sm">
          <Smartphone className="w-24 h-24 mb-6 animate-pulse rotate-90" />
          <h2 className="text-3xl font-bold mb-2">Rotate Your Device</h2>
          <p className="text-slate-400">Arena Rush is best played sideways!</p>
          <button
            onClick={() => setIsPortrait(false)}
            className="mt-8 px-6 py-2 bg-slate-800 rounded-full text-sm text-slate-500 hover:text-white"
          >
            I'm on desktop / Dismiss
          </button>
        </div>
      )}

      <GameCanvas onGameOver={onGameOver} onUpdateStats={handleUpdateStats} inputRef={inputRef} />

      <UI {...stats} />

      {/* Controls Layer */}
      <div className="absolute inset-0 flex z-10 pointer-events-none">
        {/* Left: Move Joystick */}
        <div className="w-1/2 h-full relative pointer-events-auto">
          <Joystick onMove={(vec) => (inputRef.current.move = vec)} color="bg-cyan-400" className="w-full h-full" />
          <div className="absolute bottom-8 left-8 text-white/10 text-sm font-bold uppercase pointer-events-none">
            Move
          </div>
        </div>

        {/* Right: Aim/Fire Joystick */}
        <div className="w-1/2 h-full relative pointer-events-auto">
          <Joystick
            onMove={(vec) => (inputRef.current.aim = vec)}
            color="bg-red-500"
            className="w-full h-full"
            threshold={0.5}
          />
          <div className="absolute bottom-8 right-8 text-white/10 text-sm font-bold uppercase pointer-events-none">
            Aim / Fire
          </div>
        </div>
      </div>

      {/* Sprint Button Overlay */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <button
          onTouchStart={triggerSprint}
          onClick={triggerSprint}
          disabled={sprintDisabled}
          className={`w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-xl transition-all ${
            sprintDisabled ? 'bg-slate-800 border-slate-600 opacity-50' : 'bg-yellow-500 border-yellow-300 active:scale-95 animate-pulse'
          }`}
        >
          <Zap className={`w-8 h-8 ${sprintDisabled ? 'text-slate-400' : 'text-white fill-white'}`} />
          {sprintDisabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full">
              <span className="text-xs font-bold text-white">{sprintCooldownLabel}</span>
            </div>
          )}
        </button>
      </div>
    </>
  );
}

