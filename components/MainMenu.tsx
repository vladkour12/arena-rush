import React, { useState, useEffect, useCallback } from 'react';
import { Play, Users, Settings, Trophy, Copy, ArrowRight, Loader2, QrCode, X, Maximize2 } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
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

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    let timeoutId: any = null;

    if (showScanner) {
        // Delay initialization to ensure the DOM element "reader" is mounted
        timeoutId = setTimeout(() => {
            try {
                scanner = new Html5QrcodeScanner(
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
                        } else {
                            // Maybe raw ID?
                            setJoinId(decodedText);
                        }
                    } catch {
                        // Not a URL, treat as raw ID
                        setJoinId(decodedText);
                    }
                    setShowScanner(false); // Close immediately on success
                }, (error) => {
                    // ignore scan error, keeps scanning
                });
            } catch (err) {
                console.error("Failed to initialize scanner", err);
            }
        }, 100);
    }

    return () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (scanner) {
            try {
                scanner.clear().catch(err => console.error("Failed to clear scanner", err));
            } catch (e) {
                // ignore
            }
        }
    };
  }, [showScanner]);

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
          <div className="absolute inset-0 bg-black/95 flex flex-col items-center justify-center z-[60] p-4">
              <div className="bg-white p-4 rounded-xl w-full max-w-sm relative">
                  <button 
                    onClick={() => setShowScanner(false)}
                    className="absolute top-2 right-2 p-2 bg-slate-100 rounded-full hover:bg-slate-200 z-10"
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
                            className="bg-sky-600 hover:bg-sky-500 text-white px-6 rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-sky-600/50 hover:scale-105 active:scale-95"
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
    <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-2 sm:p-6 z-50 overflow-auto">
      <div className="max-w-md w-full space-y-2 sm:space-y-4 my-auto">
        <div className="text-center space-y-1 sm:space-y-2">
            <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 italic tracking-tighter drop-shadow-[0_0_30px_rgba(251,191,36,0.5)] animate-pulse">
                ARENA RUSH
            </h1>
            <p className="text-transparent bg-clip-text bg-gradient-to-r from-slate-300 to-slate-500 text-xs sm:text-lg tracking-[0.15em] sm:tracking-[0.25em] uppercase font-bold">Loot & Shoot</p>
            <div className="flex justify-center gap-2 text-yellow-500 animate-bounce py-1">
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-yellow-500 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.8)]"></div>
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-orange-500 rounded-full shadow-[0_0_10px_rgba(249,115,22,0.8)] animation-delay-75"></div>
              <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.8)] animation-delay-150"></div>
            </div>
        </div>

        <div className="space-y-2 sm:space-y-3 pt-2 sm:pt-4">
            <button 
                onClick={() => {
                  playButtonSound();
                  stopMenuMusic();
                  onStart();
                }}
                className="w-full group relative overflow-hidden bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 text-white font-bold py-3 sm:py-5 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.5)] transform transition-all duration-200 active:scale-95 hover:shadow-[0_0_50px_rgba(16,185,129,0.8)] hover:scale-[1.02] border-2 border-emerald-400 hover:border-emerald-300"
            >
                <div className="flex items-center justify-center gap-2 text-base sm:text-xl uppercase tracking-wider">
                    <Play className="fill-white animate-pulse group-hover:scale-110 transition-transform" size={20} />
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
                className="w-full group relative overflow-hidden bg-gradient-to-r from-slate-800 to-slate-700 text-slate-300 font-bold py-2 sm:py-3 rounded-xl flex items-center justify-center gap-2 hover:from-slate-700 hover:to-slate-600 hover:text-white transition-all duration-200 hover:shadow-[0_0_20px_rgba(100,116,139,0.5)] border border-slate-600 hover:border-slate-500 active:scale-95"
            >
                <Users size={18} className="group-hover:scale-110 transition-transform" />
                <span className="text-xs sm:text-sm group-hover:tracking-wider transition-all">Friend Duel</span>
                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-4" />
            </button>
        </div>

        <div className="flex justify-center gap-2 pt-2 sm:pt-3">
             <button 
               onClick={() => {
                 playButtonSound();
                 window.dispatchEvent(new CustomEvent('showStats'));
               }}
               className="group p-2 sm:p-3 bg-slate-800 rounded-full text-slate-400 hover:text-white hover:bg-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-slate-700/50 active:scale-90 hover:scale-105 border border-slate-700 hover:border-slate-600"
               title="Your Stats"
             >
                <Settings size={16} className="group-hover:rotate-90 transition-transform duration-300" />
             </button>
             <button 
               onClick={() => {
                 playButtonSound();
                 window.dispatchEvent(new CustomEvent('showLeaderboard'));
               }}
               className="group p-2 sm:p-3 bg-slate-800 rounded-full text-slate-400 hover:text-yellow-400 hover:bg-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-yellow-600/50 active:scale-90 hover:scale-105 border border-slate-700 hover:border-yellow-600"
               title="Leaderboard"
             >
                <Trophy size={16} className="group-hover:scale-110 transition-transform" />
             </button>
             {canFullscreen && (
               <button 
                 onClick={() => {
                   playButtonSound();
                   toggleFullscreen();
                 }}
                 className="group p-2 sm:p-3 bg-slate-800 rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-700 transition-all duration-200 hover:shadow-lg hover:shadow-emerald-600/50 active:scale-90 hover:scale-105 border border-slate-700 hover:border-emerald-600"
                 title="Toggle Fullscreen"
               >
                  <Maximize2 size={16} className="group-hover:scale-110 transition-transform" />
               </button>
             )}
        </div>
        
        <div className="text-center text-slate-600 text-[9px] sm:text-xs mt-2 sm:mt-4">
            v1.3.0 - Survival Update
        </div>
      </div>
    </div>
  );
};
