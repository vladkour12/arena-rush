import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { UI } from './components/UI';
import { Joystick } from './components/Joystick';
import { MainMenu } from './components/MainMenu';
// Minimap removed per user request
import { NicknameSetup } from './components/NicknameSetup';
import { StatsPanel } from './components/StatsPanel';
import { Leaderboard } from './components/Leaderboard';
import { InputState, WeaponType, SkinType, Vector2, LootItem, PlayerProfile, GameMode } from './types';
import { RefreshCw, Trophy, Smartphone, Zap, Copy, Loader2, QrCode } from 'lucide-react';
import { AIM_DEADZONE, AUTO_FIRE_THRESHOLD, MOVE_DEADZONE } from './constants';
import { NetworkManager } from './utils/network';
import { QRCodeSVG } from 'qrcode.react';
import { getPlayerProfile, createPlayerProfile, getLeaderboard, getBotLeaderboard, getPvPLeaderboard, recordGameResult } from './utils/playerData';
import { initAudio, playVictorySound, playDefeatSound } from './utils/sounds';

enum AppState {
  Menu,
  ModeSelect,
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

  // Player profile and UI state
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [showNicknameSetup, setShowNicknameSetup] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const gameStartTimeRef = useRef<number>(0);
  const gameStatsRef = useRef({ kills: 0, damageDealt: 0, damageReceived: 0, itemsCollected: 0 });

  // Network State
  const networkRef = useRef<NetworkManager | null>(null);
  const [myId, setMyId] = useState<string>('');
  const [isHost, setIsHost] = useState(false);
  const [isLeavingLobby, setIsLeavingLobby] = useState(false);
  
  // Game Mode State
  const [gameMode, setGameMode] = useState<GameMode>(GameMode.PvP);
  
  // Load player profile on mount
  useEffect(() => {
    const profile = getPlayerProfile();
    if (profile) {
      setPlayerProfile(profile);
    } else {
      setShowNicknameSetup(true);
    }
  }, []);

