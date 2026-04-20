import React, { useState } from 'react';
import { GameState } from './types';
import { CHARACTERS } from './constants';
import Menu from './components/Menu.tsx';
import CharacterSelect from './components/CharacterSelect.tsx';
import Arena3D from './components/Arena3D.tsx';
import GameOver from './components/GameOver.tsx';
import Lobby from './components/Lobby.tsx';
import Login from './components/Login.tsx';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>('login');
  const [gameMode, setGameMode] = useState<'pvp' | 'bot' | 'online'>('pvp');
  const [userId, setUserId] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [selectedCharacters, setSelectedCharacters] = useState<{
    player1: string | null;
    player2: string | null;
  }>({
    player1: null,
    player2: null
  });
  const [gameResult, setGameResult] = useState<{
    winner: 1 | 2;
    player1Score: number;
    player2Score: number;
    duration: number;
  } | null>(null);

  const handleLogin = (newUserId: string, newUsername: string) => {
    setUserId(newUserId);
    setUsername(newUsername);
    setGameState('menu');
  };

  const handleStartGame = (mode: 'pvp' | 'bot' | 'online' = 'pvp') => {
    // Friend + Online now share the same lobby flow
    if (mode === 'pvp' || mode === 'online') {
      setGameMode('online');
      setGameState('lobby');
    } else {
      setGameMode('bot');
      setGameState('character-select');
    }
  };

  const handleCharacterSelected = (player: 1 | 2, characterId: string) => {
    let updated = {
      ...selectedCharacters,
      [player === 1 ? 'player1' : 'player2']: characterId
    };
    // In bot mode, auto-assign bot pick but don’t auto-start
    if (gameMode === 'bot' && player === 1) {
      const botCharacters = Object.keys(CHARACTERS);
      const randomBot = botCharacters[Math.floor(Math.random() * botCharacters.length)];
      updated = { player1: characterId, player2: randomBot };
    }
    setSelectedCharacters(updated);
  };

  const handleStartMatch = () => {
    if (gameMode === 'bot') {
      if (!selectedCharacters.player1) return;
      // Ensure bot pick exists
      if (!selectedCharacters.player2) {
        const botCharacters = Object.keys(CHARACTERS);
        const randomBot = botCharacters[Math.floor(Math.random() * botCharacters.length)];
        setSelectedCharacters({ player1: selectedCharacters.player1, player2: randomBot });
      }
      setGameState('arena');
    } else {
      if (!selectedCharacters.player1 || !selectedCharacters.player2) return;
      setGameState('arena');
    }
  };

  const handleGameEnd = (winner: 1 | 2, scores: { player1: number; player2: number }, duration: number) => {
    setGameResult({
      winner,
      scores,
      duration
    });
    setGameState('game-over');
  };

  const handleBackToMenu = () => {
    setGameState('menu');
    setSelectedCharacters({ player1: null, player2: null });
    setGameResult(null);
  };

  const handlePlayAgain = () => {
    setSelectedCharacters({ player1: null, player2: null });
    setGameResult(null);
    setGameState('character-select');
  };

  return (
    <div className="app">
      {gameState === 'login' && <Login onLogin={handleLogin} />}
      
      {gameState === 'menu' && <Menu onStartGame={handleStartGame} />}

      {gameState === 'lobby' && (
        <Lobby
          userId={userId}
          username={username}
          onCharacterSelected={(char) => setSelectedCharacters({ ...selectedCharacters, player1: char })}
          onBackToMenu={handleBackToMenu}
          onCreateRoom={() => setGameState('arena')}
          onJoinRoom={() => setGameState('arena')}
          onInviteFriend={() => {}}
        />
      )}
      
      {gameState === 'character-select' && (
        <CharacterSelect
          onCharacterSelected={handleCharacterSelected}
          selectedCharacters={selectedCharacters}
          onBackToMenu={handleBackToMenu}
          gameMode={gameMode as 'pvp' | 'bot'}
          onStart={handleStartMatch}
        />
      )}
      
      {gameState === 'arena' && selectedCharacters.player1 && selectedCharacters.player2 && (
        <Arena3D
          player1Character={selectedCharacters.player1}
          player2Character={selectedCharacters.player2}
          onGameEnd={handleGameEnd}
          isBotMode={gameMode === 'bot'}
        />
      )}
      
      {gameState === 'game-over' && gameResult && selectedCharacters.player1 && selectedCharacters.player2 && (
        <GameOver
          winner={gameResult.winner}
          player1Character={selectedCharacters.player1}
          player2Character={selectedCharacters.player2}
          scores={gameResult.scores}
          duration={gameResult.duration}
          onPlayAgain={handlePlayAgain}
          onBackToMenu={handleBackToMenu}
          isBotMode={gameMode === 'bot'}
        />
      )}
    </div>
  );
};

export default App;
