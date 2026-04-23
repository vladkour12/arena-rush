import React from 'react';

interface MenuProps {
  onStartGame: (mode: 'island-wars' | 'arena') => void;
}

const Menu: React.FC<MenuProps> = ({ onStartGame }) => {
  return (
    <div className="tk-menu-container">
      <div className="tk-menu-bg" />

      <div className="tk-menu-content">
        <div className="tk-menu-title-wrap">
          <div className="tk-menu-eyebrow">⚔ A Tiny Kingdoms Game ⚔</div>
          <h1 className="tk-menu-title">TINY KINGDOMS</h1>
          <p className="tk-menu-subtitle">Conquer lands. Forge armies. Crush empires.</p>
        </div>

        <div className="tk-menu-cards">
          <button
            className="tk-menu-card tk-menu-card-rts"
            onClick={() => onStartGame('island-wars')}
          >
            <div className="tk-card-icon tk-card-icon-rts" aria-hidden="true" />
            <div className="tk-card-title">Island Wars</div>
            <div className="tk-card-desc">
              10-minute RTS battle. Gather gold &amp; wood, build barracks, train warriors, and
              invade your enemy's island when the bridge rises.
            </div>
            <div className="tk-card-badge">10 min · Strategy</div>
          </button>

          <button
            className="tk-menu-card tk-menu-card-arena"
            onClick={() => onStartGame('arena')}
          >
            <div className="tk-card-icon tk-card-icon-arena" aria-hidden="true" />
            <div className="tk-card-title">Arena Battle</div>
            <div className="tk-card-desc">
              Quick 3-minute skirmish. Both sides start with an army. No building, no gathering —
              just pure combat. Destroy the enemy castle to win.
            </div>
            <div className="tk-card-badge">3 min · Action</div>
          </button>
        </div>

        <footer className="tk-menu-footer">
          <p>Powered by Tiny Swords assets · Built with Phaser 3</p>
        </footer>
      </div>
    </div>
  );
};

export default Menu;
