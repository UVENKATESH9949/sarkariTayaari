/**
 * A deterministic "identity" color per exam, the same way GitHub colors a repository's
 * language dot or a default avatar with no photo: not a real fact about the exam (there is
 * no admin-curated per-exam color — checked directly against the live API, where 10 of 11
 * active exams carry no badge/difficulty color and only 1 has an uploaded image), just a
 * consistent rendering choice so a grid of otherwise-identical cards has visual rhythm
 * instead of one repeated blue icon.
 *
 * Deterministic (same code always maps to the same slot) so a card doesn't change color on
 * every re-render or re-fetch, and doesn't require any new backend field.
 */
const SLOT_COUNT = 6;

export function identitySlot(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % SLOT_COUNT;
}
