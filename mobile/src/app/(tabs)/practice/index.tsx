import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import {
  getSyncedExams,
  getDifficultyLevels,
  getExamBadges,
  type ExamOption,
  type DifficultyLevel,
  type ExamBadge,
} from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { useSyncStatus } from "../../../sync/SyncContext";
import { useSessionHistory } from "../../../practice/sessionHistory";
import { getExamPracticeProgress } from "../../../practice/examProgress";
import { getExamGradient } from "../../../constants/examTheme";
import { getExamOrgName } from "../../../constants/examOrgs";
import type { IoniconName } from "../../../constants/subjects";
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

// Every exam here is real, locally-synced data — no hardcoded "coming soon" exams.
// Adding a new exam on the backend makes it appear here automatically on next sync.
export default function Practice() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [exams, setExams] = useState<ExamOption[]>([]);
  const [levels, setLevels] = useState<DifficultyLevel[]>([]);
  const [badges, setBadges] = useState<ExamBadge[]>([]);
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

  // The two lookup vocabularies an exam's `difficulty`/`badge` codes resolve against.
  // Kept as maps so a code with no matching row simply renders nothing rather than
  // showing the raw code.
  useEffect(() => {
    getDifficultyLevels(mode)
      .then(setLevels)
      .catch(() => setLevels([]));
    getExamBadges(mode)
      .then(setBadges)
      .catch(() => setBadges([]));
  }, [syncVersion, mode]);

  const levelByCode = useMemo(() => new Map(levels.map((l) => [l.code, l])), [levels]);
  const badgeByCode = useMemo(() => new Map(badges.map((b) => [b.code, b])), [badges]);

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
          placeholder={t("practice.searchExams")}
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
            <SectionLabel label={t("practice.recommended")} style={styles.sectionLabelSpacing} />
            <Card variant="gradient" onPress={() => openSubjects("ALL", "All Government Exams")} style={styles.allExamsCard}>
              <View style={styles.allExamsGlow} />
              <View style={styles.allExamsTop}>
                <View style={styles.allExamsIconCircle}>
                  <Ionicons name="earth" size={26} color={colors.text.onAccent} />
                </View>
                <View style={styles.allExamsTextBlock}>
                  <Text style={styles.allExamsTitle}>{t("practice.allExams")}</Text>
                  <Text style={styles.allExamsSubtitle}>{t("practice.allExamsSubtitle")}</Text>
                </View>
              </View>
              <View style={styles.allExamsCta}>
                <Text style={styles.allExamsCtaText}>{t("practice.startPracticing")}</Text>
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
            const orgName = getExamOrgName(exam.code);
            const progress = getExamPracticeProgress(sessions, exam.code);
            const level = exam.difficulty ? levelByCode.get(exam.difficulty) : undefined;
            const badge = exam.badge ? badgeByCode.get(exam.badge) : undefined;
            return (
              <FadeInItem key={exam.code} index={index}>
                <Card onPress={() => openSubjects(exam.code, exam.name)} style={styles.examCard}>
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
                      icon="document-text-outline"
                      value={exam.questionCount.toLocaleString()}
                      label={exam.questionCount === 1 ? "question" : "questions"}
                    />
                    {/* Only when the admin has actually set a difficulty — an unassessed
                        exam shows one pill rather than a guessed level. */}
                    {level && (
                      <StatPill
                        icon={(level.icon as IoniconName | null) ?? "speedometer-outline"}
                        value={level.label}
                        label={t("practice.levelPillLabel")}
                      />
                    )}
                  </View>
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
              title={searching ? t("practice.noExamsMatch", { query: search.trim() }) : t("practice.noExamsSynced")}
              body={searching ? undefined : t("practice.noExamsSyncedBody")}
            />
          )}
        </View>
        </>
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
    statRow: {
      flexDirection: "row",
      gap: spacing.sm + 2,
    },
    examOrg: {
      fontSize: 12.5,
      color: colors.text.muted,
      marginTop: 2,
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
