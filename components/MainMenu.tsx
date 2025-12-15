import React, { useState } from 'react';
import { Play, Users, Settings, Trophy, Copy, ArrowRight, Loader2 } from 'lucide-react';

interface MainMenuProps {
  onStart: () => void;
  onMultiplayerStart: (isHost: boolean, friendId?: string) => Promise<void>;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStart, onMultiplayerStart }) => {
  const [view, setView] = useState<'main' | 'multiplayer'>('main');
  const [hostId, setHostId] = useState<string>('');
  const [joinId, setJoinId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleHost = async () => {
    setLoading(true);
    setError(null);
    try {
       await onMultiplayerStart(true);
    } catch (e) {
      setError('Failed to start host');
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinId) return;
    setLoading(true);
    setError(null);
    try {
      await onMultiplayerStart(false, joinId);
    } catch (e) {
      setError('Failed to join');
      setLoading(false);
    }
  };

  if (view === 'multiplayer') {
    return (
        <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-6 z-50">
             <div className="max-w-md w-full space-y-6 bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
                <h2 className="text-3xl font-bold text-white text-center mb-8">Friend Duel</h2>
                
                {/* Host Section */}
                <div className="space-y-2">
                    <p className="text-slate-400 text-sm uppercase tracking-wider font-bold">Host a Game</p>
                    <button 
                        onClick={handleHost}
                        disabled={loading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Play size={20} />}
                        <span>Create Lobby</span>
                    </button>
                </div>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-600"></div>
                    <span className="flex-shrink mx-4 text-slate-500 text-sm">OR</span>
                    <div className="flex-grow border-t border-slate-600"></div>
                </div>

                {/* Join Section */}
                <div className="space-y-2">
                     <p className="text-slate-400 text-sm uppercase tracking-wider font-bold">Join Friend</p>
                     <div className="flex gap-2">
                         <input 
                            type="text" 
                            placeholder="Enter Friend's ID"
                            value={joinId}
                            onChange={(e) => setJoinId(e.target.value)}
                            className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 text-white focus:outline-none focus:border-emerald-500"
                         />
                         <button 
                            onClick={handleJoin}
                            disabled={loading || !joinId}
                            className="bg-sky-600 hover:bg-sky-500 text-white px-6 rounded-xl font-bold disabled:opacity-50"
                         >
                            Join
                         </button>
                     </div>
                </div>

                {error && <p className="text-red-400 text-center text-sm">{error}</p>}

                <button onClick={() => setView('main')} className="w-full text-slate-500 hover:text-white py-4">Back</button>
             </div>
        </div>
    );
  }

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
                className="w-full group relative overflow-hidden bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold py-6 rounded-xl shadow-lg transform transition active:scale-95 hover:brightness-110"
            >
                <div className="flex items-center justify-center gap-3 text-2xl uppercase tracking-wider">
                    <Play className="fill-white" />
                    <span>Battle Now</span>
                </div>
                {/* Shine effect */}
                <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
            </button>

            <button 
                onClick={() => setView('multiplayer')}
                className="w-full bg-slate-800 text-slate-300 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-700 hover:text-white transition"
            >
                <Users size={20} />
                <span>Friend Duel</span>
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
            v1.1.0 - Multiplayer Update
        </div>
      </div>
    </div>
  );
};
