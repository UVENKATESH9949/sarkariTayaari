import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { useHybridMode } from "../../../data/hybridSource";
import {
  getSubjectStats,
  getTopicStats,
  getDifficultyLevels,
  type SubjectStat,
  type TopicStat,
  type DifficultyLevel,
} from "../../../data/practiceData";
import { getTopicInsights, type TopicInsight } from "../../../db/topicIntelligence";
import { countAdHocMock } from "../../../data/adHocMockData";
import { encodeAdHocSpec } from "../../../mockHub/adHocSpecParams";
import { estimateAdHocMinutes } from "../../../mockHub/estimate";
import { topicIconFor } from "../../../mockHub/topicIcon";
import { TopicPriorityBadge } from "../../../mockHub/TopicPriorityBadge";
import type { AdHocMockSpec, MockFormat } from "../../../mockHub/types";
import { toSubjectMeta } from "../../../constants/subjects";
import { SubjectSelect } from "../../../practice/SubjectSelect";
import { MultiSubjectSelect } from "../../../mockHub/MultiSubjectSelect";
import { DifficultyList } from "../../../mockHub/DifficultyList";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { SectionLabel } from "../../../ui/SectionLabel";
import { CardSkeleton } from "../../../ui/Skeleton";
import { spacing, radius } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";
import { questionsLabel } from "@sarkaritaiyaari/core/i18n";

const DEFAULT_QUESTION_COUNT = 20;

/**
 * The one screen behind 5 of the Mock Test Hub's cards (Topic/Subject/Multi-Subject/Speed/
 * Difficulty/PYQ) — which step it shows is entirely driven by `format`, the same "one screen,
 * conditional sections" shape the 2026-09-22 Practice redesign used for
 * `Exam → Subject → Topic → Level` (`practice/browse.tsx`). Weak Area and Revision skip this
 * screen entirely (auto-selected, resolved on the hub) and Full Length keeps its own existing
 * `papers.tsx` flow.
 */
