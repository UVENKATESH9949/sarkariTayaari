import { useCallback, useEffect, useMemo, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import type { RoadmapTopic, StudyRoadmapResponse } from "@sarkaritaiyaari/core/api";
import { getStudyRoadmap, type StudyRoadmapResult } from "../data/studyRoadmapData";
import { useActiveExam } from "../examsModule/activeExamContext";
import { ACTION_COPY } from "../intelligence/radarPresentation";
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
 * "Study Roadmap" — the whole path, in order, with the work it represents.
 *
 * The companion to `daily-plan.tsx`: that one answers "what do I do today", this one answers "what
 * is all of it, and how long will it take". Same facade pattern, same signed-out story, same
 * refusal to add a ranking — `topics[]` is rendered in the order the server sent it, because the
 * order IS the roadmap.
 *
 * <h2>A FlatList, not a ScrollView</h2>
 * SSC CGL has 61 topics in its syllabus and every one of them is a card. This project has already
 * virtualised Revise, Practice Summary and the Mock Test result for exactly this reason; a plain
 * ScrollView here would mount the lot.
 *
 * <h2>Two contract details this screen deliberately surfaces</h2>
 * **Where the minutes come from.** Every estimate declares a tier, and a stated 75-second constant
 * is a different claim from a measured average. The header counts topics by tier instead of hiding
 * it, so a roadmap built mostly from assumptions reads as one.
 *
 * **When the order was changed for balance.** `priorityRank` is where priority alone would have
 * put a topic; when it disagrees with the position on screen, the subject interleave moved it. The
 * contract keeps that visible on purpose, so the card shows both rather than only the final order.
 *
 * English-only, matching `daily-plan.tsx` and every screen added since the Exam Guide work.
 */
export default function StudyRoadmapScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const params = useLocalSearchParams<{ examCode?: string; examName?: string }>();

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

  // The roadmap is ordered by health, which moves with every session practised and every restore.
  const { syncVersion } = useSyncStatus();
  const { progressVersion } = useAuth();

  const [loaded, setLoaded] = useState<{ key: string; result: StudyRoadmapResult } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadKey = `${examCode ?? ""}:${syncVersion}:${progressVersion}`;
  const isStale = loaded === null || loaded.key !== loadKey;

  useEffect(() => {
    if (!examCode) return;
    trackEvent("study_roadmap_opened", { examCode });
  }, [examCode]);

  useEffect(() => {
    if (!examCode) return;
    let cancelled = false;
    const key = loadKey;

    (async () => {
      const result = await getStudyRoadmap(examCode);
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
      setLoaded({ key: loadKey, result: await getStudyRoadmap(examCode) });
    } finally {
      setRefreshing(false);
    }
  }, [examCode, loadKey]);

  const openTopic = useCallback(
    (topic: RoadmapTopic) => {
      trackEvent("study_roadmap_topic_opened", { examCode, topicId: topic.topicId });
      router.push({
        pathname: "/practice/levels",
        params: {
          examCode: examCode ?? "",
          examLabel: examName ?? "",
          subjectName: topic.subjectName,
          topicId: topic.topicId,
          topicName: topic.topicName,
        },
      });
    },
    [examCode, examName, router],
  );

  const result = isStale ? null : loaded.result;
  const roadmap = result?.status === "ready" ? result.roadmap : null;

  if (resolvedExam === null) {
    return (
      <>
        <Stack.Screen options={{ title: "Study Roadmap" }} />
        <View style={styles.centered}>
          <EmptyState
            icon="star-outline"
            title="Pick an exam first"
            body="A roadmap is ordered against one exam's syllabus, so choose the exam you're preparing for and it'll appear here."
            action={{ label: "Browse exams", onPress: () => router.push("/exams") }}
          />
        </View>
      </>
    );
  }

  if (isStale) {
    return (
      <>
        <Stack.Screen options={{ title: "Study Roadmap" }} />
        <View style={styles.centered}>
          <ContextualLoading message="Working out your path..." skeleton={<ListSkeleton count={6} />} />
        </View>
      </>
    );
  }

  if (result!.status === "signed-out") {
    return (
      <>
        <Stack.Screen options={{ title: "Study Roadmap" }} />
        <View style={styles.centered}>
          <EmptyState
            icon="cloud-outline"
            title="Sign in to see your roadmap"
            body="The order is worked out from your practice history across every device, so it lives with your account. Practice itself works fine signed out."
            action={{ label: "Sign in", onPress: () => router.push("/account") }}
          />
        </View>
      </>
    );
  }

  if (result!.status === "unavailable") {
    return (
      <>
        <Stack.Screen options={{ title: "Study Roadmap" }} />
        <View style={styles.centered}>
          <ErrorState title="No roadmap right now" body={result!.message} onRetry={onRefresh} />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Study Roadmap" }} />
      <FlatList
        data={roadmap!.topics}
        keyExtractor={(topic) => topic.topicId}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
        ListHeaderComponent={<RoadmapHeader roadmap={roadmap!} styles={styles} />}
        ListEmptyComponent={
          <EmptyState
            icon="map-outline"
            title="Nothing to plan yet"
            body="This exam's syllabus has no practicable topics yet, so there's no path to lay out. Try another exam, or practise freely."
            action={{ label: "Open Practice", onPress: () => router.push("/practice") }}
          />
        }
        renderItem={({ item, index }) => (
          <TopicCard
            topic={item}
            position={index + 1}
            onPress={() => openTopic(item)}
            styles={styles}
            colors={colors}
          />
        )}
      />
    </>
  );
}

function RoadmapHeader({
  roadmap,
  styles,
}: {
  roadmap: StudyRoadmapResponse;
  styles: ReturnType<typeof buildStyles>;
}) {
  /*
   * Counted per render rather than per card, so the provenance of the minutes is stated ONCE and
   * as a proportion. Showing a tier badge on all 61 cards would be noise; hiding it entirely would
   * present a pile of assumptions as measurement.
   */
  const tiers = useMemo(() => {
    let personal = 0;
    let cohort = 0;
    let assumed = 0;
    for (const topic of roadmap.topics) {
      if (topic.estimate.source === "PERSONAL_TOPIC") personal += 1;
      else if (topic.estimate.source === "DEFAULT") assumed += 1;
      else cohort += 1;
    }
    return { personal, cohort, assumed };
  }, [roadmap.topics]);

  const total = roadmap.totalEstimatedMinutes;

  return (
    <View>
      <Card variant="container" style={styles.headerCard}>
        <Text style={styles.headerTitle}>
          {roadmap.topics.length} {roadmap.topics.length === 1 ? "topic" : "topics"} to work through
        </Text>
        <Text style={styles.headerBody}>
          {total === null ? "We can't estimate this one yet." : `About ${formatDuration(total)} of practice in total.`}
        </Text>

        {/*
         * hasExamDate is false for ten of eleven exams, so the undated case is the normal one and
         * is written as a plain fact rather than an absence.
         */}
        <Text style={styles.headerNote}>
          {roadmap.timeline.hasExamDate && roadmap.timeline.note
            ? roadmap.timeline.note
            : "This exam has no published date yet, so there's no countdown to work back from."}
        </Text>

        <Text style={styles.headerNote}>
          {describeEstimates(tiers)}
        </Text>
      </Card>

      {roadmap.subjects.length > 0 ? (
        <Card variant="container" style={styles.subjectsCard}>
          <Text style={styles.subjectsTitle}>Where the work is</Text>
          {roadmap.subjects.map((subject) => (
            <View key={subject.subjectId} style={styles.subjectRow}>
              <Text style={styles.subjectName} numberOfLines={1}>
                {subject.subjectName}
              </Text>
              <Text style={styles.subjectMeta}>
                {subject.topicCount} {subject.topicCount === 1 ? "topic" : "topics"}
                {subject.estimatedMinutes !== null ? ` · ${formatDuration(subject.estimatedMinutes)}` : ""}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Text style={styles.listLabel}>IN THIS ORDER</Text>
    </View>
  );
}

function TopicCard({
  topic,
  position,
  onPress,
  styles,
  colors,
}: {
  topic: RoadmapTopic;
  position: number;
  onPress: () => void;
  styles: ReturnType<typeof buildStyles>;
  colors: Theme["colors"];
}) {
  // Only when the interleave actually moved this topic. Equal values would be noise on every card.
  const movedForBalance = topic.priorityRank !== position;

  return (
    <PressableScale
      onPress={onPress}
      style={styles.topicCard}
      accessibilityRole="button"
      accessibilityLabel={`${position}. ${topic.topicName}, ${topic.subjectName}.${topic.recommended ? " Next up." : ""} ${ACTION_COPY[topic.recommendedAction] ?? topic.recommendedAction}.`}
    >
      <View style={styles.topicHeader}>
        <Text style={styles.position}>{position}</Text>
        <View style={styles.topicHeaderText}>
          <Text style={styles.topicName}>{topic.topicName}</Text>
          <Text style={styles.topicSubject}>
            {topic.subjectName}
            {movedForBalance ? ` · priority rank ${topic.priorityRank}` : ""}
          </Text>
        </View>
        {topic.recommended ? (
          <View style={[styles.pill, { backgroundColor: colors.brand.glowSoft }]}>
            <Text style={[styles.pillText, { color: colors.brand.primary }]}>Next up</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.topicAction}>{ACTION_COPY[topic.recommendedAction] ?? topic.recommendedAction}</Text>

      <View style={styles.topicMetaRow}>
        <Text style={styles.topicMeta}>{topic.questionCount} questions</Text>
        {topic.estimatedMinutes !== null ? (
          <Text style={styles.topicMeta}>~{formatDuration(topic.estimatedMinutes)}</Text>
        ) : null}
      </View>

      {/*
       * Sequencing is advice, not a lock — the contract lists a blocked topic anyway — so this
       * reads as a suggestion rather than a barrier, matching the "Best after:" idiom Practice's
       * topic list already uses.
       */}
      {!topic.prerequisitesMet && topic.blockedBy.length > 0 ? (
        <Text style={[styles.topicBlocked, { color: colors.semantic.warning }]}>
          Best after: {topic.blockedBy.join(", ")}
        </Text>
      ) : null}
    </PressableScale>
  );
}

/** Minutes as something a person would say out loud. */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 10 || rest === 0) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `${hours}h ${rest}m`;
}

/**
 * One honest sentence about where the minutes came from.
 *
 * The tiers are not equally trustworthy and the contract says so; collapsing them into a bare
 * total would be the exact "assumption wearing a measurement's shape" this program keeps refusing.
 */
function describeEstimates(tiers: { personal: number; cohort: number; assumed: number }): string {
  const parts: string[] = [];
  if (tiers.personal > 0) parts.push(`${tiers.personal} from your own pace`);
  if (tiers.cohort > 0) parts.push(`${tiers.cohort} from other students`);
  if (tiers.assumed > 0) parts.push(`${tiers.assumed} assumed`);
  if (parts.length === 0) return "Times are estimates.";
  return `Times are estimates — ${parts.join(", ")}.`;
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    centered: {
      flex: 1,
      padding: spacing.lg,
    },
    headerCard: {
      padding: spacing.md,
      marginBottom: spacing.md,
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
    headerNote: {
      fontSize: 11.5,
      lineHeight: 17,
      color: colors.text.muted,
      marginTop: spacing.sm,
      fontStyle: "italic",
    },
    subjectsCard: {
      padding: spacing.md,
      marginBottom: spacing.lg,
    },
    subjectsTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: spacing.sm,
    },
    subjectRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      paddingVertical: 4,
    },
    subjectName: {
      flex: 1,
      fontSize: 13,
      color: colors.text.secondary,
    },
    subjectMeta: {
      fontSize: 11.5,
      color: colors.text.muted,
    },
    listLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: colors.text.muted,
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
    position: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.muted,
      minWidth: 22,
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
    pill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.sm,
    },
    pillText: {
      fontSize: 10.5,
      fontWeight: "700",
    },
    topicAction: {
      fontSize: 12.5,
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
    topicBlocked: {
      fontSize: 11.5,
    },
  });
}
