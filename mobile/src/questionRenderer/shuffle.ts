/**
 * Fisher-Yates, for scrambling MATCH's right column and ORDERING's item pool (TASK-2301
 * Phase P2 Wave B) — the admin authors both in a natural/correct order, so the display
 * order has to be randomized independently or the position itself would give the answer
 * away.
 */
export function shuffled<T>(items: T[]): T[] {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