export default function MockTestBuilder() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const mode = useHybridMode();
  const { examCode, examLabel, format } = useLocalSearchParams<{
    examCode: string;
    examLabel: string;
    format: MockFormat;
  }>();

  const [subjects, setSubjects] = useState<SubjectStat[]>([]);
  const [difficultyLevels, setDifficultyLevels] = useState<DifficultyLevel[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  const [subjectOpen, setSubjectOpen] = useState(false);
  const [singleSubject, setSingleSubject] = useState<SubjectStat | null>(null);
  const [multiSubjectIds, setMultiSubjectIds] = useState<Set<string>>(new Set());
  const [difficulty, setDifficulty] = useState<DifficultyLevel | null>(null);

  // Keyed by the subject it was loaded for, the same pattern PreparationPlanCard
  // established: derive "is this stale" by comparing the key to what's currently
  // selected, rather than an effect resetting the list synchronously when the
  // subject changes — see the effect below. `insights` rides along with `rows` — same
  // subject, same key, one Epic L read (`getTopicInsights`) instead of a second effect.
  const [loadedTopics, setLoadedTopics] = useState<{
    subjectId: string;
    rows: TopicStat[];
    insights: Map<string, TopicInsight>;
  } | null>(null);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topic, setTopic] = useState<TopicStat | null>(null);

  // Keyed by the exact `spec` it was resolved for (a stable reference from the `useMemo`
  // below), same reasoning as `loadedTopics`.
  const [loadedCount, setLoadedCount] = useState<{ spec: AdHocMockSpec; count: number } | null>(null);
  const [resolvingCount, setResolvingCount] = useState(false);

  // Multi-Subject/Speed/Difficulty/PYQ all draw from the exam's whole syllabus by default —
  // narrowing which subjects is only a real step for Multi-Subject/Speed.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const subs = await getSubjectStats(examCode, mode);
      if (cancelled) return;
      setSubjects(subs);
      if (format === "speed" || format === "difficulty" || format === "pyq") {
        setMultiSubjectIds(new Set(subs.map((s) => s.id)));
      }
      if (format === "difficulty") {
        const levels = await getDifficultyLevels(mode);
        if (!cancelled) setDifficultyLevels(levels);
      }
      if (!cancelled) setLoadingMeta(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [examCode, mode, format]);

  useEffect(() => {
    if (format !== "topic" || !singleSubject) return;
    let cancelled = false;
    (async () => {
      setLoadingTopics(true);
      // getTopicInsights is local-only (no live/hybrid variant exists anywhere in this app —
      // Practice's own browse.tsx reads it the same direct way), so this card design is
      // honest about it: the priority badge and Attempts/Avg. Score simply don't appear on
      // a device that hasn't synced Epic L's intelligence tables yet, rather than blocking
      // the topic list on it.
      const [rows, insights] = await Promise.all([
        getTopicStats(singleSubject.id, examCode, mode),
        getTopicInsights(singleSubject.id, examCode),
      ]);
      if (cancelled) return;
      setLoadedTopics({ subjectId: singleSubject.id, rows, insights });
      setLoadingTopics(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [format, singleSubject, examCode, mode]);

  const topicsMatchSelection = loadedTopics && singleSubject && loadedTopics.subjectId === singleSubject.id;
  const topics = topicsMatchSelection ? loadedTopics.rows : [];
  const topicInsights = topicsMatchSelection ? loadedTopics.insights : new Map<string, TopicInsight>();

  const spec: AdHocMockSpec | null = useMemo(() => {
    const title = t(`mock.hub.cards.${format}.title`);
    if (format === "topic") {
      if (!topic || !singleSubject) return null;
      return {
        format,
        examCode,
        examLabel,
        title: `${title} — ${topic.name}`,
        subjectIds: [singleSubject.id],
        topicIds: [topic.id],
        questionCount: DEFAULT_QUESTION_COUNT,
      };
    }
    if (format === "subject") {
      if (!singleSubject) return null;
      return {
        format,
        examCode,
        examLabel,
        title: `${title} — ${singleSubject.name}`,
        subjectIds: [singleSubject.id],
        questionCount: DEFAULT_QUESTION_COUNT,
      };
    }
    if (format === "multiSubject" || format === "speed") {
      if (multiSubjectIds.size === 0) return null;
      return {
        format,
        examCode,
        examLabel,
        title,
        subjectIds: Array.from(multiSubjectIds),
        questionCount: DEFAULT_QUESTION_COUNT,
      };
    }
    if (format === "difficulty") {
      if (!difficulty || multiSubjectIds.size === 0) return null;
      return {
        format,
        examCode,
        examLabel,
        title: `${title} — ${difficulty.label}`,
        subjectIds: Array.from(multiSubjectIds),
        difficultyCode: difficulty.code,
        questionCount: DEFAULT_QUESTION_COUNT,
      };
    }
    if (format === "pyq") {
      if (multiSubjectIds.size === 0) return null;
      return {
        format,
        examCode,
        examLabel,
        title,
        subjectIds: Array.from(multiSubjectIds),
        pyqOnly: true,
        questionCount: DEFAULT_QUESTION_COUNT,
      };
    }
    return null;
  }, [format, examCode, examLabel, t, topic, singleSubject, multiSubjectIds, difficulty]);

  useEffect(() => {
    if (!spec) return;
    let cancelled = false;
    (async () => {
      setResolvingCount(true);
      const count = await countAdHocMock(spec, mode);
      if (!cancelled) {
        setLoadedCount({ spec, count });
        setResolvingCount(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spec, mode]);

  const resolvedCount = spec && loadedCount && loadedCount.spec === spec ? loadedCount.count : null;
  const canStart = spec !== null && resolvedCount !== null && resolvedCount > 0;
  const estimatedMinutes = spec ? estimateAdHocMinutes(spec.format, resolvedCount ?? spec.questionCount) : null;

  const startTest = () => {
    if (!spec) return;
    router.push({ pathname: "/mock-test/start", params: { examLabel, adhoc: encodeAdHocSpec(spec) } });
  };

  const toggleMultiSubject = (subjectId: string) => {
    setMultiSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(subjectId)) next.delete(subjectId);
      else next.add(subjectId);
      return next;
    });
  };

  if (loadingMeta) {
    return (
      <View style={styles.container}>
        <ContextualLoading message={t("mock.hub.loadingBuilder")} skeleton={<CardSkeleton height={120} />} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t(`mock.hub.cards.${format}.title`) }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.intro}>{t(`mock.hub.builderIntro.${format}`)}</Text>

        {(format === "topic" || format === "subject") && (
          <>
            <SectionLabel label={t("mock.hub.chooseSubject")} style={styles.sectionLabel} />
            <SubjectSelect
              subjects={subjects}
              selected={singleSubject}
              open={subjectOpen}
              onToggle={() => setSubjectOpen((o) => !o)}
              onSelect={(s) => {
                setSingleSubject(s);
                setSubjectOpen(false);
                setTopic(null);
              }}
            />
          </>
        )}

        {format === "topic" && singleSubject && (
          <>
            <SectionLabel label={t("mock.hub.chooseTopic")} style={styles.sectionLabel} />
            {loadingTopics ? (
              <CardSkeleton height={200} />
            ) : (
              <View style={styles.topicList}>
                {topics.map((row) => {
                  const isSelected = row.id === topic?.id;
                  const insight = topicInsights.get(row.id);
                  const subjectTint = toSubjectMeta(singleSubject, singleSubject.name, {
                    iconColor: colors.brand.light,
                    iconBg: colors.brand.glowSoft,
                  });
                  const avgScoreText =
                    insight?.accuracyPercent !== null && insight?.accuracyPercent !== undefined
                      ? `${Math.round(insight.accuracyPercent)}%`
                      : "—";

                  return (
                    <Card
                      key={row.id}
                      onPress={() => setTopic(row)}
                      style={[styles.topicCard, isSelected && styles.topicCardSelected]}
                    >
                      <View style={styles.topicTopRow}>
                        <View style={[styles.topicIconCircle, { backgroundColor: subjectTint.iconBg }]}>
                          <Ionicons name={topicIconFor(row.name)} size={18} color={subjectTint.iconColor} />
                        </View>
                        <Text style={styles.topicName} numberOfLines={2}>
                          {row.name}
                        </Text>
                        <TopicPriorityBadge
                          finalPriority={insight?.finalPriority ?? null}
                          adminOverride={insight?.adminOverride}
                        />
                        <Ionicons
                          name={isSelected ? "checkmark-circle" : "chevron-forward"}
                          size={18}
                          color={isSelected ? colors.brand.primary : colors.text.muted}
                        />
                      </View>

                      <View style={styles.topicStatsRow}>
                        <View style={styles.topicStatItem}>
                          <View style={styles.topicStatTopRow}>
                            <Ionicons name="play-circle-outline" size={14} color={colors.brand.primary} />
                            <Text style={styles.topicStatValue}>{insight?.attemptedCount ?? 0}</Text>
                          </View>
                          <Text style={styles.topicStatLabel}>{t("mock.hub.attemptsLabel")}</Text>
                        </View>
                        <View style={styles.topicStatItem}>
                          <View style={styles.topicStatTopRow}>
                            <Ionicons name="document-text-outline" size={14} color={colors.brand.primary} />
                            <Text style={styles.topicStatValue}>{row.questionCount}</Text>
                          </View>
                          <Text style={styles.topicStatLabel}>{questionsLabel(row.questionCount, t)}</Text>
                        </View>
                        <View style={styles.topicStatItem}>
                          <View style={styles.topicStatTopRow}>
                            <Ionicons name="locate-outline" size={14} color={colors.brand.primary} />
                            <Text style={styles.topicStatValue}>{avgScoreText}</Text>
                          </View>
                          <Text style={styles.topicStatLabel}>{t("mock.hub.avgScoreLabel")}</Text>
                        </View>
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </>
        )}

        {(format === "multiSubject" || format === "speed") && (
          <>
            <SectionLabel label={t("mock.hub.chooseSubjects")} style={styles.sectionLabel} />
            <MultiSubjectSelect subjects={subjects} selectedIds={multiSubjectIds} onToggle={toggleMultiSubject} />
          </>
        )}

        {format === "difficulty" && (
          <>
            <SectionLabel label={t("mock.hub.chooseDifficulty")} style={styles.sectionLabel} />
            <DifficultyList levels={difficultyLevels} selected={difficulty} onSelect={setDifficulty} />
          </>
        )}

        <View style={styles.summary}>
          <View style={styles.summaryRow}>
            <Ionicons name="help-circle-outline" size={18} color={colors.brand.primary} />
            <Text style={styles.summaryText}>
              {resolvingCount
                ? t("mock.hub.resolvingCount")
                : resolvedCount === null
                  ? t("mock.hub.pickToContinue")
                  : t("mock.hub.questionsReady", { count: Math.min(resolvedCount, DEFAULT_QUESTION_COUNT) })}
            </Text>
          </View>
          {estimatedMinutes !== null && (
            <View style={styles.summaryRow}>
              <Ionicons name="time-outline" size={18} color={colors.brand.primary} />
              <Text style={styles.summaryText}>{t("mock.hub.estimatedMinutes", { minutes: estimatedMinutes })}</Text>
            </View>
          )}
        </View>

        <Button size="lg" disabled={!canStart} onPress={startTest}>
          {canStart ? t("mock.startTest") : t("mock.startTestDisabled")}
        </Button>
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    intro: {
      ...typography.secondary,
      marginBottom: spacing.lg,
      lineHeight: 19,
    },
    sectionLabel: {
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    topicList: {
      gap: spacing.md,
    },
    topicCard: {
      gap: spacing.md,
    },
    topicCardSelected: {
      borderColor: colors.brand.primary,
    },
    topicTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm + 2,
    },
    topicIconCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
    },
    topicName: {
      flex: 1,
      fontSize: 15.5,
      fontWeight: "700",
      color: colors.text.primary,
    },
    topicStatsRow: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: colors.borderSubtle,
      paddingTop: spacing.sm + 2,
    },
    topicStatItem: {
      flex: 1,
      gap: 2,
    },
    topicStatTopRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
    },
    topicStatValue: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    topicStatLabel: {
      fontSize: 11,
      color: colors.text.muted,
    },
    summary: {
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.md,
      padding: spacing.base,
      marginTop: spacing.xl,
      marginBottom: spacing.lg,
      gap: spacing.sm,
    },
    summaryRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    summaryText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
  });
