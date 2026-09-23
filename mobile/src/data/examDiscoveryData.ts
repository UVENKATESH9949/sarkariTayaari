import { discoverExams, type ExamCard, type ExamSortOption } from "@sarkaritaiyaari/core/api";
import { readSnapshot, snapshotKey, writeSnapshot } from "./snapshotStore";

/**
 * Where the Exams tab's catalogue comes from, with the device keeping a copy.
 *
 * Same architecture as `dailyPlanData.ts`, for the same reason: `GET /api/exams/discover` is
 * server-computed from data the device does not hold — recruitment cycles, statuses, vacancy
 * counts, the curated category — so the device must not try to derive it. But it can remember
 * the last answer, which turns a round trip on every open into an instant render, and makes the
 * screen work with no connection at all.
 *
 * <h2>What is cached, and what is deliberately re-derived</h2>
 *
 * Almost every field on an `ExamCard` is a FACT with a date attached: `applicationEnd`,
 * `examStart`, `vacancyCount`, `status`. Those keep.
 *
 * Two do not. `daysUntilDeadline` and `closingSoon` are computed **relative to the moment the
 * server answered** — `ChronoUnit.DAYS.between(LocalDate.now(), applicationEnd)` and
 * `days <= 14` in `ExamDiscoveryService`. Replay those from a snapshot taken four days ago and
 * the card says "closes in 12 days" when it is really 8, and — worse — `closingSoon` decides
 * which SECTION an exam appears in on that screen, so a stale flag files it under the wrong
 * heading entirely.
 *
 * So this is the same definition-versus-derived split the daily plan makes. The facts are
 * cached; the two now-relative fields are recomputed on the device from `applicationEnd`, which
 * is an absolute date and safe to store. The recomputation mirrors the server's rule exactly,
 * including the fourteen-day threshold, so a card cannot say one thing online and another off.
 *
 * <h2>Rules carried over from the daily-plan cache</h2>
 *
 * A snapshot is never a source of truth, and a fresh server response is never second-guessed —
 * re-derivation applies only to a cached read. And a failed refresh must never replace a usable
 * list with an error; that rule lives in the screen, where the state does.
 *
 * <h2>Two differences from the daily plan, both deliberate</h2>
 *
 * **No user in the key.** Discover is a public endpoint taking no token and returning nothing
 * personal — follow state is local (`followed_exams`) and never travels in this payload. Keying
 * by user would fragment one shared answer into a copy per account for no benefit, and it is why
 * sign-out clears only the `daily-plan` namespace and leaves this one alone.
 *
 * **Only the first page is cached.** That is what an open renders. "Load more" is a deliberate
 * action on a screen the student is already looking at, so it stays live rather than growing the
 * snapshot into something that has to be invalidated as a whole.
 */

const NAMESPACE = "exams-discover";

/** Matches `ExamDiscoveryService.CLOSING_SOON_THRESHOLD_DAYS`. Changing one without the other is the bug. */
const CLOSING_SOON_THRESHOLD_DAYS = 14;

export type ExamDiscoveryPage = {
  content: ExamCard[];
  page: number;
  hasMore: boolean;
  totalElements: number;
};

export type ExamDiscoveryResult =
  | { status: "ready"; page: ExamDiscoveryPage; fetchedAt: number | null }
  /** A stored page, with its countdowns recomputed for today. */
  | { status: "cached"; page: ExamDiscoveryPage; fetchedAt: number }
  | { status: "unavailable"; message: string };

type Query = { sort: ExamSortOption; category: string | null };

function keyFor({ sort, category }: Query): string {
  return snapshotKey(NAMESPACE, sort, category);
}

/**
 * Whole days from today to an ISO date, or null when there is no date.
 *
 * Compared at midnight UTC on both sides so a partial day never rounds the count off by one —
 * the server does the same by working in `LocalDate` rather than instants.
 */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const end = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(end)) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - todayUtc) / 86_400_000);
}

/**
 * Recomputes the two fields that are relative to now. Cached reads only.
 *
 * A card with no `applicationEnd` keeps whatever the server said, which for those cards is
 * `null`/`false` and does not decay.
 */
function refreshCountdowns(cards: ExamCard[]): ExamCard[] {
  return cards.map((card) => {
    if (!card.applicationEnd) return card;
    const days = daysUntil(card.applicationEnd);
    if (days === null) return card;
    return {
      ...card,
      daysUntilDeadline: days,
      closingSoon: days >= 0 && days <= CLOSING_SOON_THRESHOLD_DAYS,
    };
  });
}

/**
 * The first page for a sort/category, from the snapshot first and the server right after.
 *
 * Returns twice by design, like `getDailyPlan`: the promise resolves with whatever can be shown
 * immediately, and `onRefreshed` fires later if the server had something different.
 */
export async function getExamDiscoveryPage(
  query: Query,
  onRefreshed?: (result: ExamDiscoveryResult) => void,
): Promise<ExamDiscoveryResult> {
  const key = keyFor(query);
  const cached = await readSnapshot<ExamDiscoveryPage>(key);

  if (cached) {
    // Not awaited: awaiting it would reintroduce exactly the round trip the cache removes.
    void refreshPage(query, key).then((fresh) => onRefreshed?.(fresh));
    return {
      status: "cached",
      page: { ...cached.payload, content: refreshCountdowns(cached.payload.content) },
      fetchedAt: cached.fetchedAt,
    };
  }

  return refreshPage(query, key);
}

async function refreshPage(query: Query, key: string): Promise<ExamDiscoveryResult> {
  try {
    const result = await discoverExams({
      page: 0,
      size: PAGE_SIZE,
      sort: query.sort,
      category: query.category ?? undefined,
    });
    const page: ExamDiscoveryPage = {
      content: result.content,
      page: result.page,
      hasMore: result.hasMore,
      totalElements: result.totalElements,
    };
    // Fire-and-forget: the caller is about to render this, and a slow write must not hold it up.
    void writeSnapshot(key, page);
    return { status: "ready", page, fetchedAt: Date.now() };
  } catch (err) {
    return {
      status: "unavailable",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * A later page. Deliberately uncached and always live — see the note at the top about why only
 * the first page is stored.
 */
export async function getExamDiscoveryMore(
  query: Query,
  targetPage: number,
): Promise<ExamDiscoveryPage> {
  const result = await discoverExams({
    page: targetPage,
    size: PAGE_SIZE,
    sort: query.sort,
    category: query.category ?? undefined,
  });
  return {
    content: result.content,
    page: result.page,
    hasMore: result.hasMore,
    totalElements: result.totalElements,
  };
}

/**
 * Kept here rather than on the screen so the cached page and a "load more" page can never be
 * fetched at different sizes, which would make the stored `hasMore` wrong.
 */
export const PAGE_SIZE = 100;
