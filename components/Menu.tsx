import React from 'react';

interface MenuProps {
  onStartGame: () => void;
  onStartShooter: () => void;
}

const Menu: React.FC<MenuProps> = ({ onStartGame, onStartShooter }) => {
  return (
    <div className="tk-menu-container">
      <div className="tk-menu-bg" />

      <div className="tk-menu-content">
        <div className="tk-menu-title-wrap">
          <div className="tk-menu-eyebrow">⚔ A Tiny Kingdoms Game ⚔</div>
          <h1 className="tk-menu-title">TINY KINGDOMS</h1>
          <p className="tk-menu-subtitle">Pick your battle.</p>
        </div>

        <div className="tk-menu-cards">
          <button className="tk-menu-card tk-menu-card-rts" onClick={onStartGame}>
            <div className="tk-card-icon tk-card-icon-rts" aria-hidden="true" />
            <div className="tk-card-title">Island Wars</div>
            <div className="tk-card-desc">
              Main mode. Gather resources, expand your base, train units, and win before
              the clock hits zero.
            </div>
            <div className="tk-card-badge">8 min · Strategy</div>
          </button>

          <button className="tk-menu-card tk-menu-card-arena" onClick={onStartShooter}>
            <div className="tk-card-icon tk-card-icon-arena" aria-hidden="true" />
            <div className="tk-card-title">1v1 Shooter</div>
            <div className="tk-card-desc">
              Top-down twin-stick deathmatch. Play your friend over the internet, or duel a bot.
            </div>
            <div className="tk-card-badge">~5 min · Action</div>
          </button>
        </div>

        <footer className="tk-menu-footer">
          <p>Powered by Tiny Swords + Top-Down Shooter assets · Built with Phaser 4</p>
        </footer>
      </div>
    </div>
  );
};

export default Menu;
