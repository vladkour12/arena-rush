import React, { useState, useEffect } from 'react';
import { Play, Users, Settings, Trophy, Copy, ArrowRight, Loader2, QrCode, X } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface MainMenuProps {
  onStart: () => void;
  onMultiplayerStart: (isHost: boolean, friendId?: string) => Promise<void>;
  initialJoinId?: string;
}

export const MainMenu: React.FC<MainMenuProps> = ({ onStart, onMultiplayerStart, initialJoinId }) => {
  const [view, setView] = useState<'main' | 'multiplayer'>('main');
  const [hostId, setHostId] = useState<string>('');
  const [joinId, setJoinId] = useState<string>(initialJoinId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);

  // Auto-join if ID is present
  useEffect(() => {
      if (initialJoinId) {
          handleJoin();
      }
  }, []);

  useEffect(() => {
    if (showScanner) {
        const scanner = new Html5QrcodeScanner(
            "reader",
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        scanner.render((decodedText) => {
            // Check if it's a URL with ?join=
            try {
                const url = new URL(decodedText);
                const id = url.searchParams.get('join');
                if (id) {
                    setJoinId(id);
                    scanner.clear();
                    setShowScanner(false);
                } else {
                    // Maybe raw ID?
                    setJoinId(decodedText);
                    scanner.clear();
                    setShowScanner(false);
                }
            } catch {
                // Not a URL, treat as raw ID
                setJoinId(decodedText);
                scanner.clear();
                setShowScanner(false);
            }
        }, (error) => {
            // ignore scan error, keeps scanning
        });

        return () => {
            scanner.clear().catch(err => console.error("Failed to clear scanner", err));
        };
    }
  }, [showScanner]);

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

  if (showScanner) {
      return (
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-[60] p-4">
              <div className="bg-white p-4 rounded-xl w-full max-w-sm relative">
                  <button 
                    onClick={() => setShowScanner(false)}
                    className="absolute top-2 right-2 p-2 bg-slate-100 rounded-full hover:bg-slate-200"
                  >
                      <X className="text-black w-6 h-6" />
                  </button>
                  <h3 className="text-center text-black font-bold mb-4">Scan QR Code</h3>
                  <div id="reader" className="overflow-hidden rounded-lg"></div>
              </div>
          </div>
      );
  }

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
                         <div className="relative flex-1">
                             <input 
                                type="text" 
                                placeholder="Enter Friend's ID"
                                value={joinId}
                                onChange={(e) => setJoinId(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-xl pl-4 pr-10 py-3 text-white focus:outline-none focus:border-emerald-500"
                             />
                             <button 
                                onClick={() => setShowScanner(true)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 transition-colors"
                                title="Scan QR Code"
                             >
                                 <QrCode size={20} />
                             </button>
                         </div>
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
