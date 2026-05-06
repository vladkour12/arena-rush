import React, { useState, useCallback } from 'react';
import Menu from './components/Menu';
import IslandWars from './components/IslandWars';
import ShooterLobby from './components/ShooterLobby';
import Shooter from './components/Shooter';

type AppState = 'menu' | 'island-wars' | 'game-over' | 'shooter-lobby' | 'shooter';

interface GameResult { winner: string; reason: string; }
interface ShooterMatch { code: string; playerId: string; playerName: string; wsUrl: string; }

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('menu');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [shooterMatch, setShooterMatch] = useState<ShooterMatch | null>(null);

  const handleStartGame = useCallback(() => {
    setGameResult(null);
    setAppState('island-wars');
  }, []);

  const handleStartShooter = useCallback(() => {
    setAppState('shooter-lobby');
  }, []);

  const handleIslandWarsEnd = useCallback((winner: 'player' | 'bot', reason: string) => {
    setGameResult({ winner, reason });
    setAppState('game-over');
  }, []);

  const handleShooterReady = useCallback((code: string, playerId: string, playerName: string, wsUrl: string) => {
    setShooterMatch({ code, playerId, playerName, wsUrl });
    setAppState('shooter');
  }, []);

  const handleBackToMenu = () => {
    setAppState('menu');
    setGameResult(null);
    setShooterMatch(null);
  };

  return (
    <div className="app">
      {appState === 'menu' && <Menu onStartGame={handleStartGame} onStartShooter={handleStartShooter} />}

      {appState === 'island-wars' && <IslandWars onGameEnd={handleIslandWarsEnd} />}

      {appState === 'shooter-lobby' && <ShooterLobby onMatchReady={handleShooterReady} onBack={handleBackToMenu} />}

      {appState === 'shooter' && shooterMatch && (
        <Shooter
          code={shooterMatch.code}
          playerId={shooterMatch.playerId}
          playerName={shooterMatch.playerName}
          wsUrl={shooterMatch.wsUrl}
          onLeave={handleBackToMenu}
        />
      )}

      {appState === 'game-over' && gameResult && (
        <div className="tk-game-over">
          <div className="tk-game-over-box">
            <div className={`tk-go-result ${gameResult.winner === 'player' ? 'tk-go-win' : 'tk-go-loss'}`}>
              {gameResult.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="tk-go-reason">{gameResult.reason}</div>
            <div className="tk-go-buttons">
              <button className="tk-btn tk-btn-large" onClick={handleStartGame}>Play Again</button>
              <button className="tk-btn tk-btn-large tk-btn-secondary" onClick={handleBackToMenu}>Main Menu</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
