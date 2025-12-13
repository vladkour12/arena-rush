import React from 'react';
import { Play, Users, Settings, Trophy } from 'lucide-react';

interface MainMenuProps {
  onStart: () => void;
  onStartIntent?: () => void;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStart, onStartIntent }) => {
  return (
    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 z-50">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-600 italic tracking-tighter drop-shadow-lg">
                ARENA RUSH
            </h1>
            <p className="text-slate-400 text-lg tracking-widest uppercase">Loot & Shoot</p>
        </div>

        <div className="space-y-4 pt-8">
            <button 
                onClick={onStart}
                onPointerEnter={onStartIntent}
                onFocus={onStartIntent}
                className="w-full group relative overflow-hidden bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-6 rounded-xl shadow-lg transform transition active:scale-95 hover:brightness-110"
            >
                <div className="flex items-center justify-center gap-3 text-2xl uppercase tracking-wider">
                    <Play className="fill-white" />
                    <span>Battle Now</span>
                </div>
                {/* Shine effect */}
                <div className="absolute top-0 -inset-full h-full w-1/2 z-10 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
            </button>

            <button className="w-full bg-slate-800 text-slate-300 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-700 transition opacity-50 cursor-not-allowed">
                <Users size={20} />
                <span>Friend Duel (Coming Soon)</span>
            </button>
        </div>

        <div className="flex justify-center gap-4 pt-4">
             <button className="p-4 bg-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <Settings size={24} />
             </button>
             <button className="p-4 bg-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <Trophy size={24} />
             </button>
        </div>
        
        <div className="text-center text-slate-600 text-xs mt-12">
            v1.0.0 - Alpha Build
        </div>
      </div>
    </div>
  );
};
