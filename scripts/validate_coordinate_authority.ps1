param(
  [ValidateSet("strict", "inventory")]
  [string]$Mode = "strict"
)

$ErrorActionPreference = "Stop"

function Test-Number {
  param([object]$Value)

  return $Value -is [byte] -or
    $Value -is [int16] -or
    $Value -is [int32] -or
    $Value -is [int64] -or
    $Value -is [single] -or
    $Value -is [double] -or
    $Value -is [decimal]
}

function Assert-CoordinateTree {
  param(
    [object]$Node,
    [string]$Context
  )

  if ($null -eq $Node) {
    throw "Missing coordinate tree at $Context"
  }

  $Items = @($Node)
  if ($Items.Count -eq 0) {
    throw "Empty coordinate tree at $Context"
  }

  $AllNumeric = $true
  foreach ($Item in $Items) {
    if (-not (Test-Number $Item)) {
      $AllNumeric = $false
      break
    }
  }

  if ($AllNumeric) {
    if ($Items.Count -lt 2) {
      throw "Coordinate pair too short at $Context"
    }

    return
  }

  for ($Index = 0; $Index -lt $Items.Count; $Index++) {
    Assert-CoordinateTree -Node $Items[$Index] -Context "$Context[$Index]"
  }
}

function Add-ErrorLine {
  param(
    [System.Collections.Generic.List[string]]$Bucket,
    [string]$Message
  )

  $Bucket.Add($Message) | Out-Null
}

function Get-FeatureContext {
  param([object]$Feature)

  if ($null -ne $Feature.properties.feature_id) {
    return [string]$Feature.properties.feature_id
  }

  if ($null -ne $Feature.properties.sector_id) {
    return [string]$Feature.properties.sector_id
  }

  if ($null -ne $Feature.properties.id) {
    return [string]$Feature.properties.id
  }

  return "unnamed_feature"
}

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $WorkspaceRoot "data\\authority\\coordinate_authority_manifest.json"

if (-not (Test-Path $ManifestPath)) {
  throw "Manifest not found: $ManifestPath"
}

$Manifest = Get-Content -Raw -Encoding UTF8 $ManifestPath | ConvertFrom-Json
$Summary = New-Object 'System.Collections.Generic.List[string]'
$Errors = New-Object 'System.Collections.Generic.List[string]'

