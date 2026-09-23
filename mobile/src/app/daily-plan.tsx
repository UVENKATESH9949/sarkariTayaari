import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, Polygon } from "react-native-svg";
import type { DailyPlanResponse, DailyPlanTask, DailyPlanTaskSource } from "@sarkaritaiyaari/core/api";
import type { IoniconName } from "../constants/subjects";
import { getDailyPlan, type DailyPlanResult } from "../data/dailyPlanData";
import {
  FALLBACK_SOURCE,
  SOURCE_META,
  SOURCE_ORDER,
  sourceAccent,
  sourceMeta,
  taskAccent,
  taskIcon,
} from "./dailyPlanVisuals";
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
 * "Today's Plan" — the student-facing surface of the personalization program.
 *
 * A root-level pushed screen reached from Home and from More — **deliberately not a sixth tab**,
 * the same call `preparation-radar.tsx` made and for the same reason: the bar is already the
 * five Home/Practice/Mock Test/Exams/More, and Progress was moved out of it precisely because
 * primary navigation was getting crowded.
 *
 * <h2>Five purposes, all of them the server's</h2>
 *
 * Every section on this screen is one value of the payload's `source` — New Topics, Revision, Weak
 * Topics, Practice and Mistake Review. The screen groups and labels them and does nothing else: no
 * client-side reordering, no "you're behind" framing, no second opinion about what matters. A third
 * ranking is exactly the drift the program's earlier phases exist to prevent, and an earlier version
 * of this screen came close to one by computing its own weak-topic and mistake previews on the
 * device — those are now the server's own task categories instead.
 *
 * Where the payload is an assumption rather than a measurement (the minutes budget above all) the
 * screen says so, rather than presenting a guess as a fact.
 *
 * <h2>Colour</h2>
 *
 * One colour per purpose, from `dailyPlanVisuals.ts`, so the jump pill at the top matches the
 * section it scrolls to and a rose card always means the same thing.
 *
 * English-only, matching every screen added since the Exam Guide work — this app's i18n types
 * Telugu as English's shape, so adding keys here would force Telugu copy nobody in this session
 * can vouch for.
 */
/**
 * When a snapshot was taken, in the shortest form that is still unambiguous: a time for today,
 * a date once it is older. "Last updated 08:04" on a plan from three days ago would be worse
 * than useless.
 */
