import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { UI } from './components/UI';
import { Joystick } from './components/Joystick';
import { MainMenu } from './components/MainMenu';
import { InputState, WeaponType, SkinType } from './types';
import { RefreshCw, Trophy, Smartphone, Zap, Copy, Loader2, QrCode } from 'lucide-react';
import { AIM_DEADZONE, AUTO_FIRE_THRESHOLD, MOVE_DEADZONE } from './constants';
import { NetworkManager } from './utils/network';
import { QRCodeSVG } from 'qrcode.react';

enum AppState {
  Menu,
  Lobby,
  Playing,
  GameOver
}

export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.Menu);
  const [winner, setWinner] = useState<'Player' | 'Bot' | null>(null);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Network State
  const networkRef = useRef<NetworkManager | null>(null);
  const [myId, setMyId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  
  // URL Join Logic
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const joinId = params.get('join');
    if (joinId && appState === AppState.Menu) {
        handleMultiplayerStart(false, joinId);
    }
  }, []);

  // Game Stats for UI
  const [stats, setStats] = useState({
    hp: 100,
    ammo: 8,
    weapon: WeaponType.Pistol,
    armor: 0,
    timeLeft: 0,
    sprintCooldown: 0
  });

  const [damageFlash, setDamageFlash] = useState(0);
  const lastHpRef = useRef(100);

  // Gyroscope/Tilt controls
  const [gyroEnabled, setGyroEnabled] = useState(false);
  const gyroCalibrationRef = useRef({ beta: 0, gamma: 0 });
  
  // Player skin selection
  const [playerSkin, setPlayerSkin] = useState<SkinType>(SkinType.Police);

  // Controls Reference (Mutable for performance, avoids re-renders)
  const inputRef = useRef<InputState>({
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 }, // Right stick vector (mobile)
    sprint: false,
    fire: false, // mouse click (desktop)
    pointer: { x: 0, y: 0 }, // screen pixels
    isPointerAiming: false
  });

  // Check orientation
  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', checkOrientation);
    checkOrientation();
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  // Gyroscope/Tilt controls for movement
  useEffect(() => {
    if (!gyroEnabled || appState !== AppState.Playing) return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;

      // beta: front-to-back tilt (-180 to 180)
      // gamma: left-to-right tilt (-90 to 90)
      const beta = event.beta - gyroCalibrationRef.current.beta;
      const gamma = event.gamma - gyroCalibrationRef.current.gamma;

      // Convert tilt to movement vector
      // Tilt forward (beta < 0) = move up (y < 0)
      // Tilt left (gamma < 0) = move left (x < 0)
      const sensitivity = 0.05; // Adjust sensitivity
      const tiltThreshold = 5; // Degrees of tilt to start moving
      
      let x = 0;
      let y = 0;

      if (Math.abs(gamma) > tiltThreshold) {
        x = Math.max(-1, Math.min(1, gamma * sensitivity));
      }
      if (Math.abs(beta) > tiltThreshold) {
        y = Math.max(-1, Math.min(1, beta * sensitivity));
      }

      // Only override joystick if tilt is significant
      if (Math.abs(x) > 0.1 || Math.abs(y) > 0.1) {
        inputRef.current.move = { x, y };
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [gyroEnabled, appState]);

  // Mobile browsers (esp. iOS) can report `innerHeight` including UI chrome.
  // This sets a CSS var based on the *visible* viewport so the game uses the real playable height.
  useEffect(() => {
    const setVhVar = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`);
    };

    setVhVar();
    window.addEventListener('resize', setVhVar);
    window.addEventListener('orientationchange', setVhVar);
    window.visualViewport?.addEventListener('resize', setVhVar);
    window.visualViewport?.addEventListener('scroll', setVhVar);

    return () => {
      window.removeEventListener('resize', setVhVar);
      window.removeEventListener('orientationchange', setVhVar);
      window.visualViewport?.removeEventListener('resize', setVhVar);
      window.visualViewport?.removeEventListener('scroll', setVhVar);
    };
  }, []);

  // Fullscreen support + state (Fullscreen API requires a user gesture to enter).
  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    const updateSupport = () => {
      const el = containerRef.current;
      setCanFullscreen(Boolean(el && (el as any).requestFullscreen && (document as any).fullscreenEnabled));
    };

    updateSupport();
    updateFullscreenState();
    document.addEventListener('fullscreenchange', updateFullscreenState);
    window.addEventListener('resize', updateSupport);

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState);
      window.removeEventListener('resize', updateSupport);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;

    try {
      if (!document.fullscreenElement) {
        await (el as any).requestFullscreen?.({ navigationUI: 'hide' });
        // Orientation lock is only allowed in fullscreen on many browsers.
        try {
          await (screen.orientation as any)?.lock?.('landscape');
        } catch {
          // ignore
        }
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore (unsupported browser / denied)
    }
  }, []);

  // Mobile-only: No desktop keyboard/mouse controls
  // Controls are handled entirely by on-screen joysticks and buttons

  const handleGameOver = useCallback((win: 'Player' | 'Bot') => {
    setWinner(win);
    setAppState(AppState.GameOver);
  }, []);

  const handleUpdateStats = useCallback((hp: number, ammo: number, weapon: WeaponType, armor: number, time: number, sprint: number) => {
      setStats({ hp, ammo, weapon, armor, timeLeft: time, sprintCooldown: sprint });
      
      // Trigger damage flash when HP decreases
      if (hp < lastHpRef.current) {
        setDamageFlash(1);
        setTimeout(() => setDamageFlash(0), 200); // DAMAGE_FLASH_DURATION from constants
      }
      lastHpRef.current = hp;
  }, []);

  const setSprint = (isSprinting: boolean) => {
    inputRef.current.sprint = isSprinting;
  };

  const handleMove = useCallback((vec: any) => {
    inputRef.current.move.x = vec.x;
    inputRef.current.move.y = vec.y;
  }, []);

  const handleAim = useCallback((vec: any) => {
    inputRef.current.aim.x = vec.x;
    inputRef.current.aim.y = vec.y;
    inputRef.current.isPointerAiming = false;
    inputRef.current.fire = false;
  }, []);

  const toggleGyroscope = useCallback(async () => {
    if (!gyroEnabled) {
      // Request permission on iOS 13+
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        try {
          const permission = await (DeviceOrientationEvent as any).requestPermission();
          if (permission === 'granted') {
            // Calibrate current position as center
            const calibrate = (event: DeviceOrientationEvent) => {
              if (event.beta !== null && event.gamma !== null) {
                gyroCalibrationRef.current = { beta: event.beta, gamma: event.gamma };
                setGyroEnabled(true);
                window.removeEventListener('deviceorientation', calibrate);
              }
            };
            window.addEventListener('deviceorientation', calibrate, { once: true });
          } else {
            alert('Gyroscope permission denied');
          }
        } catch (error) {
          console.error('Error requesting gyroscope permission:', error);
        }
      } else {
        // Non-iOS or older iOS - calibrate immediately
        const calibrate = (event: DeviceOrientationEvent) => {
          if (event.beta !== null && event.gamma !== null) {
            gyroCalibrationRef.current = { beta: event.beta, gamma: event.gamma };
            setGyroEnabled(true);
            window.removeEventListener('deviceorientation', calibrate);
          }
        };
        window.addEventListener('deviceorientation', calibrate, { once: true });
      }
    } else {
      setGyroEnabled(false);
    }
  }, [gyroEnabled]);

  const handleMultiplayerStart = useCallback(async (host: boolean, friendId?: string) => {
    if (networkRef.current) networkRef.current.destroy();
    
    const net = new NetworkManager();
    networkRef.current = net;
    setIsHost(host);

    net.onConnect = () => {
       console.log("Connected to peer!");
       setAppState(AppState.Playing);
    };

    net.onError = (err) => {
        alert("Connection Error: " + err);
        setAppState(AppState.Menu);
    };

    try {
        const id = await net.initialize();
        setMyId(id);
        
        if (host) {
            setAppState(AppState.Lobby);
        } else if (friendId) {
            net.connect(friendId);
            setAppState(AppState.Lobby); // Show "Connecting..."
        }
    } catch (e) {
        console.error(e);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full bg-green-500 overflow-hidden relative font-sans select-none touch-none"
      style={{
        height: 'calc(var(--vh, 1vh) * 100)',
        // Extra safety: browsers that support dvh will still respect the inline height above.
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)'
      }}
    >
      
      {isPortrait && appState === AppState.Playing && (
        <div className="absolute inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center text-white p-8 text-center backdrop-blur-sm">
          <Smartphone className="w-24 h-24 mb-6 animate-pulse rotate-90" />
          <h2 className="text-3xl font-bold mb-2">Rotate Your Device</h2>
          <p className="text-slate-400 text-lg mt-2">Please rotate your phone to landscape mode for the best experience</p>
        </div>
      )}

      {appState === AppState.Menu && (
        <MainMenu 
            onStart={() => {
                // Single Player
                if (networkRef.current) {
                    networkRef.current.destroy();
                    networkRef.current = null;
                }
                setAppState(AppState.Playing);
            }} 
            onMultiplayerStart={handleMultiplayerStart}
            initialJoinId={new URLSearchParams(window.location.search).get('join') || undefined}
        />
      )}

      {appState === AppState.Lobby && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center z-50 p-6">
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center space-y-6 border border-slate-700">
                  {isHost ? (
                      <>
                        <h2 className="text-2xl font-bold text-white">Waiting for Friend...</h2>
                        
                        <div className="bg-white p-4 rounded-xl shadow-lg mx-auto">
                            <QRCodeSVG value={`${window.location.origin}/?join=${myId}`} size={160} />
                        </div>

                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-600 flex items-center justify-between gap-4 w-full">
                            <code className="text-emerald-400 font-mono text-xl tracking-wider truncate">{myId}</code>
                            <button 
                                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?join=${myId}`)}
                                className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition"
                                title="Copy Link"
                            >
                                <Copy size={20} />
                            </button>
                        </div>
                        <p className="text-slate-400 text-sm">Scan or share link to join</p>
                        <div className="flex justify-center py-4">
                            <Loader2 className="animate-spin text-emerald-500 w-12 h-12" />
                        </div>
                      </>
                  ) : (
                      <>
                        <h2 className="text-2xl font-bold text-white">Connecting...</h2>
                         <div className="flex justify-center py-4">
                            <Loader2 className="animate-spin text-sky-500 w-12 h-12" />
                        </div>
                      </>
                  )}
                  <button 
                    onClick={() => {
                        if (networkRef.current) networkRef.current.destroy();
                        setAppState(AppState.Menu);
                    }}
                    className="text-slate-500 hover:text-white"
                  >
                    Cancel
                  </button>
              </div>
          </div>
      )}

      {appState === AppState.Playing && (
        <>
          {/* Damage Flash Overlay */}
          {damageFlash > 0 && (
            <div 
              className="absolute inset-0 pointer-events-none z-[15] transition-opacity duration-200"
              style={{
                backgroundColor: 'rgba(255, 0, 0, ' + (damageFlash * 0.3) + ')',
                opacity: damageFlash
              }}
            />
          )}
          
          <GameCanvas 
            onGameOver={handleGameOver}
            onUpdateStats={handleUpdateStats}
            inputRef={inputRef} // Pass the mutable ref
            network={networkRef.current} // Pass network manager
            isHost={isHost}
            playerSkin={playerSkin} // Pass selected skin
          />
          
          <UI
            {...stats}
            isFullscreen={isFullscreen}
            canFullscreen={canFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />

          {/* Controls Layer */}
          <div className="absolute inset-0 flex z-10 pointer-events-none">
            {/* Left: Move Joystick */}
            <div className="w-1/2 h-full relative pointer-events-auto">
                <Joystick 
                    onMove={handleMove}
                    color="bg-cyan-400" 
                    className="w-full h-full" 
                    deadzone={MOVE_DEADZONE}
                    responseCurve={1.1}
                    maxRadiusPx={50}
                />
                <div className="absolute bottom-4 sm:bottom-8 left-4 sm:left-8 text-white/10 text-xs sm:text-sm font-bold uppercase pointer-events-none">Move</div>
            </div>

            {/* Right: Aim/Fire Joystick */}
            <div className="w-1/2 h-full relative pointer-events-auto">
                <Joystick 
                    onMove={handleAim}
                    color="bg-red-500" 
                    className="w-full h-full"
                    threshold={AUTO_FIRE_THRESHOLD} // Visual ring for firing
                    deadzone={AIM_DEADZONE}
                    responseCurve={1.5}
                    maxRadiusPx={55}
                />
                <div className="absolute bottom-4 sm:bottom-8 right-4 sm:right-8 text-white/10 text-xs sm:text-sm font-bold uppercase pointer-events-none">Aim / Fire</div>
            </div>
          </div>

          {/* Control Buttons - Top Right */}
          <div className="absolute top-4 right-4 z-30 pointer-events-auto flex gap-2">
            {/* Skin Selection */}
            <button
              onClick={() => setPlayerSkin(playerSkin === SkinType.Police ? SkinType.Terrorist : SkinType.Police)}
              className="px-3 py-2 rounded-lg font-bold text-xs bg-slate-800/70 text-white hover:bg-slate-700/70 transition"
              title="Change Skin"
            >
              {playerSkin === SkinType.Police ? '👮 Police' : '🎭 Terrorist'}
            </button>
            
            {/* Gyroscope Toggle */}
            <button
              onClick={toggleGyroscope}
              className={`px-3 py-2 rounded-lg font-bold text-xs transition ${
                gyroEnabled 
                  ? 'bg-green-500 text-white' 
                  : 'bg-slate-800/70 text-slate-400'
              }`}
            >
              {gyroEnabled ? '📱 Tilt ON' : '📱 Tilt OFF'}
            </button>
          </div>

          {/* Sprint Button - Right Side (Smaller) */}
          <div className="absolute bottom-28 sm:bottom-36 right-4 sm:right-6 z-30 pointer-events-auto">
            <button 
                onTouchStart={() => setSprint(true)}
                onTouchEnd={() => setSprint(false)}
                onMouseDown={() => setSprint(true)}
                onMouseUp={() => setSprint(false)}
                onMouseLeave={() => setSprint(false)}
                disabled={stats.sprintCooldown > 0}
                className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  stats.sprintCooldown > 0 
                    ? 'bg-slate-700/60 cursor-not-allowed' 
                    : 'bg-slate-800/70'
                }`}
                style={{
                  boxShadow: stats.sprintCooldown > 0 
                    ? 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 2px rgba(100,116,139,0.4)' 
                    : 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 2px rgba(234,179,8,0.6), 0 0 15px rgba(234,179,8,0.3)'
                }}
            >
                {/* Inner circle */}
                <div className={`absolute inset-1.5 rounded-full flex items-center justify-center ${
                  stats.sprintCooldown > 0 ? 'bg-slate-600/50' : 'bg-gradient-to-br from-yellow-500/80 to-orange-600/80'
                }`}>
                  <Zap className={`w-5 h-5 sm:w-6 sm:h-6 ${stats.sprintCooldown > 0 ? 'text-slate-400' : 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'}`} />
                </div>
                
                {/* Cooldown overlay */}
                {stats.sprintCooldown > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-[10px] sm:text-xs font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {(stats.sprintCooldown / 1000).toFixed(1)}
                    </span>
                  </div>
                )}
            </button>
          </div>
        </>
      )}

      {appState === AppState.GameOver && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-md">
          <div className="text-center p-8 bg-slate-800 rounded-2xl border border-slate-600 shadow-2xl max-w-sm w-full mx-4 transform animate-bounce-in">
            {winner === 'Player' ? (
                <div className="flex flex-col items-center gap-4 mb-6">
                    <Trophy className="w-20 h-20 text-yellow-400 fill-yellow-400 animate-pulse" />
                    <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-b from-yellow-300 to-yellow-600 uppercase">Victory!</h2>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-4 mb-6">
                    <div className="text-6xl">💀</div>
                    <h2 className="text-5xl font-black text-red-600 uppercase">Defeat</h2>
                </div>
            )}
            <p className="text-slate-400 mb-8">{winner === 'Player' ? "You survived!" : "Better luck next time."}</p>
            <button onClick={() => setAppState(AppState.Menu)} className="w-full py-4 bg-white text-slate-900 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition">
                <RefreshCw size={20} /> <span>Play Again</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}