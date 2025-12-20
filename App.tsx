import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameCanvas } from './components/GameCanvas';
import { UI } from './components/UI';
import { Joystick } from './components/Joystick';
import { MainMenu } from './components/MainMenu';
import { ModeSelect } from './components/ModeSelect';
// Minimap removed per user request
import { NicknameSetup } from './components/NicknameSetup';
import { StatsPanel } from './components/StatsPanel';
import { Leaderboard } from './components/Leaderboard';
import { InputState, WeaponType, SkinType, Vector2, LootItem, PlayerProfile, GameMode } from './types';
import { RefreshCw, Trophy, Smartphone, Zap, Copy, Loader2, QrCode, Users } from 'lucide-react';
import { AIM_DEADZONE, AUTO_FIRE_THRESHOLD, MOVE_DEADZONE } from './constants';
import { NetworkManager } from './utils/network';
import { QRCodeSVG } from 'qrcode.react';
import { getPlayerProfile, createPlayerProfile, getLeaderboard, getBotLeaderboard, getPvPLeaderboard, recordGameResult } from './utils/playerData';
import { initAudio, playVictorySound, playDefeatSound, playButtonSound } from './utils/sounds';
import { isIOSDevice } from './utils/gameUtils';

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
  // Always landscape mode - no portrait state needed
  const [isPortrait, setIsPortrait] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  // Initialize viewport size with current window dimensions (landscape)
  const getInitialViewportSize = () => {
    if (typeof window === 'undefined') return { width: 0, height: 0 };
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isPortrait = height > width;
    return {
      width: isPortrait ? height : width,
      height: isPortrait ? width : height
    };
  };
  const [viewportSize, setViewportSize] = useState(getInitialViewportSize);
  const containerRef = useRef<HTMLDivElement>(null);

  // Player profile and UI state
  const [playerProfile, setPlayerProfile] = useState<PlayerProfile | null>(null);
  const [showNicknameSetup, setShowNicknameSetup] = useState(false);
  const [isUsingMouseKeyboard, setIsUsingMouseKeyboard] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const gameStartTimeRef = useRef<number>(0);
  const gameStatsRef = useRef({ kills: 0, damageDealt: 0, damageReceived: 0, itemsCollected: 0 });
  
  // iOS-specific state
  const [isIOS] = useState(isIOSDevice());
  const [controlsWorking, setControlsWorking] = useState(true);
  const [showResetControls, setShowResetControls] = useState(false);
  const joystickResetKeyRef = useRef(0);

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
    totalAmmo: 24,
    weapon: WeaponType.Pistol,
    armor: 0,
    timeLeft: 0,
    sprintCooldown: 0,
    dashCooldown: 0,
    speedBoostTimeLeft: 0,
    damageBoostTimeLeft: 0,
    invincibilityTimeLeft: 0,
    currentWave: 0,
    zombiesRemaining: 0,
    prepTimeRemaining: 0,
    inventory: [] as Array<{ weapon: WeaponType; ammo: number; totalAmmo: number }>
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
    isPointerAiming: false,
    weaponSwitch: 0 // 1 = next, -1 = previous, 0 = none
  });

  // Reset input state - call when transitioning between games
  const resetInputState = () => {
    inputRef.current.move = { x: 0, y: 0 };
    inputRef.current.aim = { x: 0, y: 0 };
    inputRef.current.sprint = false;
    inputRef.current.dash = false;
    inputRef.current.fire = false;
    inputRef.current.pointer = { x: 0, y: 0 };
    inputRef.current.isPointerAiming = false;
    inputRef.current.weaponSwitch = 0;
  };

  // Force landscape orientation and lock it + track viewport size
  useEffect(() => {
    // Try to lock orientation to landscape immediately
    const lockOrientation = async () => {
      try {
        if (screen.orientation && (screen.orientation as any).lock) {
          await (screen.orientation as any).lock('landscape').catch(() => {
            // Ignore errors (may require user gesture or fullscreen)
          });
        }
      } catch (e) {
        // Ignore errors
      }
    };
    
    // Update viewport size and orientation
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isCurrentlyPortrait = height > width;
      
      setIsPortrait(false); // Always treat as landscape for UI
      setViewportSize({ 
        width: isCurrentlyPortrait ? height : width,
        height: isCurrentlyPortrait ? width : height
      });
      
      // Try to lock again on orientation change
      lockOrientation();
    };
    
    // Lock on mount
    lockOrientation();
    updateViewport();
    
    // Also try to lock when user interacts
    const handleUserInteraction = () => {
      lockOrientation();
      updateViewport();
    };
    
    document.addEventListener('click', handleUserInteraction, { once: true });
    document.addEventListener('touchstart', handleUserInteraction, { once: true });
    
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

  // Gyroscope/Tilt controls for movement - DISABLED (removed per requirements)
  // useEffect(() => {
  //   ... gyroscope code removed ...
  // }, []);

  // Mobile browsers (esp. iOS) can report `innerHeight` including UI chrome.
  // This sets CSS vars based on the *visible* viewport so the game uses the real playable size.
  useEffect(() => {
    const setViewportVars = () => {
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      document.documentElement.style.setProperty('--vh', `${viewportHeight * 0.01}px`);
      document.documentElement.style.setProperty('--vw', `${viewportWidth * 0.01}px`);
    };

    setViewportVars();
    window.addEventListener('resize', setViewportVars);
    window.addEventListener('orientationchange', setViewportVars);
    window.visualViewport?.addEventListener('resize', setViewportVars);
    window.visualViewport?.addEventListener('scroll', setViewportVars);

    return () => {
      window.removeEventListener('resize', setViewportVars);
      window.removeEventListener('orientationchange', setViewportVars);
      window.visualViewport?.removeEventListener('resize', setViewportVars);
      window.visualViewport?.removeEventListener('scroll', setViewportVars);
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

  // PC Keyboard Controls
  // Add keyboard input handling for desktop players
  useEffect(() => {
    if (appState !== AppState.Playing) return;

    const keysPressed = new Set<string>();

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.add(key);

      // Update movement input
      const moveX = (keysPressed.has('d') || keysPressed.has('arrowright') ? 1 : 0) - 
                    (keysPressed.has('a') || keysPressed.has('arrowleft') ? 1 : 0);
      const moveY = (keysPressed.has('s') || keysPressed.has('arrowdown') ? 1 : 0) - 
                    (keysPressed.has('w') || keysPressed.has('arrowup') ? 1 : 0);

      // Normalize diagonal movement
      let magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
      inputRef.current.move = {
        x: magnitude > 0 ? moveX / magnitude : 0,
        y: magnitude > 0 ? moveY / magnitude : 0
      };

      // Sprint: Shift key
      inputRef.current.sprint = keysPressed.has('shift');

      // Dash: Space key
      if (key === ' ') {
        e.preventDefault();
        inputRef.current.dash = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed.delete(key);

      // Update movement input
      const moveX = (keysPressed.has('d') || keysPressed.has('arrowright') ? 1 : 0) - 
                    (keysPressed.has('a') || keysPressed.has('arrowleft') ? 1 : 0);
      const moveY = (keysPressed.has('s') || keysPressed.has('arrowdown') ? 1 : 0) - 
                    (keysPressed.has('w') || keysPressed.has('arrowup') ? 1 : 0);

      // Normalize diagonal movement
      let magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
      inputRef.current.move = {
        x: magnitude > 0 ? moveX / magnitude : 0,
        y: magnitude > 0 ? moveY / magnitude : 0
      };

      // Sprint: Shift key
      inputRef.current.sprint = keysPressed.has('shift');

      // Dash: Space key
      if (key === ' ') {
        e.preventDefault();
        inputRef.current.dash = false;
      }
    };

    // Mouse controls - Click and drag to aim and shoot
    let mouseDownPos: { x: number; y: number } | null = null;
    
    const handleMouseMove = (e: MouseEvent) => {
      // Only aim when holding left mouse button
      if (mouseDownPos && inputRef.current.fire) {
        setIsUsingMouseKeyboard(true);
        // Calculate aim direction from where you clicked to current mouse position
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 10) { // Minimum drag distance
          // Normalize and set as aim direction
          inputRef.current.aim = { x: dx / dist, y: dy / dist };
          inputRef.current.isPointerAiming = false; // Use aim vector, not pointer
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        e.preventDefault();
        setIsUsingMouseKeyboard(true);
        mouseDownPos = { x: e.clientX, y: e.clientY };
        inputRef.current.fire = true;
        inputRef.current.isPointerAiming = false;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) { // Left click
        mouseDownPos = null;
        inputRef.current.fire = false;
        inputRef.current.aim = { x: 0, y: 0 };
      }
    };

    // Scroll wheel for weapon switching
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        inputRef.current.weaponSwitch = -1; // Scroll up = previous weapon
      } else if (e.deltaY > 0) {
        inputRef.current.weaponSwitch = 1; // Scroll down = next weapon
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [appState]);

  // iOS-specific keepalive mechanism (prevents touch event throttling)
  useEffect(() => {
    if (appState !== AppState.Playing || !isIOS) return;
    
    console.log('[App] iOS keepalive mechanism activated');
    let wakeLock: any = null;
    
    // Request Wake Lock API if available
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await (navigator as any).wakeLock.request('screen');
          console.log('[App] Wake Lock acquired');
          
          wakeLock.addEventListener('release', () => {
            console.log('[App] Wake Lock released');
          });
        }
      } catch (err) {
        console.warn('[App] Wake Lock not supported or denied:', err);
      }
    };
    
    requestWakeLock();
    
    // Periodic keepalive - trigger touch event to keep iOS active
    const keepaliveInterval = setInterval(() => {
      // Dispatch a minimal touch event to prevent iOS from throttling
      const dummyTouch = new Event('touchstart', { bubbles: true });
      document.body.dispatchEvent(dummyTouch);
      
      console.log('[App] iOS keepalive ping');
      
      // Re-request wake lock if it was released
      if (wakeLock === null || wakeLock.released) {
        requestWakeLock();
      }
    }, 30000); // Every 30 seconds
    
    return () => {
      clearInterval(keepaliveInterval);
      if (wakeLock !== null && !wakeLock.released) {
        wakeLock.release().catch(() => {});
        console.log('[App] Wake Lock released on cleanup');
      }
    };
  }, [appState, isIOS]);

  // Show reset controls button after 45 seconds on mobile (preventive)
  useEffect(() => {
    if (appState !== AppState.Playing || !isIOS) {
      setShowResetControls(false);
      return;
    }
    
    const timer = setTimeout(() => {
      setShowResetControls(true);
      console.log('[App] Reset controls button now visible');
    }, 45000); // 45 seconds
    
    return () => clearTimeout(timer);
  }, [appState, isIOS]);

  // Monitor input responsiveness
  useEffect(() => {
    if (appState !== AppState.Playing) return;
    
    const lastInputTime = { move: Date.now(), aim: Date.now() };
    
    const checkInputResponsiveness = setInterval(() => {
      const now = Date.now();
      const moveAge = now - lastInputTime.move;
      const aimAge = now - lastInputTime.aim;
      
      // If no input for 2 minutes during gameplay, controls might be stuck
      if (moveAge > 120000 && aimAge > 120000) {
        console.warn('[App] No joystick input detected for 2 minutes');
        setControlsWorking(false);
      }
      
      // Update last input times based on current input state
      if (inputRef.current.move.x !== 0 || inputRef.current.move.y !== 0) {
        lastInputTime.move = now;
        setControlsWorking(true);
      }
      if (inputRef.current.aim.x !== 0 || inputRef.current.aim.y !== 0) {
        lastInputTime.aim = now;
        setControlsWorking(true);
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(checkInputResponsiveness);
  }, [appState]);

  // Reset controls function
  const handleResetControls = useCallback(() => {
    console.log('[App] Resetting controls');
    
    // Reset input state
    resetInputState();
    
    // Force joystick remount by changing key
    joystickResetKeyRef.current += 1;
    
    // Reset control status
    setControlsWorking(true);
    
    // Provide haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([50, 100, 50]);
    }
    
    // Show temporary confirmation
    alert('Controls reset successfully!');
  }, []);

  const handleGameOver = useCallback((win: 'Player' | 'Bot') => {
    // Reset input state to prevent stuck fire button
    resetInputState();
    
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
    totalAmmo: number,
    weapon: WeaponType, 
    armor: number, 
    time: number, 
    sprint: number, 
    dash: number,
    speedBoost: number = 0,
    damageBoost: number = 0,
    invincibility: number = 0,
    wave: number = 0,
    zombiesRemaining: number = 0,
    prepTime: number = 0,
    inventory: Array<{ weapon: WeaponType; ammo: number; totalAmmo: number }> = []
  ) => {
      setStats({ 
        hp, 
        ammo,
        totalAmmo,
        weapon, 
        armor, 
        timeLeft: time, 
        sprintCooldown: sprint, 
        dashCooldown: dash,
        speedBoostTimeLeft: speedBoost,
        damageBoostTimeLeft: damageBoost,
        invincibilityTimeLeft: invincibility,
        currentWave: wave,
        zombiesRemaining: zombiesRemaining,
        prepTimeRemaining: prepTime,
        inventory: inventory
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
    // Only use joystick if not using mouse/keyboard
    if (!isUsingMouseKeyboard) {
      inputRef.current.move.x = vec.x;
      inputRef.current.move.y = vec.y;
    }
  }, [isUsingMouseKeyboard]);

  const handleAim = useCallback((vec: any) => {
    // Only use joystick if not using mouse/keyboard
    if (!isUsingMouseKeyboard) {
      inputRef.current.aim.x = vec.x;
      inputRef.current.aim.y = vec.y;
      inputRef.current.isPointerAiming = false;
      // Auto-fire when aiming with joystick (magnitude above threshold)
      const magnitude = Math.sqrt(vec.x * vec.x + vec.y * vec.y);
      inputRef.current.fire = magnitude > 0.5; // Fire when pushing joystick past 50%
    }
  }, [isUsingMouseKeyboard]);

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
       // Use refs and setState callbacks to avoid stale closure issues
       setIsLeavingLobby(currentLeavingState => {
         if (!currentLeavingState) {
           // Use requestAnimationFrame to defer state transition and prevent UI freeze
           requestAnimationFrame(() => {
             requestAnimationFrame(() => {
               setAppState(currentAppState => {
                 // Validate state before transitioning
                 if (currentAppState === AppState.Lobby) {
                   console.log('Transitioning from Lobby to Playing');
                   // Reset game state before starting
                   gameStartTimeRef.current = Date.now();
                   gameStatsRef.current = { kills: 0, damageDealt: 0, damageReceived: 0, itemsCollected: 0 };
                   // Reset input state to prevent stuck buttons
                   resetInputState();
                   return AppState.Playing;
                 }
                 // Don't transition if not in Lobby state
                 console.warn('onConnect called but not in Lobby state:', currentAppState);
                 return currentAppState;
               });
             });
           });
         } else {
           console.log("Connection established but leaving lobby - cleaning up");
           if (networkRef.current) {
             try {
               networkRef.current.destroy();
             } catch (e) {
               console.error('Error cleaning up network on leave:', e);
             }
             networkRef.current = null;
           }
         }
         return currentLeavingState;
       });
    };

    net.onDisconnect = () => {
      console.log("Peer disconnected");
      setAppState(currentState => {
        if (currentState !== AppState.Menu) {
          alert("Connection lost. Returning to menu.");
          return AppState.Menu;
        }
        return currentState;
      });
    };

    net.onError = (err) => {
        console.error("Connection Error:", err);
        setAppState(currentState => {
          if (currentState !== AppState.Menu) {
            alert("Connection Error: " + err);
            return AppState.Menu;
          }
          return currentState;
        });
    };

    try {
        const id = await net.initialize();
        setMyId(id);
        
        if (host) {
            // Use requestAnimationFrame to prevent UI freeze when entering lobby
            requestAnimationFrame(() => {
              setAppState(AppState.Lobby);
            });
        } else if (friendId) {
            // Use requestAnimationFrame to prevent UI freeze when joining
            requestAnimationFrame(() => {
              net.connect(friendId);
              setAppState(AppState.Lobby); // Show "Connecting..."
            });
        }
    } catch (e) {
        console.error('Failed to initialize network:', e);
        alert('Failed to connect: ' + (e instanceof Error ? e.message : 'Unknown error'));
        setAppState(AppState.Menu);
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="bg-black overflow-hidden relative font-sans select-none touch-none"
      style={{
        // Force landscape layout - always maintain landscape aspect ratio
        position: 'fixed',
        // Use landscape dimensions from state (swapped if in portrait)
        width: viewportSize.width > 0 ? `${viewportSize.width}px` : '100vw',
        height: viewportSize.height > 0 ? `${viewportSize.height}px` : '100vh',
        // Center and scale if in portrait
        ...(typeof window !== 'undefined' && window.innerHeight > window.innerWidth && viewportSize.width > 0 ? {
          transform: `scale(${Math.min(window.innerWidth / viewportSize.width, window.innerHeight / viewportSize.height)})`,
          transformOrigin: 'center center',
          top: '50%',
          left: '50%',
          marginTop: `-${viewportSize.height / 2}px`,
          marginLeft: `-${viewportSize.width / 2}px`
        } : {
          top: 0,
          left: 0,
          transform: 'none'
        }),
        // Extra safety: browsers that support dvh will still respect the inline height above.
        paddingTop: 'env(safe-area-inset-top)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)'
      }}
    >
      
      {/* Portrait warning removed - game always scales for landscape */}

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
                // Go to mode selection instead of directly starting
                playButtonSound();
                setAppState(AppState.ModeSelect);
            }} 
            onMultiplayerStart={handleMultiplayerStart}
            initialJoinId={new URLSearchParams(window.location.search).get('join') || undefined}
        />
      )}

      {appState === AppState.ModeSelect && (
        <ModeSelect
          onSelectMode={(mode) => {
            // Validate game mode before proceeding
            if (!Object.values(GameMode).includes(mode)) {
              console.error('Invalid game mode:', mode);
              return;
            }
            
            setGameMode(mode);
            if (mode === GameMode.CoopSurvival) {
              // Co-op mode requires multiplayer setup
              setAppState(AppState.Lobby);
              handleMultiplayerStart(true);
            } else {
              // Single player modes (PvP with bot, or Survival)
              // Clean up any existing network connection
              if (networkRef.current) {
                try {
                  networkRef.current.destroy();
                } catch (e) {
                  console.error('Error destroying network:', e);
                }
                networkRef.current = null;
              }
              // Reset input state to prevent stuck buttons
              resetInputState();
              // Reset game state
              gameStartTimeRef.current = Date.now();
              gameStatsRef.current = { kills: 0, damageDealt: 0, damageReceived: 0, itemsCollected: 0 };
              setAppState(AppState.Playing);
            }
          }}
          onBack={() => setAppState(AppState.Menu)}
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
            gameMode={gameMode} // Pass selected game mode
          />
          
          {/* Minimap/Radar removed per user request */}
          
          <UI
            hp={stats.hp}
            armor={stats.armor}
            ammo={stats.ammo}
            totalAmmo={stats.totalAmmo}
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
            onExitGame={() => setAppState(AppState.Menu)}
            gameMode={gameMode}
            currentWave={stats.currentWave}
            zombiesRemaining={stats.zombiesRemaining}
            prepTimeRemaining={stats.prepTimeRemaining}
            inventory={stats.inventory}
            onWeaponSwitch={() => { inputRef.current.weaponSwitch = 1; }}
          />

          {/* Controls Layer - Hide on PC when using mouse/keyboard */}
          <div className={`absolute inset-0 flex z-10 pointer-events-none ${isUsingMouseKeyboard ? 'opacity-0 pointer-events-none' : ''}`}>
            {/* Left: Move Joystick */}
            <div className="w-1/2 h-full relative pointer-events-auto">
                <Joystick 
                    key={`move-${joystickResetKeyRef.current}`}
                    onMove={handleMove}
                    color="bg-cyan-400" 
                    className="w-full h-full" 
                    deadzone={MOVE_DEADZONE}
                    responseCurve={1.0} // Linear response for gamepad-like feel (was 1.3)
                    maxRadiusPx={50} // Optimal radius for control (was 45)
                />
                <div className="absolute bottom-4 sm:bottom-8 left-4 sm:left-8 text-white/10 text-xs sm:text-sm font-bold uppercase pointer-events-none">Move</div>
            </div>

            {/* Right: Aim/Fire Joystick */}
            <div className="w-1/2 h-full relative pointer-events-auto">
                <Joystick 
                    key={`aim-${joystickResetKeyRef.current}`}
                    onMove={handleAim}
                    color="bg-red-500" 
                    className="w-full h-full"
                    threshold={AUTO_FIRE_THRESHOLD} // Visual ring for firing
                    deadzone={AIM_DEADZONE}
                    responseCurve={1.0} // Linear response for precise aiming (was 1.4)
                    maxRadiusPx={50} // Optimal radius for control (was 45)
                />
                <div className="absolute bottom-4 sm:bottom-8 right-4 sm:right-8 text-white/10 text-xs sm:text-sm font-bold uppercase pointer-events-none">Aim / Fire</div>
            </div>
          </div>

          {/* Reset Controls Button - iOS/Mobile only, appears after 45s */}
          {showResetControls && isIOS && !isUsingMouseKeyboard && (
            <button
              onClick={handleResetControls}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-40 px-4 py-2 bg-yellow-600/90 hover:bg-yellow-500 text-white text-sm font-bold rounded-lg shadow-lg border-2 border-yellow-400 pointer-events-auto flex items-center gap-2 animate-pulse"
              style={{ touchAction: 'manipulation' }}
            >
              <RefreshCw className="w-4 h-4" />
              Reset Controls
            </button>
          )}

          {/* Controls Status Indicator - Show when controls working */}
          {controlsWorking && isIOS && !isUsingMouseKeyboard && (
            <div className="absolute top-16 left-4 z-30 px-2 py-1 bg-green-600/80 text-white text-xs font-bold rounded pointer-events-none">
              ✓ Controls OK
            </div>
          )}

          {/* Ability Buttons Container - Hide on PC when using mouse/keyboard */}
          <div className={`absolute top-16 right-2 sm:top-[4.5rem] sm:right-4 z-30 pointer-events-auto flex flex-col gap-2 sm:gap-2.5 origin-top-right scale-[0.7] sm:scale-75 ${isUsingMouseKeyboard ? 'opacity-0 pointer-events-none' : ''}`}>
            {/* Sprint Button */}
            <button 
                onTouchStart={() => setSprint(true)}
                onTouchEnd={() => setSprint(false)}
                onMouseDown={() => setSprint(true)}
                onMouseUp={() => setSprint(false)}
                onMouseLeave={() => setSprint(false)}
                disabled={stats.sprintCooldown > 0}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all active:scale-90 ${
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
                  <Zap className={`w-7 h-7 sm:w-8 sm:h-8 ${stats.sprintCooldown > 0 ? 'text-slate-400' : 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'}`} />
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

            {/* Dash Button */}
            <button 
                onTouchStart={() => setDash(true)}
                onTouchEnd={() => setDash(false)}
                onMouseDown={() => setDash(true)}
                onMouseUp={() => setDash(false)}
                onMouseLeave={() => setDash(false)}
                disabled={stats.dashCooldown > 0}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all active:scale-90 ${
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
                  <svg className={`w-7 h-7 sm:w-8 sm:h-8 ${stats.dashCooldown > 0 ? 'text-slate-400' : 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]'}`} fill="currentColor" viewBox="0 0 24 24">
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