import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { getMockablePapersLive } from "../../../data/mockTestStructureData";
import { useHybridMode } from "../../../data/hybridSource";
import { getMockablePapers, type SyncedPaper } from "../../../db/examStructure";
import { getMockAttemptSummary, type MockAttemptSummary } from "../../../db/mockTest";
import { getExamOrgName } from "../../../constants/examOrgs";
import { useSyncStatus } from "../../../sync/SyncContext";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { SectionLabel } from "../../../ui/SectionLabel";
import { ListSkeleton } from "../../../ui/Skeleton";
import { colors, radius, spacing, typography } from "../../../ui/theme";

function formatAvgTime(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

export default function MockTestPapers() {
  const router = useRouter();
  const { examCode, examLabel } = useLocalSearchParams<{ examCode: string; examLabel: string }>();
  const [papers, setPapers] = useState<SyncedPaper[]>([]);
  const [summary, setSummary] = useState<MockAttemptSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    if (!examCode) return;
    (async () => {
      try {
        const [mockable, attemptSummary] = await Promise.all([
          mode === "local" ? getMockablePapers(examCode) : getMockablePapersLive(examCode),
          getMockAttemptSummary(examCode),
        ]);
        setPapers(mockable);
        setSummary(attemptSummary);
      } finally {
        setLoading(false);
      }
    })();
  }, [examCode, syncVersion, mode]);

  const orgName = examCode ? getExamOrgName(examCode) : null;

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
        {orgName && <Text style={styles.orgName}>{orgName}</Text>}
        <Text style={styles.subheading}>
          Timed, exam-pattern tests with real negative marking — just like the real thing.
        </Text>

        {loading ? (
          <ContextualLoading message="Finding the right mock tests for you..." skeleton={<ListSkeleton count={4} />} />
        ) : (
          <>
            {/* Only shown once this exam has at least one real attempt — never a fabricated 0. */}
            {summary && (
              <View style={styles.statRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{summary.attempted}</Text>
                  <Text style={styles.statLabel}>ATTEMPTED</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{Math.round(summary.bestScore)}</Text>
                  <Text style={styles.statLabel}>BEST SCORE</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{formatAvgTime(summary.avgTimeSeconds)}</Text>
                  <Text style={styles.statLabel}>AVG TIME</Text>
                </View>
              </View>
            )}

            <SectionLabel label={papers.length > 1 ? "Choose a test" : "Available"} style={styles.sectionLabel} />

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
          </>
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
  orgName: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.brand.light,
    marginTop: spacing.xs,
  },
  subheading: {
    ...typography.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    lineHeight: 19,
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginBottom: spacing.xl,
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md + 2,
    paddingVertical: spacing.sm + 2,
    alignItems: "center",
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text.primary,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: "600",
    letterSpacing: 0.3,
    color: colors.text.muted,
  },
  sectionLabel: {
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    gap: spacing.sm,
    borderRadius: radius["2xl"],
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
