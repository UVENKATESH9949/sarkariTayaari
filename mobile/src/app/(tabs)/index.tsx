import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { greetingPeriod } from "@sarkaritaiyaari/core/onboarding";
import { useActiveExam } from "../../examsModule/activeExamContext";
import { useOnboarding } from "../../onboarding/OnboardingContext";
import { ActiveExamPicker } from "../../examsModule/ActiveExamPicker";
import { getExamGuideHybrid } from "../../data/examGuideData";
import { useHybridMode } from "../../data/hybridSource";
import { daysUntil, priorityTier } from "../../examGuide/dates";
import { useBookmarks } from "../../practice/bookmarks";
import { useSessionHistory } from "../../practice/sessionHistory";
import { getWrongAnswers } from "../../practice/wrongAnswers";
import { useSyncStatus } from "../../sync/SyncContext";
import { PressableScale } from "../../ui/PressableScale";
import { FadeInItem } from "../../ui/FadeInList";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/Card";
import { PreparationPlanCard } from "../../ui/PreparationPlanCard";
import { SectionLabel } from "../../ui/SectionLabel";
import { CardSkeleton } from "../../ui/Skeleton";
import { radius, spacing } from "../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../ui/ThemeContext";
import { ThemeToggleButton } from "../../ui/ThemeToggleButton";
import { useT } from "../../i18n/I18nContext";

// Streak/readiness are still mock — real streak computation and the final
// readiness formula haven't been decided yet (see Progress for the real,
// computed readiness score). The followed exam name and Revise counts below are real.
const MOCK = {
  streakDays: 3,
  readinessPercent: 62,
};

/**
 * Keyed by the period rather than built by string concatenation, so every greeting is a real
 * catalogue key the compiler can check and the Telugu catalogue is forced to cover.
 */
const GREETING_KEYS = {
  morning: "home.greetingMorning",
  afternoon: "home.greetingAfternoon",
  evening: "home.greetingEvening",
} as const;

