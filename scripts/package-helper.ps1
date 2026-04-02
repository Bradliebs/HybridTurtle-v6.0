# ============================================================
# HybridTurtle — Package Helper (called by package.bat)
# ============================================================
param(
    [string]$RootDir,
    [string]$ZipName
)

$ErrorActionPreference = 'Stop'

$zipPath = Join-Path $RootDir $ZipName
$staging = Join-Path $env:TEMP ('HybridTurtle-pkg-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$dest = Join-Path $staging 'HybridTurtle-v6.0'

# Excluded directory names (case-insensitive)
$excludeDirs = @(
    'node_modules', '.next', '.git', '.vercel', '.claude', '.pnp',
    'coverage', 'build', 'out', 'dist', 'backups'
)

# Excluded file patterns
$excludeFiles = @(
    '*.log', '*.pem', '*.db', '*.db-journal', '*.db-shm', '*.db-wal',
    '.env', '.env.local', '.env.*.local',
    'tsconfig.tsbuildinfo',
    '_investigate_*.ts', '_temp_*.ts', '_temp_*.js',
    'Thumbs.db', '.DS_Store'
)

# Also exclude the zip itself
$excludeExact = @($ZipName)

Write-Host "  [1/3] Scanning files..."

$allFiles = Get-ChildItem -Path $RootDir -Recurse -File -Force | Where-Object {
    $relPath = $_.FullName.Substring($RootDir.Length + 1)
    $parts = $relPath -split '\\'

    # Skip if any path segment is an excluded directory
    foreach ($part in $parts) {
        if ($excludeDirs -contains $part.ToLower()) { return $false }
    }

    # Skip prisma/cache folder
    if ($relPath -like 'prisma\cache\*') { return $false }

    # Skip excluded exact names
    if ($excludeExact -contains $_.Name) { return $false }

    # Skip excluded file patterns
    foreach ($pat in $excludeFiles) {
        if ($_.Name -like $pat) { return $false }
    }

    return $true
}

Write-Host "  [2/3] Copying $($allFiles.Count) files to staging..."

foreach ($f in $allFiles) {
    $relPath = $f.FullName.Substring($RootDir.Length + 1)
    $targetFile = Join-Path $dest $relPath
    $targetDir = Split-Path $targetFile
    if (-not (Test-Path $targetDir)) {
        [void](New-Item -ItemType Directory -Path $targetDir -Force)
    }
    Copy-Item $f.FullName $targetFile -Force
}

Write-Host "  [3/3] Compressing..."
Compress-Archive -Path $dest -DestinationPath $zipPath -Force

# Clean up staging
Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

# Report size
$size = (Get-Item $zipPath).Length
$sizeMB = [math]::Round($size / 1MB, 1)
Write-Host ""
Write-Host "  Package created: $ZipName ($sizeMB MB)"
