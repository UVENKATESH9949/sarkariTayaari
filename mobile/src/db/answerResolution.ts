/**
 * correctAnswer is meant to be a letter ("A"/"B"/"C"/"D") — options are in the
 * same order across every language's translation, so the letter maps to the
 * same index regardless of language. Some content has it stored as the
 * literal answer value instead (a real data-quality inconsistency found in
 * the seed data, e.g. "12" instead of "B") — fall back to matching against
 * the English options in that case rather than showing no correct answer at all.
 *
 * Shared by every path that turns a raw correctAnswer into a UI index —
 * local SQLite reads (db/practiceContent.ts, db/mockTest.ts) and the hybrid
 * live-API reads (data/practiceData.ts, data/mockTestData.ts) — so a fix here
 * never has to be duplicated across sources.
 */
export function resolveCorrectIndex(correctAnswer: string, englishOptions: string[]): number {
  const letterIndex = correctAnswer.trim().toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
  if (letterIndex >= 0 && letterIndex < englishOptions.length) {
    return letterIndex;
  }
  const valueIndex = englishOptions.findIndex((option) => option.trim() === correctAnswer.trim());
  if (valueIndex !== -1) {
    return valueIndex;
  }
  console.warn(`Could not resolve correctAnswer "${correctAnswer}" against options`, englishOptions);
  return 0;
}
