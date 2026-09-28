import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TopicVideoCatalogEntry } from "@sarkaritaiyaari/core/api";
import { getTopicStats, type TopicStat } from "../../../data/practiceData";
import { getVideoCatalog, type VideoCatalog } from "../../../data/lessonVideoCatalog";
import { useHybridMode } from "../../../data/hybridSource";
import { useActiveExam } from "../../../examsModule/activeExamContext";
import { useSyncStatus } from "../../../sync/SyncContext";
import { Card } from "../../../ui/Card";
import { ErrorState } from "../../../ui/ErrorState";
import { ListSkeleton } from "../../../ui/Skeleton";
import { spacing, radius } from "../../../ui/theme";
import { useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { trackEvent } from "../../../telemetry/analytics";

/**
 * AI Videos, topic list for one subject.
 *
 * <p><strong>Every topic in the subject is listed, whether or not it has a video.</strong> That is
 * the deliberate behaviour, not an oversight: a topic with no lesson yet says so plainly. Showing
 * only topics that have videos would make an almost-empty library look like a complete syllabus,
 * and a student would have no way to see what is still coming.
 *
 * <p>The topics come from `getTopicStats` - the same call Practice uses - so this list and the
 * practice list can never disagree about what a subject contains.
 */
export default function AiVideosSubjectScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const styles = useThemedStyles(buildStyles);
  const mode = useHybridMode();
  const { syncVersion } = useSyncStatus();
  const { activeExam } = useActiveExam();
  const { subjectId, subjectName } = useLocalSearchParams<{
    subjectId: string;
    subjectName?: string;
  }>();

  const examCode = activeExam?.code ?? null;

  /*
   * Same keyed-loaded-state shape as the subject list, for the same two reasons: no synchronous
   * setState inside an effect, and one subject's topics can never render under another subject's
   * heading while a load is in flight.
   */
  const loadKey = `${subjectId ?? "-"}:${examCode ?? "-"}:${mode}:${syncVersion}`;
  const [loaded, setLoaded] = useState<{ key: string; topics: TopicStat[] } | null>(null);
  const [catalog, setCatalog] = useState<VideoCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const topics = loaded?.key === loadKey ? loaded.topics : null;

  useEffect(() => {
    if (subjectName) navigation.setOptions({ title: subjectName });
  }, [navigation, subjectName]);

  const load = useCallback(
    async (key: string) => {
      if (!subjectId) return;
      // Awaits before touching state, so nothing is set synchronously from the effect below.
      const loadedTopics = await getTopicStats(subjectId, examCode, mode);
      setLoaded({ key, topics: loadedTopics });
      setError(null);

      const result = await getVideoCatalog(examCode, (fresh) => setCatalog(fresh));
      if (result.status === "ready") {
        setCatalog(result.catalog);
      } else if (result.status === "unavailable") {
        // The topic list is still correct and still worth showing; only the video markers are
        // missing. Saying so beats replacing a working screen with an error page.
        setError(result.message);
      }
    },
    [subjectId, examCode, mode],
  );

  useEffect(() => {
    // An inline async IIFE, not `load(...).catch(...)`. The lint rule flags a memoized
    // callback invoked with a chained .catch() at the call site, even when the callee
    // touches no state before its first await - a shape this codebase has hit before.
    void (async () => {
      try {
        await load(loadKey);
      } catch {
        setError("Something went wrong loading these topics.");
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

  function openVideo(topic: TopicStat, video: TopicVideoCatalogEntry) {
    trackEvent("ai_video_opened", { topicId: topic.id, videoId: video.videoId });
    router.push({
      pathname: "/lesson-video",
      params: { streamPath: video.playbackPath, title: topic.name },
  });
  }

  if (topics === null) {
    return (
      <View style={styles.container}>
        <ListSkeleton count={6} />
      </View>
    );
  }

  if (topics.length === 0) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="No topics yet"
          body="We don't have this subject's topics on your device yet. Sync, then try again."
          onRetry={onRefresh}
        />
      </View>
    );
  }

  const withVideo = topics.filter((t) => catalog?.byTopicId[t.id]).length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.summary}>
        {withVideo === 0
          ? `No video lessons for this subject yet — all ${topics.length} topics are listed below.`
          : `${withVideo} of ${topics.length} topics have a video lesson.`}
      </Text>

      {error && <Text style={styles.notice}>{error}</Text>}

      {topics.map((topic) => {
        const video = catalog?.byTopicId[topic.id];
        const locked = video != null && video.requiresPremium && !video.entitled;
        return (
          <Card key={topic.id} style={styles.topicCard}>
            <Pressable
              accessibilityRole={video && !locked ? "button" : undefined}
              disabled={!video || locked}
              onPress={() => video && openVideo(topic, video)}
              style={styles.topicRow}
            >
              <View
                style={[styles.iconCircle, video ? styles.iconCircleActive : styles.iconCircleIdle]}
              >
                <Ionicons
                  name={video ? "play" : "videocam-outline"}
                  size={18}
                  color={video ? styles.iconOnAccent.color : styles.iconMuted.color}
                />
              </View>
              <View style={styles.topicText}>
                <Text style={styles.topicName}>{topic.name}</Text>
                {video ? (
                  <Text style={styles.topicMeta}>
                    {locked
                      ? "Premium lesson"
                      : `Watch explanation${
                          video.durationSeconds ? ` · ${formatDuration(video.durationSeconds)}` : ""
                        }`}
                  </Text>
                ) : (
                  /*
                   * The empty state, stated plainly and without a chevron, so the row reads as
                   * information rather than as a button that does nothing.
                   */
                  <Text style={styles.topicEmpty}>No explanation video available yet</Text>
                )}
              </View>
              {video && !locked && (
                <Ionicons name="chevron-forward" size={18} color={styles.iconMuted.color} />
              )}
            </Pressable>
          </Card>
        );
      })}

      <View style={styles.footerSpace} />
    </ScrollView>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg },
    summary: { color: colors.text.secondary, fontSize: 14, marginBottom: spacing.md },
    notice: { color: colors.text.muted, fontSize: 12, marginBottom: spacing.sm },
    topicCard: { marginBottom: spacing.sm },
    topicRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: "center",
      justifyContent: "center",
    },
    iconCircleActive: { backgroundColor: colors.brand.primary },
    iconCircleIdle: { backgroundColor: colors.surfaceElevated2 },
    iconOnAccent: { color: colors.text.onAccent },
    iconMuted: { color: colors.text.muted },
    topicText: { flex: 1 },
    topicName: { color: colors.text.primary, fontSize: 15, fontWeight: "600" },
    topicMeta: { color: colors.brand.light, fontSize: 12, marginTop: 2 },
    topicEmpty: { color: colors.text.muted, fontSize: 12, marginTop: 2 },
    footerSpace: { height: spacing.xl },
  });
