import React, { useState } from 'react';
import { PlayerProfile } from '../types';
import { Trophy, Target, Skull, Shield, Clock, Package, Bot, Users } from 'lucide-react';
import { calculateWinRate, formatPlayTime } from '../utils/playerData';

interface StatsPanelProps {
  profile: PlayerProfile;
  onClose: () => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ profile, onClose }) => {
  const [activeTab, setActiveTab] = useState<'all' | 'bot' | 'pvp'>('all');
  
  const stats = activeTab === 'bot' ? profile.botStats : activeTab === 'pvp' ? profile.pvpStats : profile.stats;
  const winRate = calculateWinRate(stats.wins, stats.gamesPlayed).toFixed(1);
  const kd = stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);
  const avgDamage = stats.gamesPlayed > 0 ? Math.round(stats.damageDealt / stats.gamesPlayed) : 0;
  const playTime = formatPlayTime(stats.playTime);

  const statItems = [
    { icon: Trophy, label: 'Wins', value: stats.wins, color: 'text-yellow-400' },
    { icon: Target, label: 'Kills', value: stats.kills, color: 'text-red-400' },
    { icon: Skull, label: 'Deaths', value: stats.deaths, color: 'text-gray-400' },
    { icon: Shield, label: 'Win Rate', value: `${winRate}%`, color: 'text-emerald-400' },
    { icon: Target, label: 'K/D Ratio', value: kd, color: 'text-orange-400' },
    { icon: Package, label: 'Items Collected', value: stats.itemsCollected, color: 'text-blue-400' },
    { icon: Shield, label: 'Avg Damage', value: avgDamage, color: 'text-purple-400' },
    { icon: Clock, label: 'Play Time', value: playTime, color: 'text-cyan-400' }
  ];

  return (
    <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-700 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-600 p-6">
          <h2 className="text-3xl font-bold text-white mb-2">{profile.nickname}</h2>
          <p className="text-emerald-100">Player Statistics</p>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-slate-700 bg-slate-900">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'all'
                ? 'bg-slate-800 text-white border-b-2 border-emerald-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Trophy size={16} />
            Overall
          </button>
          <button
            onClick={() => setActiveTab('bot')}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'bot'
                ? 'bg-slate-800 text-white border-b-2 border-orange-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Bot size={16} />
            vs Bots
          </button>
          <button
            onClick={() => setActiveTab('pvp')}
            className={`flex-1 px-4 py-3 text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              activeTab === 'pvp'
                ? 'bg-slate-800 text-white border-b-2 border-sky-500'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Users size={16} />
            PvP
          </button>
        </div>
        
        {/* Stats Grid */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4">
          {statItems.map((item, idx) => (
            <div
              key={idx}
              className="bg-slate-900/50 p-4 rounded-xl border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 bg-slate-800 rounded-lg ${item.color}`}>
                  <item.icon size={20} />
                </div>
                <div className="flex-1">
                  <div className="text-slate-400 text-xs uppercase tracking-wider">{item.label}</div>
                  <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Games Played Summary */}
        <div className="px-6 pb-4">
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
            <div className="text-center">
              <div className="text-slate-400 text-sm uppercase tracking-wider mb-1">Total Games</div>
              <div className="text-3xl font-bold text-white">{stats.gamesPlayed}</div>
              <div className="text-sm text-slate-500 mt-2">
                {stats.wins} Wins • {stats.losses} Losses
              </div>
            </div>
          </div>
        </div>
        
        {/* Close Button */}
        <div className="p-6 pt-2">
          <button
            onClick={onClose}
            className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
