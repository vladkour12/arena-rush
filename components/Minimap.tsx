import React from 'react';
import { Vector2, LootItem, Player } from '../types';
import { MINIMAP_SIZE, MINIMAP_SCALE, MINIMAP_ITEM_DETECTION_RANGE, MAP_SIZE } from '../constants';
import { getDistance } from '../utils/gameUtils';

interface MinimapProps {
  playerPosition: Vector2;
  enemyPosition: Vector2;
  lootItems: LootItem[];
  zoneRadius: number;
  zoneCenter?: Vector2;
}

export const Minimap: React.FC<MinimapProps> = ({
  playerPosition,
  enemyPosition,
  lootItems,
  zoneRadius,
  zoneCenter = { x: MAP_SIZE / 2, y: MAP_SIZE / 2 }
}) => {
  // Convert world position to minimap position
  const worldToMinimap = (worldPos: Vector2): Vector2 => {
    return {
      x: worldPos.x * MINIMAP_SCALE,
      y: worldPos.y * MINIMAP_SCALE
    };
  };

  const playerMiniPos = worldToMinimap(playerPosition);
  const enemyMiniPos = worldToMinimap(enemyPosition);
  const zoneCenterMini = worldToMinimap(zoneCenter);
  const zoneRadiusMini = zoneRadius * MINIMAP_SCALE;

  // Filter nearby items within detection range
  const nearbyItems = lootItems.filter(item => {
    const dist = getDistance(playerPosition, item.position);
    return dist <= MINIMAP_ITEM_DETECTION_RANGE;
  });

  return (
    <div 
      className="absolute top-4 left-4 z-30 pointer-events-none"
      style={{
        width: MINIMAP_SIZE,
        height: MINIMAP_SIZE
      }}
    >
      {/* Minimap container */}
      <div className="relative w-full h-full bg-slate-900/80 backdrop-blur-md rounded-lg border-2 border-slate-700 shadow-2xl overflow-hidden">
        {/* Zone circle */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox={`0 0 ${MINIMAP_SIZE} ${MINIMAP_SIZE}`}
        >
          {/* Zone boundary */}
          <circle
            cx={zoneCenterMini.x}
            cy={zoneCenterMini.y}
            r={zoneRadiusMini}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeDasharray="4,4"
            opacity="0.6"
          />

          {/* Nearby loot items with directional indicators */}
          {nearbyItems.map((item, idx) => {
            const itemMiniPos = worldToMinimap(item.position);
            const dx = item.position.x - playerPosition.x;
            const dy = item.position.y - playerPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // Calculate position on minimap
            const distOnMinimap = distance * MINIMAP_SCALE;
            
            // If item is close enough to show on minimap
            if (distOnMinimap < MINIMAP_SIZE / 2) {
              return (
                <g key={`item-${idx}`}>
                  {/* Item dot */}
                  <circle
                    cx={itemMiniPos.x}
                    cy={itemMiniPos.y}
                    r="3"
                    fill="#fbbf24"
                    opacity="0.8"
                  />
                  {/* Pulsing ring */}
                  <circle
                    cx={itemMiniPos.x}
                    cy={itemMiniPos.y}
                    r="4"
                    fill="none"
                    stroke="#fbbf24"
                    strokeWidth="1"
                    opacity="0.5"
                  >
                    <animate
                      attributeName="r"
                      values="3;6;3"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.5;0;0.5"
                      dur="1.5s"
                      repeatCount="indefinite"
                    />
                  </circle>
                </g>
              );
            }

            // If item is outside minimap, show directional arrow at edge
            const edgeX = playerMiniPos.x + Math.cos(angle) * (MINIMAP_SIZE / 2 - 10);
            const edgeY = playerMiniPos.y + Math.sin(angle) * (MINIMAP_SIZE / 2 - 10);

            return (
              <g key={`item-edge-${idx}`}>
                {/* Directional indicator */}
                <circle
                  cx={edgeX}
                  cy={edgeY}
                  r="2"
                  fill="#fbbf24"
                  opacity="0.6"
                />
              </g>
            );
          })}

          {/* Enemy position */}
          <circle
            cx={enemyMiniPos.x}
            cy={enemyMiniPos.y}
            r="4"
            fill="#ef4444"
            opacity="0.9"
          />

          {/* Player position (center) */}
          <circle
            cx={playerMiniPos.x}
            cy={playerMiniPos.y}
            r="4"
            fill="#10b981"
            stroke="#fff"
            strokeWidth="1"
          />
          
          {/* Player direction indicator */}
          <line
            x1={playerMiniPos.x}
            y1={playerMiniPos.y}
            x2={playerMiniPos.x}
            y2={playerMiniPos.y - 8}
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>

        {/* Scanner effect - rotating sweep */}
        <div 
          className="absolute inset-0 overflow-hidden"
          style={{
            background: `conic-gradient(from 0deg at ${playerMiniPos.x}px ${playerMiniPos.y}px, transparent 350deg, rgba(16, 185, 129, 0.2) 360deg)`
          }}
        >
          <div 
            className="absolute w-full h-full animate-spin"
            style={{
              animationDuration: '3s',
              background: `conic-gradient(from 0deg at ${playerMiniPos.x}px ${playerMiniPos.y}px, transparent 350deg, rgba(16, 185, 129, 0.3) 360deg)`
            }}
          />
        </div>

        {/* Label */}
        <div className="absolute bottom-1 right-1 text-[8px] text-slate-400 font-bold uppercase tracking-wider">
          Scanner
        </div>

        {/* Item count indicator */}
        {nearbyItems.length > 0 && (
          <div className="absolute top-1 right-1 bg-yellow-500/90 text-slate-900 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            {nearbyItems.length}
          </div>
        )}
      </div>
    </div>
  );
};
