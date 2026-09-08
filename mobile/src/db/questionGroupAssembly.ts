import { shuffled } from "../questionRenderer/shuffle";

/**
 * TypeScript mirror of the backend's `QuestionGroupAssembly.packRandomSample`
 * (TASK-2301 Phase P3) — kept in exact structural lockstep, since the user explicitly
 * chose "pack algorithm in Mock Test too" rather than scoping groups to Practice only.
 * A group (a passage with several child questions) must never be split across a random
 * selection, matching the same "may undershoot the requested count" trade-off ADR-008
 * already accepted for plain random sampling, just extended to whole groups: a standalone
 * question is a unit of size 1; a question that belongs to a group pulls in the group's
 * FULL sibling set (loaded once per distinct group id, however many of its siblings
 * happened to land in the candidate pool); a unit that would overflow `limit` is skipped
 * rather than split.
 *
 * The loader is async (unlike the Java version's synchronous `Function`) because a mobile
 * group lookup is a real SQLite query — awaited sequentially per distinct group, which is
 * fine at the scale a single mock-test section ever needs.
 */
export type GroupableCandidate = { id: string; questionGroupId: string | null };

export async function packRandomSample<T extends GroupableCandidate>(
  candidates: T[],
  limit: number,
  groupChildrenLoader: (groupId: string) => Promise<T[]>,
): Promise<T[]> {
  const units: T[][] = [];
  const seenGroupIds = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate.questionGroupId) {
      units.push([candidate]);
    } else if (!seenGroupIds.has(candidate.questionGroupId)) {
      seenGroupIds.add(candidate.questionGroupId);
      units.push(await groupChildrenLoader(candidate.questionGroupId));
    }
  }

  const shuffledUnits = shuffled(units);
  const result: T[] = [];
  for (const unit of shuffledUnits) {
    if (result.length + unit.length > limit) continue;
    result.push(...unit);
    if (result.length >= limit) break;
  }
  return result;
}
