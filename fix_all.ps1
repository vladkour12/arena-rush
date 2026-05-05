$ErrorActionPreference = 'Stop'
$f = 'c:\Users\vladk\Desktop\arena-rush\game\scenes\IslandWarsScene.ts'
$lines = [System.Collections.Generic.List[string]]([System.IO.File]::ReadAllLines($f))
Write-Host "Loaded $($lines.Count) lines"
function FLM([string]$pattern, [int]$after = 0) {
    for ($i = $after; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) { return $i }
    }
    return -1
}
function FME([int]$startLine) {
    $depth = 0; $started = $false
    for ($i = $startLine; $i -lt [Math]::Min($startLine + 200, $lines.Count); $i++) {
        foreach ($ch in $lines[$i].ToCharArray()) {
            if ($ch -eq '{') { $depth++; $started = $true }
            if ($ch -eq '}') { $depth--; if ($started -and $depth -eq 0) { return $i } }
        }
    }
    return -1
}

# 1. Add preloc fields after terrainVisuals
$idx = FLM 'private terrainVisuals.*\[\]'
Write-Host "1. terrainVisuals at $idx"
$lines.Insert($idx + 1, '  private p1CastlePreloc: { tx: number; ty: number } = { tx: P1_CASTLE_TX, ty: P1_CASTLE_TY };')
$lines.Insert($idx + 2, '  private p2CastlePreloc: { tx: number; ty: number } = { tx: P2_CASTLE_TX, ty: P2_CASTLE_TY };')

# 2. 7-tier terrain gen - find block start/end
$bs = FLM "^\s+if \(h < 0\.42\)"
$be = -1
for ($i = $bs; $i -lt ($bs + 20); $i++) {
    if ($lines[$i] -match "cell\.tileKind = 'flat'") { $be = $i + 1; break }
}
Write-Host "2. 4-tier block: $bs to $be"
$t7 = [string[]]@(
    '        if (h < 0.42) {',
    "          cell.level = 1; cell.tileKind = 'beach'; cell.buildable = false;",
    '        } else if (hill > 0.76 && h > 0.90) {',
    "          cell.level = 7; cell.tileKind = 'summit'; cell.buildable = false;",
    '        } else if (hill > 0.70 && h > 0.84) {',
    "          cell.level = 6; cell.tileKind = 'summit'; cell.buildable = false;",
    '        } else if (hill > 0.62 && h > 0.78) {',
    "          cell.level = 5; cell.tileKind = 'summit'; cell.buildable = false;",
    '        } else if (hill > 0.54 && h > 0.70) {',
    "          cell.level = 4; cell.tileKind = 'summit'; cell.buildable = false;",
    '        } else if (hill > 0.50 && h > 0.68) {',
    "          cell.level = 3; cell.tileKind = 'elevated'; cell.buildable = false;",
    '        } else if (hill > 0.34 && h > 0.55) {',
    "          cell.level = 2; cell.tileKind = 'elevated'; cell.buildable = false;",
    '        } else {',
    "          cell.level = 1; cell.tileKind = 'flat'; cell.buildable = true;",
    '        }'
)
$rc = $be - $bs + 1; $lines.RemoveRange($bs, $rc); $lines.InsertRange($bs, $t7)
Write-Host "   removed $rc, inserted $($t7.Count)"

# 3. Add pre-flatten calls before applyWorldStairs
$scl = FLM "this\.applyWorldStairs\(\)"
Write-Host "3. applyWorldStairs call at $scl"
$pf = [string[]]@(
    "    // Pre-flatten castle compound areas so buildings always land on flat ground.",
    "    const p1Default = { tx: P1_CASTLE_TX, ty: P1_CASTLE_TY };",
    "    const p2Default = { tx: P2_CASTLE_TX, ty: P2_CASTLE_TY };",
    "    this.p1CastlePreloc = this.pickAndFlattenCastleArea('blue', p1Default);",
    "    this.p2CastlePreloc = this.pickAndFlattenCastleArea('red',  p2Default);",
    ""
)
$lines.InsertRange($scl, $pf)

