import { useCallback, useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { discoverExams, type ExamCard as ExamCardData, type ExamSortOption } from "../../api/examDiscovery";
import { followExam, getFollowedExams, unfollowExam } from "../../db/followedExams";
import { useHybridMode } from "../../data/hybridSource";
import { getSubjectStats } from "../../data/practiceData";
import { useSessionHistory } from "../../practice/sessionHistory";
import { ExamCard } from "../../examsModule/ExamCard";
import { Button } from "../../ui/Button";
import { EmptyState } from "../../ui/EmptyState";
import { ErrorState } from "../../ui/ErrorState";
import { ContextualLoading } from "../../ui/ContextualLoading";
import { ListSkeleton } from "../../ui/Skeleton";
import { SectionLabel } from "../../ui/SectionLabel";
import { spacing, radius } from "../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../ui/ThemeContext";
import { trackEvent } from "../../telemetry/analytics";

const PAGE_SIZE = 100;

type Segment = "ALL" | "MY_EXAMS" | "OPEN" | "UPCOMING";

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "MY_EXAMS", label: "My Exams" },
  { key: "OPEN", label: "Applications Open" },
  { key: "UPCOMING", label: "Upcoming" },
];

const SORT_OPTIONS: { key: ExamSortOption; label: string }[] = [
  { key: "DEADLINE", label: "Deadline" },
  { key: "EXAM_DATE", label: "Exam Date" },
  { key: "NEWLY_ANNOUNCED", label: "Newly Announced" },
  { key: "ALPHABETICAL", label: "A-Z" },
];

const OPEN_STATUSES = new Set(["APPLICATION_OPEN", "APPLICATION_CLOSING_SOON"]);

/**
 * The Exams module's own landing screen (spec §5-15) — a 5th primary tab, distinct from
 * My Exams (still reachable from More, untouched — see the approved plan's Architecture
 * Decision #7) and from the Exam Guide detail screen this now leads into.
 *
 * Real server-side pagination/sort/category-filter (the user's explicit choice, even at
 * today's ~11-exam catalogue): a sort or category change re-fetches from
 * `GET /api/exams/discover` with those params. The top segmented row (All/My Exams/
 * Applications Open/Upcoming) and the search box are deliberately client-side filters
 * over the already-fetched page instead — a second server round trip per tap would buy
 * nothing at this scale, and the backend has no "multiple statuses at once" param for
 * "Open" to filter on anyway (it covers exactly one RecruitmentCycleStatus, or the
 * synthetic CLOSING_SOON bucket, at a time — both already exercised directly in
 * ExamDiscoveryTest).
 */
