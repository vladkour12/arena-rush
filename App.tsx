import React, { useState, useCallback } from 'react';
import Menu from './components/Menu';
import IslandWars from './components/IslandWars';

type AppState = 'menu' | 'island-wars' | 'game-over';

interface GameResult {
  winner: string;
  reason: string;
}

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>('menu');
  const [gameResult, setGameResult] = useState<GameResult | null>(null);

  const handleStartGame = useCallback(() => {
    setGameResult(null);
    setAppState('island-wars');
  }, []);

  const handleIslandWarsEnd = useCallback((winner: 'player' | 'bot', reason: string) => {
    setGameResult({ winner, reason });
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

      {appState === 'game-over' && gameResult && (
        <div className="tk-game-over">
          <div className="tk-game-over-box">
            <div className={`tk-go-result ${gameResult.winner === 'player' ? 'tk-go-win' : 'tk-go-loss'}`}>
              {gameResult.winner === 'player' ? 'VICTORY' : 'DEFEAT'}
            </div>
            <div className="tk-go-reason">{gameResult.reason}</div>
            <div className="tk-go-buttons">
              <button className="tk-btn tk-btn-large" onClick={handleStartGame}>
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
