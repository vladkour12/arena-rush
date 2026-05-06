# Game Logic Rewrite - Complete Implementation Guide

## Overview

This document describes the complete game logic system rewrite for Tiny Kingdoms (1v1 RTS). The new architecture implements:

- **5-phase game system** with distinct mechanics for each phase
- **Castle-based victory system** with HP tracking and repair mechanics
- **Resource management** with phase-based income multipliers
- **Building system** with 6 structure types and upgrade progression
- **Unit training queue** with prerequisites and costs
- **Combat resolver** with type advantages, critical hits, and targeting priority
- **AI opponent** with phase-adaptive strategy
- **Victory checker** with multiple win conditions

---

## File Structure

### New Files Created

```
game/systems/
  PhaseManager.ts          # 5-phase system with timing and mechanics
  GameState.ts             # Central game state manager
  BuildingSystem.ts        # Building management and bonuses
  UnitTraining.ts          # Unit training queue
  CombatResolver.ts        # Combat calculation and resolution
  VictoryChecker.ts        # Victory condition checking
  AIController.ts          # Phase-adaptive AI opponent

game/entities/
  Castle.ts                # Castle entity with HP and repair
```

---

## System Descriptions

### 1. PhaseManager (`game/systems/PhaseManager.ts`)

Manages the 5-phase game progression:

**Phases:**
- **DEPLOYMENT** (0-5 min): No combat, 0.75x income, 30% faster building
- **EARLY GAME** (5-15 min): Combat enabled, 1x income, 0.9x damage, Castle -50% damage
- **MID GAME** (15-25 min): Full combat, 1.5x income, 1.1x damage, normal castle damage
- **LATE GAME** (25-30 min): Massive battles, 2x income, 1.3x damage, Castle +50% damage
- **FINAL STAND** (30+ min): Sudden death, 3x castle damage, 2x unit damage, no income

**Key Methods:**
```typescript
start()                              // Initialize at game start
update()                             // Call each frame to check phase changes
getCurrentPhase(): GamePhase         // Get current phase name
getPhaseConfig(): PhaseConfig        // Get full config for current phase
getIncomeMultiplier(): number        // Resource generation multiplier
getDamageMultiplier(): number        // Unit damage multiplier
getCastleDamageMultiplier(): number  // Castle-specific damage multiplier
getTimerDisplay(): string            // Formatted "MM:SS" timer
isCombatEnabled(): boolean           // Combat availability
```

### 2. Castle (`game/entities/Castle.ts`)

Represents the player's castle with health and defensive mechanics.

**Mechanics:**
- 500 HP base health
- Can be repaired by Church: 10 HP/s per level (costs 2 gold/s)
- Defense: -10% damage reduction per Tower level
- Destruction triggers instant loss
- Phase-specific damage multipliers applied

**Key Methods:**
```typescript
getHP(): number                    // Current HP
getMaxHP(): number                 // Max HP
getHPPercent(): number             // HP as 0-1
isDestroyed(): boolean             // Check if destroyed
takeDamage(dmg, towerLevel, phaseMult): number  // Apply damage
repair(churchLevel, deltaSeconds, availableGold): number  // Restore HP
getDefenseMultiplier(towerLevel): number  // Calculate defense bonus
```

### 3. BuildingSystem (`game/systems/BuildingSystem.ts`)

Manages all building types and their bonuses.

**Buildings:**
- **Castle** (500 HP): Core structure
- **Barracks** (60w): +10% damage per level, unlocks Warrior/Pawn/Scout
- **House** (40w): +5 unit capacity per level
- **Tower** (90w): +15% castle defense per level
- **Archery** (140w): +15% ranged damage per level, unlocks Archers
- **Church** (80w): Heals castle, unlocks Monks

