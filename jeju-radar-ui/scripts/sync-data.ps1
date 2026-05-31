$ErrorActionPreference = "Stop"

$AppRoot = Split-Path -Parent $PSScriptRoot
$WorkspaceRoot = Split-Path -Parent $AppRoot
$SourceRoot = Join-Path $WorkspaceRoot "data"
$PublicRoot = Join-Path $AppRoot "public"
$Directories = @("reference", "geometry", "scenarios", "authority")
$ExcludedFileNames = @(
  "coastline_lines.geojson"
)

New-Item -ItemType Directory -Force -Path $PublicRoot | Out-Null

foreach ($Directory in $Directories) {
  $Source = Join-Path $SourceRoot $Directory
  $Target = Join-Path $PublicRoot $Directory

  if (-not (Test-Path $Source)) {
    throw "Source data directory not found: $Source"
  }

  if (Test-Path $Target) {
    Remove-Item -Recurse -Force $Target
  }

  New-Item -ItemType Directory -Force -Path $Target | Out-Null
  Get-ChildItem -Path $Source -Recurse | ForEach-Object {
    $RelativePath = $_.FullName.Substring($Source.Length).TrimStart("\")
    $Destination = Join-Path $Target $RelativePath

    if ($_.PSIsContainer) {
      New-Item -ItemType Directory -Force -Path $Destination | Out-Null
      return
    }

    if ($ExcludedFileNames -contains $_.Name) {
      return
    }

    $DestinationDirectory = Split-Path -Parent $Destination
    New-Item -ItemType Directory -Force -Path $DestinationDirectory | Out-Null
    Copy-Item -Force -LiteralPath $_.FullName -Destination $Destination
  }
}

Write-Host "Synced Jeju radar reference data into public/."
