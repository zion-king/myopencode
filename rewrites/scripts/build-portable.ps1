param(
    [string]$TargetFolder = "C:\Users\pibzion\Local\Projects\OpenCode Dev\dist"
)

$ErrorActionPreference = "Stop"

# Get absolute paths
$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$desktopDir = Join-Path $repoRoot "packages\desktop"
$sourceDir = Join-Path $desktopDir "dist\win-unpacked"

Write-Host "1. Building unpacked OpenCode Dev app (skipping installer)..." -ForegroundColor Cyan
Set-Location $desktopDir

# --dir tells electron-builder to only create the unpacked folder, skipping the NSIS step that gets blocked
bunx electron-builder --win --dir --config electron-builder.config.ts

Write-Host "`n2. Preparing destination directory..." -ForegroundColor Cyan
$dateStr = Get-Date -Format "yyyy-MM-dd"

# Trim trailing slash if present
if ($TargetFolder.EndsWith("\") -or $TargetFolder.EndsWith("/")) { 
    $TargetFolder = $TargetFolder.Substring(0, $TargetFolder.Length - 1) 
}

$baseDestDir = "$TargetFolder\@opencode-aidesktop-$dateStr"
$destDir = $baseDestDir

# If you build multiple times in one day, append a number so we don't overwrite
$counter = 1
while (Test-Path $destDir) {
    $destDir = "$baseDestDir-$counter"
    $counter++
}

Write-Host "Copying build to $destDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Force $destDir | Out-Null
Copy-Item -Path "$sourceDir\*" -Destination $destDir -Recurse -Force

Write-Host "`nSUCCESS! Your portable app is ready at:" -ForegroundColor Green
Write-Host "$destDir" -ForegroundColor White
Write-Host "Run 'OpenCode Dev.exe' inside that folder to launch.`n" -ForegroundColor DarkGray
