import React, { useState, useCallback } from 'react';
import Menu from './components/Menu';
import IslandWars from './components/IslandWars';
import ArenaBattle from './components/ArenaBattle';

type AppState = 'menu' | 'island-wars' | 'arena' | 'game-over';

interface GameResult {
  winner: string;
  reason: string;
  mode: 'island-wars' | 'arena';
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('menu');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const handleStartGame = useCallback((mode: 'island-wars' | 'arena') => {
    setGameResult(null);
    setAppState(mode);
  }, []);

  const handleIslandWarsEnd = useCallback((winner: 'player' | 'bot', reason: string) => {
    setGameResult({ winner, reason, mode: 'island-wars' });
    setAppState('game-over');
  }, []);

  const handleArenaEnd = useCallback((winner: 'player' | 'bot' | 'draw', reason: string) => {
    setGameResult({ winner, reason, mode: 'arena' });
    setAppState('game-over');
  }, []);

  const handleBackToMenu = () => {
    setAppState('menu');
    setGameResult(null);
  };

  return (
    <div className="app">
      {appState === 'menu' && <Menu onStartGame={handleStartGame} />}

      {appState === 'island-wars' && (
        <IslandWars onGameEnd={handleIslandWarsEnd} />
      )}

      {appState === 'arena' && (
        <ArenaBattle onGameEnd={handleArenaEnd} />
      )}

      {appState === 'game-over' && gameResult && (
        <div className="tk-game-over">
          <div className="tk-game-over-box">
            <div className={`tk-go-result ${gameResult.winner === 'player' ? 'tk-go-win' : gameResult.winner === 'draw' ? 'tk-go-draw' : 'tk-go-loss'}`}>
              {gameResult.winner === 'player' ? '🏆 VICTORY!' : gameResult.winner === 'draw' ? '🤝 DRAW!' : '💀 DEFEAT!'}
            </div>
            <div className="tk-go-reason">{gameResult.reason}</div>
            <div className="tk-go-buttons">
              <button
                className="tk-btn tk-btn-large"
                onClick={() => handleStartGame(gameResult.mode)}
              >
                Play Again
              </button>
              <button className="tk-btn tk-btn-large tk-btn-secondary" onClick={handleBackToMenu}>
                Main Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default App;
