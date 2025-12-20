import React from 'react';
import { WeaponType, GameMode } from '../types';
import { Heart, Shield, Crosshair, Maximize2, Minimize2, Skull, RefreshCw } from 'lucide-react';
import { WEAPONS } from '../constants';
import { BoostIcons } from './BoostIcons';
import { isMobileDevice } from '../utils/gameUtils';

interface UIProps {
  hp: number;
  armor: number;
  ammo: number;
  totalAmmo?: number;
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
  onExitGame?: () => void;
  gameMode?: GameMode;
  currentWave?: number;
  zombiesRemaining?: number;
  prepTimeRemaining?: number;
  inventory?: Array<{ weapon: WeaponType; ammo: number; totalAmmo: number }>;
  onWeaponSwitch?: () => void;
}

const getWeaponColor = (weapon: WeaponType): string => {
  return WEAPONS[weapon]?.color || '#fbbf24';
};

export const UI: React.FC<UIProps> = ({
  hp,
  armor,
  ammo,
  totalAmmo = 0,
  weapon,
  timeLeft,
  sprintCooldown = 0,
  dashCooldown = 0,
  speedBoostTimeLeft = 0,
  damageBoostTimeLeft = 0,
  invincibilityTimeLeft = 0,
  canFullscreen = false,
  isFullscreen = false,
  onToggleFullscreen,
  onExitGame,
  gameMode = GameMode.PvP,
  currentWave = 0,
  zombiesRemaining = 0,
  prepTimeRemaining = 0,
  inventory = [],
  onWeaponSwitch
}) => {
  // Format time mm:ss
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  
  // Format prep time
  const prepSeconds = Math.ceil(prepTimeRemaining / 1000);
  
  // Check if mobile
  const isMobile = isMobileDevice();
  
  // Check if in survival mode
  const isSurvivalMode = gameMode === GameMode.Survival || gameMode === GameMode.CoopSurvival;

  return (
    <div className="absolute inset-0 pointer-events-none p-2 sm:p-4 z-20">
      
      {/* Top Center: Health & Armor - Reduced size */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 sm:top-4 flex flex-col gap-1.5 sm:gap-2 pointer-events-auto origin-top scale-[0.35] sm:scale-[0.4] md:scale-50">
        <div className="bg-slate-900/90 p-3 sm:p-4 rounded-xl border-2 border-slate-700 flex items-center gap-2 sm:gap-3 w-64 sm:w-80 backdrop-blur-md shadow-2xl">
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
            <div className="bg-slate-900/90 p-2.5 sm:p-3 rounded-xl border-2 border-slate-700 flex items-center gap-2 sm:gap-3 w-64 sm:w-80 backdrop-blur-md shadow-2xl">
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
          <div className="flex flex-col gap-1">
            {/* Weapon Name */}
            <div className="text-[10px] sm:text-xs font-bold uppercase tracking-wider" style={{ color: getWeaponColor(weapon) }}>
              {weapon}
            </div>
            <div className="flex items-center gap-2">
              {/* Weapon Icon */}
              <div className="flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8">
                <Crosshair className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: getWeaponColor(weapon) }} />
              </div>
              {/* Ammo Count with Reserve */}
              <div className="flex flex-col items-start">
                <span
                  className={`text-base sm:text-xl font-mono font-bold leading-none tabular-nums drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] ${
                    ammo === 0 ? 'text-red-500 animate-pulse' : totalAmmo === 0 ? 'text-yellow-500' : 'text-white'
                  }`}
                >
                  {ammo} <span className="text-xs text-slate-400">/ {totalAmmo}</span>
                </span>
                {ammo === 0 && totalAmmo > 0 && (
                  <div className="text-[8px] sm:text-[9px] text-red-400 font-bold animate-pulse uppercase tracking-wide">
                    RELOAD!
                  </div>
                )}
                {ammo === 0 && totalAmmo === 0 && (
                  <div className="text-[8px] sm:text-[9px] text-yellow-400 font-bold animate-pulse uppercase tracking-wide">
                    NO AMMO!
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Weapon Switch Button - Beside Ammo */}
        {isMobile && onWeaponSwitch && (
          <button
            onClick={onWeaponSwitch}
            className="p-2 sm:p-3 rounded-lg backdrop-blur-md shadow-xl flex items-center justify-center active:scale-95 transition-all duration-200 border-2 bg-slate-800/90 border-amber-500 hover:bg-slate-700 hover:shadow-amber-500/50"
            style={{ touchAction: 'manipulation' }}
            aria-label="Switch weapon"
            title="Switch weapon"
          >
            <RefreshCw className="w-4 h-4 sm:w-6 sm:h-6 text-amber-400" />
            {inventory && inventory.length > 1 && (
              <span className="absolute -top-1 -right-1 bg-amber-500 text-slate-900 text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{inventory.length}</span>
            )}
          </button>
        )}

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

      {/* Center Bottom: Wave Info for Survival Mode - Compact */}
      {isSurvivalMode && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-auto scale-[0.375] sm:scale-[0.45] md:scale-50 flex gap-2">
          {/* Wave Counter */}
          <div className="px-3 py-1.5 rounded-lg backdrop-blur-md text-center transition-all duration-300 bg-purple-900/90 border-2 border-purple-400 shadow-[0_0_25px_rgba(168,85,247,0.7)]">
            <div className="text-[7px] sm:text-[9px] uppercase font-black tracking-wider leading-tight text-purple-200">
              Wave
            </div>
            <div className="text-sm sm:text-lg font-mono font-bold tabular-nums leading-none text-white">
              {currentWave}
            </div>
          </div>
          
          {/* Zombies Remaining or Prep Time */}
          {prepTimeRemaining > 0 ? (
            <div className="px-3 py-1.5 rounded-lg backdrop-blur-md text-center transition-all duration-300 bg-green-900/90 border-2 border-green-400 shadow-[0_0_25px_rgba(34,197,94,0.7)] animate-pulse">
              <div className="text-[7px] sm:text-[9px] uppercase font-black tracking-wider leading-tight text-green-200">
                Next Wave
              </div>
              <div className="text-sm sm:text-lg font-mono font-bold tabular-nums leading-none text-white">
                {prepSeconds}s
              </div>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-lg backdrop-blur-md text-center transition-all duration-300 bg-red-900/90 border-2 border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.7)]">
              <div className="text-[7px] sm:text-[9px] uppercase font-black tracking-wider leading-tight text-red-200 flex items-center justify-center gap-1">
                <Skull className="w-2 h-2" /> Zombies
              </div>
              <div className="text-sm sm:text-lg font-mono font-bold tabular-nums leading-none text-white">
                {zombiesRemaining}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Exit to Menu Button */}
      {onExitGame && (
        <button
          onClick={onExitGame}
          className="absolute top-2 left-2 px-2 py-1 bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold rounded transition-all shadow-md pointer-events-auto"
        >
          ✕
        </button>
      )}

    </div>
  );
};
