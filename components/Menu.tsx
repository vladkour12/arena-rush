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
          <p className="tk-menu-subtitle">Conquer lands. Forge armies. Crush empires.</p>
        </div>

        <div className="tk-menu-cards">
          <button
            className="tk-menu-card tk-menu-card-rts"
            onClick={() => onStartGame()}
          >
            <div className="tk-card-icon tk-card-icon-rts" aria-hidden="true" />
            <div className="tk-card-title">Island Wars</div>
            <div className="tk-card-desc">
              8-minute RTS battle. Gather gold &amp; wood, build armies, and crush the
              enemy castle before time runs out.
            </div>
            <div className="tk-card-badge">8 min · Strategy</div>
          </button>

          <div className="tk-menu-card tk-menu-card-arena tk-menu-card-soon">
            <div className="tk-card-icon tk-card-icon-arena" aria-hidden="true" />
            <div className="tk-card-title">Arena Battle</div>
            <div className="tk-card-desc">
              Quick skirmish. Both sides start with a full army — no building,
              no gathering. Pure combat.
            </div>
            <div className="tk-card-badge tk-badge-soon">Coming Soon</div>
          </div>

          <div className="tk-menu-card tk-menu-card-siege tk-menu-card-soon">
            <div className="tk-card-icon tk-card-icon-siege" aria-hidden="true" />
            <div className="tk-card-title">Siege &amp; Conquer</div>
            <div className="tk-card-desc">
              Defend your fortress against endless waves or lead a siege across
              multiple maps.
            </div>
            <div className="tk-card-badge tk-badge-soon">Coming Soon</div>
          </div>
        </div>

        <footer className="tk-menu-footer">
          <p>Powered by Tiny Swords assets · Built with Phaser 3</p>
        </footer>
      </div>
    </div>
  );
};

export default Menu;