**Key Methods:**
```typescript
startBuilding(id, type, speedMult): boolean    // Begin construction
completeBuilding(id): boolean                  // Finish building
upgradeBuilding(id): boolean                   // Upgrade to next level
updateBuildings(deltaSeconds, speedMult): void // Update progress
hasBuilding(type): boolean                     // Check if built
getBuildingsByType(type): Building[]           // Get all of type
getDamageBonus(): number                       // Barracks bonus
getRangedDamageBonus(): number                 // Archery bonus
getTowerLevel(): number                        // Castle defense
getChurchLevel(): number                       // Healing level
getUnitCapacity(): number                      // Total unit limit
isUnitUnlocked(unitType): boolean              // Check prerequisites
```

### 4. UnitTraining (`game/systems/UnitTraining.ts`)

Manages unit training queue and prerequisites.

**Units:**
- **Pawn** (8g, 5s): Basic worker
- **Warrior** (25g, 10s): Melee damage
- **Archer** (40g, 8s): Ranged damage (requires Archery)
- **Monk** (55g, 12s): Healer (requires Church)
- **Scout** (75g, 6s): Fast attacker

**Key Methods:**
```typescript
canTrain(type, gold, hasBuilding, currentUnits, capacity): boolean
queueUnit(type, gold, hasBuilding, currentUnits, capacity): boolean
getCurrentTraining(): TrainingQueue | null
getQueue(): TrainingQueue[]
update(deltaSeconds): UnitType[]  // Returns newly completed units
getTrainingCost(type): number
getTrainingTime(type): number
getCurrentProgress(): number       // 0-100%
```

### 5. CombatResolver (`game/systems/CombatResolver.ts`)

Handles all combat mechanics.

**Combat Rules:**
- Speed-based turn order (fastest first)
- Target priority: enemy units (lowest HP) → castle
- Damage formula: base × team_mult × phase_mult × (1 - def×0.1) × variance × crit
- Type advantages: Warrior→Pawn (1.5x), Archer→Warrior (1.4x), Pawn→Archer (1.4x), Scout→Monk/Archer (1.3x)
- Critical hits: 10% chance for 1.5x damage
- Monks heal 5 HP to lowest HP ally instead of attacking
- Damage variance: ±15%

**Key Methods:**
```typescript
calculateDamage(attacker, defender, teamMult, phaseMult): DamageCalc
getUnitMoveOrder(units): Unit[]
findBestTarget(attacker, enemyUnits, castleExists): Unit | Castle | null
findHealTarget(alliedUnits): Unit | null
resolveUnitAction(...): CombatAction | null
simulateCombatRound(...): CombatAction[]
```

### 6. BuildingSystem & UnitTraining Integration

**Unlocked units by building:**
- **Barracks**: Warrior, Pawn, Scout
- **Archery**: Archer
- **Church**: Monk

### 7. VictoryChecker (`game/systems/VictoryChecker.ts`)

Determines match outcomes.

**Victory Conditions:**
1. **Castle Destroyed**: Instant win
2. **Units Wiped**: Win if opponent has no units and can't attack
3. **Timeout**: Judge by:
   - Castle HP (50% weight)
   - Units alive (30% weight)
   - Buildings standing (20% weight)

**Key Methods:**
```typescript
checkImmediate(p1Status, p2Status): VictoryResult | null
checkTimeout(p1Status, p2Status): VictoryResult | null
calculateTimeoutScore(status): number
formatVictoryMessage(result): string
```

### 8. GameState (`game/systems/GameState.ts`)

Central manager coordinating all systems.

**Key Methods:**
```typescript
start(): void                      // Initialize game
update(deltaSeconds): void         // Update all systems
getCurrentPhase(): GamePhase       // Get current phase
getPlayerState(faction): PlayerState  // Get P1 or P2 state
isGameOver(): boolean             // Check end state
getVictoryResult(): VictoryResult | null
spendResources(faction, gold, wood): boolean
trainUnit(faction, type): boolean
buildStructure(faction, type): boolean
getTimerDisplay(): string
```

