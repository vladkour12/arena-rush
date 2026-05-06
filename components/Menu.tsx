import React from 'react';

interface MenuProps {
  onStartGame: () => void;
}

const Menu: React.FC<MenuProps> = ({ onStartGame }) => {
  return (
    <div className="tk-menu-container">
      <div className="tk-menu-bg" />

      <div className="tk-menu-content">
        <div className="tk-menu-title-wrap">
          <div className="tk-menu-eyebrow">⚔ A Tiny Kingdoms Game ⚔</div>
          <h1 className="tk-menu-title">TINY KINGDOMS</h1>
          <p className="tk-menu-subtitle">Command your island. Build fast. Break the enemy castle.</p>
        </div>

        <div className="tk-menu-cards">
          <button
            className="tk-menu-card tk-menu-card-rts"
            onClick={() => onStartGame()}
          >
            <div className="tk-card-icon tk-card-icon-rts" aria-hidden="true" />
            <div className="tk-card-title">Island Wars</div>
            <div className="tk-card-desc">
              Main mode. Gather resources, expand your base, train units, and win before
              the clock hits zero.
            </div>
            <div className="tk-card-badge">8 min · Strategy</div>
          </button>

          <div className="tk-menu-card tk-menu-card-arena tk-menu-card-soon">
            <div className="tk-card-icon tk-card-icon-arena" aria-hidden="true" />
            <div className="tk-card-title">Arena Battle</div>
            <div className="tk-card-desc">
              Instant combat mode. No economy phase, just direct army clashes in
              short high-pressure fights.
            </div>
            <div className="tk-card-badge tk-badge-soon">Coming Soon</div>
          </div>
        </div>

        <footer className="tk-menu-footer">
          <p>Powered by Tiny Swords assets · Built with Phaser 4</p>
        </footer>
      </div>
    </div>
  );
};

export default Menu;
