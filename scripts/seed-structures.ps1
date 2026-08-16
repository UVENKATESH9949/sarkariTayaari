# Seeds exam patterns (stage -> paper -> section) and each exam's syllabus.
#
# Patterns are taken from the published exam notifications. They DO change between
# years — verify against the current official notification before relying on the
# marks and timings for anything student-facing.
#
# Re-runnable: anything that already exists returns 400 and is skipped.

$base = "http://localhost:8080"
$subjects = Invoke-RestMethod -Uri "$base/api/subjects" -TimeoutSec 60
function SubjId([string]$name) { ($subjects | Where-Object { $_.name -eq $name }).id }

# section = @{ name; count; minutes(optional); subjects = @(subject names) }
$plan = @(
  @{ exam = "SSC_CHSL"; stage = "Tier 1"; paper = "Tier 1 (Computer Based Examination)"
     minutes = 60; marks = 200; correct = 2; wrong = 0.5
     sections = @(
       @{ name = "English Language";              count = 25; subjects = @("English") }
       @{ name = "General Intelligence";          count = 25; subjects = @("Reasoning") }
       @{ name = "Quantitative Aptitude";         count = 25; subjects = @("Quantitative Aptitude") }
       @{ name = "General Awareness";             count = 25; subjects = @("General Awareness") }
     ) }

  @{ exam = "IBPS_PO"; stage = "Mains"; paper = "Main Examination (Objective)"
     minutes = 180; marks = 200; correct = 1; wrong = 0.25
     sections = @(
       @{ name = "Reasoning & Computer Aptitude"; count = 45; minutes = 60; subjects = @("Reasoning", "Computer Knowledge") }
       @{ name = "General/Economy/Banking Awareness"; count = 40; minutes = 35; subjects = @("General Awareness") }
       @{ name = "English Language";              count = 35; minutes = 40; subjects = @("English") }
       @{ name = "Data Analysis & Interpretation"; count = 35; minutes = 45; subjects = @("Quantitative Aptitude") }
     ) }

  @{ exam = "IBPS_CLERK"; stage = "Preliminary"; paper = "Preliminary Examination"
     minutes = 60; marks = 100; correct = 1; wrong = 0.25
     sections = @(
       @{ name = "English Language";              count = 30; minutes = 20; subjects = @("English") }
       @{ name = "Numerical Ability";             count = 35; minutes = 20; subjects = @("Quantitative Aptitude") }
       @{ name = "Reasoning Ability";             count = 35; minutes = 20; subjects = @("Reasoning") }
     ) }

  @{ exam = "IBPS_CLERK"; stage = "Mains"; paper = "Main Examination"
     minutes = 160; marks = 200; correct = 1; wrong = 0.25
     sections = @(
       @{ name = "General/Financial Awareness";   count = 50; minutes = 35; subjects = @("General Awareness") }
       @{ name = "General English";               count = 40; minutes = 35; subjects = @("English") }
       @{ name = "Reasoning & Computer Aptitude"; count = 50; minutes = 45; subjects = @("Reasoning", "Computer Knowledge") }
       @{ name = "Quantitative Aptitude";         count = 50; minutes = 45; subjects = @("Quantitative Aptitude") }
     ) }

  @{ exam = "RRB_NTPC"; stage = "CBT 1"; paper = "Computer Based Test 1"
     minutes = 90; marks = 100; correct = 1; wrong = 0.33
     sections = @(
       @{ name = "General Awareness";             count = 40; subjects = @("General Awareness") }
       @{ name = "Mathematics";                   count = 30; subjects = @("Quantitative Aptitude") }
       @{ name = "General Intelligence & Reasoning"; count = 30; subjects = @("Reasoning") }
     ) }

  @{ exam = "RRB_NTPC"; stage = "CBT 2"; paper = "Computer Based Test 2"
     minutes = 90; marks = 120; correct = 1; wrong = 0.33
     sections = @(
       @{ name = "General Awareness";             count = 50; subjects = @("General Awareness") }
       @{ name = "Mathematics";                   count = 35; subjects = @("Quantitative Aptitude") }
       @{ name = "General Intelligence & Reasoning"; count = 35; subjects = @("Reasoning") }
     ) }

  @{ exam = "RRB_GROUP_D"; stage = "CBT"; paper = "Computer Based Test"
     minutes = 90; marks = 100; correct = 1; wrong = 0.33
     sections = @(
       @{ name = "General Science";               count = 25; subjects = @("General Science") }
       @{ name = "Mathematics";                   count = 25; subjects = @("Quantitative Aptitude") }
       @{ name = "General Intelligence & Reasoning"; count = 30; subjects = @("Reasoning") }
       @{ name = "General Awareness & Current Affairs"; count = 20; subjects = @("General Awareness") }
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
    $stageId = (Invoke-RestMethod -Uri "$base/api/exam-stages" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60).id
  } catch {
    $existing = Invoke-RestMethod -Uri "$base/api/exam-stages?examCode=$($p.exam)" -TimeoutSec 60
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
    $paperId = (Invoke-RestMethod -Uri "$base/api/exam-papers" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60).id
  } catch {
    $existing = Invoke-RestMethod -Uri "$base/api/exam-papers?stageId=$stageId" -TimeoutSec 60
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
      Invoke-RestMethod -Uri "$base/api/paper-sections" -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json) -TimeoutSec 60 | Out-Null
      Write-Host ("    + {0,-38} {1} Q{2}" -f $s.name, $s.count, $(if ($s.minutes) { " / $($s.minutes) min" } else { "" }))
    } catch {
      Write-Host ("    = {0,-38} already existed" -f $s.name)
    }
    $i++
  }
}

Write-Host ""
Write-Host "=== syllabus per exam (auto-filled from the sections above) ==="
foreach ($code in @("SSC_CGL","SSC_CHSL","IBPS_PO","IBPS_CLERK","RRB_NTPC","RRB_GROUP_D")) {
  try {
    $subs = Invoke-RestMethod -Uri "$base/api/exams/$code/subjects" -TimeoutSec 60
    Write-Host ("  {0,-14} {1}" -f $code, (($subs.name) -join ", "))
  } catch { Write-Host "  $code  (error)" }
}
