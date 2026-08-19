# Extends seed-structures.ps1 with five more real exams, for broader coverage during
# load testing (TICKET-501) — this is the same kind of real, published-pattern data as
# seed-structures.ps1, just added later and kept in its own file so that one stays a
# clean, standalone record of the original six.
#
# Patterns are taken from published exam notifications and are simplified in places
# (e.g. UPSC's qualifying CSAT paper is deliberately left out, matching this project's
# existing precedent of not modelling every multi-module nuance — see
# scripts/README.md's note about SSC CGL/CHSL Tier 2). They DO change between years —
# verify against the current official notification before relying on the marks and
# timings for anything student-facing.
#
# Re-runnable: anything that already exists returns 400 and is skipped. Requires an
# admin bearer token (this project's content-management endpoints require one as of
# the admin-authentication work — see reports/10-admin-authentication/).
#
# Usage: .\scripts\seed-more-exam-structures.ps1 -AdminToken "<token>"

param(
  [Parameter(Mandatory = $true)]
  [string]$AdminToken
)

$base = "http://localhost:8080"
$headers = @{ Authorization = "Bearer $AdminToken" }

$exams = @(
  @{ code = "UPSC_CSE"; name = "UPSC Civil Services (Prelims)"; displayOrder = 7 }
  @{ code = "SSC_MTS"; name = "SSC MTS"; displayOrder = 8 }
  @{ code = "SSC_GD"; name = "SSC GD Constable"; displayOrder = 9 }
  @{ code = "RBI_ASSISTANT"; name = "RBI Assistant (Prelims)"; displayOrder = 10 }
  @{ code = "LIC_AAO"; name = "LIC AAO (Prelims)"; displayOrder = 11 }
)

Write-Host "=== creating exams ==="
foreach ($e in $exams) {
  $body = @{ code = $e.code; name = $e.name; active = $true; displayOrder = $e.displayOrder } | ConvertTo-Json
  try {
    Invoke-RestMethod -Uri "$base/api/exams" -Method Post -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 60 | Out-Null
    Write-Host "  + $($e.code)"
  } catch {
    Write-Host "  = $($e.code) already existed"
  }
}

$subjects = Invoke-RestMethod -Uri "$base/api/subjects" -TimeoutSec 60
function SubjId([string]$name) { ($subjects | Where-Object { $_.name -eq $name }).id }

# section = @{ name; count; minutes(optional); subjects = @(subject names) }
$plan = @(
  @{ exam = "UPSC_CSE"; stage = "Prelims"; paper = "General Studies Paper I"
     minutes = 120; marks = 200; correct = 2; wrong = 0.66
     sections = @(
       @{ name = "General Studies";               count = 70; subjects = @("General Awareness") }
       @{ name = "General Science & Environment";  count = 30; subjects = @("General Science") }
     ) }

  @{ exam = "SSC_MTS"; stage = "Paper 1"; paper = "Computer Based Examination"
     minutes = 90; marks = 90; correct = 1; wrong = 0.33
     sections = @(
       @{ name = "Numerical Ability";              count = 20; subjects = @("Quantitative Aptitude") }
       @{ name = "Reasoning Ability & Problem Solving"; count = 20; subjects = @("Reasoning") }
       @{ name = "General Awareness";               count = 25; subjects = @("General Awareness") }
       @{ name = "English Language";                count = 25; subjects = @("English") }
     ) }

  @{ exam = "SSC_GD"; stage = "Tier 1"; paper = "Computer Based Examination"
     minutes = 60; marks = 160; correct = 2; wrong = 0.5
     sections = @(
       @{ name = "General Intelligence & Reasoning"; count = 20; subjects = @("Reasoning") }
       @{ name = "General Knowledge & General Awareness"; count = 20; subjects = @("General Awareness") }
       @{ name = "Elementary Mathematics";           count = 20; subjects = @("Quantitative Aptitude") }
       @{ name = "English/Hindi";                    count = 20; subjects = @("English") }
     ) }

  @{ exam = "RBI_ASSISTANT"; stage = "Preliminary"; paper = "Preliminary Examination"
     minutes = 60; marks = 100; correct = 1; wrong = 0.25
     sections = @(
       @{ name = "English Language";                count = 30; minutes = 20; subjects = @("English") }
       @{ name = "Numerical Ability";                count = 35; minutes = 20; subjects = @("Quantitative Aptitude") }
       @{ name = "Reasoning Ability";                count = 35; minutes = 20; subjects = @("Reasoning") }
     ) }

  @{ exam = "LIC_AAO"; stage = "Preliminary"; paper = "Preliminary Examination"
     minutes = 60; marks = 100; correct = 1; wrong = 0.25
     sections = @(
       @{ name = "English Language";                count = 30; minutes = 20; subjects = @("English") }
       @{ name = "Reasoning Ability";                count = 35; minutes = 20; subjects = @("Reasoning") }
       @{ name = "Quantitative Aptitude";            count = 35; minutes = 20; subjects = @("Quantitative Aptitude") }
     ) }
)

