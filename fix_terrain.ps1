$f = 'c:\Users\vladk\Desktop\arena-rush\game\scenes\IslandWarsScene.ts'
$c = [System.IO.File]::ReadAllText($f)
$nl = "`r`n"

# ─── 1. Expand terrain gen to 7 tiers ─────────────────────────────────────
$old = @"
        const hill = hillNoise(tx, ty);
        if (h < 0.42) {
          cell.level = 1; cell.tileKind = 'beach'; cell.buildable = false;
        } else if (hill > 0.62 && h > 0.78) {
          // Summit — peak of the mountain range
          cell.level = 4; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.50 && h > 0.68) {
          // Mountain — the tier below summit
          cell.level = 3; cell.tileKind = 'elevated'; cell.buildable = false;
        } else if (hill > 0.34 && h > 0.55) {
          // Hill / plateau
          cell.level = 2; cell.tileKind = 'elevated'; cell.buildable = true;
        } else {
          cell.level = 1; cell.tileKind = 'flat'; cell.buildable = true;
        }
"@
$new = @"
        const hill = hillNoise(tx, ty);
        if (h < 0.42) {
          cell.level = 1; cell.tileKind = 'beach'; cell.buildable = false;
        } else if (hill > 0.76 && h > 0.90) {
          cell.level = 7; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.70 && h > 0.84) {
          cell.level = 6; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.62 && h > 0.78) {
          cell.level = 5; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.54 && h > 0.70) {
          cell.level = 4; cell.tileKind = 'summit'; cell.buildable = false;
        } else if (hill > 0.50 && h > 0.68) {
          cell.level = 3; cell.tileKind = 'elevated'; cell.buildable = false;
        } else if (hill > 0.34 && h > 0.55) {
          cell.level = 2; cell.tileKind = 'elevated'; cell.buildable = false;
        } else {
          cell.level = 1; cell.tileKind = 'flat'; cell.buildable = true;
        }
"@
$c = $c.Replace($old.Replace("`n","`r`n"), $new.Replace("`n","`r`n"))
Write-Host "Step1 7tiers: $($c.Contains('cell.level = 7'))"

# ─── 2. Add pre-flatten call after applyWorldStairs comment ───────────────
$old2 = @"
    // ── 3. Stairs at elevation transitions ───────────────────────────────
    this.applyWorldStairs();
"@
$new2 = @"
    // Pre-flatten castle compound areas before rendering.
    const p1Default = { tx: P1_CASTLE_TX, ty: P1_CASTLE_TY };
    const p2Default = { tx: P2_CASTLE_TX, ty: P2_CASTLE_TY };
    this.p1CastlePreloc = this.pickAndFlattenCastleArea('blue', p1Default);
    this.p2CastlePreloc = this.pickAndFlattenCastleArea('red',  p2Default);

    // ── 3. Stairs at elevation transitions ───────────────────────────────
    this.applyWorldStairs();
"@
$c = $c.Replace($old2.Replace("`n","`r`n"), $new2.Replace("`n","`r`n"))
Write-Host "Step2 preloc call: $($c.Contains('pickAndFlattenCastleArea'))"

# ─── 3. Update liftFor to 7 tiers ─────────────────────────────────────────
$old3 = @"
    // Per-tier vertical lift (in pixels) — drives the parallax depth effect
    const liftFor = (lv: number): number => {
      if (lv >= 4) return 60; // summit
      if (lv >= 3) return 42; // mountain
      if (lv >= 2) return 22; // hill
      return 0;
    };
    // Per-tier surface tint — higher = lighter and slightly cooler
    const tintFor = (lv: number, isBeach: boolean): number | null => {
      if (isBeach) return 0xe8c872;
      if (lv >= 4) return 0xfdf6e3; // snow-tinged summit
      if (lv >= 3) return 0xb6c8a6; // cool mountain green
      if (lv >= 2) return 0xd4eba8; // hill bright green
      return null;
    };
"@
$new3 = @"
    const liftFor = (lv: number): number => {
      if (lv >= 7) return 200;
      if (lv >= 6) return 162;
      if (lv >= 5) return 126;
      if (lv >= 4) return 92;
      if (lv >= 3) return 60;
      if (lv >= 2) return 30;
      return 0;
    };
    const tintFor = (lv: number, isBeach: boolean): number | null => {
      if (isBeach) return 0xe8c872;
      if (lv >= 7) return 0xf8fbff;
      if (lv >= 6) return 0xd8eaf5;
      if (lv >= 5) return 0xffffff;
      if (lv >= 4) return 0xe9efe0;
      if (lv >= 3) return 0xb6c8a6;
      if (lv >= 2) return 0xd4eba8;
      return null;
    };
"@
$c = $c.Replace($old3.Replace("`n","`r`n"), $new3.Replace("`n","`r`n"))
Write-Host "Step3 liftFor7: $($c.Contains('if (lv >= 7) return 200'))"

# ─── 4. Fix canTraverse to block cross-level movement except at stairs ─────
$old4 = @"
  private canTraverse(from: TerrainCell, to: TerrainCell) {
    if (!to.walkable) return false;
    const levelDiff = Math.abs(from.level - to.level);
    // Allow any adjacent walkable cell within ±1 level — stair tiles are visual hints only
    return levelDiff <= 1;
  }
