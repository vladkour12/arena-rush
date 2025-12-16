import React from 'react';
import { WeaponType } from '../types';
import { Heart, Shield, Crosshair, Maximize2, Minimize2, RefreshCcw } from 'lucide-react';

interface UIProps {
  hp: number;
  armor: number;
  ammo: number;
  weapon: WeaponType;
  timeLeft: number;
  canFullscreen?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const UI: React.FC<UIProps> = ({
  hp,
  armor,
  ammo,
  weapon,
  timeLeft,
  canFullscreen = false,
  isFullscreen = false,
  onToggleFullscreen
}) => {
  // Format time mm:ss
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="absolute inset-0 pointer-events-none p-4 z-20">
      
      {/* Top Left: Health & Armor */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-auto origin-top-left scale-90 sm:scale-100">
        <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-700 flex items-center gap-2 w-48 backdrop-blur-md shadow-lg">
            <Heart className="text-rose-500 fill-rose-500 w-6 h-6 ml-1" />
            <div className="flex-1 h-4 bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-rose-500 transition-all duration-300" 
                    style={{ width: `${Math.max(0, hp)}%` }}
                />
            </div>
            <span className="text-sm font-bold w-8 text-right font-mono text-white">{hp}</span>
        </div>
        
        {armor > 0 && (
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-700 flex items-center gap-2 w-48 backdrop-blur-md shadow-lg">
                <Shield className="text-sky-500 fill-sky-500 w-5 h-5 ml-1" />
                <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-sky-500 transition-all duration-300" 
                        style={{ width: `${(armor/50)*100}%` }}
                    />
                </div>
                <span className="text-sm font-bold w-6 text-right font-mono text-white">{armor}</span>
            </div>
        )}
      </div>

      {/* Top Right: Timer & Fullscreen */}
      <div className="absolute top-4 right-4 flex items-start gap-4 pointer-events-auto origin-top-right scale-90 sm:scale-100">
        <div className={`px-4 py-2 rounded-xl backdrop-blur-md text-center transition-all duration-300 ${
          timeLeft < 30000 
            ? 'bg-red-900/90 border-2 border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-pulse' 
            : timeLeft < 60000
            ? 'bg-orange-900/80 border border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.5)]'
            : 'bg-slate-900/80 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
        }`}>
            <div className={`text-[10px] uppercase font-black tracking-widest leading-tight ${
              timeLeft < 30000 ? 'text-red-200' : timeLeft < 60000 ? 'text-orange-300' : 'text-red-300'
            }`}>
              {timeLeft < 30000 ? '⚠️ ZONE CLOSING' : 'Zone Shrink'}
            </div>
            <div className={`text-2xl font-mono font-bold tabular-nums leading-none ${
              timeLeft < 30000 ? 'text-red-100' : 'text-white'
            }`}>{timeString}</div>
        </div>

        {canFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="bg-slate-900/90 p-3 rounded-xl border border-slate-600 backdrop-blur-md shadow-xl flex items-center justify-center active:scale-95 transition"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-6 h-6 text-white/90" />
              ) : (
                <Maximize2 className="w-6 h-6 text-white/90" />
              )}
            </button>
        )}
      </div>

      {/* Right Side: Weapon Controls (Above Joystick) */}
      <div className="absolute bottom-32 right-6 flex flex-col items-end gap-4 pointer-events-auto origin-bottom-right scale-90 sm:scale-100">
          
          {/* Change Gun Button */}
          <button 
            className="bg-slate-900/90 p-4 rounded-full border-2 border-slate-500 backdrop-blur-md shadow-xl active:scale-95 transition hover:bg-slate-800 group"
            title="Change Gun"
          >
            <RefreshCcw className="w-8 h-8 text-white group-hover:rotate-180 transition-transform duration-500" />
          </button>

          {/* Ammo & Weapon Info */}
          <div className="bg-slate-900/90 p-4 rounded-2xl border border-slate-600 backdrop-blur-md shadow-xl flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-xs font-black italic tracking-wider uppercase text-slate-400 leading-none mb-1">
                {weapon}
              </span>
              <div className="relative">
                <span
                  className={`text-4xl font-mono font-bold leading-none ${
                    ammo === 0 ? 'text-red-500 animate-pulse' : 'text-emerald-400'
                  }`}
                >
                  {ammo} <span className="text-slate-600 text-xl">/ ∞</span>
                </span>
                {ammo === 0 && (
                  <div className="absolute -bottom-5 right-0 text-xs text-orange-400 font-bold animate-pulse whitespace-nowrap">
                    RELOADING...
                  </div>
                )}
              </div>
            </div>
            <div className="w-12 h-12 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl flex items-center justify-center border border-slate-600 shadow-inner">
              <Crosshair className="w-7 h-7 text-white/80" />
            </div>
          </div>
      </div>

    </div>
  );
};
