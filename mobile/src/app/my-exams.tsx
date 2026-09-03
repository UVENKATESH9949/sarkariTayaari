import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { getExams, type ExamResponse } from "../api/reference";
import { followExam, getFollowedExams, unfollowExam, type FollowedExam } from "../db/followedExams";
import { getExamGuideHybrid } from "../data/examGuideData";
import { useHybridMode } from "../data/hybridSource";
import { getSubjectStats } from "../data/practiceData";
import { daysUntil } from "../examGuide/dates";
import { useSessionHistory } from "../practice/sessionHistory";
import { Card, CardDivider, CardRow } from "../ui/Card";
import { SectionLabel } from "../ui/SectionLabel";
import { EmptyState } from "../ui/EmptyState";
import { ContextualLoading } from "../ui/ContextualLoading";
import { ListSkeleton } from "../ui/Skeleton";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

/**
 * Exam Guide spec §29 "My Exams" and §47/§48 "Search"/"Exam Discovery" — this is a
 * genuinely new screen, not a Phase 1 gap-fill, so it stays English-only for now rather
 * than a half-translated addition; see the report.
 *
 * `followedExams` was never actually a single-exam table (its primary key is
 * `examCode`), so following a second exam here needs no schema change — only
 * `getFollowedExam()`'s callers (Home, PreparationPlanCard) keep assuming one, and this
 * screen deliberately doesn't touch that: it reads/writes the same rows through the new
 * plural functions instead.
 */
