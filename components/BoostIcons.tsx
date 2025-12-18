import React from 'react';
import { Zap, Shield as ShieldIcon, Swords, Wind } from 'lucide-react';

interface BoostIconsProps {
  speedBoostTimeLeft?: number; // milliseconds remaining
  damageBoostTimeLeft?: number; // milliseconds remaining
  invincibilityTimeLeft?: number; // milliseconds remaining
  sprintCooldown?: number; // milliseconds remaining
  dashCooldown?: number; // milliseconds remaining
}

export const BoostIcons: React.FC<BoostIconsProps> = ({
  speedBoostTimeLeft = 0,
  damageBoostTimeLeft = 0,
  invincibilityTimeLeft = 0,
  sprintCooldown = 0,
  dashCooldown = 0
}) => {
  const hasActiveBoosts = speedBoostTimeLeft > 0 || damageBoostTimeLeft > 0 || invincibilityTimeLeft > 0;
  const hasCooldowns = sprintCooldown > 0 || dashCooldown > 0;
  
  if (!hasActiveBoosts && !hasCooldowns) {
    return null; // Don't render if no boosts or cooldowns
  }

  return (
    <div className="absolute top-[11rem] right-2 sm:top-[12rem] sm:right-4 flex flex-col gap-1.5 pointer-events-none origin-top-right scale-[0.375] sm:scale-[0.45] md:scale-50 z-20">
      {/* Active Boosts */}
      {speedBoostTimeLeft > 0 && (
        <BoostIcon
          icon={<Wind className="w-5 h-5 sm:w-6 sm:h-6" />}
          color="from-cyan-500 to-blue-600"
          borderColor="border-cyan-400"
          glowColor="shadow-cyan-500/60"
          timeLeft={speedBoostTimeLeft}
          label="SPEED"
        />
      )}
      
      {damageBoostTimeLeft > 0 && (
        <BoostIcon
          icon={<Swords className="w-5 h-5 sm:w-6 sm:h-6" />}
          color="from-red-500 to-orange-600"
          borderColor="border-red-400"
          glowColor="shadow-red-500/60"
          timeLeft={damageBoostTimeLeft}
          label="POWER"
        />
      )}
      
      {invincibilityTimeLeft > 0 && (
        <BoostIcon
          icon={<ShieldIcon className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />}
          color="from-yellow-400 to-amber-600"
          borderColor="border-yellow-300"
          glowColor="shadow-yellow-500/60"
          timeLeft={invincibilityTimeLeft}
          label="SHIELD"
        />
      )}
      
      {/* Cooldown Indicators */}
      {sprintCooldown > 0 && (
        <CooldownIcon
          icon={<Zap className="w-4 h-4 sm:w-5 sm:h-5" />}
          timeLeft={sprintCooldown}
          label="SPRINT"
        />
      )}
      
      {dashCooldown > 0 && (
        <CooldownIcon
          icon={
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M13.5 2L3 14h8l-1.5 8L20 10h-8l1.5-8z"/>
            </svg>
          }
          timeLeft={dashCooldown}
          label="DASH"
        />
      )}
    </div>
  );
};

interface BoostIconProps {
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  glowColor: string;
  timeLeft: number;
  label: string;
}

const BoostIcon: React.FC<BoostIconProps> = ({
  icon,
  color,
  borderColor,
  glowColor,
  timeLeft,
  label
}) => {
  const seconds = Math.ceil(timeLeft / 1000);
  
  // Calculate progress based on max boost duration (estimate 10 seconds for most boosts)
  // This will show decreasing bar as time counts down
  const maxDuration = 10000; // 10 seconds as typical max
  const progress = Math.max(0, Math.min(100, (timeLeft / maxDuration) * 100));
  
  return (
    <div className={`relative bg-gradient-to-br ${color} p-2 sm:p-2.5 rounded-lg border-2 ${borderColor} backdrop-blur-md shadow-xl ${glowColor} animate-pulse`}>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <div className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {icon}
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[7px] sm:text-[8px] font-black text-white/90 uppercase tracking-wide leading-none">
            {label}
          </span>
          <span className="text-xs sm:text-sm font-bold text-white font-mono leading-none">
            {seconds}s
          </span>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 sm:h-1 bg-black/30 overflow-hidden rounded-b-lg">
        <div 
          className="h-full bg-white/60 transition-all duration-100"
          style={{ 
            width: `${progress}%` 
          }}
        />
      </div>
    </div>
  );
};

interface CooldownIconProps {
  icon: React.ReactNode;
  timeLeft: number;
  label: string;
}

const CooldownIcon: React.FC<CooldownIconProps> = ({
  icon,
  timeLeft,
  label
}) => {
  const seconds = Math.ceil(timeLeft / 1000);
  const progress = Math.min(100, (timeLeft / 5000) * 100); // Assuming max 5s cooldown
  
  return (
    <div className="relative bg-slate-800/80 p-1.5 sm:p-2 rounded-lg border border-slate-600 backdrop-blur-md shadow-lg">
      <div className="flex items-center gap-1 sm:gap-1.5">
        <div className="text-slate-400 opacity-50">
          {icon}
        </div>
        <div className="flex flex-col items-start">
          <span className="text-[6px] sm:text-[7px] font-bold text-slate-500 uppercase tracking-wide leading-none">
            {label}
          </span>
          <span className="text-[10px] sm:text-xs font-bold text-slate-400 font-mono leading-none">
            {seconds}s
          </span>
        </div>
      </div>
      
      {/* Cooldown progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-700 overflow-hidden rounded-b-lg">
        <div 
          className="h-full bg-slate-500 transition-all duration-100"
          style={{ 
            width: `${100 - progress}%` 
          }}
        />
      </div>
    </div>
  );
};
