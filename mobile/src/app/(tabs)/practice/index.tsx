import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { getSyncedExams, type ExamOption } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { useSyncStatus } from "../../../sync/SyncContext";
import { useSessionHistory } from "../../../practice/sessionHistory";
import { getExamPracticeProgress } from "../../../practice/examProgress";
import { getExamGradient } from "../../../constants/examTheme";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { IconBox } from "../../../ui/IconBox";
import { StatPill } from "../../../ui/StatPill";
import { SectionLabel } from "../../../ui/SectionLabel";
import { AnimatedProgressBar } from "../../../ui/AnimatedProgressBar";
import { ListSkeleton } from "../../../ui/Skeleton";
import { colors, radius, spacing } from "../../../ui/theme";

// Every exam here is real, locally-synced data — no hardcoded "coming soon" exams.
// Adding a new exam on the backend makes it appear here automatically on next sync.
export default function Practice() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [loading, setLoading] = useState(true);

  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();
  const { sessions } = useSessionHistory();

  useEffect(() => {
    getSyncedExams(mode).then((result) => {
      setExams(result);
      setLoading(false);
    });
  }, [syncVersion, mode]);

  const openSubjects = (examCode: string, examLabel: string) => {
    router.push({ pathname: "/practice/subjects", params: { examCode, examLabel } });
  };

  // This box used to be decorative — it accepted text and changed nothing, which is
  // worse than having no search at all, because it reads as broken rather than absent.
  const query = search.trim().toLowerCase();
  const filteredExams = useMemo(
    () => (query ? exams.filter((exam) => exam.name.toLowerCase().includes(query)) : exams),
    [exams, query],
  );
  const searching = query.length > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search exams..."
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searching && (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* While searching, the "All Government Exams" shortcut is noise — the user has
            told us what they are looking for. */}
        {!searching && (
          <>
            <SectionLabel label="Recommended" style={styles.sectionLabelSpacing} />
            <Card variant="gradient" onPress={() => openSubjects("ALL", "All Government Exams")} style={styles.allExamsCard}>
              <View style={styles.allExamsGlow} />
              <View style={styles.allExamsTop}>
                <View style={styles.allExamsIconCircle}>
                  <Ionicons name="earth" size={26} color={colors.text.onAccent} />
                </View>
                <View style={styles.allExamsTextBlock}>
                  <Text style={styles.allExamsTitle}>All Government Exams</Text>
                  <Text style={styles.allExamsSubtitle}>Common Quant, Reasoning, English & GA content</Text>
                </View>
              </View>
              <View style={styles.allExamsCta}>
                <Text style={styles.allExamsCtaText}>Start practicing</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.text.onAccent} />
              </View>
            </Card>
          </>
        )}

        <SectionLabel
          label={searching ? `${filteredExams.length} result${filteredExams.length === 1 ? "" : "s"}` : "Browse by exam"}
          count={searching ? undefined : `${filteredExams.length} board${filteredExams.length === 1 ? "" : "s"}`}
          style={styles.sectionLabel}
        />
        {loading ? (
          <ListSkeleton count={5} />
        ) : (
        <>
        {/*
          A single-column list rather than a two-up grid: exam names range from "GK"
          to "RRB NTPC (Graduate Level)", and a fixed-width tile either wastes space on
          short names or forces long ones onto three lines. A full-width row also has
          room for a second line, so the count of what's actually synced is visible
          without a tap — the thing an aspirant most wants to know before diving in.
        */}
        <View style={styles.list}>
          {filteredExams.map((exam, index) => {
            const gradient = getExamGradient(exam.code);
            const progress = getExamPracticeProgress(sessions, exam.code);
            return (
              <FadeInItem key={exam.code} index={index}>
                <Card onPress={() => openSubjects(exam.code, exam.name)} style={styles.examCard}>
                  <View style={styles.examTopRow}>
                    <IconBox icon={gradient.icon} gradientColors={gradient.colors} />
                    <View style={styles.examTextBlock}>
                      <Text style={styles.examLabel} numberOfLines={2}>
                        {exam.name}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                  </View>
                  <StatPill
                    icon="document-text-outline"
                    value={exam.questionCount.toLocaleString()}
                    label={exam.questionCount === 1 ? "question" : "questions"}
                  />
                  {progress !== null && (
                    <View style={styles.progressWrap}>
                      <AnimatedProgressBar progress={progress / 100} style={styles.progressTrack} />
                      <Text style={styles.progressText}>{progress}%</Text>
                    </View>
                  )}
                </Card>
              </FadeInItem>
            );
          })}
          {/* Two different empty states: nothing synced yet is a content gap, while a
              search that found nothing is a dead end the user can back out of. */}
          {filteredExams.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
          {filteredExams.length === 0 && mode !== "unavailable" && (
            <EmptyState
              icon={searching ? "search-outline" : "document-text-outline"}
              title={searching ? `No exams match "${search.trim()}"` : "No exams synced yet"}
              body={searching ? undefined : "More exams are added as they're synced."}
            />
          )}
        </View>
        </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    padding: 0,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing["3xl"],
  },
  sectionLabelSpacing: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  allExamsCard: {
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  allExamsGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.brand.bright,
    opacity: 0.25,
  },
  allExamsTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md + 2,
  },
  allExamsIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  allExamsTextBlock: {
    flex: 1,
  },
  allExamsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text.onAccent,
    marginBottom: spacing.xs,
  },
  allExamsSubtitle: {
    fontSize: 13.5,
    color: colors.text.onAccentSecondary,
    lineHeight: 19,
  },
  allExamsCta: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs + 2,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 1,
    paddingHorizontal: spacing.base,
    marginTop: spacing.base,
  },
  allExamsCtaText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.onAccent,
  },
  list: {
    gap: spacing.base,
  },
  examCard: {
    gap: spacing.md,
  },
  examTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
  },
  examTextBlock: {
    flex: 1,
  },
  examLabel: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.text.primary,
  },
  progressWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.brand.light,
  },
});
