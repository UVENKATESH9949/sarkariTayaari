import { useCallback, useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { DailyPlanResponse, DailyPlanTask } from "@sarkaritaiyaari/core/api";
import { getDailyPlan, type DailyPlanResult } from "../data/dailyPlanData";
import { useActiveExam } from "../examsModule/activeExamContext";
import { useAuth } from "../practice/authContext";
import { useSyncStatus } from "../sync/SyncContext";
import { Card } from "../ui/Card";
import { ContextualLoading } from "../ui/ContextualLoading";
import { EmptyState } from "../ui/EmptyState";
import { ErrorState } from "../ui/ErrorState";
import { PressableScale } from "../ui/PressableScale";
import { ListSkeleton } from "../ui/Skeleton";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

/**
 * "Today's Plan" — the first student-facing consumer of the personalization program.
 *
 * Six phases shipped behind five endpoints with no reader at all; this is the one a student
 * would actually open, and it is the surface the program's own plan named first, because every
 * task it lists already resolves to a screen that exists (`/practice/levels`).
 *
 * A root-level pushed screen reached from Home and from More — **deliberately not a sixth tab**,
 * the same call `preparation-radar.tsx` made and for the same reason: the bar is already the
 * five Home/Practice/Mock Test/Exams/More, and Progress was moved out of it precisely because
 * primary navigation was getting crowded.
 *
 * <h2>What this screen refuses to invent</h2>
 *
 * It renders the server's plan and nothing else. No client-side reordering, no "you're behind"
 * framing, no second opinion about what matters — a third ranking is exactly the drift Phases 3,
 * 4 and 7 exist to prevent. Where the payload is an assumption rather than a measurement (the
 * minutes budget above all) the screen says so, rather than presenting a guess as a fact.
 *
 * English-only, matching every screen added since the Exam Guide work — this app's i18n types
 * Telugu as English's shape, so adding keys here would force Telugu copy nobody in this session
 * can vouch for.
 */
export default function DailyPlanScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ examCode?: string; examName?: string }>();

  // Same exam resolution as the radar: fall back to the ACTIVE exam rather than "some followed
  // one", so this screen and Home can never disagree about which exam is being planned for.
  const { activeExam, loading: activeExamLoading } = useActiveExam();
  const resolvedExam = params.examCode
    ? { code: params.examCode, name: params.examName ?? "" }
    : activeExamLoading
      ? undefined
      : activeExam
        ? { code: activeExam.code, name: activeExam.name }
        : null;

  const examCode = resolvedExam?.code;
  const examName = resolvedExam?.name ?? params.examName;

  // A finished quiz landing locally and a restore landing from the server both change
  // answeredToday, so both have to re-read — the documented stale-screen trap.
  const { syncVersion } = useSyncStatus();
  const { progressVersion } = useAuth();

  // Keyed loaded-state, the pattern `PreparationPlanCard` established here: it keeps a
  // synchronous setState out of the effect body (`react-hooks/set-state-in-effect`) and stops
  // a stale exam's plan flashing while the new one is in flight.
  const [loaded, setLoaded] = useState<{ key: string; result: DailyPlanResult } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadKey = `${examCode ?? ""}:${syncVersion}:${progressVersion}`;
  const isStale = loaded === null || loaded.key !== loadKey;

  useEffect(() => {
    if (!examCode) return;
    trackEvent("daily_plan_opened", { examCode });
  }, [examCode]);

  useEffect(() => {
    if (!examCode) return;
    let cancelled = false;
    const key = loadKey;

    (async () => {
      const result = await getDailyPlan(examCode);
      if (!cancelled) setLoaded({ key, result });
    })();

    return () => {
      cancelled = true;
    };
  }, [examCode, loadKey]);

  const onRefresh = useCallback(async () => {
    if (!examCode) return;
    setRefreshing(true);
    try {
      setLoaded({ key: loadKey, result: await getDailyPlan(examCode) });
    } finally {
      setRefreshing(false);
    }
  }, [examCode, loadKey]);

  function openTask(task: DailyPlanTask) {
    trackEvent("daily_plan_task_opened", { examCode, topicId: task.topicId, source: task.source });
    /*
     * Into the levels screen rather than straight into a quiz. The task names a difficulty
     * sometimes and a question count always, but Practice's own flow owns choosing a level and
     * starting a session — jumping past it would be a second entry path into the quiz to keep
     * working forever after.
     */
    router.push({
      pathname: "/practice/levels",
      params: {
        examCode: examCode ?? "",
        examLabel: examName ?? "",
        subjectName: task.subjectName,
        topicId: task.topicId,
        topicName: task.topicName,
      },
    });
  }

  const result = isStale ? null : loaded.result;

  return (
    <>
      <Stack.Screen options={{ title: "Today's Plan" }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        {resolvedExam === null ? (
          <EmptyState
            icon="star-outline"
            title="Pick an exam first"
            body="A day is planned against one exam's syllabus, so choose the exam you're preparing for and today's plan will appear here."
            action={{ label: "Browse exams", onPress: () => router.push("/exams") }}
          />
        ) : isStale ? (
          <ContextualLoading message="Working out your day..." skeleton={<ListSkeleton count={4} />} />
        ) : result!.status === "signed-out" ? (
          /*
           * Not a degraded state — a real one. The plan is built and stored on the server from
           * a history that spans devices; there is deliberately no local version to fall back
           * to (see `data/dailyPlanData.ts`).
           */
          <EmptyState
            icon="cloud-outline"
            title="Sign in to get a daily plan"
            body="Your plan is built from your practice history across every device, so it lives with your account. Practice itself works fine signed out."
            action={{ label: "Sign in", onPress: () => router.push("/account") }}
          />
        ) : result!.status === "unavailable" ? (
          <ErrorState title="No plan right now" body={result!.message} onRetry={onRefresh} />
        ) : result!.plan.tasks.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Nothing to schedule yet"
            body="There's no practicable topic for this exam today — usually that means its syllabus has no questions yet. Try another exam, or practise freely."
            action={{ label: "Open Practice", onPress: () => router.push("/practice") }}
          />
        ) : (
          <>
            <PlanHeader plan={result!.plan} styles={styles} onSetStudyTime={() => router.push("/study-preferences")} />
            {result!.plan.tasks.map((task) => (
              <TaskCard
                key={task.taskId}
                task={task}
                onPress={() => openTask(task)}
                styles={styles}
                colors={colors}
              />
            ))}
            <Text style={styles.footnote}>
              Done is worked out from what you actually practise — there&apos;s nothing to tick off.
            </Text>
          </>
        )}
      </ScrollView>
    </>
  );
}