$stageOrder = @{}
foreach ($p in $plan) {
  Write-Host ("{0} / {1}" -f $p.exam, $p.stage)

  if (-not $stageOrder.ContainsKey($p.exam)) { $stageOrder[$p.exam] = 1 }
  $order = $stageOrder[$p.exam]

  # --- stage ---
  $stageId = $null
  try {
    $body = @{ examCode = $p.exam; name = $p.stage; displayOrder = $order; versionLabel = "Current pattern" } | ConvertTo-Json
    $stageId = (Invoke-RestMethod -Uri "$base/api/exam-stages" -Method Post -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 60).id
  } catch {
    $existing = Invoke-RestMethod -Uri "$base/api/exam-stages?examCode=$($p.exam)" -Headers $headers -TimeoutSec 60
    $stageId = ($existing | Where-Object { $_.name -eq $p.stage }).id
    Write-Host "  stage already existed"
  }
  $stageOrder[$p.exam] = $order + 1
  if (-not $stageId) { Write-Host "  !! no stage id, skipping"; continue }

  # --- paper ---
  $paperId = $null
  try {
    $body = @{ stageId = $stageId; name = $p.paper; paperType = "objective"; durationMinutes = $p.minutes
               totalMarks = $p.marks; marksCorrect = $p.correct; marksWrong = $p.wrong; displayOrder = 1 } | ConvertTo-Json
    $paperId = (Invoke-RestMethod -Uri "$base/api/exam-papers" -Method Post -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 60).id
  } catch {
    $existing = Invoke-RestMethod -Uri "$base/api/exam-papers?stageId=$stageId" -Headers $headers -TimeoutSec 60
    $paperId = ($existing | Where-Object { $_.name -eq $p.paper }).id
    Write-Host "  paper already existed"
  }
  if (-not $paperId) { Write-Host "  !! no paper id, skipping"; continue }

  # --- sections ---
  $i = 1
  foreach ($s in $p.sections) {
    $ids = @($s.subjects | ForEach-Object { SubjId $_ } | Where-Object { $_ })
    if ($ids.Count -eq 0) { Write-Host "    !! no subjects resolved for $($s.name)"; continue }
    $payload = @{ paperId = $paperId; name = $s.name; questionCount = $s.count
                  displayOrder = $i; subjectIds = $ids }
    if ($s.minutes) { $payload.durationMinutes = $s.minutes }
    try {
      Invoke-RestMethod -Uri "$base/api/paper-sections" -Method Post -ContentType "application/json" -Headers $headers -Body ($payload | ConvertTo-Json) -TimeoutSec 60 | Out-Null
      Write-Host ("    + {0,-38} {1} Q{2}" -f $s.name, $s.count, $(if ($s.minutes) { " / $($s.minutes) min" } else { "" }))
    } catch {
      Write-Host ("    = {0,-38} already existed" -f $s.name)
    }
    $i++
  }
}

Write-Host ""
Write-Host "=== syllabus per new exam (auto-filled from the sections above) ==="
foreach ($code in @("UPSC_CSE","SSC_MTS","SSC_GD","RBI_ASSISTANT","LIC_AAO")) {
  try {
    $subs = Invoke-RestMethod -Uri "$base/api/exams/$code/subjects" -Headers $headers -TimeoutSec 60
    Write-Host ("  {0,-14} {1}" -f $code, (($subs.name) -join ", "))
  } catch { Write-Host "  $code  (error)" }
}
