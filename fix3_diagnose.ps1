$f = 'c:\Users\vladk\Desktop\arena-rush\game\scenes\IslandWarsScene.ts'
$lines = [System.IO.File]::ReadAllLines($f)

# Step 1: Find and remove the broken CombatSystem block (lines that make up the first wrong instantiation)
# It starts with "    this.combatSystem = new CombatSystem(" (4 spaces indent)
# and its first lambda has no radiusTiles parameter
$firstStart = -1
$firstEnd = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s+this\.combatSystem = new CombatSystem\(') {
        if ($firstStart -lt 0) {
            $firstStart = $i
        }
    }
}

# Find the matching end of the first combatSystem block
# Look for the pattern `      () => this.isWarActive(),` followed by `    );`
$parenDepth = 0
$inBlock = $false
$blockStart = -1
$blockEnd = -1

for ($i = $firstStart; $i -lt [Math]::Min($firstStart + 30, $lines.Count); $i++) {
    if ($lines[$i] -match '^\s+this\.combatSystem = new CombatSystem\(' -and -not $inBlock) {
        $inBlock = $true
        $blockStart = $i
        $parenDepth = 1
    } elseif ($inBlock) {
        # Count opening parens from '('
        $opens = ([regex]::Matches($lines[$i], '\(')).Count
        $closes = ([regex]::Matches($lines[$i], '\)')).Count
        $parenDepth += $opens - $closes
        if ($parenDepth -le 0) {
            $blockEnd = $i
            break
        }
    }
}

Write-Host "First combatSystem block: lines $blockStart to $blockEnd"
Write-Host "Line $blockStart : $($lines[$blockStart])"
Write-Host "Line $blockEnd : $($lines[$blockEnd])"

# Step 2: Check what's inside the first block - does it have the wrong lambda?
$firstBlockHasGetTerrainLevel = $false
for ($i = $blockStart; $i -le $blockEnd; $i++) {
    if ($lines[$i] -match 'this\.terrainGrid\[ty\].*level') {
        $firstBlockHasGetTerrainLevel = $true
        break
    }
}
Write-Host "First block has getTerrainLevel: $firstBlockHasGetTerrainLevel"