# 4. Replace liftFor + tintFor with 7-tier versions
$ls = FLM "Per-tier vertical lift.*drives the parallax"
$le = -1
for ($i = $ls; $i -lt ($ls + 30); $i++) {
    if ($lines[$i] -match "^\s+return null;") { $le = $i + 1; break }
}
Write-Host "4. liftFor/tintFor: $ls to $le"
$lt = [string[]]@(
    '    const liftFor = (lv: number): number => {',
    '      if (lv >= 7) return 200;',
    '      if (lv >= 6) return 162;',
    '      if (lv >= 5) return 126;',
    '      if (lv >= 4) return 92;',
    '      if (lv >= 3) return 60;',
    '      if (lv >= 2) return 30;',
    '      return 0;',
    '    };',
    '    const tintFor = (lv: number, isBeach: boolean): number | null => {',
    '      if (isBeach) return 0xe8c872;',
    '      if (lv >= 7) return 0xf8fbff;',
    '      if (lv >= 6) return 0xd8eaf5;',
    '      if (lv >= 5) return 0xffffff;',
    '      if (lv >= 4) return 0xe9efe0;',
    '      if (lv >= 3) return 0xb6c8a6;',
    '      if (lv >= 2) return 0xd4eba8;',
    '      return null;',
    '    };'
)
$rc2 = $le - $ls + 1; $lines.RemoveRange($ls, $rc2); $lines.InsertRange($ls, $lt)
Write-Host "   removed $rc2, inserted $($lt.Count)"

# 5. Fix canTraverse
$cts = FLM 'private canTraverse\('
$cte = FME $cts
Write-Host "5. canTraverse: $cts to $cte"
$ct = [string[]]@(
    '  private canTraverse(from: TerrainCell, to: TerrainCell) {',
    '    if (!to.walkable) return false;',
    '    if (from.level === to.level) return true;',
    '    // Cross-level movement only allowed through stair-marked tiles.',
    '    return from.stair || to.stair;',
    '  }'
)
$rcc = $cte - $cts + 1; $lines.RemoveRange($cts, $rcc); $lines.InsertRange($cts, $ct)
Write-Host "   removed $rcc, inserted $($ct.Count)"

# 6. Replace applyWorldStairs
$aws = FLM 'Place stair openings at all level'
if ($aws -lt 0) { $aws = FLM 'private applyWorldStairs\(\)' }
$awe = FME $aws
Write-Host "6. applyWorldStairs: $aws to $awe"
$aw = [string[]]@(
    '  private applyWorldStairs() {',
    '    const markStair = (tx: number, ty: number) => {',
    '      const cell = this.terrainGrid[ty]?.[tx];',
    '      if (!cell || cell.water) return;',
    "      cell.stair = true; cell.tileKind = 'stair'; cell.walkable = true; cell.buildable = false;",
    '    };',
    '    for (let ty = 2; ty < MAP_ROWS - 3; ty++) {',
    '      for (let tx = 2; tx < MAP_COLS - 2; tx++) {',
    '        const cell = this.terrainGrid[ty]?.[tx];',
    '        if (!cell || cell.water || cell.level < 2) continue;',
    '        const south = this.terrainGrid[ty + 1]?.[tx];',
    '        if (!south || south.water || south.level >= cell.level) continue;',
    '        const lOk = (this.terrainGrid[ty]?.[tx - 1]?.level ?? 0) >= cell.level;',
    '        const rOk = (this.terrainGrid[ty]?.[tx + 1]?.level ?? 0) >= cell.level;',
    '        if (!lOk || !rOk) continue;',
    '        if ((tx * 31 + ty * 19 + cell.level * 7) % 5 !== 0) continue;',
    '        for (let dx = -1; dx <= 1; dx++) {',
    '          markStair(tx + dx, ty); markStair(tx + dx, ty + 1);',
    '          let sy = ty + 2;',
    '          while (sy < MAP_ROWS) {',
    '            const bw = this.terrainGrid[sy]?.[tx + dx];',
    '            const ab = this.terrainGrid[sy - 1]?.[tx + dx];',
    '            if (!bw || bw.water || !ab || ab.level <= bw.level) break;',
    '            markStair(tx + dx, sy); sy++;',
    '          }',
    '        }',
    '      }',
    '    }',
    '    for (let ty = 2; ty < MAP_ROWS - 2; ty++) {',
    '      for (let tx = 2; tx < MAP_COLS - 3; tx++) {',
    '        const cell = this.terrainGrid[ty]?.[tx];',
    '        if (!cell || cell.water || cell.level < 2) continue;',
    '        const east = this.terrainGrid[ty]?.[tx + 1];',
    '        if (!east || east.water || east.level >= cell.level) continue;',
    '        const tOk = (this.terrainGrid[ty - 1]?.[tx]?.level ?? 0) >= cell.level;',
    '        const bOk = (this.terrainGrid[ty + 1]?.[tx]?.level ?? 0) >= cell.level;',
    '        if (!tOk || !bOk) continue;',
    '        if ((tx * 41 + ty * 23 + cell.level * 11) % 5 !== 0) continue;',
    '        for (let dy = -1; dy <= 1; dy++) { markStair(tx, ty + dy); markStair(tx + 1, ty + dy); }',
    '      }',
    '    }',
    '  }'
)
$raw = $awe - $aws + 1; $lines.RemoveRange($aws, $raw); $lines.InsertRange($aws, $aw)
Write-Host "   removed $raw, inserted $($aw.Count)"

