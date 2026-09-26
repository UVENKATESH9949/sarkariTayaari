import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View, StyleSheet } from "react-native";
import type { PracticeResultAnalytics } from "@sarkaritaiyaari/core/analytics";
import { loadPracticeResultInsight, type PracticeResultInsightState } from "../ai/practiceResultInsight";
import type { SessionRecord } from "../db/practiceSessions";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

type Props = {
  session: SessionRecord;
  analytics: PracticeResultAnalytics;
  examCode: string | null;
  subjectName: string;
  topicName: string;
  levelLabel: string;
  languageCode: string;
};

/**
 * The Practice Result screen's third tab. Generated only once mounted — this component is only
 * rendered at all once the student taps the "AI Feedback" tab (see `summary.tsx`), which is what
 * makes "never call AI on page load" (§8/§15 of the spec) hold without a separate guard here.
 *
 * Keyed loaded-state, the same `PreparationPlanCard` pattern this codebase uses everywhere else
 * to avoid `react-hooks/set-state-in-effect` — comparing the stored session id against the
 * current one rather than a synchronous reset at the top of the effect.
 */
export function AiFeedbackTab({ session, analytics, examCode, subjectName, topicName, levelLabel, languageCode }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  // Bumped by the Retry button so the effect re-fires without needing a second effect. Folded
  // into the loaded-state key (rather than session id alone) so a retry falls back to the
  // "loading" render below immediately, instead of showing the stale error until the new
  // attempt resolves.
  const [retryToken, setRetryToken] = useState(0);
  const key = `${session.id}:${retryToken}`;
  const [loaded, setLoaded] = useState<{ key: string; state: PracticeResultInsightState } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPracticeResultInsight({ session, analytics, examCode, subjectName, topicName, levelLabel, languageCode }).then(
      (state) => {
        if (!cancelled) setLoaded({ key, state });
      },
    );
    return () => {
      cancelled = true;
    };
    // session/analytics/examCode/subjectName/topicName/levelLabel/languageCode are all derived
    // from the same session this effect is already keyed on — re-listing them would just
    // re-trigger on every parent re-render without changing what actually gets fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const state: PracticeResultInsightState = loaded && loaded.key === key ? loaded.state : { status: "loading" };

  if (state.status === "loading") {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.loadingTitle}>{t("aiFeedbackTab.loadingTitle")}</Text>
        <View style={styles.loadingList}>
          <Text style={styles.loadingItem}>{t("aiFeedbackTab.loadingAccuracy")}</Text>
          <Text style={styles.loadingItem}>{t("aiFeedbackTab.loadingTime")}</Text>
          <Text style={styles.loadingItem}>{t("aiFeedbackTab.loadingStrengths")}</Text>
          <Text style={styles.loadingItem}>{t("aiFeedbackTab.loadingWeak")}</Text>
        </View>
      </View>
    );
  }

  if (state.status === "disabled") {
    return (
      <View style={styles.centered}>
        <Ionicons name="sparkles-outline" size={28} color={colors.text.muted} />
        <Text style={styles.disabledTitle}>{t("aiFeedbackTab.title")}</Text>
        <Text style={styles.disabledBody}>{t("aiFeedbackTab.disabledBody")}</Text>
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorBody}>{t("aiFeedbackTab.errorBody")}</Text>
        <Button variant="secondary" onPress={() => setRetryToken((n) => n + 1)}>
          {t("common.tryAgain")}
        </Button>
      </View>
    );
  }

  const { insight } = state;

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons name="sparkles" size={16} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t("aiFeedbackTab.overallInsight")}</Text>
        </View>
        <Text style={styles.summaryText}>{insight.summary}</Text>
      </Card>

      {insight.strengths.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="thumbs-up" size={16} color={colors.semantic.success} />
            <Text style={styles.sectionTitle}>{t("aiFeedbackTab.strengths")}</Text>
          </View>
          {insight.strengths.map((point, i) => (
            <Text key={i} style={styles.bullet}>
              {"• "}
              {point}
            </Text>
          ))}
        </Card>
      )}

      {insight.weakAreas.length > 0 && (
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle" size={16} color={colors.semantic.error} />
            <Text style={styles.sectionTitle}>{t("aiFeedbackTab.weakAreas")}</Text>
          </View>
          {insight.weakAreas.map((point, i) => (
            <Text key={i} style={styles.bullet}>
              {"• "}
              {point}
            </Text>
          ))}
        </Card>
      )}

      {insight.timeInsight && (
        <Card style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={16} color={colors.brand.primary} />
            <Text style={styles.sectionTitle}>{t("aiFeedbackTab.timeInsight")}</Text>
          </View>
          <Text style={styles.summaryText}>{insight.timeInsight}</Text>
        </Card>
      )}

      <Card style={styles.card}>
        <View style={styles.sectionHeader}>
          <Ionicons name="flag" size={16} color={colors.brand.primary} />
          <Text style={styles.sectionTitle}>{t("aiFeedbackTab.recommendedNextStep")}</Text>
        </View>
        <Text style={styles.summaryText}>{insight.recommendation}</Text>
      </Card>

      <Text style={styles.footer}>{t("ai.footer")}</Text>
    </View>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: { width: "100%", gap: spacing.md },
    card: { width: "100%", gap: spacing.sm },
    sectionHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
    sectionTitle: { fontSize: 13.5, fontWeight: "700", color: colors.text.primary, textTransform: "uppercase", letterSpacing: 0.3 },
    summaryText: { fontSize: 14, lineHeight: 21, color: colors.text.primary },
    bullet: { fontSize: 13.5, lineHeight: 20, color: colors.text.secondary },
    centered: { width: "100%", alignItems: "center", paddingVertical: spacing["2xl"], gap: spacing.sm },
    loadingTitle: { fontSize: 14, fontWeight: "600", color: colors.text.primary, marginTop: spacing.sm },
    loadingList: { marginTop: spacing.xs, alignItems: "center" },
    loadingItem: { fontSize: 12.5, color: colors.text.muted, lineHeight: 19 },
    disabledTitle: { fontSize: 15, fontWeight: "700", color: colors.text.primary },
    disabledBody: { fontSize: 13, color: colors.text.muted, textAlign: "center", paddingHorizontal: spacing.xl },
    errorBody: { fontSize: 13.5, color: colors.text.secondary, textAlign: "center", paddingHorizontal: spacing.xl },
    footer: { fontSize: 11, color: colors.text.muted, textAlign: "center" },
  });