### 9. AIController (`game/systems/AIController.ts`)

Phase-adaptive AI opponent.

**Strategies by Phase:**
- **DEPLOYMENT**: Build House → Barracks → Train Pawns
- **EARLY GAME**: Mix Pawns/Warriors, defend, small attacks
- **MID GAME**: Balanced army, add Archers/Monks, attack when stronger
- **LATE GAME**: Upgrade all buildings, aggressive unit production
- **FINAL STAND**: Rush with Scouts, ignore defense

**Key Methods:**
```typescript
update(gameState, deltaSeconds): AIDecision[]
getDifficultyMultiplier(difficulty): number
```

---

## Integration Steps

### Step 1: Wire into IslandWarsScene

```typescript
import { GameState } from '../systems/GameState';
import { AIController } from '../systems/AIController';

export class IslandWarsScene extends Phaser.Scene {
  private gameState: GameState;
  private aiController: AIController;

  constructor() {
    super('IslandWars');
    this.gameState = new GameState();
    this.aiController = new AIController();
  }

  create() {
    this.gameState.start();
    // ... rest of scene setup
  }

  update(time: number, delta: number) {
    const deltaSeconds = delta / 1000;
    
    // Update game logic
    this.gameState.update(deltaSeconds);
    
    // Get AI decisions
    const aiDecisions = this.aiController.update(this.gameState, deltaSeconds);
    this.processAIDecisions(aiDecisions);
    
    // Check victory
    if (this.gameState.isGameOver()) {
      const victory = this.gameState.getVictoryResult();
      this.showVictoryScreen(victory);
    }
  }

  private processAIDecisions(decisions: AIDecision[]): void {
    for (const decision of decisions) {
      switch (decision.action) {
        case 'train':
          this.gameState.trainUnit('p2', decision.targetType as any);
          break;
        case 'build':
          this.gameState.buildStructure('p2', decision.targetType!);
          break;
        // Handle other actions...
      }
    }
  }
}
```

### Step 2: Update React HUD

```typescript
// In components/IslandWars.tsx
const [gameState, setGameState] = useState<GameState | null>(null);

// Update HUD with phase info
const phaseConfig = gameState?.getPhaseManager().getPhaseConfig();
return (
  <div>
    {/* Phase banner */}
    <div style={{ background: phaseConfig?.bannerColor }}>
      {phaseConfig?.name}
    </div>
    
    {/* Timer */}
    <div>{gameState?.getTimerDisplay()}</div>
    
    {/* Resources */}
    <div>Gold: {playerState?.resources.gold}</div>
    <div>Wood: {playerState?.resources.wood}</div>
    
    {/* Castle HP */}
    <div>Castle: {playerState?.castle.getHP()}/{playerState?.castle.getMaxHP()}</div>
  </div>
);
```

### Step 3: Handle Unit/Building Creation

```typescript
// When a unit completes training
const completedUnits = playerState.unitTraining.update(deltaSeconds);
for (const unitType of completedUnits) {
  // Create unit in Phaser scene
  const unit = this.createUnit(unitType, playerFaction);
  gameState.addUnit(playerFaction);
}

// When building completes
playerState.buildings.updateBuildings(deltaSeconds, phaseConfig.buildingSpeedMultiplier);
// Check for completed buildings and create in scene
```

### Step 4: Integrate Combat

```typescript
// During combat phase
const p1Units = /* get player units */;
const p2Units = /* get AI units */;

const actions = gameState.getCombatResolver().simulateCombatRound(
  p1Units,
  p2Units,
  gameState.getPhaseManager().getDamageMultiplier(),
  gameState.getPhaseManager().getCastleDamageMultiplier(),
  !playerState.castle.isDestroyed(),
);

// Apply actions to game objects
for (const action of actions) {
  if (action.isHeal) {
    // Heal unit
  } else {
    // Damage unit/castle
  }
}
```

---

## Resource Generation by Phase

