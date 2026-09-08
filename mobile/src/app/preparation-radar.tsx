import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { getRadar } from "../data/weaknessRadarData";
import { getFollowedExam } from "../db/followedExams";
import type { RadarResult, RadarTopic } from "../intelligence/types";
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
import { SECTIONS, stateVisual, sourceNote, RadarStatePill } from "../intelligence/radarPresentation";

/**
 * "Your Preparation Radar" — the supplied Weakness Radar spec's §16.
 *
 * A root-level pushed screen, reached from Progress and from More. **Deliberately not a sixth
 * tab**: the bar is already the five Home/Practice/Mock Test/Exams/More, and Progress itself
 * was moved out of it in an earlier session precisely because primary navigation was getting
 * crowded. §16 asks for this "without disrupting existing navigation", and adding a tab would
 * be exactly that.
 *
 * Reads only through `data/weaknessRadarData.ts`, so it neither knows nor cares whether the
 * radar came from the server, this device's cache, or a local computation — see that module
 * for the three cases. It shows *which*, though, because a cached or device-only answer is a
 * materially different claim from a fresh one.
 *
 * English-only, matching every screen added since the Exam Guide work (`exam-guide.tsx`,
 * `my-exams.tsx`, `exams.tsx`, `syllabus-trends.tsx`). This app's i18n types Telugu as
 * English's shape, so adding keys here would force Telugu copy nobody in this session can
 * vouch for — the same call, and the same stated limitation, as those screens.
 */
