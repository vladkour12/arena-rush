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
          <a
            className="tk-menu-instagram"
            href="https://www.instagram.com/galwaysunsprouts2026?igsh=MXQ3bnd3dmt3N3Rmeg%3D%3D&utm_source=qr"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Follow us on Instagram"
          >
            <svg className="tk-ig-icon" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.97.24 2.43.403a4.9 4.9 0 0 1 1.77 1.152 4.9 4.9 0 0 1 1.153 1.77c.163.46.35 1.26.403 2.43.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.054 1.17-.24 1.97-.403 2.43a4.9 4.9 0 0 1-1.152 1.77 4.9 4.9 0 0 1-1.77 1.153c-.46.163-1.26.35-2.43.403-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.054-1.97-.24-2.43-.403a4.9 4.9 0 0 1-1.77-1.152 4.9 4.9 0 0 1-1.153-1.77c-.163-.46-.35-1.26-.403-2.43C2.175 15.747 2.163 15.367 2.163 12s.012-3.584.07-4.85c.054-1.17.24-1.97.403-2.43A4.9 4.9 0 0 1 3.788 2.95a4.9 4.9 0 0 1 1.77-1.153c.46-.163 1.26-.35 2.43-.403C9.254 2.175 9.634 2.163 12 2.163zm0-2.163C8.756 0 8.332.014 7.052.072 5.775.13 4.902.333 4.14.63A7.07 7.07 0 0 0 1.635 2.256 7.07 7.07 0 0 0 .008 4.76C-.288 5.522-.492 6.395-.55 7.672-.608 8.952-.622 9.376-.622 12.622c0 3.246.014 3.67.072 4.95.058 1.277.262 2.15.559 2.912a7.07 7.07 0 0 0 1.626 2.505 7.07 7.07 0 0 0 2.505 1.626c.762.297 1.635.5 2.912.559 1.28.058 1.704.072 4.95.072s3.67-.014 4.95-.072c1.277-.058 2.15-.262 2.912-.559a7.07 7.07 0 0 0 2.505-1.626 7.07 7.07 0 0 0 1.626-2.505c.297-.762.5-1.635.559-2.912.058-1.28.072-1.704.072-4.95s-.014-3.67-.072-4.95c-.058-1.277-.262-2.15-.559-2.912a7.07 7.07 0 0 0-1.626-2.505A7.07 7.07 0 0 0 19.24.63C18.478.333 17.605.13 16.328.072 15.048.014 14.624 0 11.378 0z"/>
              <path d="M12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zm0 10.162a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
            </svg>
            <span>@galwaysunsprouts2026</span>
          </a>
        </footer>
      </div>
    </div>
  );
};

export default Menu;
