import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { toSubjectMeta } from "../../../constants/subjects";
import { getTopicStats, type TopicStat } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { getSubjectMetaByName, type SubjectMetaRow } from "../../../db/subjectMeta";
import { getTopicInsights, type TopicInsight } from "../../../db/topicIntelligence";
import { useAuth } from "../../../practice/authContext";
import { useSyncStatus } from "../../../sync/SyncContext";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ListSkeleton } from "../../../ui/Skeleton";
import {
  MasteryChip,
  PrerequisiteNotice,
  PriorityChip,
  TrendChip,
  WeightageChip,
} from "../../../ui/TopicInsightChips";
import { colors, radius, spacing, typography } from "../../../ui/theme";

function questionsLabel(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

/** The two orderings the list can be in. */
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

export default function Topics() {
  const router = useRouter();
  const { examCode, examLabel, subjectId, subjectName } = useLocalSearchParams<{
    examCode: string;
    examLabel: string;
    subjectId: string;
    subjectName: string;
  }>();
  const [search, setSearch] = useState("");
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [insights, setInsights] = useState<Map<string, TopicInsight>>(new Map());
  const [subjectStyle, setSubjectStyle] = useState<SubjectMetaRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const { syncVersion } = useSyncStatus();
  // Mastery changes when a quiz finishes or a sign-in restores history, and progressVersion is
  // the existing signal for exactly that — without it the chips stay stale until the screen
  // unmounts and remounts.
  const { progressVersion } = useAuth();
  const mode = useHybridMode();

  useEffect(() => {
    if (!subjectId) return;
    getTopicStats(subjectId, examCode ?? null, mode).then((result) => {
      setTopics(result);
      setLoading(false);
    });
  }, [subjectId, examCode, syncVersion, mode]);

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
    getTopicInsights(subjectId, examCode && examCode !== "ALL" ? examCode : null)
      .then(setInsights)
      .catch((err) => {
        console.warn("Failed to load topic insights", err);
        setInsights(new Map());
      });
  }, [subjectId, examCode, syncVersion, progressVersion]);

  // Styling is synced per subject rather than looked up from a hardcoded table.
  useEffect(() => {
    if (!subjectName) return;
    getSubjectMetaByName(subjectName).then(setSubjectStyle);
  }, [subjectName]);

  const subjectMeta = toSubjectMeta(subjectStyle, subjectName ?? "");

  const rows: TopicRow[] = useMemo(
    () => topics.map((topic) => ({ ...topic, insight: insights.get(topic.id) ?? null })),
    [topics, insights],
  );

  /** Whether anything on this screen actually has a priority to sort by. */
  const hasPriorityData = useMemo(
    () => rows.some((r) => r.insight?.finalPriority !== null && r.insight?.finalPriority !== undefined),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
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
  }, [search, rows, sortMode, hasPriorityData]);

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

  const openLevels = (topic: TopicRow) => {
    router.push({
      pathname: "/practice/levels",
      params: { examCode, examLabel, subjectName, topicId: topic.id, topicName: topic.name },
    });
  };

  const renderTopicCard = (row: TopicRow, index: number, nested: boolean) => {
    const disabled = row.questionCount === 0;
    const insight = row.insight;

    return (
      <FadeInItem key={row.id} index={index}>
        <Card
          disabled={disabled}
          onPress={() => openLevels(row)}
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
                {disabled ? "No questions yet" : questionsLabel(row.questionCount)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
          </View>

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
      <Stack.Screen options={{ title: subjectName ?? "Topics" }} />
      <View style={styles.screen}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search topics in ${subjectName ?? "this subject"}...`}
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.heading}>Choose a topic</Text>
          <Text style={styles.subheading}>
            {topics.length} topics under {subjectName}
          </Text>

          {/* Only offered when there is something to sort by. A toggle that reorders nothing is
              worse than no toggle - it looks broken. */}
          {hasPriorityData && !loading && (
            <View style={styles.sortRow}>
              {(
                [
                  { mode: "priority" as SortMode, label: "By priority", icon: "flame-outline" },
                  { mode: "syllabus" as SortMode, label: "Syllabus order", icon: "list-outline" },
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

          {loading ? (
            <ContextualLoading
              message={`Preparing topics for ${subjectName ?? "this subject"}...`}
              skeleton={<ListSkeleton count={6} />}
            />
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

              {filteredRows.length === 0 && topics.length > 0 && (
                <EmptyState icon="search-outline" title={`No topics match "${search}"`} />
              )}
              {topics.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
              {topics.length === 0 && mode !== "unavailable" && (
                <EmptyState
                  icon="document-text-outline"
                  title="No topics synced yet"
                  body="Topics appear here once they're synced."
                />
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </>
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
  container: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing["3xl"],
  },
  heading: {
    ...typography.pageTitle,
    fontSize: 22,
  },
  subheading: {
    ...typography.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.base,
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
});