  // Listen for stats/leaderboard events
  useEffect(() => {
    const handleShowStats = () => {
      if (playerProfile) setShowStats(true);
    };
    const handleShowLeaderboard = () => setShowLeaderboard(true);
    
    window.addEventListener('showStats', handleShowStats);
    window.addEventListener('showLeaderboard', handleShowLeaderboard);
    
    return () => {
      window.removeEventListener('showStats', handleShowStats);
      window.removeEventListener('showLeaderboard', handleShowLeaderboard);
    };
  }, [playerProfile]);

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
    sprintCooldown: 0,
    dashCooldown: 0,
    speedBoostTimeLeft: 0,
    damageBoostTimeLeft: 0,
    invincibilityTimeLeft: 0
  });

  // Minimap data
  const [minimapData, setMinimapData] = useState<{
    playerPosition: Vector2;
    enemyPosition: Vector2;
    lootItems: LootItem[];
    zoneRadius: number;
  }>({
    playerPosition: { x: 0, y: 0 },
    enemyPosition: { x: 0, y: 0 },
    lootItems: [],
    zoneRadius: 0
  });

  const [damageFlash, setDamageFlash] = useState(0);
  const lastHpRef = useRef(100);

  // Gyroscope/Tilt controls - DISABLED
  // const [gyroEnabled, setGyroEnabled] = useState(false);
  // const gyroCalibrationRef = useRef({ beta: 0, gamma: 0 });
  
  // Player skin selection
  const [playerSkin, setPlayerSkin] = useState<SkinType>(SkinType.Police);

  // Controls Reference (Mutable for performance, avoids re-renders)
  const inputRef = useRef<InputState>({
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 }, // Right stick vector (mobile)
    sprint: false,
    dash: false,
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

  // Gyroscope/Tilt controls for movement - DISABLED (removed per requirements)
  // useEffect(() => {
  //   ... gyroscope code removed ...
  // }, []);

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

    // Play victory or defeat sound
    if (win === 'Player') {
      playVictorySound();
    } else {
      playDefeatSound();
    }

    // Record game result
    if (playerProfile) {
      const playTime = Math.floor((Date.now() - gameStartTimeRef.current) / 1000);
      // Determine if game was against bot or real player
      const isAgainstBot = networkRef.current === null;
      
      const updatedProfile = recordGameResult(
        playerProfile,
        win === 'Player',
        gameStatsRef.current.kills,
        gameStatsRef.current.damageDealt,
        gameStatsRef.current.damageReceived,
        gameStatsRef.current.itemsCollected,
        playTime,
        isAgainstBot
      );
      setPlayerProfile(updatedProfile);
      
      // Reset game stats
      gameStatsRef.current = { kills: 0, damageDealt: 0, damageReceived: 0, itemsCollected: 0 };
    }
  }, [playerProfile]);

  const handleUpdateStats = useCallback((
    hp: number, 
    ammo: number, 
    weapon: WeaponType, 
    armor: number, 
    time: number, 
    sprint: number, 
    dash: number,
    speedBoost: number = 0,
    damageBoost: number = 0,
    invincibility: number = 0
  ) => {
      setStats({ 
        hp, 
        ammo, 
        weapon, 
        armor, 
        timeLeft: time, 
        sprintCooldown: sprint, 
        dashCooldown: dash,
        speedBoostTimeLeft: speedBoost,
        damageBoostTimeLeft: damageBoost,
        invincibilityTimeLeft: invincibility
      });
      
      // Trigger damage flash when HP decreases
      if (hp < lastHpRef.current) {
        setDamageFlash(1);
        setTimeout(() => setDamageFlash(0), 200); // DAMAGE_FLASH_DURATION from constants
      }
      lastHpRef.current = hp;
  }, []);

  const handleUpdateMinimap = useCallback((playerPos: Vector2, enemyPos: Vector2, loot: LootItem[], zoneRad: number) => {
    setMinimapData({
      playerPosition: playerPos,
      enemyPosition: enemyPos,
      lootItems: loot,
      zoneRadius: zoneRad
    });
  }, []);

  const setSprint = (isSprinting: boolean) => {
    inputRef.current.sprint = isSprinting;
  };
  
  const setDash = (isDashing: boolean) => {
    inputRef.current.dash = isDashing;
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

  // Toggle gyroscope function - DISABLED (removed per requirements)
  // const toggleGyroscope = useCallback(async () => {
  //   ... gyroscope code removed ...
  // }, []);

  const handleNicknameComplete = (nickname: string) => {
    const profile = createPlayerProfile(nickname);
    setPlayerProfile(profile);
    setShowNicknameSetup(false);
    // Initialize audio context on user interaction
    initAudio();
  };

  const handleMultiplayerStart = useCallback(async (host: boolean, friendId?: string) => {
    // Clean up any existing network connection
    if (networkRef.current) {
      try {
        networkRef.current.destroy();
      } catch (err) {
        console.error('Error destroying previous network:', err);
      }
      networkRef.current = null;
    }
    
    const net = new NetworkManager();
    networkRef.current = net;
    setIsHost(host);
    setIsLeavingLobby(false);

    net.onConnect = () => {
       console.log("Connected to peer!");
       // Double-check state to prevent race condition
       if (!isLeavingLobby && appState === AppState.Lobby) {
         gameStartTimeRef.current = Date.now();
         setAppState(AppState.Playing);
       } else {
         console.log("Connection established but leaving lobby - cleaning up");
         net.destroy();
       }
    };

    net.onDisconnect = () => {
      console.log("Peer disconnected");
      if (appState !== AppState.Menu) {
        alert("Connection lost. Returning to menu.");
        setAppState(AppState.Menu);
      }
    };

    net.onError = (err) => {
        console.error("Connection Error:", err);
        if (appState !== AppState.Menu) {
          alert("Connection Error: " + err);
          setAppState(AppState.Menu);
        }
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
        console.error('Failed to initialize network:', e);
        setAppState(AppState.Menu);
    }
  }, [appState, isLeavingLobby]);

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

      {/* Nickname Setup */}
      {showNicknameSetup && (
        <NicknameSetup onComplete={handleNicknameComplete} />
      )}

      {/* Stats Panel */}
      {showStats && playerProfile && (
        <StatsPanel 
          profile={playerProfile} 
          onClose={() => setShowStats(false)} 
        />
      )}

      {/* Leaderboard */}
      {showLeaderboard && (
        <Leaderboard 
          entries={getLeaderboard()}
          botEntries={getBotLeaderboard()}
          pvpEntries={getPvPLeaderboard()}
          currentPlayerNickname={playerProfile?.nickname}
          onClose={() => setShowLeaderboard(false)} 
        />
      )}

      {appState === AppState.Menu && (
        <MainMenu 
            onStart={() => {
                // Single Player
                if (networkRef.current) {
                    networkRef.current.destroy();
                    networkRef.current = null;
                }
                gameStartTimeRef.current = Date.now();
                gameStatsRef.current = { kills: 0, damageDealt: 0, damageReceived: 0, itemsCollected: 0 };
                setAppState(AppState.Playing);
            }} 
            onMultiplayerStart={handleMultiplayerStart}
            initialJoinId={new URLSearchParams(window.location.search).get('join') || undefined}
        />
      )}

      {appState === AppState.Lobby && (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center z-50 p-6">
              <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center space-y-6 border-2 border-slate-700/50">
                  {isHost ? (
                      <>
                        {/* Visual Sign/Banner */}
                        <div className="bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600 p-4 rounded-xl shadow-lg">
                          <div className="flex items-center justify-center gap-3">
                            <Users className="w-6 h-6 text-white animate-pulse" />
                            <h2 className="text-2xl font-black text-white uppercase tracking-wide">Lobby Open</h2>
                            <Users className="w-6 h-6 text-white animate-pulse" />
                          </div>
                          <p className="text-emerald-100 text-xs mt-1 font-semibold">Friend can join now!</p>
                        </div>
                        
                        <div className="space-y-2">
                          <p className="text-slate-300 text-sm font-medium">Share this QR code or link</p>
                        </div>
                        
                        {/* Enhanced QR Code Display */}
                        <div className="bg-white p-6 rounded-2xl shadow-2xl mx-auto ring-4 ring-emerald-500/30">
                            <QRCodeSVG 
                              value={`${window.location.origin}/?join=${myId}`} 
                              size={200}
                              level="H"
                              includeMargin={true}
                            />
                        </div>
                        <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Scan with in-game scanner</p>

                        {/* Copy Link Section */}
                        <div className="space-y-2">
                          <p className="text-slate-500 text-xs uppercase tracking-wider">Or share link</p>
                          <div className="bg-slate-900 p-3 rounded-xl border border-slate-600 flex items-center justify-between gap-3 w-full">
                              <code className="text-emerald-400 font-mono text-sm tracking-wide truncate flex-1">{myId}</code>
                              <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(`${window.location.origin}/?join=${myId}`);
                                    // Could add visual feedback here
                                  }}
                                  className="p-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-600/30"
                                  title="Copy Link"
                              >
                                  <Copy size={18} />
                              </button>
                          </div>
                        </div>
                        
                        {/* Connection Status */}
                        <div className="flex flex-col items-center justify-center py-2 space-y-2">
                            <Loader2 className="animate-spin text-emerald-500 w-10 h-10" />
                            <p className="text-slate-400 text-sm">Waiting for connection...</p>
                        </div>
                      </>
                  ) : (
                      <>
                        {/* Visual Sign/Banner for Connecting */}
                        <div className="bg-gradient-to-r from-sky-600 via-blue-500 to-sky-600 p-4 rounded-xl shadow-lg">
                          <div className="flex items-center justify-center gap-3">
                            <Loader2 className="w-6 h-6 text-white animate-spin" />
                            <h2 className="text-2xl font-black text-white uppercase tracking-wide">Connecting</h2>
                          </div>
                          <p className="text-sky-100 text-xs mt-1 font-semibold">Please wait...</p>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="flex justify-center py-4">
                              <div className="relative">
                                <div className="w-16 h-16 border-4 border-sky-500/30 rounded-full"></div>
                                <div className="absolute top-0 left-0 w-16 h-16 border-4 border-sky-500 rounded-full border-t-transparent animate-spin"></div>
                              </div>
                          </div>
                          <p className="text-slate-400 text-sm">Establishing connection with host...</p>
                        </div>
                      </>
                  )}
                  
                  {/* Cancel Button */}
                  <button 
                    onClick={() => {
                        setIsLeavingLobby(true);
                        if (networkRef.current) {
                          try {
                            networkRef.current.destroy();
                          } catch (err) {
                            console.error('Error cleaning up network:', err);
                          }
                          networkRef.current = null;
                        }
                        // Clear URL parameters if joining
                        if (!isHost && window.location.search) {
                          window.history.replaceState({}, document.title, window.location.pathname);
                        }
                        setMyId('');
                        setAppState(AppState.Menu);
                    }}
                    disabled={isLeavingLobby}
                    className="w-full mt-4 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLeavingLobby ? 'Leaving...' : 'Cancel'}
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
            onUpdateMinimap={handleUpdateMinimap}
            inputRef={inputRef} // Pass the mutable ref
            network={networkRef.current} // Pass network manager
            isHost={isHost}
            playerSkin={playerSkin} // Pass selected skin
          />
          
          {/* Minimap/Radar removed per user request */}
          
          <UI
            hp={stats.hp}
            armor={stats.armor}
            ammo={stats.ammo}
            weapon={stats.weapon}
            timeLeft={stats.timeLeft}
            sprintCooldown={stats.sprintCooldown}
            dashCooldown={stats.dashCooldown}
            speedBoostTimeLeft={stats.speedBoostTimeLeft}
            damageBoostTimeLeft={stats.damageBoostTimeLeft}
            invincibilityTimeLeft={stats.invincibilityTimeLeft}
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
                    responseCurve={1.3} // Smoother response curve
                    maxRadiusPx={45} // Smaller radius (was 60)
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
                    responseCurve={1.4} // Smoother aiming
                    maxRadiusPx={45} // Smaller radius (was 60)
                />
                <div className="absolute bottom-4 sm:bottom-8 right-4 sm:right-8 text-white/10 text-xs sm:text-sm font-bold uppercase pointer-events-none">Aim / Fire</div>
            </div>
          </div>

          {/* Ability Buttons Container - Moved more to left */}
          <div className="absolute bottom-4 right-1/4 sm:right-[28%] z-30 pointer-events-auto flex gap-2 sm:gap-3">
            {/* Dash Button */}
            <button 
                onTouchStart={() => setDash(true)}
                onTouchEnd={() => setDash(false)}
                onMouseDown={() => setDash(true)}
                onMouseUp={() => setDash(false)}
                onMouseLeave={() => setDash(false)}
                disabled={stats.dashCooldown > 0}
                className={`relative w-14 h-14 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  stats.dashCooldown > 0 
                    ? 'bg-slate-700/60 cursor-not-allowed' 
                    : 'bg-slate-800/70'
                }`}
                style={{
                  boxShadow: stats.dashCooldown > 0 
                    ? 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 3px rgba(100,116,139,0.4)' 
                    : 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 3px rgba(14,165,233,0.6), 0 0 20px rgba(14,165,233,0.4)'
                }}
            >
                {/* Inner circle */}
                <div className={`absolute inset-2 rounded-full flex items-center justify-center ${
                  stats.dashCooldown > 0 ? 'bg-slate-600/50' : 'bg-gradient-to-br from-sky-500/80 to-blue-600/80'
                }`}>
                  <svg className={`w-7 h-7 sm:w-9 sm:h-9 ${stats.dashCooldown > 0 ? 'text-slate-400' : 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'}`} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M13.5 2L3 14h8l-1.5 8L20 10h-8l1.5-8z"/>
                  </svg>
                </div>
                
                {/* Cooldown overlay */}
                {stats.dashCooldown > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xs sm:text-sm font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                      {(stats.dashCooldown / 1000).toFixed(1)}
                    </span>
                  </div>
                )}
            </button>

            {/* Sprint Button */}
            <button 
                onTouchStart={() => setSprint(true)}
                onTouchEnd={() => setSprint(false)}
                onMouseDown={() => setSprint(true)}
                onMouseUp={() => setSprint(false)}
                onMouseLeave={() => setSprint(false)}
                disabled={stats.sprintCooldown > 0}
                className={`relative w-14 h-14 sm:w-18 sm:h-18 rounded-full flex items-center justify-center transition-all active:scale-90 ${
                  stats.sprintCooldown > 0 
                    ? 'bg-slate-700/60 cursor-not-allowed' 
                    : 'bg-slate-800/70'
                }`}
                style={{
                  boxShadow: stats.sprintCooldown > 0 
                    ? 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 3px rgba(100,116,139,0.4)' 
                    : 'inset 0 0 20px rgba(0,0,0,0.5), 0 0 0 3px rgba(234,179,8,0.6), 0 0 20px rgba(234,179,8,0.4)'
                }}
            >
                {/* Inner circle */}
                <div className={`absolute inset-2 rounded-full flex items-center justify-center ${
                  stats.sprintCooldown > 0 ? 'bg-slate-600/50' : 'bg-gradient-to-br from-yellow-500/80 to-orange-600/80'
                }`}>
                  <Zap className={`w-7 h-7 sm:w-9 sm:h-9 ${stats.sprintCooldown > 0 ? 'text-slate-400' : 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'}`} />
                </div>
                
                {/* Cooldown overlay */}
                {stats.sprintCooldown > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xs sm:text-sm font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
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