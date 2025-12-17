import React from 'react';
import { User, Users, Skull, ArrowLeft, Target, Zap } from 'lucide-react';
import { GameMode } from '../types';
import { playButtonSound } from '../utils/sounds';

interface ModeSelectProps {
  onSelectMode: (mode: GameMode) => void;
  onBack: () => void;
}

export const ModeSelect: React.FC<ModeSelectProps> = ({ onSelectMode, onBack }) => {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 z-50">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header Sign */}
        <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 p-4 rounded-xl shadow-lg">
          <div className="flex items-center justify-center gap-3">
            <Target className="w-7 h-7 text-white" />
            <h2 className="text-3xl font-black text-white uppercase tracking-wide">Select Mode</h2>
            <Target className="w-7 h-7 text-white" />
          </div>
          <p className="text-purple-100 text-sm mt-1 text-center font-semibold">
            Choose your battle style
          </p>
        </div>

        {/* Mode Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* PvP Mode */}
          <ModeCard
            icon={<Users className="w-12 h-12" />}
            title="PvP Duel"
            description="Classic 1v1 battle against another player"
            gradient="from-emerald-600 via-green-500 to-emerald-600"
            borderColor="border-emerald-400"
            glowColor="hover:shadow-emerald-500/50"
            features={['Battle royal', 'Shrinking zone', 'Real-time combat']}
            onClick={() => {
              playButtonSound();
              onSelectMode(GameMode.PvP);
            }}
          />

          {/* Survival Mode */}
          <ModeCard
            icon={<Skull className="w-12 h-12" />}
            title="Survival"
            description="Fight waves of zombies alone"
            gradient="from-red-600 via-orange-500 to-red-600"
            borderColor="border-red-400"
            glowColor="hover:shadow-red-500/50"
            features={['Endless waves', 'Increasing difficulty', 'More loot per wave']}
            onClick={() => {
              playButtonSound();
              onSelectMode(GameMode.Survival);
            }}
            badge="NEW"
            badgeColor="bg-yellow-500"
          />

          {/* Co-op Survival Mode */}
          <ModeCard
            icon={
              <div className="relative">
                <Users className="w-12 h-12" />
                <Skull className="w-6 h-6 absolute -top-1 -right-1" />
              </div>
            }
            title="Co-op"
            description="Team up to survive zombie hordes"
            gradient="from-blue-600 via-sky-500 to-blue-600"
            borderColor="border-blue-400"
            glowColor="hover:shadow-blue-500/50"
            features={['2 players', 'Shared objectives', 'Teamwork required']}
            onClick={() => {
              playButtonSound();
              onSelectMode(GameMode.CoopSurvival);
            }}
            badge="NEW"
            badgeColor="bg-cyan-500"
          />
        </div>

        {/* Back Button */}
        <button
          onClick={() => {
            playButtonSound();
            onBack();
          }}
          className="w-full py-4 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span>Back to Menu</span>
        </button>
      </div>
    </div>
  );
};

interface ModeCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  borderColor: string;
  glowColor: string;
  features: string[];
  onClick: () => void;
  badge?: string;
  badgeColor?: string;
}

const ModeCard: React.FC<ModeCardProps> = ({
  icon,
  title,
  description,
  gradient,
  borderColor,
  glowColor,
  features,
  onClick,
  badge,
  badgeColor
}) => {
  return (
    <button
      onClick={onClick}
      className={`group relative bg-slate-800 p-6 rounded-2xl border-2 ${borderColor} transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-2xl ${glowColor} text-left`}
    >
      {/* Badge */}
      {badge && (
        <div className={`absolute top-3 right-3 ${badgeColor} text-white text-xs font-black px-2 py-1 rounded-full animate-pulse`}>
          {badge}
        </div>
      )}

      {/* Icon with gradient background */}
      <div className={`mb-4 bg-gradient-to-br ${gradient} w-16 h-16 rounded-xl flex items-center justify-center text-white shadow-lg group-hover:scale-110 transition-transform`}>
        {icon}
      </div>

      {/* Title */}
      <h3 className="text-2xl font-black text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 transition-all">
        {title}
      </h3>

      {/* Description */}
      <p className="text-slate-400 text-sm mb-4">
        {description}
      </p>

      {/* Features */}
      <ul className="space-y-2">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-2 text-xs text-slate-500">
            <Zap className="w-3 h-3 text-emerald-400 flex-shrink-0 mt-0.5" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      {/* Hover effect overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-10 rounded-2xl transition-opacity pointer-events-none`} />
    </button>
  );
};
