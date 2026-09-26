import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { getRadar } from "../../../data/weaknessRadarData";
import { useSessionHistory } from "../../../practice/sessionHistory";
import { getWrongAnswers } from "../../../practice/wrongAnswers";
import { encodeAdHocSpec } from "../../../mockHub/adHocSpecParams";
import type { AdHocMockSpec, MockFormat } from "../../../mockHub/types";
import { Badge } from "../../../ui/Badge";
import { Card } from "../../../ui/Card";
import { IconBox } from "../../../ui/IconBox";
import { SectionLabel } from "../../../ui/SectionLabel";
import { radius, spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";

/**
 * Every syllabus-derived format shares one flat `AdHocMockSpec` shape, so the two
 * downstream screens (`start.tsx`/`test.tsx`) never need to know there are 8 different
 * ways one could have been built — see `mockHub/types.ts`.
 */
type ChipKey = "all" | "topic" | "subject" | "speed" | "pyq" | "full" | "personalized";

type HubCard = {
  format: MockFormat;
  chip: ChipKey;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  personalized?: boolean;
  /** Full Length routes to the existing papers.tsx; every other format routes to builder.tsx (or, for the two auto-selected ones, straight to start.tsx once resolved). */
  needsBuilder: boolean;
};

const CARDS: HubCard[] = [
  { format: "topic", chip: "topic", icon: "locate-outline", color: "#7C6CF6", needsBuilder: true },
  { format: "subject", chip: "subject", icon: "book-outline", color: "#3B82F6", needsBuilder: true },
  { format: "multiSubject", chip: "subject", icon: "layers-outline", color: "#14B8A6", needsBuilder: true },
  { format: "speed", chip: "speed", icon: "stopwatch-outline", color: "#F59E0B", needsBuilder: true },
  { format: "difficulty", chip: "speed", icon: "bar-chart-outline", color: "#F43F5E", needsBuilder: true },
  { format: "pyq", chip: "pyq", icon: "calendar-outline", color: "#6366F1", needsBuilder: true },
  { format: "fullLength", chip: "full", icon: "document-text-outline", color: "#10B981", needsBuilder: false },
  { format: "weakArea", chip: "personalized", icon: "pulse-outline", color: "#D946EF", personalized: true, needsBuilder: false },
  { format: "revision", chip: "personalized", icon: "refresh-outline", color: "#0EA5E9", personalized: true, needsBuilder: false },
];

const CHIPS: ChipKey[] = ["all", "topic", "subject", "speed", "pyq", "full", "personalized"];

const WEAK_AREA_TOPIC_CAP = 5;
const WEAK_AREA_QUESTIONS_PER_TOPIC = 4;
const REVISION_QUESTION_CAP = 20;

export default function MockTestHub() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  const router = useRouter();
  const { examCode, examLabel } = useLocalSearchParams<{ examCode: string; examLabel: string }>();
  const { sessions } = useSessionHistory();

  const [filter, setFilter] = useState<ChipKey>("all");
  const [resolvingFormat, setResolvingFormat] = useState<MockFormat | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A plain click handler, not an effect — the notice only ever needs clearing in
  // response to the one discrete action (picking a chip) that could make it stale.
  const changeFilter = (next: ChipKey) => {
    setFilter(next);
    setNotice(null);
  };

  const visibleCards = useMemo(
    () => (filter === "all" ? CARDS : CARDS.filter((c) => c.chip === filter)),
    [filter],
  );

  const openBuilder = (format: MockFormat) => {
    router.push({ pathname: "/mock-test/builder", params: { examCode, examLabel, format } });
  };

  const openStart = (spec: AdHocMockSpec) => {
    router.push({ pathname: "/mock-test/start", params: { examLabel, adhoc: encodeAdHocSpec(spec) } });
  };

  const openWeakArea = async () => {
    setResolvingFormat("weakArea");
    setNotice(null);
    try {
      const { radar } = await getRadar({ examCode });
      const weakTopics = radar.topics
        .filter((topic) => topic.state === "NEEDS_ATTENTION" || topic.state === "NEEDS_REVISION")
        .slice(0, WEAK_AREA_TOPIC_CAP);
      if (weakTopics.length === 0) {
        setNotice(t("mock.hub.weakAreaEmpty"));
        return;
      }
      const topicIds = weakTopics.map((topic) => topic.topicId);
      const subjectIds = Array.from(new Set(weakTopics.map((topic) => topic.subjectId)));
      const questionCount = weakTopics.length * WEAK_AREA_QUESTIONS_PER_TOPIC;
      openStart({
        format: "weakArea",
        examCode,
        examLabel,
        title: t("mock.hub.cards.weakArea.title"),
        subjectIds,
        topicIds,
        questionCount,
      });
    } finally {
      setResolvingFormat(null);
    }
  };

  const openRevision = () => {
    setNotice(null);
    // Only sessions this device actually recorded an exam code for — a session from before
    // that column existed (or the cross-exam "All Government Exams" shortcut) is excluded
    // rather than guessed into this exam's revision set.
    const scoped = sessions.filter((s) => s.examCode === examCode);
    const wrongAnswers = getWrongAnswers(scoped).slice(0, REVISION_QUESTION_CAP);
    if (wrongAnswers.length === 0) {
      setNotice(t("mock.hub.revisionEmpty"));
      return;
    }
    openStart({
      format: "revision",
      examCode,
      examLabel,
      title: t("mock.hub.cards.revision.title"),
      subjectIds: [],
      questionIds: wrongAnswers.map((w) => w.id),
      questionCount: wrongAnswers.length,
    });
  };

  const handleCardPress = (card: HubCard) => {
    if (card.format === "fullLength") {
      router.push({ pathname: "/mock-test/papers", params: { examCode, examLabel } });
      return;
    }
    if (card.format === "weakArea") {
      openWeakArea();
      return;
    }
    if (card.format === "revision") {
      openRevision();
      return;
    }
    openBuilder(card.format);
  };

  return (
    <>
      <Stack.Screen options={{ title: examLabel ?? t("mock.hub.title") }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{t("mock.hub.eyebrow")}</Text>
          <Text style={styles.heroTitle}>{t("mock.hub.heroTitle")}</Text>
          <Text style={styles.heroSubtitle}>{t("mock.hub.heroSubtitle")}</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chipRowContent}>
          {CHIPS.map((chip) => {
            const active = filter === chip;
            return (
              <Pressable
                key={chip}
                onPress={() => changeFilter(chip)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(`mock.hub.chips.${chip}`)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <SectionLabel
          label={t("mock.hub.allFormats")}
          count={t(visibleCards.length === 1 ? "mock.hub.formatCountOne" : "mock.hub.formatCountOther", {
            count: visibleCards.length,
          })}
          style={styles.sectionLabel}
        />
        <Text style={styles.sectionBody}>{t("mock.hub.sectionBody")}</Text>

        {notice && (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={16} color={colors.semantic.warning} />
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        )}

        <View style={styles.grid}>
          {visibleCards.map((card) => {
            const resolving = resolvingFormat === card.format;
            return (
              <Pressable
                key={card.format}
                disabled={resolving}
                onPress={() => handleCardPress(card)}
                accessibilityRole="button"
                style={{ flexBasis: "48%", flexGrow: 1 }}
              >
                <Card style={styles.card}>
                  {card.personalized && (
                    <View style={styles.badgeWrap}>
                      <Badge label={t("mock.hub.personalized")} variant="success" />
                    </View>
                  )}
                  <IconBox icon={card.icon} size={36} iconSize={18} backgroundColor={card.color} />
                  <Text style={styles.cardTitle}>{t(`mock.hub.cards.${card.format}.title`)}</Text>
                  <Text style={styles.cardDesc} numberOfLines={3}>
                    {t(`mock.hub.cards.${card.format}.desc`)}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardStat}>{t(`mock.hub.cards.${card.format}.stat`)}</Text>
                    {resolving ? (
                      <ActivityIndicator size="small" color={colors.text.muted} />
                    ) : (
                      <Ionicons name="chevron-forward" size={14} color={colors.text.muted} />
                    )}
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingTop: spacing.xl,
      paddingBottom: spacing["3xl"],
    },
    hero: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius["2xl"],
      padding: spacing.base + 4,
    },
    heroEyebrow: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.brand.light,
    },
    heroTitle: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text.primary,
      marginTop: spacing.xs,
    },
    heroSubtitle: {
      fontSize: 12.5,
      color: colors.text.muted,
      marginTop: spacing.xs,
      lineHeight: 18,
    },
    chipRow: {
      marginTop: spacing.base + 2,
    },
    chipRowContent: {
      gap: spacing.sm,
      paddingRight: spacing.lg,
    },
    chip: {
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
    chipActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.secondary,
    },
    chipTextActive: {
      color: colors.text.onAccent,
    },
    sectionLabel: {
      marginTop: spacing.xl,
      marginBottom: spacing.xs,
    },
    sectionBody: {
      fontSize: 12.5,
      color: colors.text.muted,
      lineHeight: 18,
      marginBottom: spacing.md,
    },
    notice: {
      flexDirection: "row",
      gap: spacing.sm,
      backgroundColor: colors.semantic.warningBg,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      alignItems: "flex-start",
    },
    noticeText: {
      flex: 1,
      fontSize: 12.5,
      color: colors.semantic.warning,
      lineHeight: 17,
    },
    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm + 2,
    },
    card: {
      gap: spacing.sm,
      borderRadius: radius.xl,
      padding: spacing.md + 2,
      minHeight: 150,
    },
    badgeWrap: {
      position: "absolute",
      top: spacing.sm,
      right: spacing.sm,
    },
    cardTitle: {
      fontSize: 13.5,
      fontWeight: "700",
      color: colors.text.primary,
    },
    cardDesc: {
      fontSize: 11.5,
      color: colors.text.muted,
      lineHeight: 16,
    },
    cardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: "auto",
      paddingTop: spacing.xs,
    },
    cardStat: {
      fontSize: 10.5,
      fontWeight: "600",
      color: colors.text.muted,
    },
  });
