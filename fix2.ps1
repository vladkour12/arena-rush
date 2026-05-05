$f = 'c:\Users\vladk\Desktop\arena-rush\game\scenes\IslandWarsScene.ts'
$lines = [System.IO.File]::ReadAllLines($f)

# Find the line numbers
$startBad = -1
$endBad = -1
$insertAfter = -1  # line index after which to insert the new method

for ($i = 0; $i -lt $lines.Count; $i++) {
    # Find bad block start: the wrongly nested private method inside spawnStartUnits
    if ($lines[$i] -match '^\s+/\*\* Find the best castle spot and force-flatten') {
        $startBad = $i
    }
    # Find bad block end: closing brace + blank line after spot = this.pickRandomCastleSpot...
    if ($startBad -ge 0 -and $endBad -lt 0 -and $lines[$i] -match '^\s+return spot;') {
        # the } and blank line follow
        $endBad = $i + 2  # include the closing brace and blank line
    }
    # Find end of pickRandomCastleSpot (the last "return defaultSpot;" before "private spawnStartUnits")
    if ($lines[$i] -match '^\s+return defaultSpot;' -and $i -lt ($lines.Count - 5)) {
        # check the next non-blank line is a closing brace
        if ($lines[$i+1] -match '^\s+}$') {
            $insertAfter = $i + 1  # after the closing }
        }
    }
}

Write-Host "startBad=$startBad endBad=$endBad insertAfter=$insertAfter"

if ($startBad -lt 0 -or $endBad -lt 0) {
    Write-Host "ERROR: Could not find bad block boundaries"
    exit 1
}

# Remove lines from startBad to endBad (inclusive)
$removed = [System.Collections.Generic.List[string]]($lines)
$count = $endBad - $startBad + 1
$removed.RemoveRange($startBad, $count)
Write-Host "Removed $count lines starting at $startBad"

# Now find insertAfter in the new list (it may have shifted)
# Re-scan for insertAfter in the cleaned list
$insertIdx = -1
for ($i = 0; $i -lt $removed.Count - 3; $i++) {
    if ($removed[$i] -match '^\s+return defaultSpot;' -and $removed[$i+1] -match '^\s+}$') {
        # Make sure this is pickRandomCastleSpot (next non-blank line should be "private spawnStartUnits")
        $j = $i + 2
        while ($j -lt $removed.Count -and $removed[$j] -match '^\s*$') { $j++ }
        if ($removed[$j] -match 'private spawnStartUnits') {
            $insertIdx = $i + 2  # insert after the closing brace of pickRandomCastleSpot
            break
        }
    }
}
Write-Host "insertIdx=$insertIdx"

if ($insertIdx -lt 0) {
    Write-Host "ERROR: Could not find insertion point"
    exit 1
}

# Build the new method lines
$newMethod = @(
  '',
  '  /** Find the best castle spot and force-flatten a 14x14 area so buildings always have room. */',
  '  private pickAndFlattenCastleArea(faction: Faction, _defaultSpot: { tx: number; ty: number }): { tx: number; ty: number } {',
  '    const spot = this.pickRandomCastleSpot(faction);',
  '    const flatRadius = 7;',
  '    for (let dty = -flatRadius; dty < flatRadius + 4; dty++) {',
  '      for (let dtx = -flatRadius; dtx < flatRadius + 4; dtx++) {',
  '        const cx = spot.tx + dtx;',
  '        const cy = spot.ty + dty;',
  '        if (cx < 1 || cy < 1 || cx >= MAP_COLS - 1 || cy >= MAP_ROWS - 1) continue;',
  '        const cell = this.terrainGrid[cy]?.[cx];',
  '        if (!cell || cell.water || cell.bridge) continue;',
  '        cell.level = 1;',
  "        cell.tileKind = 'flat';",
  '        cell.walkable = true;',
  '        cell.buildable = true;',
  '        cell.stair = false;',
  '      }',
  '    }',
  '    return spot;',
  '  }'
)

$removed.InsertRange($insertIdx, [string[]]$newMethod)
Write-Host "Inserted method at $insertIdx"

[System.IO.File]::WriteAllLines($f, $removed, [System.Text.UTF8Encoding]::new($false))
Write-Host "File written. Total lines: $($removed.Count)"
