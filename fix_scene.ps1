$file = "c:\Users\vladk\Desktop\arena-rush\game\scenes\IslandWarsScene.ts"
$lines = Get-Content $file -Encoding UTF8

Write-Host "Total lines: $($lines.Count)"

# Find line numbers
$orphanStart = -1
$realStart = -1
$count = 0
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s+private getTerrainCell") {
        $count++
        if ($count -eq 1) { $orphanStart = $i; Write-Host "Orphan getTerrainCell at line $($i+1)" }
        if ($count -eq 2) { $realStart = $i; Write-Host "Real getTerrainCell at line $($i+1)" }
    }
}

# Find the old isInBounds just before the real getTerrainCell
$oldIsInBoundsEnd = -1
for ($i = $realStart - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match "^\s+}") {
        $oldIsInBoundsEnd = $i
        Write-Host "Old isInBounds end at line $($i+1)"
        break
    }
}

if ($orphanStart -ge 0 -and $oldIsInBoundsEnd -ge 0) {
    # Remove from orphanStart to oldIsInBoundsEnd (inclusive)
    Write-Host "Removing lines $($orphanStart+1) to $($oldIsInBoundsEnd+1)"
    $keep = @($lines[0..($orphanStart-1)]) + @($lines[($oldIsInBoundsEnd+1)..($lines.Count-1)])
    Set-Content $file $keep -Encoding UTF8
    Write-Host "Done. New line count: $($keep.Count)"
} else {
    Write-Host "Could not find boundaries!"
}
