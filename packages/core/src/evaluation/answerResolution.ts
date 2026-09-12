/**
 * correctAnswer is meant to be a letter ("A"/"B"/"C"/"D") — options are in the
 * same order across every language's translation, so the letter maps to the
 * same index regardless of language. Some content has it stored as the
 * literal answer value instead (a real data-quality inconsistency found in
 * the seed data, e.g. "12" instead of "B") — fall back to matching against
 * the English options in that case rather than showing no correct answer at all.
 *
 * Shared by every path that turns a raw correctAnswer into a UI index — mobile's local
 * SQLite reads and hybrid live-API reads, and (as of TASK-2601 Phase 1) web's online-only
 * Practice screens — so a fix here never has to be duplicated across sources or platforms.
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

/**
 * Whether a question type has a genuine single correct index that {@link resolveCorrectIndex}
 * can meaningfully compute (TASK-2301 Phase P2 Wave A). SINGLE_CHOICE/ASSERTION_REASON/
 * STATEMENT_COMBINATION all do — the latter two reuse the same answer shape, differing only
 * in authored content. MULTIPLE_CHOICE/TRUE_FALSE do not: `correct_answer` for those two is
 * a computed *display* string ("A,C" / "TRUE"), and resolving it against options would
 * produce a wrong or meaningless index — `answerKey` is their only source of truth.
 */
const INDEX_BASED_TYPES = new Set(["SINGLE_CHOICE", "ASSERTION_REASON", "STATEMENT_COMBINATION"]);

export function isIndexBasedType(questionType: string | null | undefined): boolean {
  return questionType == null || INDEX_BASED_TYPES.has(questionType);
}
