import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { getMockablePapersLive } from "../../../data/mockTestStructureData";
import { useHybridMode } from "../../../data/hybridSource";
import { getMockablePapers, type SyncedPaper } from "../../../db/examStructure";
import { useSyncStatus } from "../../../sync/SyncContext";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ListSkeleton } from "../../../ui/Skeleton";
import { colors, spacing, typography } from "../../../ui/theme";

export default function MockTestPapers() {
  const router = useRouter();
  const { examCode, examLabel } = useLocalSearchParams<{ examCode: string; examLabel: string }>();
  const [papers, setPapers] = useState<SyncedPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    if (!examCode) return;
    (async () => {
      try {
        const mockable = mode === "local" ? await getMockablePapers(examCode) : await getMockablePapersLive(examCode);
        setPapers(mockable);
      } finally {
        setLoading(false);
      }
    })();
  }, [examCode, syncVersion, mode]);

  const openStart = (paper: SyncedPaper) => {
    router.push({
      pathname: "/mock-test/start",
      params: {
        paperId: paper.id,
        examCode: paper.examCode,
        examLabel: examLabel ?? "",
        paperName: paper.name,
      },
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: examLabel ?? "Mock Tests" }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Full-length Mock Tests</Text>
        <Text style={styles.subheading}>
          Timed, exam-pattern tests with real negative marking — just like the real thing.
        </Text>

        {loading && <ListSkeleton count={4} />}

        {!loading && (
          <View style={styles.list}>
            {papers.map((paper, index) => {
              const totalQuestions = paper.sections.reduce((sum, s) => sum + s.questionCount, 0);
              const meta = [
                `${totalQuestions} Questions`,
                paper.durationMinutes != null ? `${paper.durationMinutes} Minutes` : null,
                paper.marksCorrect != null ? `+${paper.marksCorrect}/-${paper.marksWrong ?? 0} marking` : null,
              ].filter(Boolean) as string[];

              return (
                <FadeInItem key={paper.id} index={index}>
                  <Card variant="filled" onPress={() => openStart(paper)} style={styles.card}>
                    <View style={styles.cardTopRow}>
                      <View style={styles.badge}>
                        <Ionicons name="timer-outline" size={13} color={colors.text.onAccent} />
                        <Text style={styles.badgeText}>MOCK TEST</Text>
                      </View>
                      <Text style={styles.stageText}>{paper.stageName}</Text>
                    </View>

                    <Text style={styles.cardTitle}>{paper.name}</Text>

                    <View style={styles.metaRow}>
                      {meta.map((item, i) => (
                        <View key={item} style={styles.metaItem}>
                          {i > 0 ? <View style={styles.metaDot} /> : null}
                          <Text style={styles.metaText}>{item}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.ctaRow}>
                      <Text style={styles.ctaText}>Start Test</Text>
                      <Ionicons name="arrow-forward" size={16} color={colors.text.onAccent} />
                    </View>
                  </Card>
                </FadeInItem>
              );
            })}

            {papers.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
            {papers.length === 0 && mode !== "unavailable" && (
              <EmptyState
                icon="timer-outline"
                title="No mock tests yet"
                body="This exam needs a paper defined in its structure before a test can be built from it."
              />
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing["3xl"],
  },
  heading: {
    ...typography.pageTitle,
    fontSize: 22,
  },
  subheading: {
    ...typography.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    lineHeight: 19,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "rgba(255,255,255,0.75)",
    letterSpacing: 0.5,
  },
  stageText: {
    fontSize: 11,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text.onAccent,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "rgba(255,255,255,0.4)",
    marginHorizontal: spacing.sm,
  },
  metaText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
  },
  ctaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.onAccent,
  },
});
