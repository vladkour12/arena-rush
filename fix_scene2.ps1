$file = "c:\Users\vladk\Desktop\arena-rush\game\scenes\IslandWarsScene.ts"
$lines = Get-Content $file -Encoding UTF8
Write-Host "Total lines: $($lines.Count)"

# Find start of updateIslandDrift (1-based line number)
$deleteStart = -1
$deleteEnd = -1
$placeResourcesLine = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "^\s+private updateIslandDrift\(\)") {
        $deleteStart = $i  # 0-based
        Write-Host "updateIslandDrift at line $($i+1)"
    }
    if ($lines[$i] -match "^\s+private placeResources\(\)") {
        $placeResourcesLine = $i  # 0-based
        Write-Host "placeResources at line $($i+1)"
        break
    }
}

if ($deleteStart -ge 0 -and $placeResourcesLine -gt $deleteStart) {
    $deleteEnd = $placeResourcesLine - 1  # index before placeResources (0-based inclusive)
    Write-Host "Removing 0-based indices $deleteStart to $deleteEnd"
    $keep = @($lines[0..($deleteStart-1)]) + @($lines[$deleteEnd..($lines.Count-1)])
    # Wait, we want to keep from $placeResourcesLine onward, so deleteEnd should be $placeResourcesLine - 1
    # and we keep $lines[0..($deleteStart-1)] + $lines[$placeResourcesLine..($lines.Count-1)]
    $keep = @($lines[0..($deleteStart-1)]) + @($lines[$placeResourcesLine..($lines.Count-1)])
    Set-Content $file $keep -Encoding UTF8
    Write-Host "Done. New line count: $($keep.Count)"
} else {
    Write-Host "ERROR: Couldn't find boundaries. deleteStart=$deleteStart placeResourcesLine=$placeResourcesLine"
}