# 7. Add pickAndFlattenCastleArea after pickRandomCastleSpot
$prcs = FLM 'private pickRandomCastleSpot\('
$prce = FME $prcs
Write-Host "7. pickRandomCastleSpot ends at $prce"
$pfa = [string[]]@(
    '',
    '  private pickAndFlattenCastleArea(faction: Faction, _defaultSpot: { tx: number; ty: number }): { tx: number; ty: number } {',
    '    const spot = this.pickRandomCastleSpot(faction);',
    '    for (let dty = -7; dty < 11; dty++) {',
    '      for (let dtx = -7; dtx < 11; dtx++) {',
    '        const cx = spot.tx + dtx; const cy = spot.ty + dty;',
    '        if (cx < 1 || cy < 1 || cx >= MAP_COLS - 1 || cy >= MAP_ROWS - 1) continue;',
    '        const cell = this.terrainGrid[cy]?.[cx];',
    '        if (!cell || cell.water || cell.bridge) continue;',
    "        cell.level = 1; cell.tileKind = 'flat'; cell.walkable = true; cell.buildable = true; cell.stair = false;",
    '      }',
    '    }',
    '    return spot;',
    '  }'
)
$lines.InsertRange($prce + 1, $pfa)

# 8. Replace spawnStartBuildings + add buildFortressCompound
$ssbs = FLM 'private spawnStartBuildings\(\)'
$ssbe = FME $ssbs
Write-Host "8. spawnStartBuildings: $ssbs to $ssbe"
$ssb = [string[]]@(
    '  private spawnStartBuildings() {',
    '    const p1Spot = this.p1CastlePreloc;',
    '    const p2Spot = this.p2CastlePreloc;',
    "    const p1Castle = this.placeBuilding('castle', 'blue', p1Spot.tx, p1Spot.ty)",
    "      ?? this.placeBuilding('castle', 'blue', P1_CASTLE_TX, P1_CASTLE_TY);",
    "    const p2Castle = this.placeBuilding('castle', 'red', p2Spot.tx, p2Spot.ty)",
    "      ?? this.placeBuilding('castle', 'red', P2_CASTLE_TX, P2_CASTLE_TY);",
    '    if (p1Castle) {',
    '      this.p1SpawnPoint = { x: (p1Castle.tx + BUILDING_CONFIGS.castle.width * 0.5) * TILE_SIZE, y: (p1Castle.ty + BUILDING_CONFIGS.castle.height) * TILE_SIZE };',
    "      this.buildFortressCompound('blue', p1Castle.tx, p1Castle.ty);",
    '    }',
    '    if (p2Castle) {',
    '      this.p2SpawnPoint = { x: (p2Castle.tx + BUILDING_CONFIGS.castle.width * 0.5) * TILE_SIZE, y: (p2Castle.ty + BUILDING_CONFIGS.castle.height) * TILE_SIZE };',
    "      this.buildFortressCompound('red', p2Castle.tx, p2Castle.ty);",
    '    }',
    '  }',
    '',
    '  private buildFortressCompound(faction: Faction, cTx: number, cTy: number) {',
    '    const T = TILE_SIZE;',
    '    const cW = BUILDING_CONFIGS.castle.width; const cH = BUILDING_CONFIGS.castle.height;',
    '    const wc = 0x8a9aa8; const wa = 0.92; const wt = Math.round(T * 0.40);',
    '    const drawH = (x1: number, x2: number, row: number) => {',
    '      const g = this.add.graphics({ fillStyle: { color: wc, alpha: wa } });',
    '      g.fillRect(Math.min(x1,x2)*T, row*T+(T-wt)/2, (Math.abs(x2-x1)+1)*T, wt);',
    '      g.setDepth(55);',
    '    };',
    '    const drawV = (col: number, y1: number, y2: number) => {',
    '      const g = this.add.graphics({ fillStyle: { color: wc, alpha: wa } });',
    '      g.fillRect(col*T+(T-wt)/2, Math.min(y1,y2)*T, wt, (Math.abs(y2-y1)+1)*T);',
    '      g.setDepth(55);',
    '    };',
    '    const iL = cTx-2; const iR = cTx+cW+1; const iT = cTy-2; const iB = cTy+cH+1;',
    '    drawH(iL+1,iR-1,iT); drawH(iL+1,iR-1,iB); drawV(iL,iT+1,iB-1); drawV(iR,iT+1,iB-1);',
    "    this.placeBuilding('tower',faction,iL,iT); this.placeBuilding('tower',faction,iR,iT);",
    "    this.placeBuilding('tower',faction,iL,iB); this.placeBuilding('tower',faction,iR,iB);",
    '    const oL = cTx-7; const oR = cTx+cW+6; const oT = cTy-7; const oB = cTy+cH+6;',
    '    drawH(oL+1,oR-1,oT); drawH(oL+1,oR-1,oB); drawV(oL,oT+1,oB-1); drawV(oR,oT+1,oB-1);',
    "    this.placeBuilding('tower',faction,oL,oT); this.placeBuilding('tower',faction,oR,oT);",
    "    this.placeBuilding('tower',faction,oL,oB); this.placeBuilding('tower',faction,oR,oB);",
    "    this.placeBuilding('house',faction,cTx-4,cTy+1); this.placeBuilding('house',faction,cTx+cW+1,cTy+1);",
    "    this.placeBuilding('workshop',faction,cTx-4,cTy-2); this.placeBuilding('fort',faction,cTx+cW+1,cTy-2);",
    "    this.placeBuilding('barracks',faction,cTx-5,cTy+4);",
    '  }'
)
$rss = $ssbe - $ssbs + 1; $lines.RemoveRange($ssbs, $rss); $lines.InsertRange($ssbs, $ssb)
Write-Host "   removed $rss, inserted $($ssb.Count)"

# 9. canPlaceBuildingAt border check
$cpb = FLM 'private canPlaceBuildingAt\('
$rtl = -1
for ($i = $cpb; $i -lt ($cpb + 30); $i++) {
    if ($lines[$i] -match '^\s+return true;\s*$') { $rtl = $i; break }
}
Write-Host "9. canPlaceBuildingAt return true at $rtl"
$bc = [string[]]@(
    '    for (let dtx = -1; dtx < cfg.width + 1; dtx++) {',
    '      for (let dty = -1; dty < cfg.height + 1; dty++) {',
    '        const bc = this.getTerrainCell(tx + dtx, ty + dty);',
    '        if (!bc || bc.water) return false;',
    '      }',
    '    }'
)
$lines.InsertRange($rtl, $bc)

# Save
[System.IO.File]::WriteAllLines($f, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Host "Done! Total lines: $($lines.Count)"
