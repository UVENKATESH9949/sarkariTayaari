import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { toSubjectMeta } from "../../../constants/subjects";
import {
  getSubjectStats,
  getTopicCoverage,
  getTopicStats,
  type SubjectStat,
  type TopicStat,
} from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { getTopicInsights, type TopicInsight } from "../../../db/topicIntelligence";
import { useAuth } from "../../../practice/authContext";
import { useSyncStatus } from "../../../sync/SyncContext";
import {
  DifficultyPickerDialog,
  type DifficultyPickerTarget,
} from "../../../practice/DifficultyPickerDialog";
import { SubjectSelect } from "../../../practice/SubjectSelect";
import { trackEvent } from "../../../telemetry/analytics";
import { AnimatedProgressBar } from "../../../ui/AnimatedProgressBar";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { ListSkeleton } from "../../../ui/Skeleton";
import {
  MasteryChip,
  PrerequisiteNotice,
  PriorityChip,
  TrendChip,
  WeightageChip,
} from "../../../ui/TopicInsightChips";
import { radius, spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";
import { questionsLabel } from "@sarkaritaiyaari/core/i18n";

/** The two orderings the topic list can be in. */
type SortMode = "priority" | "syllabus";

/**
 * A topic and everything Epic L knows about it. `insight` is null when nothing has been computed
 * — an exam with no curated topic map, or a device whose intelligence sync has not landed yet —
 * and every chip handles that by rendering nothing rather than a zero.
 */
type TopicRow = TopicStat & { insight: TopicInsight | null };

/** A parent topic and its children, or a lone top-level topic (TICKET-2102). */
type TopicGroup = {
  key: string;
  /** Null for the synthetic group holding topics whose parent is outside this subject. */
  parentName: string | null;
  rows: TopicRow[];
};

/**
 * Groups topics under their parent (TICKET-2102).
 *
 * A parent that is itself in the list heads its own group and is not repeated as a child, so
 * "Arithmetic" appears once as a heading rather than twice. A topic whose parent is not in this
 * list — the parent lives in another subject, or has not synced — is treated as top level rather
 * than being hidden, because dropping it would silently remove practisable content.
 */
function groupByParent(rows: TopicRow[]): TopicGroup[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const groups = new Map<string, TopicGroup>();

  // Seed a group for every topic that is somebody's parent, so headings keep the order the
  // parents themselves appear in rather than the order their first child happens to.
  for (const row of rows) {
    const parentId = row.insight?.parentId ?? null;
    if (parentId && byId.has(parentId)) {
      const parent = byId.get(parentId)!;
      if (!groups.has(parentId)) {
        groups.set(parentId, { key: parentId, parentName: parent.name, rows: [] });
      }
    }
  }

  for (const row of rows) {
    const parentId = row.insight?.parentId ?? null;

    // A row that heads a group belongs to that group's heading, not inside it.
    if (groups.has(row.id)) continue;

    if (parentId && groups.has(parentId)) {
      groups.get(parentId)!.rows.push(row);
      continue;
    }

    const key = `__top__${row.id}`;
    groups.set(key, { key, parentName: null, rows: [row] });
  }

  // A parent with no surviving children (its children were filtered out by search) would render
  // as an empty heading. Turn it back into a plain top-level row instead.
  const result: TopicGroup[] = [];
  for (const group of groups.values()) {
    if (group.parentName !== null && group.rows.length === 0) {
      const parent = byId.get(group.key);
      if (parent) result.push({ key: group.key, parentName: null, rows: [parent] });
      continue;
    }
    result.push(group);
  }
  return result;
}

/**
 * Practice, as one screen.
 *
 * This replaces the Subject -> Topic -> Level drill-down. All three were separate routes;
 * picking a subject cost a push, picking a topic cost another, and picking Easy cost a third,
 * so starting a five-minute practice run took four screens and three back presses to undo.
 * Subject is now a dropdown, its topics render underneath the moment it changes, and difficulty
 * is a centred dialog over the list - the student never leaves this screen until the quiz opens.
 *
 * THE TOPIC CARDS THEMSELVES ARE THE OLD ONES, DELIBERATELY. An earlier pass flattened them into
 * plain rows to keep the screen quiet, and that was the wrong trade: the priority / mastery /
 * trend / weightage chips, the parent breadcrumb, the "Best after" prerequisite notice and the
 * priority-vs-syllabus toggle are Epic L's whole student-facing surface, and they are what lets
 * someone tell which topic is worth their next hour. Only the NAVIGATION needed reducing; the
 * card was already right. `renderTopicCard` and `groupByParent` are the deleted topics screen's
 * own code, moved rather than rewritten, so the two never drifted.
 *
 * Nothing about what is practised changed. Every read here (`getSubjectStats`, `getTopicStats`,
 * `getTopicInsights`, and the dialog's `getDifficultyCounts`/`getDifficultyLevels`) is the same
 * call the old screens made, and the quiz is opened with exactly the parameter set
 * `practice/levels.tsx` has always pushed - so the practice engine, its timer, its progress
 * recording and its offline behaviour are untouched.
 */
export default function PracticeBrowse() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const { examCode, examLabel } = useLocalSearchParams<{ examCode: string; examLabel: string }>();
  const scopedExam = examCode ?? null;

  const { syncVersion } = useSyncStatus();
  // Mastery changes when a quiz finishes or a sign-in restores history, and progressVersion is
  // the existing signal for exactly that — without it the chips stay stale until the screen
  // unmounts and remounts.
  const { progressVersion } = useAuth();
  const mode = useHybridMode();

  const [search, setSearch] = useState("");
  const [subjects, setSubjects] = useState<SubjectStat[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [pickedSubjectId, setPickedSubjectId] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [levelTarget, setLevelTarget] = useState<DifficultyPickerTarget>(null);
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [insights, setInsights] = useState<Map<string, TopicInsight>>(new Map());
  const [coverage, setCoverage] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    let cancelled = false;
    getSubjectStats(scopedExam, mode)
      .then((rows) => {
        if (!cancelled) setSubjects(rows);
      })
      .catch(() => {
        if (!cancelled) setSubjects([]);
      })
      .finally(() => {
        if (!cancelled) setSubjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scopedExam, mode, syncVersion]);

  /*
   * Selection is DERIVED, not stored by an effect.
   *
   * The obvious version - an effect that selects the first subject once the list arrives - is
   * exactly the `react-hooks/set-state-in-effect` shape this codebase has hit and fixed more
   * than once. Deriving it also handles two cases an effect would have to be taught separately:
   * a sync that removes the chosen subject falls back instead of rendering an empty screen, and
   * the default lands on a subject that actually has questions rather than on an empty one that
   * happens to sort first.
   */
  const selectedSubject = useMemo<SubjectStat | null>(() => {
    if (pickedSubjectId) {
      const picked = subjects.find((s) => s.id === pickedSubjectId);
      if (picked) return picked;
    }
    return subjects.find((s) => s.questionCount > 0) ?? subjects[0] ?? null;
  }, [subjects, pickedSubjectId]);

  const subjectId = selectedSubject?.id ?? null;
  const topicKey = subjectId ? `${scopedExam ?? ""}:${subjectId}` : null;

  /*
   * Topics, held with the key they were loaded for.
   *
   * Same keyed-loaded-state pattern as `ui/PreparationPlanCard.tsx`. Beyond avoiding the lint
   * rule it removes a real defect by construction: switching subject cannot show the previous
   * subject's topics under the new subject's heading, because rows whose key no longer matches
   * are never rendered.
   */
  const [topicState, setTopicState] = useState<{ key: string; rows: TopicStat[] } | null>(null);

  useEffect(() => {
    if (!subjectId || !topicKey) return;
    let cancelled = false;
    getTopicStats(subjectId, scopedExam, mode)
      .then((rows) => {
        if (!cancelled) setTopicState({ key: topicKey, rows });
      })
      .catch(() => {
        if (!cancelled) setTopicState({ key: topicKey, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, topicKey, scopedExam, mode, syncVersion]);

  /*
   * Insights are read separately from the counts, and always from local SQLite even in live mode.
   *
   * They are decoration on a screen that must work regardless: if the intelligence sync has not
   * landed, this resolves to an empty map and every chip renders nothing. Blocking the list on it
   * — or adding an HTTP path for it — would make a screen that works today depend on a feature
   * that is optional by design.
   */
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    getTopicInsights(subjectId, scopedExam && scopedExam !== "ALL" ? scopedExam : null)
      .then((result) => {
        if (!cancelled) setInsights(result);
      })
      .catch((err) => {
        console.warn("Failed to load topic insights", err);
        if (!cancelled) setInsights(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, scopedExam, syncVersion, progressVersion]);

  /*
   * How much of each topic the student has already practised, for the progress bar on a card.
   *
   * Read alongside the insights and on the same signals: `syncVersion` because a sync can add
   * questions to a topic and move the denominator, and `progressVersion` because finishing a
   * quiz moves the numerator — without that second one a student would finish twenty questions,
   * come back, and see the bar unchanged.
   *
   * A failure resolves to an empty map, i.e. every bar at zero, rather than blocking the list.
   */
  useEffect(() => {
    if (!subjectId) return;
    let cancelled = false;
    getTopicCoverage(subjectId, scopedExam)
      .then((result) => {
        if (!cancelled) setCoverage(result);
      })
      .catch((err) => {
        console.warn("Failed to load topic coverage", err);
        if (!cancelled) setCoverage(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [subjectId, scopedExam, syncVersion, progressVersion]);

  const topicsReady = topicState !== null && topicState.key === topicKey;
  // Memoised rather than `topicsReady ? rows : []`: a fresh array literal each render would give
  // the derivations below a new dependency every time and defeat their own memos.
  const topics = useMemo(() => (topicsReady ? topicState.rows : []), [topicsReady, topicState]);

  const rows: TopicRow[] = useMemo(
    () => topics.map((topic) => ({ ...topic, insight: insights.get(topic.id) ?? null })),
    [topics, insights],
  );

  /** Whether anything on this screen actually has a priority to sort by. */
  const hasPriorityData = useMemo(
    () => rows.some((r) => r.insight?.finalPriority !== null && r.insight?.finalPriority !== undefined),
    [rows],
  );

  const query = search.trim().toLowerCase();
  const searching = query.length > 0;

  /*
   * The search box filters two lists: the subjects inside the open dropdown, and the topics of
   * the selected subject. It does NOT search topics across every subject - that would need one
   * read per subject in the syllabus, which in live mode is a round trip each, for a screen whose
   * whole point is to feel immediate. A student looking for a topic in another subject changes
   * subject first, which is one tap away and always visible.
   */
  const visibleSubjects = useMemo(
    () => (query ? subjects.filter((s) => s.name.toLowerCase().includes(query)) : subjects),
    [subjects, query],
  );

  const filteredRows = useMemo(() => {
    const matched = query
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(query) ||
            // Searching a parent name finds its children, which is what someone typing
            // "arithmetic" almost always means.
            (row.insight?.parentName ?? "").toLowerCase().includes(query),
        )
      : rows;

    if (sortMode !== "priority" || !hasPriorityData) return matched;

    // Highest priority first, unscored last, then alphabetical so ties are stable between
    // renders. Sorting a copy - `matched` may be `rows` itself when there is no search.
    return [...matched].sort((a, b) => {
      const pa = a.insight?.finalPriority ?? -1;
      const pb = b.insight?.finalPriority ?? -1;
      if (pa !== pb) return pb - pa;
      return a.name.localeCompare(b.name);
    });
  }, [query, rows, sortMode, hasPriorityData]);

  /*
   * Hierarchy grouping is applied only in syllabus order.
   *
   * The two orderings answer different questions and cannot be combined honestly: priority order
   * is a flat ranking across the whole subject, and forcing it into parent groups would scatter
   * the highest-priority topics down the page under whichever heading they happen to sit in,
   * which defeats the point of ranking them.
   */
  const groups = useMemo(
    () =>
      sortMode === "syllabus"
        ? groupByParent(filteredRows)
        : [{ key: "__flat__", parentName: null, rows: filteredRows }],
    [filteredRows, sortMode],
  );

  const subjectMeta = toSubjectMeta(selectedSubject, selectedSubject?.name ?? "", {
    iconColor: colors.text.secondary,
    iconBg: colors.surfaceElevated2,
  });

  const chooseSubject = (subject: SubjectStat) => {
    setPickedSubjectId(subject.id);
    setDropdownOpen(false);
    trackEvent("practice_subject_selected", { examCode: scopedExam ?? "", subjectId: subject.id });
  };

  const openLevelPicker = (topic: TopicRow) => {
    setDropdownOpen(false);
    setLevelTarget({ id: topic.id, name: topic.name });
  };

  /*
   * The one hand-off to the existing practice engine. Same route, same parameter names and same
   * order the levels screen has always pushed - `subjectName` included, which the quiz and the
   * session summary both read back.
   */
  const startPractice = (levelKey: string, levelLabel: string) => {
    const topic = levelTarget;
    if (!topic) return;
    trackEvent("practice_started", {
      examCode: scopedExam ?? "",
      subjectId: selectedSubject?.id ?? "",
      topicId: topic.id,
      levelKey,
    });
    router.push({
      pathname: "/practice/quiz",
      params: {
        examCode,
        examLabel,
        subjectName: selectedSubject?.name ?? "",
        topicId: topic.id,
        topicName: topic.name,
        levelKey,
        levelLabel,
      },
    });
  };

  const renderTopicCard = (row: TopicRow, index: number, nested: boolean) => {
    const disabled = row.questionCount === 0;
    const insight = row.insight;
    // `Math.min` is belt and braces: the coverage query applies the same subject/exam/deleted
    // predicates as the count, so the numerator is already a subset. It costs nothing, and a
    // bar that renders past full would be the kind of thing nobody notices until a screenshot.
    const practised = Math.min(coverage.get(row.id) ?? 0, row.questionCount);
    const practisedFraction = row.questionCount > 0 ? practised / row.questionCount : 0;

    return (
      <FadeInItem key={row.id} index={index}>
        <Card
          disabled={disabled}
          onPress={() => openLevelPicker(row)}
          style={[styles.card, nested && styles.cardNested]}
        >
          <View style={styles.cardMain}>
            <View style={[styles.iconCircle, { backgroundColor: subjectMeta.iconBg }]}>
              <Ionicons name="document-text-outline" size={18} color={subjectMeta.iconColor} />
            </View>
            <View style={styles.textBlock}>
              {/* In priority order there are no headings, so the parent is shown inline instead —
                  otherwise the hierarchy would be invisible in that mode. */}
              {sortMode === "priority" && insight?.parentName && (
                <Text style={styles.breadcrumb} numberOfLines={1}>
                  {insight.parentName}
                </Text>
              )}
              <Text style={styles.topicName}>{row.name}</Text>
              <Text style={styles.topicStats}>
                {disabled ? t("practice.noQuestionsForExam") : questionsLabel(row.questionCount, t)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
          </View>

          {/*
            Coverage, not volume. `practised` counts DISTINCT questions of this topic the
            student has answered, so the bar genuinely runs 0-100% and fills only by seeing
            new questions — see `getTopicCoverage`. Hidden entirely for a topic with no
            questions, where a 0% bar would be a statement about the student rather than
            about the content.
          */}
          {row.questionCount > 0 && (
            <View style={styles.progressWrap}>
              <AnimatedProgressBar progress={practisedFraction} height={5} style={styles.progressTrack} />
              <Text style={styles.progressLabel}>
                {t("practice.topicCoverage", {
                  done: String(practised),
                  total: String(row.questionCount),
                  percent: String(Math.round(practisedFraction * 100)),
                })}
              </Text>
            </View>
          )}

          {insight && (
            <>
              <View style={styles.chipRow}>
                <PriorityChip
                  finalPriority={insight.finalPriority}
                  adminOverride={insight.adminOverride}
                />
                <MasteryChip state={insight.state} accuracyPercent={insight.accuracyPercent} />
                <TrendChip direction={insight.trendDirection} />
                <WeightageChip
                  curatedWeightagePercent={insight.curatedWeightagePercent}
                  computedWeightagePercent={insight.computedWeightagePercent}
                />
              </View>
              <PrerequisiteNotice unmet={insight.unmetPrerequisites} />
            </>
          )}
        </Card>
      </FadeInItem>
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: examLabel ?? t("nav.practice") }} />
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={22} color={colors.text.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t("practice.searchSubjectsOrTopics")}
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching && (
              <Pressable
                onPress={() => setSearch("")}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t("practice.clearSearch")}
              >
                <Ionicons name="close-circle" size={20} color={colors.text.muted} />
              </Pressable>
            )}
          </View>

          <Text style={styles.title}>{t("nav.practice")}</Text>
          <Text style={styles.subtitle}>{t("practice.browseSubtitle")}</Text>

          {subjectsLoading ? (
            <ListSkeleton count={4} />
          ) : subjects.length === 0 ? (
            mode === "unavailable" ? (
              <OfflineNoDataNotice />
            ) : (
              <EmptyState icon="book-outline" title={t("practice.noSubjects")} body={t("practice.noSubjectsBody")} />
            )
          ) : (
            <>
              <SubjectSelect
                subjects={visibleSubjects}
                selected={selectedSubject}
                open={dropdownOpen}
                onToggle={() => setDropdownOpen((v) => !v)}
                onSelect={chooseSubject}
              />

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel} numberOfLines={1}>
                  {selectedSubject?.name}
                </Text>
                <Text style={styles.sectionCount}>
                  {t("practice.topicCount", { count: String(filteredRows.length) })}
                </Text>
              </View>

              {/* Only offered when there is something to sort by. A toggle that reorders nothing
                  is worse than no toggle - it looks broken. */}
              {hasPriorityData && topicsReady && (
                <View style={styles.sortRow}>
                  {(
                    [
                      { mode: "priority" as SortMode, label: t("practice.sortByPriority") },
                      { mode: "syllabus" as SortMode, label: t("practice.sortBySyllabus") },
                    ] as const
                  ).map((option) => {
                    const active = sortMode === option.mode;
                    return (
                      <Text
                        key={option.mode}
                        onPress={() => setSortMode(option.mode)}
                        style={[styles.sortChip, active && styles.sortChipActive]}
                      >
                        {option.label}
                      </Text>
                    );
                  })}
                </View>
              )}

              {!topicsReady ? (
                <ListSkeleton count={5} />
              ) : filteredRows.length === 0 ? (
                searching ? (
                  <EmptyState icon="search-outline" title={t("practice.noTopicsMatch", { query: search.trim() })} />
                ) : (
                  <EmptyState icon="document-text-outline" title={t("practice.noTopicsAvailable")} />
                )
              ) : (
                <View style={styles.list}>
                  {groups.map((group) => (
                    <View key={group.key} style={group.parentName ? styles.group : undefined}>
                      {group.parentName && (
                        <View style={styles.groupHeader}>
                          <Ionicons name="folder-open-outline" size={13} color={colors.text.secondary} />
                          <Text style={styles.groupTitle}>{group.parentName}</Text>
                        </View>
                      )}
                      <View style={styles.list}>
                        {group.rows.map((row, index) =>
                          renderTopicCard(row, index, group.parentName !== null),
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </ScrollView>

        <DifficultyPickerDialog
          target={levelTarget}
          examCode={scopedExam}
          onClose={() => setLevelTarget(null)}
          onSelect={startPractice}
        />
      </View>
    </>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.base,
      paddingBottom: spacing["3xl"],
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 60,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.base,
      paddingVertical: spacing.sm,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text.primary,
      padding: 0,
    },
    title: {
      fontWeight: "700",
      fontSize: 29,
      lineHeight: 36,
      color: colors.text.primary,
      marginTop: spacing.xl + spacing.xs,
    },
    subtitle: {
      fontWeight: "400",
      fontSize: 16,
      lineHeight: 24,
      color: colors.text.secondary,
      marginTop: spacing.xs,
      marginBottom: spacing.xl,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginTop: spacing.xl + spacing.xs,
      marginBottom: spacing.md,
      paddingHorizontal: spacing.xs,
    },
    sectionLabel: {
      flexShrink: 1,
      fontWeight: "600",
      fontSize: 13,
      lineHeight: 18,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.text.secondary,
    },
    sectionCount: {
      fontWeight: "600",
      fontSize: 13,
      lineHeight: 18,
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.text.muted,
    },
    sortRow: {
      flexDirection: "row",
      gap: spacing.sm,
      marginBottom: spacing.base,
    },
    sortChip: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.text.secondary,
      backgroundColor: colors.surfaceElevated2,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm - 2,
      overflow: "hidden",
    },
    sortChipActive: {
      color: colors.brand.light,
      borderColor: colors.borderAccent,
      backgroundColor: colors.brand.glowSoft,
    },
    list: {
      gap: spacing.sm + 2,
    },
    group: {
      marginBottom: spacing.md,
    },
    groupHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
      marginBottom: spacing.sm,
      marginLeft: spacing.xs,
    },
    groupTitle: {
      ...typography.sectionTitle,
      fontSize: 13,
      color: colors.text.secondary,
    },
    card: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardNested: {
      // A visible indent is what makes the hierarchy readable at a glance; the folder heading
      // alone reads as a section label rather than a parent topic.
      marginLeft: spacing.md,
    },
    cardMain: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    textBlock: {
      flex: 1,
    },
    breadcrumb: {
      fontSize: 10.5,
      fontWeight: "600",
      color: colors.text.muted,
      marginBottom: 1,
    },
    topicName: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text.primary,
    },
    topicStats: {
      fontSize: 12,
      color: colors.text.muted,
      marginTop: 2,
    },
    chipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs + 2,
    },
    progressWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
    },
    progressTrack: {
      flex: 1,
      borderRadius: 3,
    },
    progressLabel: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.text.muted,
    },
  });
