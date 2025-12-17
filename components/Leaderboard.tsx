import React, { useState } from 'react';
import { LeaderboardEntry } from '../types';
import { Trophy, Target, TrendingUp, Users, Bot } from 'lucide-react';

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  botEntries: LeaderboardEntry[];
  pvpEntries: LeaderboardEntry[];
  currentPlayerNickname?: string;
  onClose: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ 
  entries,
  botEntries, 
  pvpEntries,
  currentPlayerNickname,
  onClose 
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'bot' | 'pvp'>('all');
  
  const displayEntries = activeTab === 'bot' ? botEntries : activeTab === 'pvp' ? pvpEntries : entries;
  const getMedalColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-400';
    if (rank === 2) return 'text-gray-300';
    if (rank === 3) return 'text-orange-600';
    return 'text-slate-500';
  };

  const getMedalBg = (rank: number) => {
    if (rank === 1) return 'bg-yellow-400/20';
    if (rank === 2) return 'bg-gray-300/20';
    if (rank === 3) return 'bg-orange-600/20';
    return 'bg-slate-700/20';
  };

  return (
    <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-700 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 p-6">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Trophy className="w-8 h-8 text-white" />
            <h2 className="text-3xl font-bold text-white">Leaderboard</h2>
          </div>
          <p className="text-yellow-100 text-center">Top Warriors of the Arena</p>
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
        
        {/* Leaderboard List */}
        <div className="flex-1 overflow-y-auto p-4">
          {displayEntries.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Trophy className="w-16 h-16 mx-auto mb-4 opacity-20" />
              <p>No players yet. Be the first to make history!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayEntries.map((entry, idx) => {
                const rank = idx + 1;
                const isCurrentPlayer = entry.nickname === currentPlayerNickname;
                
                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all ${
                      isCurrentPlayer
                        ? 'bg-emerald-900/30 border-emerald-600 shadow-lg shadow-emerald-600/20'
                        : 'bg-slate-900/50 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {/* Rank */}
                      <div className={`w-10 h-10 rounded-full ${getMedalBg(rank)} flex items-center justify-center flex-shrink-0`}>
                        {rank <= 3 ? (
                          <Trophy className={`w-5 h-5 ${getMedalColor(rank)}`} />
                        ) : (
                          <span className={`font-bold ${getMedalColor(rank)}`}>#{rank}</span>
                        )}
                      </div>
                      
                      {/* Player Info */}
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold truncate ${isCurrentPlayer ? 'text-emerald-400' : 'text-white'}`}>
                          {entry.nickname}
                          {isCurrentPlayer && <span className="ml-2 text-xs text-emerald-400">(You)</span>}
                        </div>
                        <div className="text-xs text-slate-400">
                          {entry.gamesPlayed} games played
                        </div>
                      </div>
                      
                      {/* Stats */}
                      <div className="flex gap-6 text-sm">
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-yellow-400">
                            <Trophy size={14} />
                            <span className="font-bold">{entry.wins}</span>
                          </div>
                          <div className="text-[10px] text-slate-500">WINS</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-red-400">
                            <Target size={14} />
                            <span className="font-bold">{entry.kills}</span>
                          </div>
                          <div className="text-[10px] text-slate-500">KILLS</div>
                        </div>
                        
                        <div className="text-center">
                          <div className="flex items-center gap-1 text-emerald-400">
                            <TrendingUp size={14} />
                            <span className="font-bold">{entry.winRate.toFixed(0)}%</span>
                          </div>
                          <div className="text-[10px] text-slate-500">WIN%</div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Close Button */}
        <div className="p-4 border-t border-slate-700">
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