foreach ($Layer in $Manifest.layers) {
  $ResolvedPath = Join-Path $WorkspaceRoot $Layer.path
  $CurrentAuthority = [string]$Layer.current_authority
  $TargetAuthority = [string]$Layer.target_authority

  if (-not (Test-Path $ResolvedPath)) {
    Add-ErrorLine -Bucket $Errors -Message "[missing] $($Layer.layer_id): $ResolvedPath"
    continue
  }

  if ([string]$Layer.check_profile -eq "large_feature_collection_manifest_only") {
    $FileInfo = Get-Item -LiteralPath $ResolvedPath
    if ($FileInfo.Length -le 0) {
      Add-ErrorLine -Bucket $Errors -Message "[file] $($Layer.layer_id): empty large feature collection"
    }

    $BlockingMark = if ($Layer.exact_mode_blocking) { "blocking" } else { "non-blocking" }
    $Summary.Add(("{0} | {1} -> {2} | {3}" -f $Layer.layer_id, $CurrentAuthority, $TargetAuthority, $BlockingMark)) | Out-Null

    if ($Mode -eq "strict" -and $Layer.exact_mode_blocking -and $CurrentAuthority -ne $TargetAuthority) {
      $Reason = if ($null -ne $Layer.blocking_reason) { [string]$Layer.blocking_reason } else { "current_authority does not meet target_authority" }
      Add-ErrorLine -Bucket $Errors -Message "[authority] $($Layer.layer_id): $Reason"
    }

    continue
  }

  try {
    $Document = Get-Content -Raw -Encoding UTF8 $ResolvedPath | ConvertFrom-Json
  } catch {
    Add-ErrorLine -Bucket $Errors -Message "[json] $($Layer.layer_id): $($_.Exception.Message)"
    continue
  }

  switch ([string]$Layer.check_profile) {
    "airport_core" {
      if ($null -eq $Document.airport_meta.arp.latitude -or $null -eq $Document.airport_meta.arp.longitude) {
        Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): airport_meta.arp latitude/longitude missing"
      }

      foreach ($Runway in $Document.runways) {
        if ($null -eq $Runway.threshold.latitude -or $null -eq $Runway.threshold.longitude) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): runway $($Runway.id) threshold coordinates missing"
        }
      }

      foreach ($Navaid in $Document.navaids) {
        if ($null -eq $Navaid.latitude -or $null -eq $Navaid.longitude) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): navaid $($Navaid.id) coordinates missing"
        }
      }
    }
    "procedure_fixes" {
      foreach ($Fix in $Document.fixes) {
        if ($null -eq $Fix.latitude -or $null -eq $Fix.longitude) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): fix $($Fix.id) coordinates missing"
        }
      }
    }
    "reference_points_document" {
      foreach ($Point in $Document.reference_points) {
        $HasDirectCoordinate = $null -ne $Point.latitude -and $null -ne $Point.longitude
        $HasReferenceLink = $null -ne $Point.reference_dataset -and $null -ne $Point.reference_key

        if (-not $HasDirectCoordinate -and -not $HasReferenceLink) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): reference point $($Point.id) has neither direct coordinates nor reference link"
        }
      }
    }
    "chart_primitives_document" {
      if ($null -eq $Document.chart_guides.concentric_rings.center_point_id) {
        Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): concentric_rings.center_point_id missing"
      }

      foreach ($Ring in $Document.chart_guides.concentric_rings.observed_ring_distances_nm) {
        if (-not (Test-Number $Ring) -or $Ring -le 0) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): invalid ring distance '$Ring'"
        }
      }

      foreach ($VisualReference in $Document.visual_reference_geometry) {
        $HasParametricReference = $null -ne $VisualReference.center_navaid_id -and $null -ne $VisualReference.radius_nm
        $HasDatasetReference = $null -ne $VisualReference.reference_dataset -and $null -ne $VisualReference.reference_key

        if (-not $HasParametricReference -and -not $HasDatasetReference) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): visual reference $($VisualReference.id) has no coordinate-backed anchor"
        }
      }
    }
    "mva_boundary_spec" {
      $AllowedKinds = @("line", "arc", "radial")
      foreach ($SectorSpec in $Document.sector_specs) {
        if ([string]::IsNullOrWhiteSpace([string]$SectorSpec.sector_id)) {
          Add-ErrorLine -Bucket $Errors -Message "[spec] $($Layer.layer_id): sector_id missing"
          continue
        }

        $Segments = @($SectorSpec.segments)
        if ($Segments.Count -eq 0) {
          Add-ErrorLine -Bucket $Errors -Message "[spec] $($Layer.layer_id): sector $($SectorSpec.sector_id) has no segments"
          continue
        }

        foreach ($Segment in $Segments) {
          if ([string]::IsNullOrWhiteSpace([string]$Segment.kind) -or $AllowedKinds -notcontains [string]$Segment.kind) {
            Add-ErrorLine -Bucket $Errors -Message "[spec] $($Layer.layer_id): sector $($SectorSpec.sector_id) has unsupported segment kind '$($Segment.kind)'"
            continue
          }

          if ([string]::IsNullOrWhiteSpace([string]$Segment.from) -or [string]::IsNullOrWhiteSpace([string]$Segment.to)) {
            Add-ErrorLine -Bucket $Errors -Message "[spec] $($Layer.layer_id): sector $($SectorSpec.sector_id) has segment without from/to"
          }

          if ($Segment.kind -eq "arc") {
            if ([string]::IsNullOrWhiteSpace([string]$Segment.center_ref) -or -not (Test-Number $Segment.radius_nm) -or ($Segment.direction -ne "cw" -and $Segment.direction -ne "ccw")) {
              Add-ErrorLine -Bucket $Errors -Message "[spec] $($Layer.layer_id): sector $($SectorSpec.sector_id) arc segment missing center/radius/direction"
            }
          }

          if ($Segment.kind -eq "radial") {
            if ([string]::IsNullOrWhiteSpace([string]$Segment.center_ref) -or -not (Test-Number $Segment.bearing_mag_deg)) {
              Add-ErrorLine -Bucket $Errors -Message "[spec] $($Layer.layer_id): sector $($SectorSpec.sector_id) radial segment missing center/bearing"
            }
          }
        }
      }
    }
    "feature_collection" {
      foreach ($Feature in $Document.features) {
        try {
          $FeatureContext = Get-FeatureContext -Feature $Feature
          Assert-CoordinateTree -Node $Feature.geometry.coordinates -Context "$($Layer.layer_id):$FeatureContext"
        } catch {
          Add-ErrorLine -Bucket $Errors -Message "[geometry] $($_.Exception.Message)"
        }
      }
    }
    "labels_document" {
      foreach ($Label in $Document.labels) {
        if ($null -eq $Label.latitude -or $null -eq $Label.longitude) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): label $($Label.id) coordinates missing"
        }
      }
    }
    "scenario_seed" {
      foreach ($Aircraft in $Document.aircraft) {
        if ($null -eq $Aircraft.latitude -or $null -eq $Aircraft.longitude) {
          Add-ErrorLine -Bucket $Errors -Message "[coords] $($Layer.layer_id): aircraft $($Aircraft.id) coordinates missing"
        }
      }
    }
    "coastline_source_manifest" {
      $RequiredFields = @(
        "provider",
        "dataset_name",
        "download_page",
        "download_zip",
        "original_projection_wkt",
        "selection_bbox_wgs84",
        "local_shp"
      )

      foreach ($FieldName in $RequiredFields) {
        if ($null -eq $Document.source.$FieldName) {
          Add-ErrorLine -Bucket $Errors -Message "[source] $($Layer.layer_id): source.$FieldName missing"
        }
      }

      if ($null -ne $Document.source.selection_bbox_wgs84 -and @($Document.source.selection_bbox_wgs84).Count -ne 4) {
        Add-ErrorLine -Bucket $Errors -Message "[source] $($Layer.layer_id): selection_bbox_wgs84 must contain 4 numeric values"
      }
    }
    default {
      Add-ErrorLine -Bucket $Errors -Message "[config] $($Layer.layer_id): unknown check_profile $($Layer.check_profile)"
    }
  }

  $BlockingMark = if ($Layer.exact_mode_blocking) { "blocking" } else { "non-blocking" }
  $Summary.Add(("{0} | {1} -> {2} | {3}" -f $Layer.layer_id, $CurrentAuthority, $TargetAuthority, $BlockingMark)) | Out-Null

  if ($Mode -eq "strict" -and $Layer.exact_mode_blocking -and $CurrentAuthority -ne $TargetAuthority) {
    $Reason = if ($null -ne $Layer.blocking_reason) { [string]$Layer.blocking_reason } else { "current_authority does not meet target_authority" }
    Add-ErrorLine -Bucket $Errors -Message "[authority] $($Layer.layer_id): $Reason"
  }
}

Write-Host ""
Write-Host "Coordinate authority inventory ($Mode)"
Write-Host "------------------------------------"
$Summary | ForEach-Object { Write-Host $_ }

if ($Errors.Count -gt 0) {
  Write-Host ""
  Write-Host "Issues"
  Write-Host "------"
  $Errors | ForEach-Object { Write-Host $_ }
}

if ($Mode -eq "strict" -and $Errors.Count -gt 0) {
  exit 1
}
