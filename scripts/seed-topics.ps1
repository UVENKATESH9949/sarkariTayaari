# Seeds real sub-topics for each subject.
#
# The existing "General" topic in every subject is deliberately left alone: all 113
# current questions are filed under it and deleting it would break them. Re-file those
# questions onto proper topics from the admin UI when convenient.

$base = "http://localhost:8080"

$topicsBySubject = [ordered]@{
  "Quantitative Aptitude" = @(
    "Number System", "Simplification & Approximation", "LCM & HCF", "Percentage",
    "Ratio & Proportion", "Average", "Profit & Loss", "Discount",
    "Simple Interest", "Compound Interest", "Time & Work", "Pipes & Cisterns",
    "Time, Speed & Distance", "Boats & Streams", "Problems on Trains",
    "Mixture & Alligation", "Partnership", "Problems on Ages", "Mensuration",
    "Geometry", "Trigonometry", "Height & Distance", "Algebra", "Number Series",
    "Data Interpretation", "Probability", "Permutation & Combination"
  )
  "Reasoning" = @(
    "Analogy", "Classification", "Number & Alphabet Series", "Coding-Decoding",
    "Blood Relations", "Direction Sense", "Order & Ranking", "Syllogism",
    "Seating Arrangement", "Puzzles", "Data Sufficiency", "Statement & Conclusion",
    "Statement & Assumption", "Venn Diagram", "Mirror & Water Images",
    "Paper Folding & Cutting", "Embedded Figures", "Cube & Dice", "Inequality",
    "Input-Output", "Logical Reasoning", "Non-Verbal Reasoning", "Matrix",
    "Word Formation"
  )
  "English" = @(
    "Reading Comprehension", "Cloze Test", "Para Jumbles", "Error Spotting",
    "Sentence Improvement", "Fill in the Blanks", "Synonyms", "Antonyms",
    "Idioms & Phrases", "One Word Substitution", "Spelling Correction",
    "Active & Passive Voice", "Direct & Indirect Speech", "Sentence Rearrangement",
    "Phrase Replacement", "Vocabulary", "Para Completion"
  )
  "General Awareness" = @(
    "Indian History", "Indian Polity", "Indian Geography", "Indian Economy",
    "World Geography", "World History", "Static GK", "Current Affairs",
    "Books & Authors", "Awards & Honours", "Important Days", "Sports",
    "Art & Culture", "Government Schemes", "Banking Awareness",
    "Environment & Ecology", "Science & Technology"
  )
  "General Science" = @(
    "Physics", "Chemistry", "Biology", "Environmental Science", "Everyday Science"
  )
  "Computer Knowledge" = @(
    "Computer Fundamentals", "Hardware", "Software", "Operating System",
    "MS Office", "Internet & Networking", "Database Management",
    "Computer Security", "Computer Abbreviations", "Shortcut Keys",
    "History of Computers"
  )
}

$subjects = Invoke-RestMethod -Uri "$base/api/subjects" -TimeoutSec 60
$created = 0; $skipped = 0; $failed = 0

foreach ($subjectName in $topicsBySubject.Keys) {
  $subject = $subjects | Where-Object { $_.name -eq $subjectName }
  if (-not $subject) { Write-Host "  SKIP subject not found: $subjectName"; continue }

  # "General" already occupies order 1; real topics start after it.
  $order = 2
  foreach ($topicName in $topicsBySubject[$subjectName]) {
    $body = @{ subjectId = $subject.id; name = $topicName; displayOrder = $order } | ConvertTo-Json
    try {
      Invoke-RestMethod -Uri "$base/api/topics" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 60 | Out-Null
      $created++
    } catch {
      # A duplicate name under the same subject returns 400 — expected if re-run.
      if ($_.Exception.Response.StatusCode.value__ -eq 400) { $skipped++ } else { $failed++; Write-Host "  FAIL $subjectName / $topicName" }
    }
    $order++
  }
  Write-Host ("  {0,-24} {1} topics" -f $subjectName, $topicsBySubject[$subjectName].Count)
}

Write-Host ""
Write-Host "created: $created   already existed: $skipped   failed: $failed"
