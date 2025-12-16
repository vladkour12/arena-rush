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
    <div className="absolute inset-0 pointer-events-none p-2 sm:p-4 z-20">
      
      {/* Top Left: Health & Armor */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 flex flex-col gap-1 sm:gap-2 pointer-events-auto origin-top-left scale-75 sm:scale-90 md:scale-100">
        <div className="bg-slate-900/80 p-1.5 sm:p-2 rounded-lg border border-slate-700 flex items-center gap-1.5 sm:gap-2 w-36 sm:w-48 backdrop-blur-md shadow-lg">
            <Heart className="text-rose-500 fill-rose-500 w-4 h-4 sm:w-6 sm:h-6 ml-0.5 sm:ml-1" />
            <div className="flex-1 h-3 sm:h-4 bg-slate-800 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-rose-500 transition-all duration-300" 
                    style={{ width: `${Math.max(0, hp)}%` }}
                />
            </div>
            <span className="text-xs sm:text-sm font-bold w-6 sm:w-8 text-right font-mono text-white">{hp}</span>
        </div>
        
        {armor > 0 && (
            <div className="bg-slate-900/80 p-1.5 sm:p-2 rounded-lg border border-slate-700 flex items-center gap-1.5 sm:gap-2 w-36 sm:w-48 backdrop-blur-md shadow-lg">
                <Shield className="text-sky-500 fill-sky-500 w-4 h-4 sm:w-5 sm:h-5 ml-0.5 sm:ml-1" />
                <div className="flex-1 h-2.5 sm:h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-sky-500 transition-all duration-300" 
                        style={{ width: `${(armor/50)*100}%` }}
                    />
                </div>
                <span className="text-xs sm:text-sm font-bold w-5 sm:w-6 text-right font-mono text-white">{armor}</span>
            </div>
        )}
      </div>

      {/* Top Right: Timer & Fullscreen */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex items-start gap-2 sm:gap-4 pointer-events-auto origin-top-right scale-75 sm:scale-90 md:scale-100">
        <div className={`px-2 py-1 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl backdrop-blur-md text-center transition-all duration-300 ${
          timeLeft < 30000 
            ? 'bg-red-900/90 border-2 border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-pulse' 
            : timeLeft < 60000
            ? 'bg-orange-900/80 border border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.5)]'
            : 'bg-slate-900/80 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
        }`}>
            <div className={`text-[8px] sm:text-[10px] uppercase font-black tracking-wider sm:tracking-widest leading-tight ${
              timeLeft < 30000 ? 'text-red-200' : timeLeft < 60000 ? 'text-orange-300' : 'text-red-300'
            }`}>
              {timeLeft < 30000 ? '⚠️ ZONE' : 'Zone'}
            </div>
            <div className={`text-lg sm:text-2xl font-mono font-bold tabular-nums leading-none ${
              timeLeft < 30000 ? 'text-red-100' : 'text-white'
            }`}>{timeString}</div>
        </div>

        {canFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="group bg-slate-900/90 p-2 sm:p-3 rounded-lg sm:rounded-xl border border-slate-600 backdrop-blur-md shadow-xl flex items-center justify-center active:scale-95 transition-all duration-200 hover:bg-slate-800 hover:border-slate-500 hover:shadow-slate-500/50"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 sm:w-6 sm:h-6 text-white/90 group-hover:text-white group-hover:scale-110 transition-transform" />
              ) : (
                <Maximize2 className="w-4 h-4 sm:w-6 sm:h-6 text-white/90 group-hover:text-white group-hover:scale-110 transition-transform" />
              )}
            </button>
        )}
      </div>

      {/* Right Side: Weapon Controls - PUBG Mobile Style (Above Joystick) */}
      <div className="absolute bottom-24 sm:bottom-32 right-3 sm:right-6 flex flex-col items-end gap-2 sm:gap-3 pointer-events-auto origin-bottom-right scale-75 sm:scale-90 md:scale-100">
          
          {/* Reload Button - PUBG Style */}
          <button 
            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-800/70 flex items-center justify-center transition-all active:scale-90 group"
            style={{
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 2px rgba(239,68,68,0.5), 0 0 10px rgba(239,68,68,0.2)'
            }}
            title="Reload"
          >
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-red-500/70 to-orange-600/70 flex items-center justify-center">
              <RefreshCcw className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            </div>
          </button>
          
          {/* Change Gun Button - PUBG Style */}
          <button 
            className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-slate-800/70 flex items-center justify-center transition-all active:scale-90 group"
            style={{
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 2px rgba(16,185,129,0.5), 0 0 10px rgba(16,185,129,0.2)'
            }}
            title="Change Gun"
          >
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-emerald-500/70 to-teal-600/70 flex items-center justify-center">
              <Crosshair className="w-5 h-5 sm:w-6 sm:h-6 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
            </div>
          </button>

          {/* Ammo & Weapon Info - PUBG Mobile Style */}
          <div className="bg-slate-900/70 px-3 py-2 sm:px-4 sm:py-3 rounded-lg backdrop-blur-md shadow-xl border border-slate-700/50">
            <div className="flex items-center gap-2">
              <div className="flex flex-col items-start">
                <span className="text-[8px] sm:text-[10px] font-bold tracking-wider uppercase text-slate-400 leading-none mb-0.5">
                  {weapon}
                </span>
                <div className="relative flex items-baseline gap-1">
                  <span
                    className={`text-xl sm:text-3xl font-mono font-bold leading-none tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                      ammo === 0 ? 'text-red-500 animate-pulse' : 'text-white'
                    }`}
                  >
                    {ammo}
                  </span>
                  <span className="text-slate-500 text-xs sm:text-base font-mono font-bold">/ ∞</span>
                </div>
                {ammo === 0 && (
                  <div className="text-[8px] sm:text-[10px] text-red-400 font-bold animate-pulse uppercase tracking-wide mt-0.5">
                    RELOAD!
                  </div>
                )}
              </div>
            </div>
          </div>
      </div>

    </div>
  );
};