export default function MyExamsScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();

  const [followed, setFollowed] = useState<FollowedExam[]>([]);
  const [allExams, setAllExams] = useState<ExamResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Tracks in-flight follow/unfollow taps so a fast double-tap can't fire the write twice.
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  // Exam Guide spec §47 "Search" — scoped to filtering this list, not a cross-content
  // search engine: there's no shared search component in this app yet, and a ~15-exam
  // catalogue doesn't need one.
  const [search, setSearch] = useState("");
  const mode = useHybridMode();
  const { sessions } = useSessionHistory();
  // Spec §28 "Personalized Exam Recommendation" — a client-side heuristic, not a new
  // backend endpoint or ML: urgency (an open application closing soon, from the exam's
  // cached Guide) plus subject overlap with the exams this device has actually practiced
  // for. Stored keyed to the discoverable-list "key" it was computed for (not a bare
  // array) so a mid-flight recompute can't flash a stale list — same shape as
  // PreparationPlanCard's `loaded` state, and avoids a synchronous setState in the effect
  // body below (react-hooks/set-state-in-effect).
  const [loadedRecommended, setLoadedRecommended] = useState<{
    key: string;
    items: { exam: ExamResponse; reason: string }[];
  } | null>(null);

  const load = useCallback(() => {
    Promise.all([getFollowedExams(), getExams()])
      .then(([f, all]) => {
        setFollowed(f);
        setAllExams(all);
      })
      .catch((err) => setError(err.message ?? String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const followedCodes = new Set(followed.map((f) => f.code));
  const query = search.trim().toLowerCase();
  // A ~15-exam list — filtered inline on every render rather than memoized, which would
  // buy nothing at this size and would need its own stable-dependency care for no benefit.
  const discoverableAll = allExams.filter((e) => !followedCodes.has(e.code));
  const discoverable = query
    ? discoverableAll.filter((e) => e.name.toLowerCase().includes(query))
    : discoverableAll;

  const discoverableKey = discoverableAll.map((e) => e.code).join(",");
  useEffect(() => {
    if (!discoverableKey) return;
    let cancelled = false;
    const practicedSubjects = new Set(sessions.map((s) => s.subjectName).filter(Boolean));
    const codes = discoverableKey.split(",");

    Promise.all(
      codes.map(async (code) => {
        const exam = discoverableAll.find((e) => e.code === code)!;
        const [guide, subjects] = await Promise.all([
          getExamGuideHybrid(code, mode).catch(() => null),
          getSubjectStats(code, mode).catch(() => []),
        ]);
        const days = guide ? daysUntil(guide.applicationEnd) : null;
        const urgent = days !== null && days >= 0 && days <= 45;
        const overlapCount = subjects.filter((s) => practicedSubjects.has(s.name)).length;
        const score = (urgent ? 2 : 0) + overlapCount;
        const reason = urgent && overlapCount > 0
          ? "Application closing soon · matches your practice"
          : urgent
            ? "Application closing soon"
            : overlapCount > 0
              ? "Matches subjects you practice"
              : "";
        return { exam, score, reason };
      }),
    ).then((scored) => {
      if (cancelled) return;
      setLoadedRecommended({
        key: discoverableKey,
        items: scored
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 2)
          .map((s) => ({ exam: s.exam, reason: s.reason })),
      });
    });

    return () => {
      cancelled = true;
    };
    // discoverableAll/sessions deliberately excluded: discoverableKey already captures
    // every discoverable-list change, and re-scoring on every practice-session update
    // (i.e. after every quiz) would refetch every discoverable exam's guide + subject
    // stats for a "nice to have" nudge — recomputing when the exam list or mode changes
    // is a fair cadence for this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discoverableKey, mode]);

  const recommended = loadedRecommended && loadedRecommended.key === discoverableKey ? loadedRecommended.items : [];

  async function toggleFollow(examCode: string, isFollowed: boolean) {
    setPendingCode(examCode);
    try {
      if (isFollowed) {
        await unfollowExam(examCode);
        trackEvent("exam_unfollowed", { examCode });
      } else {
        await followExam(examCode);
        trackEvent("exam_followed", { examCode });
      }
      // Re-reads rather than patching state locally: `getFollowedExams` is the one
      // source of truth this screen has, and it's cheap enough (a handful of rows).
      const rows = await getFollowedExams();
      setFollowed(rows);
    } finally {
      setPendingCode(null);
    }
  }

  function openGuide(exam: { code: string; name: string }) {
    router.push({ pathname: "/exam-guide", params: { examCode: exam.code, examName: exam.name } });
  }

  function StarButton({ examCode, isFollowed }: { examCode: string; isFollowed: boolean }) {
    return (
      <Pressable
        style={styles.starButton}
        disabled={pendingCode === examCode}
        onPress={(e) => {
          e.stopPropagation();
          toggleFollow(examCode, isFollowed);
        }}
        accessibilityRole="button"
        accessibilityLabel={isFollowed ? "Unfollow this exam" : "Follow this exam"}
      >
        <Ionicons
          name={isFollowed ? "star" : "star-outline"}
          size={20}
          color={isFollowed ? colors.semantic.warning : colors.text.muted}
        />
      </Pressable>
    );
  }

  if (loading) {
    return (
      <View style={styles.screen}>
        <ContextualLoading message="Loading your exams..." skeleton={<ListSkeleton />} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "My Exams" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={styles.compareLink}
          onPress={() => router.push("/exam-compare")}
          accessibilityRole="button"
          accessibilityLabel="Compare exams"
        >
          <Ionicons name="git-compare-outline" size={16} color={colors.brand.light} />
          <Text style={styles.compareLinkText}>Compare Exams</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
        </Pressable>

        <SectionLabel label="Following" />
        {followed.length === 0 ? (
          <EmptyState
            icon="star-outline"
            title="No exams followed"
            body="Follow your target exams to see their deadlines and guide here."
          />
        ) : (
          <Card variant="container" style={styles.card}>
            {followed.map((exam, i) => (
              <View key={exam.code}>
                {i > 0 && <CardDivider />}
                <CardRow
                  icon="school-outline"
                  label={exam.name}
                  onPress={() => openGuide(exam)}
                  trailing={<StarButton examCode={exam.code} isFollowed />}
                />
              </View>
            ))}
          </Card>
        )}

        {recommended.length > 0 && (
          <>
            <SectionLabel label="Recommended for You" style={styles.sectionSpacing} />
            <Card variant="container" style={styles.card}>
              {recommended.map(({ exam, reason }, i) => (
                <View key={exam.code}>
                  {i > 0 && <CardDivider />}
                  <CardRow
                    icon="sparkles-outline"
                    label={exam.name}
                    value={reason}
                    onPress={() => openGuide(exam)}
                    trailing={<StarButton examCode={exam.code} isFollowed={false} />}
                  />
                </View>
              ))}
            </Card>
          </>
        )}

        <SectionLabel label="Explore Exams" style={styles.sectionSpacing} />
        {discoverableAll.length > 0 && (
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
        )}
        {discoverableAll.length === 0 ? (
          <Text style={styles.hintText}>You&apos;re following every available exam.</Text>
        ) : discoverable.length === 0 ? (
          <Text style={styles.hintText}>No exams match &quot;{search.trim()}&quot;.</Text>
        ) : (
          <Card variant="container" style={styles.card}>
            {discoverable.map((exam, i) => (
              <View key={exam.code}>
                {i > 0 && <CardDivider />}
                <CardRow
                  icon="school-outline"
                  label={exam.name}
                  onPress={() => openGuide(exam)}
                  trailing={<StarButton examCode={exam.code} isFollowed={false} />}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors, spacing, radius }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl,
    },
    container: {
      padding: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    card: {
      marginTop: spacing.sm,
    },
    sectionSpacing: {
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
    },
    compareLink: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      alignSelf: "flex-start",
      marginBottom: spacing.base,
    },
    compareLinkText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.light,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    searchInput: {
      flex: 1,
      paddingVertical: spacing.sm + 2,
      fontSize: 14,
      color: colors.text.primary,
    },
    starButton: {
      padding: spacing.sm,
    },
    hintText: {
      fontSize: 13,
      color: colors.text.muted,
      marginTop: spacing.sm,
    },
    errorText: {
      fontSize: 13,
      color: colors.semantic.error,
      marginBottom: spacing.base,
    },
  });
