import { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { getSubjectStats, type SubjectStat } from "../../../data/practiceData";
import { getVideoCatalog, type VideoCatalog } from "../../../data/lessonVideoCatalog";
import { useHybridMode } from "../../../data/hybridSource";
import { useActiveExam } from "../../../examsModule/activeExamContext";
import { useSyncStatus } from "../../../sync/SyncContext";
import { Card, CardRow } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ErrorState } from "../../../ui/ErrorState";
import { ListSkeleton } from "../../../ui/Skeleton";
import { SectionLabel } from "../../../ui/SectionLabel";
import { spacing } from "../../../ui/theme";
import { useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { trackEvent } from "../../../telemetry/analytics";

/**
 * AI Videos, subject list — the first step of Exam -> Subject -> Topic -> Video.
 *
 * <p>The subjects are the real ones: the same `getSubjectStats` Practice reads, scoped to the same
 * active exam. Nothing here maintains its own list of what a syllabus contains, which is the one
 * thing that would let AI Videos and Practice disagree about the same exam.
 *
 * <p>Every subject is shown, whether or not it has any videos yet. A subject with none says so.
 * Hiding it would make the library look like the syllabus, and a student would have no way to tell
 * "no video yet" from "not part of my exam".
 */
export default function AiVideosScreen() {
  const router = useRouter();
  const styles = useThemedStyles(buildStyles);
  const mode = useHybridMode();
  // Reference data arrives by sync, so a screen that reads it must re-read when a sync lands or
  // it shows an empty syllabus forever on a first run.
  const { syncVersion } = useSyncStatus();
  const { activeExam, loading: examLoading } = useActiveExam();

  const examCode = activeExam?.code ?? null;

  /*
   * Subjects are held together with the inputs they were loaded for, and "still loading" is
   * DERIVED by comparing that key against the current inputs rather than set by an effect. Two
   * reasons, and this codebase already learned both: a synchronous setState inside an effect is a
   * real lint rule here, and this shape also makes it impossible to render one exam's subjects
   * under another exam's name while a switch is still in flight.
   */
  const loadKey = `${examCode ?? "-"}:${mode}:${syncVersion}`;
  const [loaded, setLoaded] = useState<{ key: string; subjects: SubjectStat[] } | null>(null);
  const [catalog, setCatalog] = useState<VideoCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const subjects = loaded?.key === loadKey ? loaded.subjects : null;

  const load = useCallback(
    async (key: string) => {
      // Awaits before touching state, so nothing is set synchronously when the effect calls this.
      const loadedSubjects = await getSubjectStats(examCode, mode);
      setLoaded({ key, subjects: loadedSubjects });
      setError(null);

      // The catalog can fail without the screen failing: the syllabus is local and still worth
      // showing. A student then sees every topic with its empty state rather than an error page,
      // which is a smaller lie than claiming the whole section is unavailable.
      const result = await getVideoCatalog(examCode, (fresh) => setCatalog(fresh));
      if (result.status === "ready") {
        setCatalog(result.catalog);
      } else if (result.status === "unavailable") {
        setError(result.message);
      }
    },
    [examCode, mode],
  );

  useEffect(() => {
    // An inline async IIFE, not `load(...).catch(...)`. The lint rule flags a memoized
    // callback invoked with a chained .catch() at the call site, even when the callee
    // touches no state before its first await - a shape this codebase has hit before.
    void (async () => {
      try {
        await load(loadKey);
      } catch {
        setError("Something went wrong loading your subjects.");
      }
    })();
  }, [load, loadKey]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(loadKey);
    } finally {
      setRefreshing(false);
    }
  }, [load, loadKey]);

  function videoCountFor(subjectId: string): number {
    if (!catalog) return 0;
    return Object.values(catalog.byTopicId).filter((v) => v.subjectId === subjectId).length;
  }

  if (examLoading || subjects === null) {
    return (
      <View style={styles.container}>
        <ListSkeleton count={5} />
      </View>
    );
  }

  if (!examCode) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="videocam-outline"
          title="Choose an exam first"
          body="Video lessons follow your exam's syllabus, so pick the exam you're preparing for."
          action={{ label: "Browse exams", onPress: () => router.push("/exams") }}
        />
      </View>
    );
  }

  if (subjects.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="No subjects yet"
          body="We don't have this exam's syllabus on your device yet. Sync, then try again."
          onRetry={onRefresh}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.intro}>
        Short video lessons for {activeExam?.name ?? "your exam"}, one topic at a time. We&apos;re
        adding more every week.
      </Text>

      {error && <Text style={styles.notice}>{error}</Text>}

      {catalog?.savedAt != null && (
        <Text style={styles.notice}>
          Saved list, last updated{" "}
          {new Date(catalog.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
        </Text>
      )}

      <SectionLabel label="Subjects" />
      <Card variant="container">
        {subjects.map((subject) => {
          const count = videoCountFor(subject.id);
          return (
            <CardRow
              key={subject.id}
              icon="videocam-outline"
              label={subject.name}
              value={count === 0 ? "No videos yet" : `${count} video${count === 1 ? "" : "s"}`}
              onPress={() => {
                trackEvent("ai_videos_subject_opened", { subjectId: subject.id });
                router.push({
                  pathname: "/ai-videos/subject",
                  params: { subjectId: subject.id, subjectName: subject.name },
                });
              }}
            />
          );
        })}
      </Card>

      <View style={styles.footerSpace} />
    </ScrollView>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg },
    intro: { color: colors.text.secondary, fontSize: 14, marginBottom: spacing.md },
    notice: { color: colors.text.muted, fontSize: 12, marginBottom: spacing.sm },
    footerSpace: { height: spacing.xl },
  });