export default function ExamsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mode = useHybridMode();
  const { sessions } = useSessionHistory();

  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<Segment>("ALL");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<ExamSortOption>("DEADLINE");
  const fetchKey = `${sort}:${category ?? ""}`;

  useEffect(() => {
    trackEvent("exam_module_opened");
  }, []);

  // Debounced rather than one event per keystroke — a real search, not every character typed.
  useEffect(() => {
    if (!search.trim()) return;
    const timer = setTimeout(() => trackEvent("exam_search_used", { query: search.trim() }), 600);
    return () => clearTimeout(timer);
  }, [search]);

  // Keyed to (sort, category) — same pattern as exam-calendar.tsx and
  // PreparationPlanCard: deriving "still loading for the current filters" by key
  // comparison avoids a synchronous setState at the top of the load effect
  // (react-hooks/set-state-in-effect) that resetting to a loading state would need.
  const [loadedPage, setLoadedPage] = useState<{
    key: string;
    content: ExamCardData[];
    page: number;
    hasMore: boolean;
    totalElements: number;
  } | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [followedCodes, setFollowedCodes] = useState<Set<string>>(new Set());
  const [pendingFollowCode, setPendingFollowCode] = useState<string | null>(null);

  const [loadedRecommended, setLoadedRecommended] = useState<{
    key: string;
    items: { exam: ExamCardData; reason: string }[];
  } | null>(null);

  const loadFollowed = useCallback(() => {
    getFollowedExams()
      .then((rows) => setFollowedCodes(new Set(rows.map((r) => r.code))))
      .catch(() => {});
  }, []);

  useEffect(loadFollowed, [loadFollowed]);

  const fetchPage = useCallback(
    async (targetPage: number, append: boolean) => {
      const result = await discoverExams({
        page: targetPage,
        size: PAGE_SIZE,
        sort,
        category: category ?? undefined,
      });
      setLoadedPage((prev) => ({
        key: fetchKey,
        content: append && prev?.key === fetchKey ? [...prev.content, ...result.content] : result.content,
        page: result.page,
        hasMore: result.hasMore,
        totalElements: result.totalElements,
      }));
      return result;
    },
    [sort, category, fetchKey],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchPage(0, false);
    })().catch((err) => {
      if (!cancelled) setLoadError({ key: fetchKey, message: err.message ?? String(err) });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage, fetchKey]);

  const current = loadedPage?.key === fetchKey ? loadedPage : null;
  const cards = useMemo(() => current?.content ?? [], [current]);
  const page = current?.page ?? 0;
  const hasMore = current?.hasMore ?? false;
  const totalElements = current?.totalElements ?? 0;
  const loading = current === null && loadError?.key !== fetchKey;
  const error = loadError?.key === fetchKey ? loadError.message : null;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await fetchPage(0, false);
      loadFollowed();
    } catch (err) {
      setLoadError({ key: fetchKey, message: (err as Error).message ?? String(err) });
    } finally {
      setRefreshing(false);
    }
  }

  async function onLoadMore() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchPage(page + 1, true);
    } catch {
      // Silent — the button just stays available to retry, the already-loaded page is unaffected.
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleFollow(examCode: string) {
    const isFollowed = followedCodes.has(examCode);
    setPendingFollowCode(examCode);
    try {
      if (isFollowed) {
        await unfollowExam(examCode);
        trackEvent("exam_unfollowed", { examCode });
      } else {
        await followExam(examCode);
        trackEvent("exam_followed", { examCode });
      }
      const rows = await getFollowedExams();
      setFollowedCodes(new Set(rows.map((r) => r.code)));
    } finally {
      setPendingFollowCode(null);
    }
  }

  function openGuide(exam: ExamCardData) {
    trackEvent("exam_card_opened", { examCode: exam.examCode });
    router.push({ pathname: "/exam-guide", params: { examCode: exam.examCode, examName: exam.examName } });
  }

  // The primary-action button (Apply Now/Prepare Now/View Exam/View Result Info) always
  // leads to the same place: the notification URL itself isn't part of the card DTO
  // (spec's own "don't force every field into every card" rule), and the Guide screen
  // is where it actually lives, alongside every other cycle detail.
  function runPrimaryAction(exam: ExamCardData) {
    openGuide(exam);
  }

  const query = search.trim().toLowerCase();
  const searched = query ? cards.filter((c) => c.examName.toLowerCase().includes(query)) : cards;

  const segmented = useMemo(() => {
    switch (segment) {
      case "MY_EXAMS":
        return searched.filter((c) => followedCodes.has(c.examCode));
      case "OPEN":
        return searched.filter((c) => OPEN_STATUSES.has(c.status ?? ""));
      case "UPCOMING":
        return searched.filter((c) => c.primaryAction === "PREPARE_NOW");
      default:
        return searched;
    }
  }, [searched, segment, followedCodes]);

  const closingSoon = segmented.filter((c) => c.closingSoon);
  const applicationsOpen = segmented.filter((c) => !c.closingSoon && OPEN_STATUSES.has(c.status ?? ""));
  const upcoming = segmented.filter((c) => c.primaryAction === "PREPARE_NOW");
  const shownCodes = new Set([...closingSoon, ...applicationsOpen, ...upcoming].map((c) => c.examCode));
  const rest = segmented.filter((c) => !shownCodes.has(c.examCode));

  const categories = useMemo(
    () => Array.from(new Set(cards.map((c) => c.category).filter((c): c is string => !!c))).sort(),
    [cards],
  );

  // Spec §28 "Personalized Exam Recommendation" — the same client-side heuristic
  // my-exams.tsx already established (urgency + subject overlap with practice history),
  // adapted to run over this screen's already-fetched cards instead of a fresh fetch.
  // Unlike my-exams.tsx, urgency doesn't need its own guide fetch here — the discovery
  // card already carries `closingSoon` directly, computed server-side from the same cycle.
  const nonFollowedKey = cards
    .filter((c) => !followedCodes.has(c.examCode))
    .map((c) => c.examCode)
    .join(",");
  useEffect(() => {
    if (!nonFollowedKey) return;
    let cancelled = false;
    const practicedSubjects = new Set(sessions.map((s) => s.subjectName).filter(Boolean));
    const codes = nonFollowedKey.split(",");

    Promise.all(
      codes.map(async (code) => {
        const exam = cards.find((c) => c.examCode === code)!;
        const subjects = await getSubjectStats(code, mode).catch(() => []);
        const overlapCount = subjects.filter((s) => practicedSubjects.has(s.name)).length;
        const score = (exam.closingSoon ? 2 : 0) + overlapCount;
        const reason =
          exam.closingSoon && overlapCount > 0
            ? "Application closing soon · matches your practice"
            : exam.closingSoon
              ? "Application closing soon"
              : overlapCount > 0
                ? "Matches subjects you practice"
                : "";
        return { exam, score, reason };
      }),
    ).then((scored) => {
      if (cancelled) return;
      setLoadedRecommended({
        key: nonFollowedKey,
        items: scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((s) => ({ exam: s.exam, reason: s.reason })),
      });
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonFollowedKey, mode]);

  const recommended = loadedRecommended && loadedRecommended.key === nonFollowedKey ? loadedRecommended.items : [];

  function renderCard(exam: ExamCardData) {
    return (
      <ExamCard
        key={exam.examCode}
        exam={exam}
        isFollowed={followedCodes.has(exam.examCode)}
        followPending={pendingFollowCode === exam.examCode}
        onToggleFollow={() => toggleFollow(exam.examCode)}
        onPress={() => openGuide(exam)}
        onPrimaryAction={() => runPrimaryAction(exam)}
      />
    );
  }

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
        <ContextualLoading message="Loading exams..." skeleton={<ListSkeleton />} />
      </View>
    );
  }

  if (error && cards.length === 0) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + spacing.xl }]}>
        <ErrorState title="Couldn't load exams" body={error} onRetry={() => fetchPage(0, false).catch(() => {})} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.light} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Exams</Text>
        <Pressable
          style={styles.calendarLink}
          onPress={() => router.push("/exam-calendar")}
          accessibilityRole="button"
          accessibilityLabel="Exam calendar"
        >
          <Ionicons name="calendar-outline" size={20} color={colors.brand.light} />
        </Pressable>
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search exams"
          placeholderTextColor={colors.text.muted}
          accessibilityLabel="Search exams"
          autoCorrect={false}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {SEGMENTS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.chip, segment === s.key && styles.chipActive]}
            onPress={() => {
              setSegment(s.key);
              trackEvent("exam_filter_used", { filter: s.key });
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, segment === s.key && styles.chipTextActive]}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          <Pressable
            style={[styles.chip, category === null && styles.chipActive]}
            onPress={() => setCategory(null)}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, category === null && styles.chipTextActive]}>All Categories</Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c}
              style={[styles.chip, category === c && styles.chipActive]}
              onPress={() => setCategory(c)}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {SORT_OPTIONS.map((s) => (
          <Pressable
            key={s.key}
            style={[styles.chip, sort === s.key && styles.chipActive]}
            onPress={() => {
              setSort(s.key);
              trackEvent("exam_sort_used", { sort: s.key });
            }}
            accessibilityRole="button"
          >
            <Text style={[styles.chipText, sort === s.key && styles.chipTextActive]}>Sort: {s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {segmented.length === 0 ? (
        <EmptyState
          icon="school-outline"
          title="No exams match this filter"
          body="Try a different filter, category, or search term."
        />
      ) : (
        <>
          {closingSoon.length > 0 && (
            <>
              <SectionLabel label="Closing Soon" count={String(closingSoon.length)} style={styles.sectionSpacing} />
              {closingSoon.map(renderCard)}
            </>
          )}
          {applicationsOpen.length > 0 && (
            <>
              <SectionLabel label="Applications Open" count={String(applicationsOpen.length)} style={styles.sectionSpacing} />
              {applicationsOpen.map(renderCard)}
            </>
          )}
          {recommended.length > 0 && (
            <>
              <SectionLabel label="Recommended For You" style={styles.sectionSpacing} />
              {recommended.map(({ exam }) => renderCard(exam))}
            </>
          )}
          {upcoming.length > 0 && (
            <>
              <SectionLabel label="Upcoming" count={String(upcoming.length)} style={styles.sectionSpacing} />
              {upcoming.map(renderCard)}
            </>
          )}
          {rest.length > 0 && (
            <>
              <SectionLabel label="All Exams" count={String(totalElements)} style={styles.sectionSpacing} />
              {rest.map(renderCard)}
            </>
          )}
          {hasMore && segment === "ALL" && !query && (
            <Button variant="secondary" onPress={onLoadMore} loading={loadingMore} style={styles.loadMoreButton}>
              Load more
            </Button>
          )}
        </>
      )}
    </ScrollView>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl,
    },
    container: {
      padding: spacing.xl,
      paddingBottom: spacing["3xl"],
      gap: spacing.sm + 2,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    title: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text.primary,
    },
    calendarLink: {
      padding: spacing.xs + 2,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    searchInput: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      fontSize: 14,
      color: colors.text.primary,
    },
    chipRow: {
      flexGrow: 0,
    },
    chip: {
      backgroundColor: colors.surfaceElevated2,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      marginRight: spacing.sm,
    },
    chipActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    chipText: {
      fontSize: 12.5,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    chipTextActive: {
      color: colors.text.onAccent,
    },
    sectionSpacing: {
      marginTop: spacing.md,
    },
    errorText: {
      fontSize: 13,
      color: colors.semantic.error,
    },
    loadMoreButton: {
      marginTop: spacing.sm,
      alignSelf: "center",
    },
  });