function PlanHeader({
  plan,
  styles,
  onSetStudyTime,
}: {
  plan: DailyPlanResponse;
  styles: ReturnType<typeof buildStyles>;
  onSetStudyTime: () => void;
}) {
  const done = plan.tasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <Card variant="container" style={styles.headerCard}>
      <Text style={styles.headerTitle}>
        {plan.tasks.length} {plan.tasks.length === 1 ? "thing" : "things"} to do today
      </Text>
      <Text style={styles.headerBody}>
        About {plan.plannedMinutes} minutes of work{done > 0 ? ` · ${done} already done` : ""}
      </Text>

      <View style={styles.headerStats}>
        <Stat label="Your time" value={`${plan.budget.minutes}m`} styles={styles} />
        <Stat label="Planned" value={`${plan.plannedMinutes}m`} styles={styles} />
        <Stat label="Tasks" value={String(plan.tasks.length)} styles={styles} />
      </View>

      {/*
       * The budget is an inference, and this line is what keeps that honest. A student who
       * chose "1-2 hours" should be able to see where "90 minutes" came from, and one who
       * never told us should not be shown 60 minutes as though they had.
       */}
      <Text style={styles.headerNote}>
        {plan.budget.basis === "STATED_BAND"
          /*
           * "you told us", not "you chose when you set up the app". The original wording was
           * true only until Study preferences shipped and a student could change the band
           * afterwards — at which point the screen was crediting the edit to onboarding. Found
           * by changing it on a device and reading the result back.
           */
          ? `Based on the ${BAND_COPY[plan.budget.dailyStudyTime ?? ""] ?? "study time"} a day you told us you study.`
          : "We don't know how long you study, so we've assumed an hour. This gets more useful once we do."}
      </Text>
      {/*
       * Naming an assumption is only half the job if the student cannot correct it. Offered
       * exactly when the budget is a guess — beside a band they did choose it would be noise.
       * The new band applies from tomorrow, which the preferences screen says plainly, because
       * today's plan is already stored and re-planning it would destroy what was assigned.
       */}
      {plan.budget.basis === "DEFAULT" ? (
        <Text style={styles.headerAction} onPress={onSetStudyTime} accessibilityRole="button">
          Tell us how long you study →
        </Text>
      ) : null}
      <Text style={styles.headerDate}>
        Planned for {plan.planDate} · {plan.zone}
      </Text>
    </Card>
  );
}