function formatSnapshotTime(at: number): string {
  const when = new Date(at);
  const sameDay = new Date().toDateString() === when.toDateString();
  return sameDay
    ? when.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function DailyPlanScreen() {
  const { colors, mode } = useTheme();
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
      const result = await getDailyPlan(examCode, (fresh) => {
        /*
         * The background half of stale-while-revalidate.
         *
         * A FAILED refresh is deliberately ignored. If the device is offline, replacing a
         * perfectly usable cached plan with an error screen would make the cache actively
         * harmful — the student had something to work from and now has nothing. The stale plan
         * stays, labelled, and the next refresh gets another go.
         */
        if (cancelled || fresh.status === "unavailable") return;
        setLoaded({ key, result: fresh });
      });
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
      const next = await getDailyPlan(examCode);
      // Same rule as the background refresh: a pull that fails while offline should leave the
      // plan the student was reading on screen, not swap it for an error.
      setLoaded((current) =>
        next.status === "unavailable" && current?.result && "plan" in current.result
          ? current
          : { key: loadKey, result: next },
      );
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
     *
     * A mistake-review task is the one exception: the questions it means are the ones the student
     * already answered wrongly, and Revise's Wrong Answers tab already shows each with the answer
     * chosen, the correct one and the explanation. Sending it to fresh practice instead would
     * quietly turn "review these" into "do more".
     */
    if (task.source === "MISTAKE_REVIEW") {
      router.push({ pathname: "/revise", params: { initialTab: "wrong" } });
      return;
    }

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
  const plan = result && "plan" in result ? result.plan : null;

  /*
   * Grouped once per render, so the jump pills' counts and the sections below can never disagree
   * about what is in the plan. A source this build does not recognise (a server older than V52
   * still sending `PRACTICE`, or a purpose added later) is folded into new ground rather than
   * dropped — an unknown task must still be visible and still tappable.
   */
  const bySource = useMemo(() => {
    const grouped = new Map<DailyPlanTaskSource, DailyPlanTask[]>();
    for (const task of plan?.tasks ?? []) {
      const key = (SOURCE_META[task.source as DailyPlanTaskSource] ? task.source : FALLBACK_SOURCE) as DailyPlanTaskSource;
      const bucket = grouped.get(key);
      if (bucket) bucket.push(task);
      else grouped.set(key, [task]);
    }
    return grouped;
  }, [plan]);

  // Mixed practice draws from today's own plan rather than a fresh ranking of its own — it is a
  // different way to WORK today's plan, not a sixth purpose within it. Deduped, since a topic can
  // carry both a revision and a practice task on the same day.
  const mixedTopics = useMemo(() => {
    if (!plan) return [];
    const seen = new Map<string, string>();
    for (const task of plan.tasks) {
      if (!seen.has(task.topicId)) seen.set(task.topicId, task.topicName);
    }
    return Array.from(seen.entries()).map(([topicId, topicName]) => ({ topicId, topicName }));
  }, [plan]);

  // Imperative, not state: these are read only from an event handler (a pill tap), so there is
  // nothing for a re-render to reflect. A ref avoids re-rendering the whole screen on every
  // section's layout pass.
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Partial<Record<DailyPlanTaskSource, number>>>({});
  const captureOffset = useCallback(
    (key: DailyPlanTaskSource) => (event: LayoutChangeEvent) => {
      sectionOffsets.current[key] = event.nativeEvent.layout.y;
    },
    [],
  );
  const jumpToSection = useCallback((key: DailyPlanTaskSource) => {
    const y = sectionOffsets.current[key];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({ y: Math.max(y - spacing.md, 0), animated: true });
  }, []);

  function startMixedPractice() {
    if (mixedTopics.length < 2) return;
    trackEvent("daily_plan_mixed_practice_started", { examCode, topicCount: mixedTopics.length });
    router.push({
      pathname: "/practice/quiz",
      params: {
        examCode: examCode ?? "",
        examLabel: examName ?? "",
        subjectName: "Mixed",
        topicName: "Mixed Practice",
        topicIds: JSON.stringify(mixedTopics.map((t) => t.topicId)),
        topicNames: JSON.stringify(mixedTopics.map((t) => t.topicName)),
        levelKey: "mixed",
        levelLabel: "Mixed",
      },
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: "Today's Plan" }} />
      <ScrollView
        ref={scrollRef}
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
        ) : plan!.tasks.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="Nothing to schedule yet"
            body="There's no practicable topic for this exam today — usually that means its syllabus has no questions yet. Try another exam, or practise freely."
            action={{ label: "Open Practice", onPress: () => router.push("/practice") }}
          />
        ) : (
          <>
            {/*
              Shown only for a stored plan. A student looking at yesterday's snapshot, or at
              today's while offline, should be told — the alternative is figures that quietly
              lag with no explanation. `answeredToday` HAS been re-derived from this device's
              own history (see dailyPlanData.ts), so the counts are current even here; what may
              be stale is the plan itself.
            */}
            {result!.status === "cached" && (
              <View style={styles.cachedNote}>
                <Ionicons name="cloud-offline-outline" size={16} color={colors.text.secondary} />
                <Text style={styles.cachedNoteText}>
                  {`Saved plan, last updated ${formatSnapshotTime(result!.fetchedAt)}. Your progress below is counted on this device.`}
                </Text>
              </View>
            )}

            <HeroCard
              plan={plan!}
              styles={styles}
              colors={colors}
              mode={mode}
              onSetStudyTime={() => router.push("/study-preferences")}
            />

            <SectionSwitch
              counts={bySource}
              onPress={jumpToSection}
              styles={styles}
              colors={colors}
              mode={mode}
            />

            {SOURCE_ORDER.map((source) => {
              const tasks = bySource.get(source) ?? [];
              if (tasks.length === 0) return null;
              const meta = SOURCE_META[source];
              return (
                <View key={source} onLayout={captureOffset(source)}>
                  <SectionHeading
                    title={meta.title}
                    subtitle={meta.subtitle}
                    count={tasks.length}
                    icon={meta.icon}
                    styles={styles}
                    colors={colors}
                  />
                  {tasks.map((task) => (
                    <TaskCard
                      key={task.taskId}
                      task={task}
                      onPress={() => openTask(task)}
                      styles={styles}
                      colors={colors}
                      mode={mode}
                    />
                  ))}
                  {source === "REVISION" ? <TipCard styles={styles} colors={colors} /> : null}
                </View>
              );
            })}

            {/*
             * Not a sixth purpose: the server does not assign this. It is one way to work the day
             * the server DID assign — the same topics, shuffled into one set.
             */}
            {mixedTopics.length >= 2 ? (
              <View>
                <SectionHeading
                  title="Mixed Topics"
                  subtitle="Practise today's topics together in one set"
                  count={mixedTopics.length}
                  icon="shuffle-outline"
                  styles={styles}
                  colors={colors}
                />
                <Card variant="elevated">
                  <Text style={styles.mixedBody}>
                    A short, shuffled set pulled from today&apos;s {mixedTopics.length} topics —{" "}
                    {mixedTopics.map((t) => t.topicName).join(", ")}.
                  </Text>
                  <PressableScale
                    onPress={startMixedPractice}
                    style={[styles.mixedAction, { backgroundColor: taskAccent(1, mode).pillBg }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="shuffle-outline" size={13} color={taskAccent(1, mode).pillFg} />
                    <Text style={[styles.actionPillText, { color: taskAccent(1, mode).pillFg }]}>
                      Start mixed practice
                    </Text>
                  </PressableScale>
                </Card>
              </View>
            ) : null}

            <Text style={styles.footnote}>
              Done is worked out from what you actually practise — there&apos;s nothing to tick off.
            </Text>
            {/*
             * Today is a slice of the roadmap, so the way out of "is this all there is?" belongs
             * at the bottom of the day rather than competing with it at the top.
             */}
            <Text
              style={styles.footerAction}
              onPress={() => router.push("/study-roadmap")}
              accessibilityRole="button"
            >
              See the whole path →
            </Text>
          </>
        )}
      </ScrollView>
    </>
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

/* ============================================================================= hero card */

function HeroCard({
  plan,
  styles,
  colors,
  mode,
  onSetStudyTime,
}: {
  plan: DailyPlanResponse;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
  mode: Theme["mode"];
  onSetStudyTime: () => void;
}) {
  const done = plan.tasks.filter((t) => t.status === "COMPLETED").length;
  const isLight = mode === "light";

  // A gradient hero card is a filled dark-accent surface everywhere else in the app (see
  // Card.tsx's DEFAULT_GRADIENT), which is why the dark-theme version of this card reuses that
  // exact navy rather than inventing a second one. Light mode gets its own pale-blue gradient —
  // that ground is what the text/icon colours below are chosen against.
  const gradient: readonly [string, string] = isLight ? ["#EAF2FF", "#DCEAFC"] : ["#1A2B57", "#0F1A38"];
  const heroText = isLight ? colors.text.primary : colors.text.onAccent;
  const heroTextSecondary = isLight ? colors.text.secondary : colors.text.onAccentSecondary;
  const heroTextMuted = isLight ? colors.text.muted : colors.text.onAccentMuted;
  const innerCardBg = isLight ? colors.surface : colors.surfaceElevated2;
  const markerBg = isLight ? colors.brand.glowSoft : "rgba(255, 255, 255, 0.14)";
  const markerFg = isLight ? colors.brand.primary : colors.text.onAccent;

  return (
    <Card variant="gradient" gradientColors={gradient} style={styles.heroCard}>
      <View style={styles.heroTopRow}>
        <View style={[styles.heroMarker, { backgroundColor: markerBg }]}>
          <Ionicons name="locate-outline" size={22} color={markerFg} />
        </View>
        <View style={styles.heroTitleBlock}>
          <Text style={[styles.heroTitle, { color: heroText }]}>
            {plan.tasks.length} {plan.tasks.length === 1 ? "thing" : "things"} to do today
          </Text>
          <Text style={[styles.heroSubtitle, { color: heroTextSecondary }]}>
            About {plan.plannedMinutes} minutes of work{done > 0 ? ` · ${done} already done` : ""}
          </Text>
        </View>
        <MountainDoodle color={isLight ? "#B9D3FA" : "rgba(255,255,255,0.18)"} accent={isLight ? "#5B8DEF" : "#93B4F5"} />
      </View>

      <Text style={[styles.heroNote, { color: heroTextSecondary }]}>Small steps today, big goals tomorrow</Text>

      <View style={[styles.heroStatsCard, { backgroundColor: innerCardBg }]}>
        <HeroStat
          icon="time-outline"
          value={`${plan.budget.minutes}m`}
          label="Your time"
          iconColor={colors.semantic.success}
          iconBg={colors.semantic.successBg}
          styles={styles}
        />
        <HeroStat
          icon="calendar-outline"
          value={`${plan.plannedMinutes}m`}
          label="Planned"
          iconColor={colors.brand.primary}
          iconBg={colors.brand.glowSoft}
          styles={styles}
        />
        <HeroStat
          icon="checkmark-done-outline"
          value={String(plan.tasks.length)}
          label="Tasks"
          iconColor={taskAccent(2, mode).iconFg}
          iconBg={taskAccent(2, mode).iconBg}
          styles={styles}
        />
      </View>

      <View style={styles.heroFootRow}>
        <Ionicons name="calendar-outline" size={14} color={heroTextMuted} style={styles.heroFootIcon} />
        <View style={styles.heroFootText}>
          {/*
           * The budget is an inference, and this line is what keeps that honest. A student
           * who chose "1-2 hours" should be able to see where "90 minutes" came from, and
           * one who never told us should not be shown 60 minutes as though they had.
           */}
          <Text style={[styles.heroFootLine, { color: heroTextMuted }]}>
            {plan.budget.basis === "STATED_BAND"
              ? `Based on the ${BAND_COPY[plan.budget.dailyStudyTime ?? ""] ?? "study time"} a day you told us you study.`
              : "We don't know how long you study, so we've assumed an hour. This gets more useful once we do."}
          </Text>
          <Text style={[styles.heroFootLine, { color: heroTextMuted }]}>
            Planned for {plan.planDate} · {plan.zone}
          </Text>
          {/*
           * Naming an assumption is only half the job if the student cannot correct it.
           * Offered exactly when the budget is a guess.
           */}
          {plan.budget.basis === "DEFAULT" ? (
            <Text style={styles.heroFootAction} onPress={onSetStudyTime} accessibilityRole="button">
              Tell us how long you study →
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function HeroStat({
  icon,
  value,
  label,
  iconColor,
  iconBg,
  styles,
}: {
  icon: IoniconName;
  value: string;
  label: string;
  iconColor: string;
  iconBg: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** A small, deliberately simple mountains-and-flag doodle — decoration only, no data in it. */
function MountainDoodle({ color, accent }: { color: string; accent: string }) {
  return (
    <Svg width={64} height={48} viewBox="0 0 64 48">
      <Polygon points="2,44 20,14 34,34 44,20 62,44" fill={color} />
      <Path d="M44 20 L44 6" stroke={accent} strokeWidth={2} strokeLinecap="round" />
      <Polygon points="44,6 56,10 44,14" fill={accent} />
    </Svg>
  );
}

/* ============================================================================= section switch */

/**
 * One horizontally-scrollable row, not a wrapping grid — five purposes do not fit a 390px phone on
 * one un-scrolled line. Each pill is a light, tinted chip in its purpose's own colour (never a solid
 * dark fill) and jumps to that section; a purpose with nothing in it today still shows, dimmed,
 * rather than the row silently losing an item.
 */
function SectionSwitch({
  counts,
  onPress,
  styles,
  colors,
  mode,
}: {
  counts: Map<DailyPlanTaskSource, DailyPlanTask[]>;
  onPress: (source: DailyPlanTaskSource) => void;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
  mode: Theme["mode"];
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.switchRow}
      style={styles.switchScroll}
    >
      {SOURCE_ORDER.map((source) => {
        const meta = SOURCE_META[source];
        const accent = sourceAccent(source, mode);
        const count = counts.get(source)?.length ?? 0;
        const disabled = count === 0;
        return (
          <PressableScale
            key={source}
            onPress={() => onPress(source)}
            disabled={disabled}
            style={[styles.switchPill, { backgroundColor: accent.pillBg }, disabled && styles.switchPillDisabled]}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${meta.title}, ${count} ${count === 1 ? "task" : "tasks"}`}
          >
            <Ionicons name={meta.icon} size={15} color={accent.pillFg} />
            <Text style={[styles.switchLabel, { color: accent.pillFg }]}>{meta.shortLabel}</Text>
            <View style={[styles.switchCountBadge, { backgroundColor: accent.pillFg }]}>
              <Text style={[styles.switchCountText, { color: colors.text.onAccent }]}>{count}</Text>
            </View>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

/* ============================================================================= section heading */

function SectionHeading({
  title,
  subtitle,
  count,
  icon,
  styles,
  colors,
}: {
  title: string;
  subtitle: string;
  count: number;
  icon: IoniconName;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
}) {
  return (
    <View style={styles.sectionHeadingRow}>
      <View style={styles.sectionHeadingText}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <View style={[styles.sectionCountPill, { backgroundColor: colors.brand.glowSoft }]}>
        <Ionicons name={icon} size={13} color={colors.brand.primary} />
        <Text style={[styles.sectionCountText, { color: colors.brand.primary }]}>
          {count} {count === 1 ? "task" : "tasks"}
        </Text>
      </View>
    </View>
  );
}

/* ============================================================================= task card */

function TaskCard({
  task,
  onPress,
  styles,
  colors,
  mode,
}: {
  task: DailyPlanTask;
  onPress: () => void;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
  mode: Theme["mode"];
}) {
  const done = task.status === "COMPLETED";
  const meta = sourceMeta(task.source);
  const accent = sourceAccent(task.source, mode);
  const icon = taskIcon(task.topicName, task.source);
  const borderColor = done ? colors.semantic.success : accent.iconFg;
  const actionIcon = done ? "checkmark" : meta.actionIcon;
  const actionLabel = done ? "Done" : meta.actionLabel;

  return (
    <PressableScale
      onPress={onPress}
      style={[styles.taskCard, { borderLeftColor: borderColor }]}
      accessibilityRole="button"
      accessibilityLabel={`${meta.title}: ${task.topicName}, ${task.subjectName}. ${task.plannedQuestionCount} questions, about ${task.plannedMinutes} minutes.${task.reason ? ` ${task.reason}` : ""}`}
    >
      <View style={styles.taskTopRow}>
        <View style={[styles.taskIconCircle, { backgroundColor: accent.iconBg }]}>
          <Ionicons name={icon} size={20} color={accent.iconFg} />
        </View>

        <View style={styles.taskHeaderText}>
          <Text style={styles.taskTopic}>{task.topicName}</Text>
          <View style={[styles.subjectPill, { backgroundColor: accent.pillBg }]}>
            <Text style={[styles.subjectPillText, { color: accent.pillFg }]} numberOfLines={1}>
              {task.subjectName}
            </Text>
          </View>
        </View>

        <View style={styles.taskActionCol}>
          <View style={[styles.actionPill, { backgroundColor: accent.pillBg }]}>
            <Ionicons name={actionIcon} size={13} color={accent.pillFg} />
            <Text style={[styles.actionPillText, { color: accent.pillFg }]}>{actionLabel}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.text.muted} style={styles.taskChevron} />
        </View>
      </View>

      {/* Deterministic, stored when the task was chosen — never a model, never re-derived. */}
      {task.reason ? <Text style={styles.taskReason}>{task.reason}</Text> : null}

      <View style={styles.taskMetaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="help-circle-outline" size={13} color={colors.text.muted} />
          <Text style={styles.taskMeta}>
            {task.plannedQuestionCount}{" "}
            {task.source === "MISTAKE_REVIEW"
              ? task.plannedQuestionCount === 1
                ? "mistake"
                : "mistakes"
              : "questions"}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={13} color={colors.text.muted} />
          <Text style={styles.taskMeta}>~{task.plannedMinutes} min</Text>
        </View>
        {task.difficultyCode ? (
          <View style={styles.metaItem}>
            <Text style={styles.taskMeta}>{task.difficultyCode}</Text>
          </View>
        ) : null}
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

/* ============================================================================= tip card */

function TipCard({ styles, colors }: { styles: ReturnType<typeof buildStyles>; colors: Theme["colors"] }) {
  return (
    <View style={styles.tipCard}>
      <View style={styles.tipIconCircle}>
        <Ionicons name="leaf-outline" size={18} color={colors.semantic.success} />
      </View>
      <View style={styles.tipTextBlock}>
        <Text style={styles.tipTitle}>Keep going!</Text>
        <Text style={styles.tipBody}>Revising helps you remember better and improve your accuracy.</Text>
      </View>
    </View>
  );
}

/* ================================================================================== styles */

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },

    /* the "this is a stored plan" note */
    cachedNote: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 1,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    cachedNoteText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: colors.text.secondary,
    },

    /* hero */
    heroCard: {
      marginBottom: spacing.lg,
    },
    heroTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    heroMarker: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: "center",
      justifyContent: "center",
    },
    heroTitleBlock: {
      flex: 1,
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: "800",
    },
    heroSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      marginTop: 3,
    },
    heroNote: {
      fontSize: 12,
      fontStyle: "italic",
      marginTop: spacing.sm,
      marginLeft: 2,
      transform: [{ rotate: "-1.5deg" }],
    },
    heroStatsCard: {
      flexDirection: "row",
      borderRadius: radius.lg,
      marginTop: spacing.md,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
    },
    stat: {
      flex: 1,
      alignItems: "center",
    },
    statIconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
    },
    statValue: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    statLabel: {
      fontSize: 10.5,
      color: colors.text.muted,
      marginTop: 1,
      textAlign: "center",
    },
    heroFootRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    heroFootIcon: {
      marginTop: 2,
    },
    heroFootText: {
      flex: 1,
    },
    heroFootLine: {
      fontSize: 11.5,
      lineHeight: 16,
    },
    heroFootAction: {
      fontSize: 12.5,
      fontWeight: "700",
      color: colors.brand.primary,
      marginTop: spacing.xs,
    },

    /* the five-purpose switch row */
    switchScroll: {
      marginBottom: spacing.lg,
    },
    switchRow: {
      flexDirection: "row",
      gap: spacing.sm,
      paddingRight: spacing.md,
    },
    switchPill: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xs + 2,
      paddingVertical: spacing.sm + 3,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
    },
    switchPillDisabled: {
      opacity: 0.45,
    },
    switchLabel: {
      fontSize: 14.5,
      fontWeight: "700",
    },
    switchCountBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
    },
    switchCountText: {
      fontSize: 12,
      fontWeight: "800",
    },

    /* section heading */
    sectionHeadingRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: spacing.sm + 2,
    },
    sectionHeadingText: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.text.primary,
    },
    sectionSubtitle: {
      fontSize: 12.5,
      color: colors.text.muted,
      marginTop: 1,
    },
    sectionCountPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      marginTop: 2,
    },
    sectionCountText: {
      fontSize: 11.5,
      fontWeight: "700",
    },

    /* task card */
    taskCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      padding: spacing.md,
      marginBottom: spacing.sm + 2,
      gap: spacing.xs + 3,
      ...cardShadow(colors),
    },
    taskTopRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm + 2,
    },
    taskIconCircle: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    taskHeaderText: {
      flex: 1,
      gap: 4,
    },
    taskTopic: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    subjectPill: {
      alignSelf: "flex-start",
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.sm,
    },
    subjectPillText: {
      fontSize: 10.5,
      fontWeight: "700",
    },
    taskActionCol: {
      alignItems: "flex-end",
      gap: 4,
    },
    actionPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: spacing.sm + 1,
      paddingVertical: 5,
      borderRadius: radius.pill,
    },
    actionPillText: {
      fontSize: 11.5,
      fontWeight: "700",
    },
    taskChevron: {
      marginRight: 2,
    },
    taskReason: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    taskMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.md,
    },
    metaItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
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

    /* mixed topics */
    mixedBody: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.text.secondary,
    },
    mixedAction: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 4,
      paddingHorizontal: spacing.sm + 1,
      paddingVertical: 5,
      borderRadius: radius.pill,
      marginTop: spacing.sm,
    },

    /* tip card */
    tipCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
      backgroundColor: colors.brand.glowSoft,
      borderWidth: 1,
      borderColor: colors.borderAccent,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    tipIconCircle: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.semantic.successBg,
    },
    tipTextBlock: {
      flex: 1,
    },
    tipTitle: {
      fontSize: 13.5,
      fontWeight: "700",
      color: colors.text.primary,
    },
    tipBody: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.text.secondary,
      marginTop: 1,
    },

    footerAction: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.primary,
      textAlign: "center",
      marginTop: spacing.md,
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

/** Same shadow recipe `Card`'s `elevated` variant uses, inlined since this card has its own
 * left-border override that a shared variant style can't express. */
function cardShadow(colors: Theme["colors"]) {
  return {
    shadowColor: colors.text.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  } as const;
}