"@
$new4 = @"
  private canTraverse(from: TerrainCell, to: TerrainCell) {
    if (!to.walkable) return false;
    if (from.level === to.level) return true;
    // Cross-level movement only permitted through stair-marked tiles.
    return from.stair || to.stair;
  }
"@
$c = $c.Replace($old4.Replace("`n","`r`n"), $new4.Replace("`n","`r`n"))
Write-Host "Step4 canTraverse: $($c.Contains('Cross-level movement only permitted'))"

# ─── 5. Rewrite applyWorldStairs for all level transitions ─────────────────
$old5 = @"
  /** Place stair openings at all level-1↔level-2 transitions across the world map. */
  private applyWorldStairs() {
    const markPair = (fx: number, fy: number, ex: number, ey: number) => {
      const fc = this.terrainGrid[fy]?.[fx]; const ec = this.terrainGrid[ey]?.[ex];
      if (!fc || !ec || fc.water || ec.water) return;
      fc.stair = true; fc.tileKind = 'stair'; fc.walkable = true; fc.buildable = false;
      ec.stair = true; ec.tileKind = 'stair'; ec.walkable = true; ec.buildable = false;
    };
    let count = 0;
    for (let ty = 2; ty < MAP_ROWS - 2; ty++) {
      for (let tx = 2; tx < MAP_COLS - 2; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2) continue;
        type Dir = [number, number, number, number];
        const transitions: Dir[] = [];
        if ((this.terrainGrid[ty]?.[tx - 1]?.level ?? 0) < 2) transitions.push([tx - 1, ty, tx, ty]);
        if ((this.terrainGrid[ty]?.[tx + 1]?.level ?? 0) < 2) transitions.push([tx + 1, ty, tx, ty]);
        if ((this.terrainGrid[ty - 1]?.[tx]?.level ?? 0) < 2) transitions.push([tx, ty - 1, tx, ty]);
        if ((this.terrainGrid[ty + 1]?.[tx]?.level ?? 0) < 2) transitions.push([tx, ty + 1, tx, ty]);
        if (transitions.length === 0) continue;
        count++;
        if (count % 8 !== 0) continue;
        for (const [fx, fy, ex, ey] of transitions) {
          markPair(fx, fy, ex, ey);
          if (fx !== ex) { markPair(fx, fy - 1, ex, ey - 1); markPair(fx, fy + 1, ex, ey + 1); }
          else           { markPair(fx - 1, fy, ex - 1, ey); markPair(fx + 1, fy, ex + 1, ey); }
        }
      }
    }
  }
"@
$new5 = @"
  private applyWorldStairs() {
    const markStair = (tx: number, ty: number) => {
      const cell = this.terrainGrid[ty]?.[tx];
      if (!cell || cell.water) return;
      cell.stair = true; cell.tileKind = 'stair'; cell.walkable = true; cell.buildable = false;
    };
    // South-facing stairs: every level transition going south, placed every ~5 tiles.
    for (let ty = 2; ty < MAP_ROWS - 3; ty++) {
      for (let tx = 2; tx < MAP_COLS - 2; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2) continue;
        const south = this.terrainGrid[ty + 1]?.[tx];
        if (!south || south.water || south.level >= cell.level) continue;
        const lOk = (this.terrainGrid[ty]?.[tx - 1]?.level ?? 0) >= cell.level;
        const rOk = (this.terrainGrid[ty]?.[tx + 1]?.level ?? 0) >= cell.level;
        if (!lOk || !rOk) continue;
        if ((tx * 31 + ty * 19 + cell.level * 7) % 5 !== 0) continue;
        for (let dx = -1; dx <= 1; dx++) {
          markStair(tx + dx, ty);
          markStair(tx + dx, ty + 1);
          // Chain down through all intermediate lower tiers too.
          let sy = ty + 2;
          while (sy < MAP_ROWS) {
            const below = this.terrainGrid[sy]?.[tx + dx];
            const above = this.terrainGrid[sy - 1]?.[tx + dx];
            if (!below || below.water || !above || above.level <= below.level) break;
            markStair(tx + dx, sy);
            sy++;
          }
        }
      }
    }
    // East-facing stairs.
    for (let ty = 2; ty < MAP_ROWS - 2; ty++) {
      for (let tx = 2; tx < MAP_COLS - 3; tx++) {
        const cell = this.terrainGrid[ty]?.[tx];
        if (!cell || cell.water || cell.level < 2) continue;
        const east = this.terrainGrid[ty]?.[tx + 1];
        if (!east || east.water || east.level >= cell.level) continue;
        const tOk = (this.terrainGrid[ty - 1]?.[tx]?.level ?? 0) >= cell.level;
        const bOk = (this.terrainGrid[ty + 1]?.[tx]?.level ?? 0) >= cell.level;
        if (!tOk || !bOk) continue;
        if ((tx * 41 + ty * 23 + cell.level * 11) % 5 !== 0) continue;
        for (let dy = -1; dy <= 1; dy++) {
          markStair(tx, ty + dy);
          markStair(tx + 1, ty + dy);
        }
      }
    }
  }
"@
$c = $c.Replace($old5.Replace("`n","`r`n"), $new5.Replace("`n","`r`n"))
Write-Host "Step5 stairs: $($c.Contains('South-facing stairs'))"

# ─── Save ─────────────────────────────────────────────────────────────────
[System.IO.File]::WriteAllText($f, $c, [System.Text.Encoding]::UTF8)
Write-Host "All done. File length: $($c.Length)"
