param(
    [string]$TargetFolder = "C:\Users\pibzion\Local\Projects\OpenCode Dev\dist"
)

$ErrorActionPreference = "Stop"

# Get absolute paths
$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$desktopDir = Join-Path $repoRoot "packages\desktop"
$sourceDir = Join-Path $desktopDir "dist\win-unpacked"

Set-Location $desktopDir

# Step 1: compile JS assets (prebuild downloads the CLI sidecar + node bundle, then
# electron-vite build regenerates out/). Required so the package reflects current source;
# electron-builder only packages out/, it does not compile it.
Write-Host "1. Building JS assets (electron-vite build)..." -ForegroundColor Cyan
bun run build

# Step 2: package the compiled assets into an unpacked folder.
# --dir creates only the unpacked folder, skipping the NSIS installer step that Windows
# Application Control (AppLocker) blocks on unsigned local builds.
Write-Host "`n2. Packaging unpacked OpenCode Dev app (skipping installer)..." -ForegroundColor Cyan
bunx electron-builder --win --dir --config electron-builder.config.ts

Write-Host "`n3. Preparing destination directory..." -ForegroundColor Cyan
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

Write-Host "`n4. Copying build to $destDir" -ForegroundColor Cyan
New-Item -ItemType Directory -Force $destDir | Out-Null
Copy-Item -Path "$sourceDir\*" -Destination $destDir -Recurse -Force

Write-Host "`nSUCCESS! Your portable app is ready at:" -ForegroundColor Green
Write-Host "$destDir" -ForegroundColor White
Write-Host "Run 'OpenCode Dev.exe' inside that folder to launch.`n" -ForegroundColor DarkGray
