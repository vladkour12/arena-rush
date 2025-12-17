import React, { useState, useEffect, useCallback } from 'react';
import { Play, Users, Settings, Trophy, Copy, ArrowRight, Loader2, QrCode, X, Maximize2 } from 'lucide-react';
import { QRScanner } from './QRScanner';
import { initAudio, startMenuMusic, stopMenuMusic, playButtonSound } from '../utils/sounds';

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
  const [canFullscreen, setCanFullscreen] = useState(false);

  // Check fullscreen support
  useEffect(() => {
    const checkFullscreenSupport = () => {
      setCanFullscreen(Boolean(
        document.fullscreenEnabled ||
        (document as any).webkitFullscreenEnabled ||
        (document as any).mozFullScreenEnabled ||
        (document as any).msFullscreenEnabled
      ));
    };
    checkFullscreenSupport();
  }, []);

  // Start menu music on mount, stop on unmount
  useEffect(() => {
    // Initialize audio and start music
    initAudio();
    startMenuMusic();
    
    return () => {
      stopMenuMusic();
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          try {
            await elem.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
          } catch {
            // Fallback without options if not supported
            await elem.requestFullscreen();
          }
        } else if ((elem as any).webkitRequestFullscreen) {
          await (elem as any).webkitRequestFullscreen();
        } else if ((elem as any).mozRequestFullScreen) {
          await (elem as any).mozRequestFullScreen();
        } else if ((elem as any).msRequestFullscreen) {
          await (elem as any).msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Auto-join if ID is present
  useEffect(() => {
      if (initialJoinId) {
          handleJoin();
      }
  }, []);

  const handleScanSuccess = (decodedId: string) => {
    setJoinId(decodedId);
    setShowScanner(false);
  };

  const handleHost = async () => {
    playButtonSound();
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
    playButtonSound();
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
          <QRScanner 
            onScanSuccess={handleScanSuccess}
            onClose={() => setShowScanner(false)}
          />
      );
  }

  if (view === 'multiplayer') {
    return (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 z-50">
             <div className="max-w-md w-full space-y-6 bg-slate-800 p-8 rounded-2xl shadow-2xl border-2 border-slate-700/50">
                {/* Visual Sign/Banner */}
                <div className="bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 p-4 rounded-xl shadow-lg -mt-2">
                  <div className="flex items-center justify-center gap-3">
                    <Users className="w-7 h-7 text-white" />
                    <h2 className="text-2xl font-black text-white uppercase tracking-wide">Friend Duel</h2>
                  </div>
                  <p className="text-purple-100 text-xs mt-1 text-center font-semibold">Battle with your friend!</p>
                </div>
                
                {/* Host Section */}
                <div className="space-y-2">
                    <p className="text-slate-400 text-sm uppercase tracking-wider font-bold">Host a Game</p>
                    <button 
                        onClick={handleHost}
                        disabled={loading}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-emerald-600/50 hover:scale-[1.02] active:scale-95"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Play size={20} className="fill-white" />}
                        <span>Create Lobby</span>
                    </button>
                </div>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-600"></div>
                    <span className="flex-shrink mx-4 text-slate-500 text-sm">OR</span>
                    <div className="flex-grow border-t border-slate-600"></div>
                </div>

                {/* Join Section */}
                <div className="space-y-3">
                     <p className="text-slate-300 text-sm uppercase tracking-wider font-bold">Join Friend</p>
                     <div className="flex gap-2">
                         <div className="relative flex-1">
                             <input 
                                type="text" 
                                placeholder="Enter Friend's ID"
                                value={joinId}
                                onChange={(e) => setJoinId(e.target.value)}
                                className="w-full bg-slate-900 border-2 border-slate-600 rounded-xl pl-4 pr-12 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 transition-all"
                             />
                             <button 
                                onClick={() => {
                                  playButtonSound();
                                  setShowScanner(true);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 bg-sky-600/20 hover:bg-sky-600 text-sky-400 hover:text-white p-2 rounded-lg transition-all hover:scale-110 active:scale-95"
                                title="Scan QR Code"
                             >
                                 <QrCode size={20} />
                             </button>
                         </div>
                         <button 
                            onClick={handleJoin}
                            disabled={loading || !joinId}
                            className="bg-sky-600 hover:bg-sky-500 text-white px-8 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-sky-600/50 hover:scale-105 active:scale-95 flex items-center gap-2"
                         >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
                            <span>Join</span>
                         </button>
                     </div>
                     <p className="text-slate-500 text-xs text-center">
                       👆 Paste ID or tap <QrCode size={12} className="inline" /> to scan
                     </p>
                </div>

                {error && <p className="text-red-400 text-center text-sm">{error}</p>}

                <button onClick={() => setView('main')} className="w-full text-slate-500 hover:text-white py-4">Back</button>
             </div>
        </div>
    );
  }

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <div className="max-w-md w-full space-y-1.5 sm:space-y-3 my-auto py-2">
        <div className="text-center space-y-0.5 sm:space-y-1.5">
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 italic tracking-tighter drop-shadow-[0_0_30px_rgba(251,191,36,0.5)] animate-pulse">
                ARENA RUSH
            </h1>
            <p className="text-transparent bg-clip-text bg-gradient-to-r from-slate-300 to-slate-500 text-[10px] sm:text-base tracking-[0.15em] sm:tracking-[0.25em] uppercase font-bold">Loot & Shoot</p>
            <div className="flex justify-center gap-1.5 text-yellow-500 animate-bounce py-0.5 sm:py-1">
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-yellow-500 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.8)]"></div>
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)] animation-delay-75"></div>
              <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)] animation-delay-150"></div>
            </div>
        </div>

        <div className="space-y-1.5 sm:space-y-2.5 pt-1 sm:pt-3">
            <button 
                onClick={() => {
                  playButtonSound();
                  stopMenuMusic();
                  onStart();
                }}
                className="w-full group relative overflow-hidden bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 text-white font-bold py-2.5 sm:py-4 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.5)] transform transition-all duration-200 active:scale-95 hover:shadow-[0_0_50px_rgba(16,185,129,0.8)] hover:scale-[1.02] border-2 border-emerald-400 hover:border-emerald-300"
            >
                <div className="flex items-center justify-center gap-2 text-sm sm:text-lg uppercase tracking-wider">
                    <Play className="fill-white animate-pulse group-hover:scale-110 transition-transform" size={18} />
                    <span className="drop-shadow-lg group-hover:tracking-widest transition-all">Battle Now</span>
                </div>
                {/* Shine effect */}
                <div className="absolute top-0 -inset-full h-full w-1/2 z-5 block transform -skew-x-12 bg-gradient-to-r from-transparent to-white opacity-20 group-hover:animate-shine" />
                {/* Glow pulse */}
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-400 to-green-400 opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300" />
            </button>

            <button 
                onClick={() => {
                  playButtonSound();
                  setView('multiplayer');
                }}
                className="w-full group relative overflow-hidden bg-gradient-to-r from-slate-800 to-slate-700 text-slate-300 font-bold py-1.5 sm:py-2.5 rounded-xl flex items-center justify-center gap-2 hover:from-slate-700 hover:to-slate-600 hover:text-white transition-all duration-200 hover:shadow-[0_0_20px_rgba(100,116,139,0.5)] border border-slate-600 hover:border-slate-500 active:scale-95"
            >
                <Users size={16} className="group-hover:scale-110 transition-transform" />
                <span className="text-[11px] sm:text-sm group-hover:tracking-wider transition-all">Friend Duel</span>
                <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-3" />
            </button>
        </div>

        <div className="flex justify-center gap-1.5 pt-1.5 sm:pt-2.5">
             <button 
               onClick={() => {
                 playButtonSound();
                 window.dispatchEvent(new CustomEvent('showStats'));
               }}
               className="group p-1.5 sm:p-2.5 bg-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-slate-700/50 active:scale-90 hover:scale-105 border border-slate-700 hover:border-slate-600"
               title="Your Stats"
             >
                <Settings size={14} className="group-hover:rotate-90 transition-transform duration-300" />
             </button>
             <button 
               onClick={() => {
                 playButtonSound();
                 window.dispatchEvent(new CustomEvent('showLeaderboard'));
               }}
               className="group p-1.5 sm:p-2.5 bg-slate-800 rounded-full text-slate-400 hover:text-yellow-400 hover:bg-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-yellow-600/50 active:scale-90 hover:scale-105 border border-slate-700 hover:border-yellow-600"
               title="Leaderboard"
             >
                <Trophy size={14} className="group-hover:scale-110 transition-transform" />
             </button>
             {canFullscreen && (
               <button 
                 onClick={() => {
                   playButtonSound();
                   toggleFullscreen();
                 }}
                 className="group p-1.5 sm:p-2.5 bg-slate-800 rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-600/50 active:scale-90 hover:scale-105 border border-slate-700 hover:border-emerald-600"
                 title="Toggle Fullscreen"
               >
                  <Maximize2 size={14} className="group-hover:scale-110 transition-transform" />
               </button>
             )}
        </div>
        
        <div className="text-center text-slate-600 text-[8px] sm:text-xs mt-1 sm:mt-3">
            v1.3.0 - Survival Update
        </div>
      </div>
    </div>
  );
};