function Stat({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TaskCard({
  task,
  onPress,
  styles,
  colors,
}: {
  task: DailyPlanTask;
  onPress: () => void;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
}) {
  const done = task.status === "COMPLETED";

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.taskCard, done ? styles.taskCardDone : null]}
      accessibilityRole="button"
      accessibilityLabel={`${task.topicName}, ${task.subjectName}. ${task.plannedQuestionCount} questions, about ${task.plannedMinutes} minutes.${task.reason ? ` ${task.reason}` : ""}`}
    >
      <View style={styles.taskHeader}>
        <View style={styles.taskHeaderText}>
          <Text style={styles.taskTopic}>{task.topicName}</Text>
          <Text style={styles.taskSubject}>{task.subjectName}</Text>
        </View>
        <View
          style={[
            styles.sourcePill,
            { backgroundColor: task.source === "REVISION" ? colors.semantic.warningBg : colors.brand.glowSoft },
          ]}
        >
          <Text
            style={[
              styles.sourcePillText,
              { color: task.source === "REVISION" ? colors.semantic.warning : colors.brand.primary },
            ]}
          >
            {task.source === "REVISION" ? "Revise" : "New"}
          </Text>
        </View>
      </View>

      {/* Deterministic, stored when the task was chosen — never a model, never re-derived. */}
      {task.reason ? <Text style={styles.taskReason}>{task.reason}</Text> : null}

      <View style={styles.taskMetaRow}>
        <Text style={styles.taskMeta}>{task.plannedQuestionCount} questions</Text>
        <Text style={styles.taskMeta}>~{task.plannedMinutes} min</Text>
        {task.difficultyCode ? <Text style={styles.taskMeta}>{task.difficultyCode}</Text> : null}
      </View>

      {/*
       * Progress, not a verdict. Accuracy is shown beside the count but never styled as
       * pass/fail: doing the work and doing it well are different questions, and the health
       * model owns the second one.
       */}
      {task.answeredToday > 0 ? (
        <Text style={[styles.taskProgress, done ? { color: colors.semantic.success } : null]}>
          {done ? "✓ " : ""}
          {task.answeredToday} answered today
          {task.accuracyToday !== null ? ` · ${task.accuracyToday}% correct` : ""}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** How the band reads back to the student, in the words the onboarding step used. */
const BAND_COPY: Record<string, string> = {
  UNDER_1H: "under an hour",
  ONE_TO_TWO: "1-2 hours",
  TWO_TO_FOUR: "2-4 hours",
  FOUR_TO_SIX: "4-6 hours",
  SIX_PLUS: "6+ hours",
};

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    headerCard: {
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text.primary,
    },
    headerBody: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.text.secondary,
      marginTop: spacing.xs,
    },
    headerStats: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
    },
    stat: {
      alignItems: "center",
      flex: 1,
    },
    statValue: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text.primary,
    },
    statLabel: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: 2,
      textAlign: "center",
    },
    headerNote: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: spacing.md,
      fontStyle: "italic",
    },
    headerAction: {
      fontSize: 12.5,
      fontWeight: "600",
      color: colors.brand.primary,
      marginTop: spacing.xs,
    },
    headerDate: {
      fontSize: 11,
      color: colors.text.muted,
      marginTop: spacing.xs,
    },
    taskCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: spacing.xs + 2,
    },
    taskCardDone: {
      borderColor: colors.semantic.success,
    },
    taskHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    taskHeaderText: {
      flex: 1,
    },
    taskTopic: {
      fontSize: 14.5,
      fontWeight: "700",
      color: colors.text.primary,
    },
    taskSubject: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: 1,
    },
    sourcePill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.sm,
    },
    sourcePillText: {
      fontSize: 10.5,
      fontWeight: "700",
    },
    taskReason: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    taskMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    taskMeta: {
      fontSize: 11.5,
      color: colors.text.muted,
    },
    taskProgress: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    footnote: {
      fontSize: 11.5,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: spacing.sm,
      fontStyle: "italic",
    },
  });
}
