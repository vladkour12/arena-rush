import React from 'react';

interface MenuProps {
  onStartGame: (mode?: 'pvp' | 'bot' | 'online') => void;
}

const Menu: React.FC<MenuProps> = ({ onStartGame }) => {
  return (
    <div className="menu-container">
      <div className="menu-background"></div>
      
      <div className="menu-content">
        <div className="menu-glow"></div>
        
        <div className="title-section">
          <h1 className="menu-title">⚔️ ARENA RUSH ⚔️</h1>
          <div className="subtitle-glow">
            <p className="menu-subtitle">1v1 BATTLE ARENA</p>
            <p className="menu-description">Choose your character and dominate your opponent</p>
          </div>
        </div>

        <div className="menu-stats">
          <div className="stat">
            <span className="stat-label">Characters</span>
            <span className="stat-number">4</span>
          </div>
          <div className="stat">
            <span className="stat-label">Abilities</span>
            <span className="stat-number">12+</span>
          </div>
          <div className="stat">
            <span className="stat-label">Players</span>
            <span className="stat-number">2</span>
          </div>
        </div>

        <button className="menu-button-enhanced" onClick={() => onStartGame('online')}>
          <span className="button-shine"></span>
          <span className="button-text">PLAY WITH FRIEND / ONLINE</span>
          <span className="button-glow"></span>
        </button>

        <button className="menu-button-enhanced bot-button" onClick={() => onStartGame('bot')}>
          <span className="button-shine"></span>
          <span className="button-text">PLAY VS BOT</span>
          <span className="button-glow"></span>
        </button>

        <footer className="menu-footer">
          <p>v1.0 - 3D Battle Arena</p>
        </footer>
      </div>
    </div>
  );
};

export default Menu;
