param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Missing file: $Path"
  }
  return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Convert-PatternToRegex {
  param([string]$Pattern)

  $regex = [regex]::Escape($Pattern)
  $replacements = @{
    "\{heading_deg}" = "(?<heading_deg>\d{1,3})"
    "\{speed_kt}" = "(?<speed_kt>\d{2,3})"
    "\{altitude_ft}" = "(?<altitude_ft>\d{3,5})"
    "\{vertical_rate_fpm}" = "(?<vertical_rate_fpm>-?\d{3,4})"
    "\{fix_id}" = "(?<fix_id>[A-Z0-9]{2,6})"
    "\{turn_direction}" = "(?<turn_direction>LEFT|RIGHT)"
    "\{leg_time_minutes}" = "(?<leg_time_minutes>\d+(?:\.\d+)?)"
    "\{runway}" = "(?<runway>\d{2}[LRC]?)"
    "\{approach_variant}" = "(?<approach_variant>Z|Y)"
    "\{procedure_compact}" = "(?<procedure_compact>\d+[A-Z])"
    "\{procedure_number_word}" = "(?<procedure_number_word>ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)"
    "\{procedure_suffix_word}" = "(?<procedure_suffix_word>PAPA|MIKE|ECHO|WHISKEY|NOVEMBER|KILO|LIMA|YANKEE|ZULU)"
    "\{procedure_id}" = "(?<procedure_id>[A-Z0-9_\-]+)"
    "\{reason}" = "(?<reason>.+)"
  }

  foreach ($key in $replacements.Keys) {
    $regex = $regex.Replace($key, $replacements[$key])
  }

  return "^$regex$"
}

function Remove-LeadingCallsign {
  param([string]$Phrase)

  $normalized = $Phrase.Trim().ToUpperInvariant() -replace "\s+", " "
  $match = [regex]::Match($normalized, "^[A-Z]{2,3}\d{2,4}\s+(.+)$")

  if ($match.Success) {
    return $match.Groups[1].Value
  }

  return $normalized
}

$dataDir = Join-Path $Root "data"
$requiredFiles = @(
  "phraseology_sources.json",
  "atc_command_taxonomy.json",
  "atc_command_intents.json",
  "atc_command_grammar.json",
  "atc_command_effects.json",
  "pilot_readback_templates.json",
  "atc_command_test_cases.json",
  "llm_pilot_agent_contract.json",
  "jeju_local_command_map.json",
  "sim_integration_contract.json",
  "official_phrase_expansion_backlog.json",
  "pilot_response_policy.json",
  "pilot_response_policy_test_cases.json"
)

foreach ($file in $requiredFiles) {
  $null = Read-JsonFile (Join-Path $dataDir $file)
}

$taxonomy = Read-JsonFile (Join-Path $dataDir "atc_command_taxonomy.json")
$intents = Read-JsonFile (Join-Path $dataDir "atc_command_intents.json")
$grammar = Read-JsonFile (Join-Path $dataDir "atc_command_grammar.json")
$effects = Read-JsonFile (Join-Path $dataDir "atc_command_effects.json")
$templates = Read-JsonFile (Join-Path $dataDir "pilot_readback_templates.json")
$testCases = Read-JsonFile (Join-Path $dataDir "atc_command_test_cases.json")
$jejuLocalMap = Read-JsonFile (Join-Path $dataDir "jeju_local_command_map.json")

$categoryIds = @{}
foreach ($category in $taxonomy.categories) {
  $categoryIds[$category.id] = $true
}

$intentIds = @{}
foreach ($intent in $intents.intents) {
  if (-not $categoryIds.ContainsKey($intent.category)) {
    throw "Intent $($intent.id) references missing category $($intent.category)"
  }
  $intentIds[$intent.id] = $true
}

foreach ($pattern in $grammar.patterns) {
  if (-not $intentIds.ContainsKey($pattern.intent)) {
    throw "Grammar pattern $($pattern.id) references missing intent $($pattern.intent)"
  }
  if (-not $categoryIds.ContainsKey($pattern.category)) {
    throw "Grammar pattern $($pattern.id) references missing category $($pattern.category)"
  }
}

foreach ($effect in $effects.effects) {
  if (-not $intentIds.ContainsKey($effect.intent)) {
    throw "Effect references missing intent $($effect.intent)"
  }
}

foreach ($template in $templates.templates) {
  if (-not $intentIds.ContainsKey($template.intent)) {
    throw "Template $($template.template_id) references missing intent $($template.intent)"
  }
}

foreach ($testCase in $testCases.test_cases) {
  if (-not $intentIds.ContainsKey($testCase.expected_intent)) {
    throw "Test case $($testCase.id) references missing intent $($testCase.expected_intent)"
  }
}

foreach ($example in $jejuLocalMap.local_phrase_examples) {
  if (-not $example.phrase -or -not $example.intent) {
    throw "Jeju local example is missing phrase or intent"
  }

  $phraseForValidation = if ($example.example_phrase) { $example.example_phrase } else { $example.phrase }
  $phraseWithoutCallsign = Remove-LeadingCallsign $phraseForValidation
  $matchedIntent = $null

  foreach ($grammarEntry in $grammar.patterns) {
    foreach ($rawPattern in $grammarEntry.patterns) {
      $regex = Convert-PatternToRegex $rawPattern
      if ($phraseWithoutCallsign -match $regex) {
        $matchedIntent = $grammarEntry.intent
        break
      }
    }

    if ($matchedIntent) {
      break
    }
  }

  if (-not $matchedIntent) {
    throw "Jeju local example did not match any grammar pattern: $phraseForValidation"
  }

  if ($matchedIntent -ne $example.intent) {
    throw "Jeju local example expected $($example.intent) but matched $matchedIntent`: $phraseForValidation"
  }
}

foreach ($testCase in $testCases.test_cases) {
  $phraseWithoutCallsign = Remove-LeadingCallsign $testCase.phrase
  $matchedIntent = $null

  foreach ($grammarEntry in $grammar.patterns) {
    foreach ($rawPattern in $grammarEntry.patterns) {
      $regex = Convert-PatternToRegex $rawPattern
      if ($phraseWithoutCallsign -match $regex) {
        $matchedIntent = $grammarEntry.intent
        break
      }
    }

    if ($matchedIntent) {
      break
    }
  }

  if (-not $matchedIntent) {
    throw "Test case $($testCase.id) did not match any grammar pattern: $($testCase.phrase)"
  }

  if ($matchedIntent -ne $testCase.expected_intent) {
    throw "Test case $($testCase.id) expected $($testCase.expected_intent) but matched $matchedIntent"
  }
}

$summary = [PSCustomObject]@{
  status = "ok"
  root = $Root
  files_checked = $requiredFiles.Count
  categories = $taxonomy.categories.Count
  intents = $intents.intents.Count
  grammar_patterns = $grammar.patterns.Count
  effects = $effects.effects.Count
  readback_templates = $templates.templates.Count
  test_cases = $testCases.test_cases.Count
  parser_test_cases_matched = $testCases.test_cases.Count
  jeju_local_examples_matched = $jejuLocalMap.local_phrase_examples.Count
}

$summary | ConvertTo-Json -Depth 4
