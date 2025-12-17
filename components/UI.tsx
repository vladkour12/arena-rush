import React from 'react';
import { WeaponType } from '../types';
import { Heart, Shield, Crosshair, Maximize2, Minimize2 } from 'lucide-react';
import { WEAPONS } from '../constants';
import { BoostIcons } from './BoostIcons';

interface UIProps {
  hp: number;
  armor: number;
  ammo: number;
  weapon: WeaponType;
  timeLeft: number;
  sprintCooldown?: number;
  dashCooldown?: number;
  speedBoostTimeLeft?: number;
  damageBoostTimeLeft?: number;
  invincibilityTimeLeft?: number;
  canFullscreen?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

const getWeaponColor = (weapon: WeaponType): string => {
  return WEAPONS[weapon]?.color || '#fbbf24';
};

export const UI: React.FC<UIProps> = ({
  hp,
  armor,
  ammo,
  weapon,
  timeLeft,
  sprintCooldown = 0,
  dashCooldown = 0,
  speedBoostTimeLeft = 0,
  damageBoostTimeLeft = 0,
  invincibilityTimeLeft = 0,
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
      
      {/* Top Center: Health & Armor - Larger */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 sm:top-4 flex flex-col gap-1.5 sm:gap-2 pointer-events-auto origin-top scale-[0.5] sm:scale-[0.6] md:scale-75">
        <div className="bg-slate-900/90 p-3 sm:p-4 rounded-xl border-2 border-slate-700 flex items-center gap-2 sm:gap-3 w-80 sm:w-96 backdrop-blur-md shadow-2xl">
            <Heart className="text-rose-500 fill-rose-500 w-8 h-8 sm:w-10 sm:h-10 ml-1 drop-shadow-lg" />
            <div className="flex-1 h-6 sm:h-7 bg-slate-800 rounded-full overflow-hidden border-2 border-slate-700/50">
                <div 
                    className="h-full bg-gradient-to-r from-rose-600 via-rose-500 to-rose-400 transition-all duration-300 shadow-inner" 
                    style={{ width: `${Math.max(0, hp)}%` }}
                />
            </div>
            <span className="text-xl sm:text-2xl font-bold w-12 sm:w-14 text-right font-mono text-white drop-shadow-lg">{hp}</span>
        </div>
        
        {armor > 0 && (
            <div className="bg-slate-900/90 p-2.5 sm:p-3 rounded-xl border-2 border-slate-700 flex items-center gap-2 sm:gap-3 w-80 sm:w-96 backdrop-blur-md shadow-2xl">
                <Shield className="text-sky-500 fill-sky-500 w-6 h-6 sm:w-8 sm:h-8 ml-1 drop-shadow-lg" />
                <div className="flex-1 h-4 sm:h-5 bg-slate-800 rounded-full overflow-hidden border-2 border-slate-700/50">
                    <div 
                        className="h-full bg-gradient-to-r from-sky-600 via-sky-500 to-sky-400 transition-all duration-300 shadow-inner" 
                        style={{ width: `${(armor/50)*100}%` }}
                    />
                </div>
                <span className="text-lg sm:text-xl font-bold w-10 sm:w-12 text-right font-mono text-white drop-shadow-lg">{armor}</span>
            </div>
        )}
      </div>

      {/* Top Right: Ammo & Weapon Info - Compact */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex items-start gap-2 pointer-events-auto origin-top-right scale-[0.375] sm:scale-[0.45] md:scale-50">
        <div className="bg-slate-900/70 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg backdrop-blur-md shadow-xl border border-slate-700/50">
          <div className="flex items-center gap-2">
            {/* Weapon Icon */}
            <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8">
              <Crosshair className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: getWeaponColor(weapon) }} />
            </div>
            {/* Ammo Count */}
            <div className="flex flex-col items-start">
              <span
                className={`text-base sm:text-xl font-mono font-bold leading-none tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                  ammo === 0 ? 'text-red-500 animate-pulse' : 'text-white'
                }`}
              >
                {ammo}
              </span>
              {ammo === 0 && (
                <div className="text-[8px] sm:text-[9px] text-red-400 font-bold animate-pulse uppercase tracking-wide">
                  RELOAD!
                </div>
              )}
            </div>
          </div>
        </div>

        {canFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`group p-2 sm:p-3 rounded-lg sm:rounded-xl backdrop-blur-md shadow-xl flex items-center justify-center active:scale-95 transition-all duration-200 border-2 ${
                isFullscreen 
                  ? 'bg-emerald-600/90 border-emerald-400 hover:bg-emerald-500 hover:shadow-emerald-500/50' 
                  : 'bg-slate-900/90 border-yellow-500 hover:bg-yellow-600 hover:border-yellow-400 hover:shadow-yellow-500/50'
              }`}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-4 h-4 sm:w-6 sm:h-6 text-white group-hover:scale-110 transition-transform" />
              ) : (
                <Maximize2 className="w-4 h-4 sm:w-6 sm:h-6 text-white group-hover:scale-110 transition-transform" />
              )}
            </button>
        )}
      </div>

      {/* Boost Icons - Below ammo and fullscreen */}
      <BoostIcons
        speedBoostTimeLeft={speedBoostTimeLeft}
        damageBoostTimeLeft={damageBoostTimeLeft}
        invincibilityTimeLeft={invincibilityTimeLeft}
        sprintCooldown={sprintCooldown}
        dashCooldown={dashCooldown}
      />

      {/* Center Bottom: Timer - Compact */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-auto scale-[0.375] sm:scale-[0.45] md:scale-50">
        <div className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg backdrop-blur-md text-center transition-all duration-300 ${
          timeLeft < 30000 
            ? 'bg-red-900/90 border-2 border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-pulse' 
            : timeLeft < 60000
            ? 'bg-orange-900/80 border border-orange-500/50 shadow-[0_0_20px_rgba(249,115,22,0.5)]'
            : 'bg-slate-900/80 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
        }`}>
            <div className={`text-[7px] sm:text-[9px] uppercase font-black tracking-wider leading-tight ${
              timeLeft < 30000 ? 'text-red-200' : timeLeft < 60000 ? 'text-orange-300' : 'text-red-300'
            }`}>
              {timeLeft < 30000 ? '⚠️ ZONE' : 'Zone'}
            </div>
            <div className={`text-sm sm:text-lg font-mono font-bold tabular-nums leading-none ${
              timeLeft < 30000 ? 'text-red-100' : 'text-white'
            }`}>{timeString}</div>
        </div>
      </div>



    </div>
  );
};
