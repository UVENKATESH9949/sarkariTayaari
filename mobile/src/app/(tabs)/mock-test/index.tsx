import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { getSyncedExams, getExamBadges, type ExamOption, type ExamBadge } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { useSyncStatus } from "../../../sync/SyncContext";
import { getMockablePapers } from "../../../data/mockTestAccess";
import { getMockAttemptSummary, type MockAttemptSummary } from "../../../db/mockTest";
import { getExamGradient } from "../../../constants/examTheme";
import { getExamOrgName } from "../../../constants/examOrgs";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Badge } from "../../../ui/Badge";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { IconBox } from "../../../ui/IconBox";
import { StatPill } from "../../../ui/StatPill";
import { SectionLabel } from "../../../ui/SectionLabel";
import { AnimatedProgressBar } from "../../../ui/AnimatedProgressBar";
import { ListSkeleton } from "../../../ui/Skeleton";
import { radius, spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";

// Every exam here is real, locally-synced data, same source Practice uses. A mock
// paper always belongs to one exam's structure, so there's no cross-exam "All Exams"
// shortcut here the way Practice has one.
export default function MockTestExamSelection() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [loading, setLoading] = useState(true);
  // examCode -> total mockable papers, and examCode -> attempt summary (or null if never
  // attempted). Attempts are always read from the student's own local history — that's
  // never server-driven, regardless of hybrid mode.
  const [paperCounts, setPaperCounts] = useState<Record<string, number>>({});
  const [attemptSummaries, setAttemptSummaries] = useState<Record<string, MockAttemptSummary | null>>({});
  const [badges, setBadges] = useState<ExamBadge[]>([]);

  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    getSyncedExams(mode).then((result) => {
      setExams(result);
      setLoading(false);
    });
  }, [syncVersion, mode]);

  useEffect(() => {
    if (exams.length === 0) return;
    (async () => {
      const counts: Record<string, number> = {};
      const summaries: Record<string, MockAttemptSummary | null> = {};
      await Promise.all(
        exams.map(async (exam) => {
          const papers = await getMockablePapers(exam.code, mode);
          counts[exam.code] = papers.length;
          summaries[exam.code] = await getMockAttemptSummary(exam.code);
        }),
      );
      setPaperCounts(counts);
      setAttemptSummaries(summaries);
    })();
  }, [exams, mode]);

  useEffect(() => {
    getExamBadges(mode)
      .then(setBadges)
      .catch(() => setBadges([]));
  }, [syncVersion, mode]);

  const badgeByCode = useMemo(() => new Map(badges.map((b) => [b.code, b])), [badges]);

  const openPapers = (examCode: string, examLabel: string) => {
    router.push({ pathname: "/mock-test/papers", params: { examCode, examLabel } });
  };

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
          placeholder={t("mock.searchExams")}
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
        <SectionLabel
          label={searching ? `${filteredExams.length} result${filteredExams.length === 1 ? "" : "s"}` : "Choose an exam"}
          count={searching ? undefined : `${filteredExams.length} board${filteredExams.length === 1 ? "" : "s"}`}
          style={styles.sectionLabel}
        />
        {loading ? (
          <ListSkeleton count={5} />
        ) : (
        <View style={styles.list}>
          {filteredExams.map((exam, index) => {
            const gradient = getExamGradient(exam.code);
            const orgName = getExamOrgName(exam.code);
            const totalPapers = paperCounts[exam.code];
            const summary = attemptSummaries[exam.code];
            const badge = exam.badge ? badgeByCode.get(exam.badge) : undefined;
            return (
              <FadeInItem key={exam.code} index={index}>
                <Card onPress={() => openPapers(exam.code, exam.name)} style={styles.examCard}>
                  <View style={styles.examTopRow}>
                    <IconBox
                      icon={gradient.icon}
                      gradientColors={gradient.colors}
                      iconColor={gradient.iconTint}
                      imageUrl={exam.imageUrl}
                    />
                    <View style={styles.examTextBlock}>
                      <View style={styles.examTitleRow}>
                        <Text style={styles.examLabel} numberOfLines={2}>
                          {exam.name}
                        </Text>
                        {badge && (
                          <Badge
                            label={badge.label}
                            variant={badge.code === "trending" ? "hot" : "success"}
                            color={badge.color}
                            backgroundColor={badge.colorBg}
                          />
                        )}
                      </View>
                      {orgName && (
                        <Text style={styles.examOrg} numberOfLines={1}>
                          {orgName}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                  </View>
                  <View style={styles.statRow}>
                    <StatPill
                      icon="timer-outline"
                      value={totalPapers !== undefined ? String(totalPapers) : "…"}
                      label={totalPapers === 1 ? t("mock.fullTestOne") : t("mock.fullTestOther")}
                    />
                    <StatPill
                      icon="document-text-outline"
                      value={exam.questionCount.toLocaleString()}
                      label={exam.questionCount === 1 ? "question" : "questions"}
                    />
                  </View>
                  {summary && totalPapers ? (
                    <View style={styles.progressWrap}>
                      <AnimatedProgressBar
                        progress={Math.min(1, summary.attempted / totalPapers)}
                        style={styles.progressTrack}
                      />
                      <Text style={styles.progressText}>
                        {summary.attempted}/{totalPapers} taken
                      </Text>
                    </View>
                  ) : null}
                </Card>
              </FadeInItem>
            );
          })}
          {filteredExams.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
          {filteredExams.length === 0 && mode !== "unavailable" && (
            <EmptyState
              icon={searching ? "search-outline" : "timer-outline"}
              title={searching ? t("practice.noExamsMatch", { query: search.trim() }) : t("practice.noExamsSynced")}
              body={searching ? undefined : t("practice.noExamsSyncedBody")}
            />
          )}
        </View>
        )}
      </ScrollView>
    </View>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radius.lg,
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
    sectionLabel: {
      marginTop: spacing.sm,
      marginBottom: spacing.md,
    },
    list: {
      gap: spacing.base,
    },
    examCard: {
      gap: spacing.md + 2,
      borderRadius: radius.xl + 2,
      padding: spacing.base + 2,
    },
    examTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md + 2,
    },
    examTextBlock: {
      flex: 1,
    },
    examTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    examLabel: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text.primary,
      flexShrink: 1,
    },
    examOrg: {
      fontSize: 12.5,
      color: colors.text.muted,
      marginTop: 2,
    },
    statRow: {
      flexDirection: "row",
      gap: spacing.sm + 2,
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