export default function PreparationRadarScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ examCode?: string; examName?: string }>();

  /**
   * The exam to score against, falling back to the followed one.
   *
   * The radar needs an exam because priority and question availability are per-exam (health
   * itself is not). Rather than make every entry point pass one, the screen resolves it —
   * so More's row and Progress's card are plain taps, and a student with no exam followed
   * gets a "pick one" state instead of a screen that cannot load.
   *
   * Keyed loaded-state again, for the same reason as the radar below: a synchronous setState
   * at the top of an effect body is what `react-hooks/set-state-in-effect` rejects.
   */
  const [resolvedExam, setResolvedExam] = useState<{ code: string; name: string } | null | undefined>(
    params.examCode ? { code: params.examCode, name: params.examName ?? "" } : undefined,
  );

  useEffect(() => {
    if (params.examCode) return;
    let cancelled = false;
    getFollowedExam()
      .then((followed) => {
        if (!cancelled) setResolvedExam(followed ? { code: followed.code, name: followed.name } : null);
      })
      .catch(() => {
        if (!cancelled) setResolvedExam(null);
      });
    return () => {
      cancelled = true;
    };
  }, [params.examCode]);

  const examCode = resolvedExam?.code;
  const examName = resolvedExam?.name ?? params.examName;
  // Practice history landing locally (a finished quiz) and a restore landing from the server
  // both change the answer, so both have to re-read — the documented stale-screen trap.
  const { syncVersion } = useSyncStatus();
  const { progressVersion } = useAuth();

  /**
   * Keyed to the exam it was loaded for, rather than a plain value plus a loading flag.
   *
   * The pattern `PreparationPlanCard` established in this codebase, and the reason is a real
   * bug it already fixed: switching exams would otherwise flash the previous exam's radar
   * while the new fetch was in flight. It also keeps this effect free of the synchronous
   * `setState` at the top of an effect body that `react-hooks/set-state-in-effect` rejects.
   */
  const [loaded, setLoaded] = useState<{ key: string; result: RadarResult | null; failed: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadKey = `${examCode ?? ""}:${syncVersion}:${progressVersion}`;
  const isStale = loaded === null || loaded.key !== loadKey;

  useEffect(() => {
    if (!examCode) return;
    trackEvent("preparation_radar_opened", { examCode });
  }, [examCode]);

  useEffect(() => {
    if (!examCode) return;
    let cancelled = false;
    const key = loadKey;

    (async () => {
      try {
        const result = await getRadar({ examCode });
        if (!cancelled) setLoaded({ key, result, failed: false });
      } catch {
        // Every recoverable case (offline with a cache, signed out) is already handled inside
        // the facade, so reaching here means there is genuinely nothing to show.
        if (!cancelled) setLoaded({ key, result: null, failed: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [examCode, loadKey]);

  const onRefresh = useCallback(async () => {
    if (!examCode) return;
    setRefreshing(true);
    try {
      const result = await getRadar({ examCode, forceRefresh: true });
      setLoaded({ key: loadKey, result, failed: false });
    } catch {
      // Keep whatever is on screen. A failed manual refresh should not blank a radar the
      // student was already reading.
    } finally {
      setRefreshing(false);
    }
  }, [examCode, loadKey]);

  function openTopic(topic: RadarTopic) {
    trackEvent("radar_topic_opened", { examCode, topicId: topic.topicId, state: topic.state });
    router.push({
      pathname: "/radar-topic",
      params: {
        examCode: examCode ?? "",
        examName: examName ?? "",
        topicId: topic.topicId,
        payload: JSON.stringify(topic),
      },
    });
  }

  const result = isStale ? null : loaded.result;
  const radar = result?.radar ?? null;

  return (
    <>
      <Stack.Screen options={{ title: "Preparation Radar" }} />
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />}
      >
        {resolvedExam === null ? (
          <EmptyState
            icon="star-outline"
            title="Pick an exam first"
            body="Your radar is scored against one exam's syllabus, so follow the exam you're preparing for and it'll appear here."
            action={{ label: "Browse exams", onPress: () => router.push("/exams") }}
          />
        ) : isStale ? (
          <ContextualLoading message="Reading your practice history..." skeleton={<ListSkeleton count={5} />} />
        ) : loaded.failed || radar === null ? (
          <ErrorState
            title="Radar unavailable"
            body="We couldn't work out your preparation state just now, and there's nothing saved on this device yet. Try again once you're online."
            onRetry={onRefresh}
          />
        ) : (
          <>
            <OverviewCard radar={radar} result={result!} styles={styles} colors={colors} />

            {radar.overview.topicsWithEvidence === 0 ? (
              /*
               * §21's first edge case. A student who has not practised gets an invitation, not
               * a list of "weaknesses" they did nothing to earn — every topic here is
               * INSUFFICIENT_DATA, and rendering that as five sections of nothing would read
               * as a broken screen.
               */
              <EmptyState
                icon="radio-outline"
                title="Your radar is waiting"
                body={
                  radar.overview.topicsInSyllabus === 0
                    ? "This exam doesn't have a curated syllabus yet, so there's nothing to track against."
                    : `Practise a few questions and this fills in. There are ${radar.overview.topicsInSyllabus} topics in this exam's syllabus to explore.`
                }
                action={{ label: "Start practising", onPress: () => router.push("/practice") }}
              />
            ) : (
              SECTIONS.map((section) => {
                const topics = radar.topics.filter((t) => t.state === section.state);
                if (topics.length === 0) return null;
                return (
                  <View key={section.state} style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Ionicons
                        name={stateVisual(section.state).icon}
                        size={16}
                        color={stateVisual(section.state).color(colors)}
                      />
                      <Text style={styles.sectionTitle}>{section.title}</Text>
                      <Text style={styles.sectionCount}>{topics.length}</Text>
                    </View>
                    <Text style={styles.sectionBlurb}>{section.blurb}</Text>
                    {topics.map((topic) => (
                      <TopicCard
                        key={topic.topicId}
                        topic={topic}
                        onPress={() => openTopic(topic)}
                        styles={styles}
                        colors={colors}
                      />
                    ))}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function OverviewCard({
  radar,
  result,
  styles,
  colors,
}: {
  radar: NonNullable<RadarResult["radar"]>;
  result: RadarResult;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
}) {
  const o = radar.overview;
  const note = sourceNote(result);

  return (
    <Card variant="container" style={styles.overviewCard}>
      <Text style={styles.overviewStatus}>{OVERVIEW_COPY[o.status].title}</Text>
      <Text style={styles.overviewBody}>{OVERVIEW_COPY[o.status].body}</Text>

      <View style={styles.overviewStats}>
        {/*
         * Counts, not a score. §18 forbids fake precision, and an aggregate "preparation
         * percentage" over topics with wildly different evidence levels would be exactly
         * that — a single number implying a confidence the underlying data does not carry.
         */}
        <Stat label="Need attention" value={o.needsAttentionCount} tint={colors.semantic.error} styles={styles} />
        <Stat label="Revise" value={o.needsRevisionCount} tint={colors.semantic.warning} styles={styles} />
        <Stat label="Improving" value={o.improvingCount} tint={colors.semantic.success} styles={styles} />
        <Stat label="Strong" value={o.strongCount} tint={colors.semantic.success} styles={styles} />
      </View>

      <Text style={styles.overviewCoverage}>
        {o.topicsWithEvidence} of {o.topicsInSyllabus} topics practised
        {o.topicsReliable > 0 ? ` · ${o.topicsReliable} with enough practice to be sure` : ""}
      </Text>
      {note ? <Text style={styles.sourceNote}>{note}</Text> : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  tint,
  styles,
}: {
  label: string;
  value: number;
  tint: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: value > 0 ? tint : undefined }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function TopicCard({
  topic,
  onPress,
  styles,
  colors,
}: {
  topic: RadarTopic;
  onPress: () => void;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
}) {
  return (
    <PressableScale
      onPress={onPress}
      style={styles.topicCard}
      accessibilityRole="button"
      accessibilityLabel={`${topic.topicName}, ${stateVisual(topic.state).label}. ${topic.explanation}`}
    >
      <View style={styles.topicHeader}>
        <View style={styles.topicHeaderText}>
          <Text style={styles.topicName}>{topic.topicName}</Text>
          <Text style={styles.topicSubject}>
            {topic.parentTopicName ? `${topic.subjectName} · ${topic.parentTopicName}` : topic.subjectName}
          </Text>
        </View>
        <RadarStatePill state={topic.state} />
      </View>

      <Text style={styles.topicWhy}>{topic.explanation}</Text>

      <View style={styles.topicMetaRow}>
        {topic.accuracyPercent !== null ? (
          <Text style={styles.topicMeta}>{topic.accuracyPercent}% accuracy</Text>
        ) : null}
        {topic.trend === "IMPROVING" ? (
          <Text style={[styles.topicMeta, { color: colors.semantic.success }]}>↑ improving</Text>
        ) : topic.trend === "DECLINING" ? (
          <Text style={[styles.topicMeta, { color: colors.semantic.warning }]}>↓ slipping</Text>
        ) : null}
        {topic.reasonCodes.includes("HIGH_EXAM_WEIGHT") ? (
          <Text style={styles.topicMeta}>high exam weight</Text>
        ) : null}
      </View>

      <Text style={styles.topicAction}>
        Next: {ACTION_COPY[topic.recommendedAction.primary]}
      </Text>
    </PressableScale>
  );
}

/**
 * §16's overall status, in words rather than a number.
 *
 * Encouraging, never judgemental — §17's tone rule applies to the whole-exam readout too, and
 * this is the first thing a student sees on the screen.
 */
const OVERVIEW_COPY: Record<string, { title: string; body: string }> = {
  NO_DATA: {
    title: "Let's find out where you stand",
    body: "Once you've practised a few topics, this page will show you exactly what to work on next.",
  },
  GETTING_STARTED: {
    title: "Getting started",
    body: "There's early signal here, but not enough yet to be confident about any one topic. Keep practising and this sharpens up quickly.",
  },
  BUILDING: {
    title: "Building up",
    body: "You've got real practice behind you. The topics below are ordered by how much fixing each one is worth for this exam.",
  },
  ON_TRACK: {
    title: "On track",
    body: "Solid across most of the syllabus. Anything in “Needs attention” is where the remaining marks are.",
  },
  STRONG: {
    title: "In good shape",
    body: "You're strong across this exam's syllabus. Keep the strong topics ticking over and hold your pace.",
  },
};

/** The one-line "do this next" label per action. Fuller step lists live on the detail screen. */
export const ACTION_COPY: Record<string, string> = {
  LEARN_CONCEPT: "review the concept",
  PRACTICE_FOUNDATIONAL: "practise the basics",
  PRACTICE_MEDIUM: "practise at exam level",
  PRACTICE_ADVANCED: "try harder questions",
  PRACTICE_PYQ: "solve real exam questions",
  TIMED_PRACTICE: "take a timed set",
  REVISION: "revise this topic",
  MAINTENANCE_PRACTICE: "keep it ticking over",
  GATHER_EVIDENCE: "practise a few questions",
};

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    overviewCard: {
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    overviewStatus: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text.primary,
    },
    overviewBody: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.text.secondary,
      marginTop: spacing.xs,
    },
    overviewStats: {
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
    overviewCoverage: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: spacing.md,
    },
    sourceNote: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: spacing.xs,
      fontStyle: "italic",
    },
    section: {
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: "700",
      color: colors.text.primary,
    },
    sectionCount: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.muted,
    },
    sectionBlurb: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
      marginBottom: spacing.sm,
    },
    topicCard: {
      backgroundColor: colors.surfaceElevated,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginBottom: spacing.sm,
      gap: spacing.xs + 2,
    },
    topicHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    topicHeaderText: {
      flex: 1,
    },
    topicName: {
      fontSize: 14.5,
      fontWeight: "700",
      color: colors.text.primary,
    },
    topicSubject: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: 1,
    },
    topicWhy: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    topicMetaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    topicMeta: {
      fontSize: 11.5,
      color: colors.text.muted,
    },
    topicAction: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.brand.primary,
    },
  });
}
