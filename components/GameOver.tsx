import React from 'react';
import { CHARACTERS } from '../constants';

interface GameOverProps {
  winner: 1 | 2;
  player1Character: string;
  player2Character: string;
  scores: { player1: number; player2: number };
  duration: number;
  onPlayAgain: () => void;
  onBackToMenu: () => void;
  isBotMode?: boolean;
}

const GameOver: React.FC<GameOverProps> = ({
  winner,
  player1Character,
  player2Character,
  scores,
  duration,
  onPlayAgain,
  onBackToMenu,
  isBotMode = false
}) => {
  const winnerChar = winner === 1 ? player1Character : player2Character;
  const winnerName = CHARACTERS[winnerChar].name;
  const winnerColor = CHARACTERS[winnerChar].color;

  return (
    <div className="game-over-wrapper">
      <div className="game-over-bg"></div>
      
      <div className="game-over">
        <div className="victory-container">
          <div className="victory-glow"></div>
          <h1 className="victory-text" style={{ color: winnerColor }}>
            🏆 {isBotMode && winner === 1 ? 'YOU WIN!' : `PLAYER ${winner} WINS!`} 🏆
          </h1>
          <h2 className="champion-name" style={{ color: winnerColor }}>
            {winnerName.toUpperCase()}
          </h2>
          {isBotMode && winner === 2 && (
            <p style={{ fontSize: '1.3rem', marginTop: '15px', color: '#FF69B4' }}>
              🤖 Defeated by the Bot 🤖
            </p>
          )}
        </div>

        <div className="match-stats-container">
          <div className="stat-item">
            <span className="stat-label">MATCH DURATION</span>
            <span className="stat-value">{duration.toFixed(1)}s</span>
          </div>
          
          <div className="stat-item">
            <span className="stat-label">PLAYER 1</span>
            <span className="stat-value p1-score" style={{ color: '#4169E1' }}>
              {scores.player1} PTS
            </span>
          </div>
          
          <div className="stat-item">
            <span className="stat-label">PLAYER 2</span>
            <span className="stat-value p2-score" style={{ color: '#FF69B4' }}>
              {scores.player2} PTS
            </span>
          </div>
        </div>

        <div className="character-comparison">
          <div className={`comparison-card ${winner === 1 ? 'winner-card' : ''}`}>
            <div className="char-icon">🎮</div>
            <h3 style={{ color: '#4169E1' }}>{CHARACTERS[player1Character].name}</h3>
            <div className="char-stats">
              <div className="char-stat-line">
                <span>HP:</span>
                <span>{CHARACTERS[player1Character].maxHealth}</span>
              </div>
              <div className="char-stat-line">
                <span>Damage:</span>
                <span>{CHARACTERS[player1Character].stats.damage}</span>
              </div>
              <div className="char-stat-line">
                <span>Speed:</span>
                <span>{CHARACTERS[player1Character].stats.movementSpeed}</span>
              </div>
            </div>
            {winner === 1 && (
              <div className="winner-badge">
                <span>👑 VICTOR 👑</span>
              </div>
            )}
          </div>

          <div className="vs-divider">
            <span>VS</span>
          </div>

          <div className={`comparison-card ${winner === 2 ? 'winner-card' : ''}`}>
            <div className="char-icon">🎮</div>
            <h3 style={{ color: '#FF69B4' }}>{CHARACTERS[player2Character].name}</h3>
            <div className="char-stats">
              <div className="char-stat-line">
                <span>HP:</span>
                <span>{CHARACTERS[player2Character].maxHealth}</span>
              </div>
              <div className="char-stat-line">
                <span>Damage:</span>
                <span>{CHARACTERS[player2Character].stats.damage}</span>
              </div>
              <div className="char-stat-line">
                <span>Speed:</span>
                <span>{CHARACTERS[player2Character].stats.movementSpeed}</span>
              </div>
            </div>
            {winner === 2 && (
              <div className="winner-badge">
                <span>👑 VICTOR 👑</span>
              </div>
            )}
          </div>
        </div>

        <div className="button-group-game-over">
          <button className="action-button primary" onClick={onPlayAgain}>
            ⚡ PLAY AGAIN ⚡
          </button>
          <button className="action-button secondary" onClick={onBackToMenu}>
            🏠 BACK TO MENU
          </button>
        </div>
      </div>
    </div>
  );
};

export default GameOver;
