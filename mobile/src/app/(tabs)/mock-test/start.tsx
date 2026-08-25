import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { getSectionAvailability, type SectionAvailability } from "../../../db/mockTest";
import { getPaperById, type SyncedPaper } from "../../../db/examStructure";
import { getPaperByIdLive } from "../../../data/mockTestStructureData";
import { getSectionAvailabilityLive } from "../../../data/mockTestData";
import { useHybridMode } from "../../../data/hybridSource";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { CardSkeleton } from "../../../ui/Skeleton";
import { colors, radius, spacing, typography } from "../../../ui/theme";

export default function MockTestStart() {
  const router = useRouter();
  const { paperId, examLabel, paperName } = useLocalSearchParams<{
    paperId: string;
    examCode: string;
    examLabel: string;
    paperName: string;
  }>();
  const [paper, setPaper] = useState<SyncedPaper | null>(null);
  const [sections, setSections] = useState<SectionAvailability[] | null>(null);
  const [loading, setLoading] = useState(true);
  const mode = useHybridMode();

  useEffect(() => {
    if (!paperId) return;
    (async () => {
      setLoading(true);
      try {
        const loaded = mode === "local" ? await getPaperById(paperId) : await getPaperByIdLive(paperId);
        setPaper(loaded);
        if (loaded) {
          setSections(mode === "local" ? await getSectionAvailability(loaded) : await getSectionAvailabilityLive(loaded));
        }
      } catch (err) {
        // A live fetch can fail (connectivity dropped between screens) where the local
        // read never could — treat it the same as "paper not found" rather than an
        // unhandled rejection, since this screen already has a graceful empty state for that.
        console.warn("Failed to load mock test paper", err);
        setPaper(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [paperId, mode]);

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingMessage}>Preparing your test details...</Text>
        <CardSkeleton height={28} />
        <View style={[styles.summaryRow, { marginTop: spacing.xl }]}>
          <CardSkeleton height={78} />
          <CardSkeleton height={78} />
          <CardSkeleton height={78} />
        </View>
      </View>
    );
  }

  if (!paper) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>This paper is no longer part of the exam's structure.</Text>
      </View>
    );
  }

  const totalAvailable = sections?.reduce((sum, s) => sum + s.available, 0) ?? null;
  const totalRequested = paper.sections.reduce((sum, s) => sum + s.questionCount, 0);
  const isCapped = totalAvailable !== null && totalAvailable < totalRequested;
  const canStart = totalAvailable !== null && totalAvailable > 0;
  // Sections with their own limit are summed; otherwise the paper's overall time applies.
  const sectionallyTimed = paper.sections.some((s) => s.isSectionallyTimed);
  const totalMinutes = sectionallyTimed
    ? paper.sections.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
    : paper.durationMinutes;

  const startTest = () => {
    router.push({ pathname: "/mock-test/test", params: { paperId, examLabel, paperName } });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.examName}>
        {examLabel} — {paper.name}
      </Text>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Ionicons name="time-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.summaryValue}>{totalMinutes != null ? `${totalMinutes} min` : "—"}</Text>
          <Text style={styles.summaryLabel}>{sectionallyTimed ? "Total (sectional)" : "Duration"}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons name="help-circle-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.summaryValue}>{totalAvailable ?? totalRequested}</Text>
          <Text style={styles.summaryLabel}>Questions</Text>
        </View>
        <View style={styles.summaryCard}>
          <Ionicons name="ribbon-outline" size={20} color={colors.brand.primary} />
          <Text style={styles.summaryValue}>
            {paper.marksCorrect != null ? `+${paper.marksCorrect}/-${paper.marksWrong ?? 0}` : "—"}
          </Text>
          <Text style={styles.summaryLabel}>Marking</Text>
        </View>
      </View>

      {isCapped && (
        <View style={styles.cappedNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.semantic.warning} />
          <Text style={styles.cappedNoteText}>
            Only {totalAvailable} of the usual {totalRequested} questions are available today — more content is
            added over time.
          </Text>
        </View>
      )}

      <Text style={typography.label}>Sections</Text>
      <View style={styles.sectionsList}>
        {paper.sections.map((section) => {
          const availability = sections?.find((s) => s.sectionName === section.name);
          return (
            <Card key={section.id} style={styles.sectionRow}>
              <View style={styles.sectionIconCircle}>
                <Ionicons name="layers-outline" size={18} color={colors.text.secondary} />
              </View>
              <Text style={styles.sectionName}>
                {section.name}
                {section.isSectionallyTimed ? ` · ${section.durationMinutes} min` : ""}
              </Text>
              <Text style={styles.sectionCount}>
                {availability ? `${availability.available} questions` : "…"}
              </Text>
            </Card>
          );
        })}
      </View>

      <View style={styles.instructionsBox}>
        <Text style={styles.instructionsTitle}>Before you start</Text>
        <Text style={styles.instructionsItem}>• The timer starts as soon as you tap Start and auto-submits at zero.</Text>
        <Text style={styles.instructionsItem}>• Answers aren't shown right or wrong until you submit — just like the real exam.</Text>
        {paper.marksWrong != null && paper.marksWrong > 0 && (
          <Text style={styles.instructionsItem}>
            • Wrong answers cost {paper.marksWrong} marks — skip if you're unsure rather than guessing blindly.
          </Text>
        )}
        {sectionallyTimed && (
          <Text style={styles.instructionsItem}>• This paper is sectionally timed — each section has its own limit.</Text>
        )}
        <Text style={styles.instructionsItem}>• Use the question navigator to jump around and mark questions for review.</Text>
      </View>

      <Button size="lg" disabled={!canStart} onPress={startTest}>
        {canStart ? "Start Test" : "Not enough questions yet"}
      </Button>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing["3xl"],
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing["2xl"],
  },
  emptyText: {
    ...typography.secondary,
    textAlign: "center",
  },
  loadingMessage: {
    ...typography.secondary,
    marginBottom: spacing.md,
  },
  examName: {
    ...typography.pageTitle,
    fontSize: 20,
    marginBottom: spacing.xl,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm + 2,
    marginBottom: spacing.base,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.surfaceElevated2,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.xs,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  cappedNote: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.semantic.warningBg,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.base,
    alignItems: "flex-start",
  },
  cappedNoteText: {
    flex: 1,
    fontSize: 12,
    color: colors.semantic.warning,
    lineHeight: 17,
  },
  sectionsList: {
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xl,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  sectionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceElevated2,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  sectionCount: {
    fontSize: 12,
    color: colors.text.muted,
  },
  instructionsBox: {
    backgroundColor: colors.surfaceElevated2,
    borderRadius: radius.md,
    padding: spacing.base,
    marginBottom: spacing.xl,
    gap: spacing.xs + 2,
  },
  instructionsTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: spacing.xs,
  },
  instructionsItem: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
});
