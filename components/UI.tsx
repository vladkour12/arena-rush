import React from 'react';
import { WeaponType } from '../types';
import { Heart, Shield, Crosshair } from 'lucide-react';
import { WEAPONS } from '../constants';

interface UIProps {
  hp: number;
  armor: number;
  ammo: number;
  weapon: WeaponType;
  timeLeft: number;
}

export const UI: React.FC<UIProps> = ({ hp, armor, ammo, weapon, timeLeft }) => {
  // Format time mm:ss
  const minutes = Math.floor(timeLeft / 60000);
  const seconds = Math.floor((timeLeft % 60000) / 1000);
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between z-20">
      
      {/* TOP ROW: Health, Timer, Weapon - All at top to clear thumbs */}
      <div className="flex justify-between items-start w-full">
        
        {/* Left: Health & Armor */}
        <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-700 flex items-center gap-2 w-48 backdrop-blur-md shadow-lg">
                <Heart className="text-rose-500 fill-rose-500 w-5 h-5 ml-1" />
                <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-rose-500 transition-all duration-300" 
                        style={{ width: `${Math.max(0, hp)}%` }}
                    />
                </div>
                <span className="text-xs font-bold w-8 text-right font-mono text-white">{hp}</span>
            </div>
            
            {armor > 0 && (
                <div className="bg-slate-900/80 p-1.5 rounded-lg border border-slate-700 flex items-center gap-2 w-40 backdrop-blur-md shadow-lg">
                    <Shield className="text-sky-500 fill-sky-500 w-4 h-4 ml-1" />
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-sky-500 transition-all duration-300" 
                            style={{ width: `${(armor/50)*100}%` }}
                        />
                    </div>
                    <span className="text-xs font-bold w-6 text-right font-mono text-white">{armor}</span>
                </div>
            )}
        </div>

        {/* Center: Timer */}
        <div className="bg-slate-900/80 px-4 py-1 rounded-b-xl border-b border-x border-red-500/50 backdrop-blur-md text-center shadow-[0_0_15px_rgba(239,68,68,0.4)]">
            <div className="text-[10px] text-red-300 uppercase font-black tracking-widest">Zone Shrink</div>
            <div className="text-xl font-mono font-bold text-white tabular-nums leading-none">{timeString}</div>
        </div>

        {/* Right: Weapon Info (Moved from bottom) */}
        <div className="flex items-start pointer-events-auto">
             <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-600 backdrop-blur-md shadow-xl flex items-center gap-3">
                <div className="flex flex-col items-end">
                    <span className="text-sm font-black italic tracking-wider uppercase text-slate-400 leading-none mb-1">{weapon}</span>
                    <span className={`text-2xl font-mono font-bold leading-none ${ammo === 0 ? 'text-red-500 animate-pulse' : 'text-emerald-400'}`}>
                        {ammo} <span className="text-slate-600 text-lg">/ ∞</span>
                    </span>
                </div>
                <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-800 rounded-lg flex items-center justify-center border border-slate-600 shadow-inner">
                   <Crosshair className="w-6 h-6 text-white/80" />
                </div>
            </div>
        </div>

      </div>

      {/* Bottom area is now clear for Joysticks */}
    </div>
  );
};