export default function Home() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  /*
   * The active exam comes from the app-wide provider, NOT from a local read of the database.
   *
   * That is the whole fix for the stale-Home bug. This screen used to call getFollowedExam()
   * in an effect keyed on `syncVersion`, so an exam changed from My Exams, the Exams tab or an
   * Exam Guide wrote to SQLite and Home never heard about it — it kept rendering its mounted
   * value until a sync or an app restart. Reading through the provider means the write and
   * this render are the same state change.
   */
  const { activeExam, myExams, loading: loadingExam, refresh: refreshActiveExam } = useActiveExam();
  const { displayName } = useOnboarding();
  const followedExamName = activeExam?.name ?? null;
  const followedExamCode = activeExam?.code ?? null;
  const [pickerVisible, setPickerVisible] = useState(false);
  // Exam Guide spec §38 "Home page integration" — deadline countdown. A separate,
  // best-effort fetch: this screen must render fine even if the guide call fails
  // (offline, or the exam has no current cycle configured yet). Stored keyed to the
  // exam it was loaded for (not a bare value) so switching the followed exam can't
  // briefly show the previous exam's deadline while the new fetch is in flight — same
  // shape as PreparationPlanCard's `loaded` state, and the same fix for the same
  // `react-hooks/set-state-in-effect` case (no synchronous setState in the effect body).
  const [loadedDeadline, setLoadedDeadline] = useState<{
    examCode: string;
    deadline: { label: string; days: number } | null;
  } | null>(null);
  const { bookmarks } = useBookmarks();
  const { sessions } = useSessionHistory();
  const { isRefreshing, refresh, syncVersion } = useSyncStatus();
  const guideMode = useHybridMode();

  useEffect(() => {
    if (!followedExamCode) return;
    let cancelled = false;
    getExamGuideHybrid(followedExamCode, guideMode)
      .then((guide) => {
        if (cancelled) return;
        const candidates = !guide
          ? []
          : [
              { label: "Application closes", date: guide.applicationEnd },
              ...guide.importantDates.map((d) => ({ label: d.title, date: d.startDate })),
            ]
              .map((c) => ({ ...c, days: daysUntil(c.date) }))
              .filter((c): c is { label: string; date: string; days: number } => c.days !== null && c.days >= 0);
        const deadline = candidates.length > 0 ? candidates.reduce((a, b) => (a.days <= b.days ? a : b)) : null;
        setLoadedDeadline({ examCode: followedExamCode, deadline });
      })
      .catch(() => {
        if (!cancelled) setLoadedDeadline({ examCode: followedExamCode, deadline: null });
      });
    return () => {
      cancelled = true;
    };
  }, [followedExamCode, guideMode]);

  const nearestDeadline = loadedDeadline && loadedDeadline.examCode === followedExamCode ? loadedDeadline.deadline : null;

  const wrongAnswerCount = useMemo(() => getWrongAnswers(sessions).length, [sessions]);

  // Pull to refresh forces a check, bypassing the staleness window — this is the
  // user explicitly asking, so "synced recently" isn't a reason to do nothing.
  const onRefresh = async () => {
    await refresh({ force: true });
    // A sync can add follows made on another device, and can auto-follow the first exam on a
    // fresh install — so the provider is asked to re-resolve rather than assumed current.
    await refreshActiveExam();
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextBlock}>
          {/*
           * The personalised greeting from onboarding. Falls back to the original "Welcome
           * back" whenever there is no name — an install adopted from before onboarding
           * existed, or a signed-out user who never gave one — so nothing here can render a
           * greeting with an empty gap where a name should be.
           */}
          <Text style={styles.greeting}>
            {displayName
              ? t(GREETING_KEYS[greetingPeriod(new Date().getHours())], { name: displayName })
              : t("home.welcome")}
          </Text>
          <Text style={styles.title}>{t("common.appName")}</Text>
        </View>
        <ThemeToggleButton />
      </View>

      <View style={styles.streakCard}>
        <Ionicons name="flame" size={22} color={colors.semantic.warning} />
        <Text style={styles.streakText}>{MOCK.streakDays}-day streak</Text>
      </View>

      {loadingExam ? (
        <CardSkeleton height={70} />
      ) : (
        <Card style={styles.examCard}>
          <Pressable
            style={styles.examCardMain}
            onPress={
              followedExamCode
                ? () => router.push({ pathname: "/exam-guide", params: { examCode: followedExamCode, examName: followedExamName ?? "" } })
                : undefined
            }
            accessibilityRole="button"
            accessibilityLabel={followedExamName ? `${t("home.preparingFor")} ${followedExamName}` : undefined}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.examLabel}>{t("home.preparingFor")}</Text>
              <Text style={styles.examName}>{followedExamName ?? " "}</Text>
            </View>
            {followedExamCode && <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />}
          </Pressable>

          {/* Only with something to switch to. With one followed exam this control would open
              a picker containing the exam already shown; "Explore Exams" right below is the
              route to getting a second one. */}
          {myExams.length > 1 && (
            <Pressable
              style={styles.changeExamRow}
              onPress={() => setPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t("exams.changeExam")}
            >
              <Ionicons name="swap-horizontal" size={14} color={colors.brand.light} />
              <Text style={styles.changeExamText}>{t("exams.changeExam")}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.brand.light} />
            </Pressable>
          )}
        </Card>
      )}

      {nearestDeadline && (
        <Pressable
          style={styles.deadlineCard}
          onPress={() => router.push({ pathname: "/exam-guide", params: { examCode: followedExamCode!, examName: followedExamName ?? "" } })}
          accessibilityRole="button"
          accessibilityLabel={`${nearestDeadline.label} in ${nearestDeadline.days} days`}
        >
          <Ionicons name="alarm-outline" size={16} color={priorityTier(nearestDeadline.days, colors).color} />
          <Text style={[styles.deadlineText, { color: priorityTier(nearestDeadline.days, colors).color }]}>
            {nearestDeadline.label} in {nearestDeadline.days} day{nearestDeadline.days === 1 ? "" : "s"}
          </Text>
        </Pressable>
      )}

      <Pressable
        style={styles.exploreExamsRow}
        onPress={() => router.push("/exams")}
        accessibilityRole="button"
        accessibilityLabel="Explore other exams"
      >
        <Ionicons name="compass-outline" size={16} color={colors.brand.light} />
        <Text style={styles.exploreExamsText}>Explore Exams</Text>
        <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
      </Pressable>

      <Button size="lg" onPress={() => router.push("/practice")}>
        {t("home.continuePractice")}
      </Button>

      <Card variant="gradient" onPress={() => router.push("/progress")} style={styles.readinessCard}>
        <View>
          <Text style={styles.readinessLabel}>{t("home.readiness")}</Text>
          <Text style={styles.readinessPercent}>{MOCK.readinessPercent}%</Text>
        </View>
        <View style={styles.readinessCta}>
          <Text style={styles.readinessCtaText}>{t("home.viewProgress")}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.text.onAccent} />
        </View>
      </Card>

      {/* Epic L's first user-facing slice. Renders nothing when no exam is followed or nothing
          has been computed yet, so Home is unchanged until there is a real plan to show. */}
      <PreparationPlanCard
        examCode={followedExamCode}
        examName={followedExamName}
        refreshKey={syncVersion}
      />

      <SectionLabel label={t("nav.revise")} />
      <View style={styles.reviseRow}>
        <FadeInItem index={0} style={styles.reviseItem}>
          <PressableScale
            style={styles.reviseCard}
            onPress={() => router.push({ pathname: "/revise", params: { initialTab: "bookmarks" } })}
          >
            <Ionicons name="star" size={20} color={colors.semantic.warning} />
            <Text style={styles.reviseCount}>{bookmarks.length}</Text>
            <Text style={styles.reviseLabel}>{t("home.bookmarked")}</Text>
          </PressableScale>
        </FadeInItem>
        <FadeInItem index={1} style={styles.reviseItem}>
          <PressableScale
            style={styles.reviseCard}
            onPress={() => router.push({ pathname: "/revise", params: { initialTab: "wrong" } })}
          >
            <Ionicons name="close-circle" size={20} color={colors.semantic.error} />
            <Text style={styles.reviseCount}>{wrongAnswerCount}</Text>
            <Text style={styles.reviseLabel}>{t("home.wrongAnswers")}</Text>
          </PressableScale>
        </FadeInItem>
      </View>

      <ActiveExamPicker visible={pickerVisible} onClose={() => setPickerVisible(false)} />
    </ScrollView>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.xl,
      paddingTop: spacing.xl,
      paddingBottom: spacing["3xl"],
      gap: spacing.base,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    headerTextBlock: {
      flex: 1,
    },
    greeting: {
      ...typography.secondary,
    },
    title: {
      ...typography.pageTitle,
      marginBottom: spacing.sm,
    },
    streakCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.semantic.warningBg,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      alignSelf: "flex-start",
    },
    streakText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.semantic.warning,
    },
    /* A column now, not a row: the card holds the exam row plus an optional "Change exam"
       control beneath it. The row layout moved down to examCardMain, unchanged. */
    examCard: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    examCardMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    changeExamRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      alignSelf: "flex-start",
      paddingVertical: spacing.xs,
    },
    changeExamText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.light,
    },
    examLabel: {
      ...typography.secondary,
    },
    examName: {
      ...typography.cardTitle,
      fontSize: 20,
      marginTop: spacing.xs,
    },
    deadlineCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm - 2,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    deadlineText: {
      fontSize: 13,
      fontWeight: "600",
      flex: 1,
    },
    exploreExamsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      alignSelf: "flex-start",
    },
    exploreExamsText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.light,
      flex: 1,
    },
    readinessCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    readinessLabel: {
      fontSize: 13,
      color: "rgba(255,255,255,0.75)",
    },
    readinessPercent: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.text.onAccent,
      marginTop: 2,
    },
    readinessCta: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    readinessCtaText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.onAccent,
    },
    reviseRow: {
      flexDirection: "row",
      gap: spacing.md,
    },
    // Carries the flex share; reviseCard fills whatever width that gives it. Same
    // wrapper-vs-child sizing trap as the Practice grid — see FadeInItem's own comment.
    reviseItem: {
      flex: 1,
    },
    reviseCard: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: spacing.base,
    },
    reviseCount: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text.primary,
      marginTop: spacing.sm,
    },
    reviseLabel: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
  });