| Phase | Gold/s | Wood/s |
|-------|--------|--------|
| DEPLOYMENT | 2.25 | 1.5 |
| EARLY GAME | 3 | 2 |
| MID GAME | 4.5 | 3 |
| LATE GAME | 6 | 4 |
| FINAL STAND | 0 | 0 |

Plus bonus from:
- **House**: +2 gold per 5 seconds (simplified to continuous)
- **Workshop**: +2 wood per 5 seconds (if implemented)

---

## Unit Stats Reference

| Unit | HP | DMG | SPD | DEF | Range | Cost |
|------|----|----|-----|-----|-------|------|
| Pawn | 40 | 5 | 1 | 3 | 1 | 8g/5s |
| Warrior | 70 | 14 | 2 | 2 | 1 | 25g/10s |
| Archer | 35 | 12 | 3 | 1 | 3 | 40g/8s |
| Monk | 45 | 6 | 2 | 1 | 2 | 55g/12s |
| Scout | 30 | 10 | 5 | 0 | 1 | 75g/6s |

---

## Building Stats Reference

| Building | Cost | Max Lvl | Bonus | Unlock |
|----------|------|---------|--------|--------|
| Barracks | 60w | 3 | +10% dmg | Warrior/Pawn/Scout |
| House | 40w | 3 | +5 cap | - |
| Tower | 90w | 3 | +15% def | - |
| Archery | 140w | 3 | +15% ranged dmg | Archer |
| Church | 80w | 3 | Heals 10 HP/s | Monk |
| Castle | - | 1 | 500 HP | - |

---

## Testing Checklist

- [ ] PhaseManager transitions correctly every 5 minutes
- [ ] Resource income matches phase multipliers
- [ ] Buildings take correct time to build (with speed multiplier)
- [ ] Castle takes phase-appropriate damage
- [ ] Units can only be trained if prerequisites are met
- [ ] Training queue processes correctly
- [ ] Combat resolver calculates damage with all modifiers
- [ ] Type advantages are applied correctly
- [ ] Critical hits occur at 10% rate
- [ ] Monk heals lowest HP ally instead of attacking
- [ ] Castle defense reduces damage correctly
- [ ] Victory conditions trigger appropriately
- [ ] AI makes decisions in all phases
- [ ] Game ends correctly at timeout
- [ ] Score calculation for timeout is correct

---

## Performance Considerations

- PhaseManager.update() is O(1) — no issues
- GameState.update() calls multiple systems — monitor for spikes
- CombatResolver.simulateCombatRound() is O(n²) for n units — manageable for typical unit counts
- AIController.update() makes decisions every 3 seconds (configurable)

---

## Future Enhancements

1. **Building defense**: Towers provide defense to nearby buildings
2. **Unit abilities**: Special abilities for Scout (scout/vision), Monk (group heal)
3. **Resource trading**: Allow selling resources for gold or vice versa
4. **Weather events**: Random events affecting resource generation
5. **Difficulty settings**: Easy (0.7x), Normal (1.0x), Hard (1.3x) multipliers to AI resources
6. **Replays**: Record and playback matches
7. **Leaderboard**: Track wins/losses across matches

---

## Debugging

Enable verbose logging:

```typescript
// In PhaseManager
console.log(`Phase changed to: ${this.currentPhase}`);
console.log(`Income multiplier: ${this.getIncomeMultiplier()}`);

// In GameState
console.log(`Resources: ${playerState.resources.gold}g, ${playerState.resources.wood}w`);
console.log(`Units: ${playerState.unitsCount}/${playerState.buildings.getUnitCapacity()}`);

// In VictoryChecker
console.log(`Victory: ${victory.reason}`);
```

---

## Questions & Support

For issues integrating these systems:
1. Check TypeScript compilation: `npx tsc --noEmit`
2. Verify all imports are correct
3. Ensure update() is called every frame for PhaseManager
4. Test each system independently before integration
