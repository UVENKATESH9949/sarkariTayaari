import { useEffect, useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { REASON_COPY, RadarStatePill, stateVisual } from "../intelligence/radarPresentation";
import type { RadarTopic } from "@sarkaritaiyaari/core/intelligence";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";

/**
 * One topic's diagnosis and plan — the supplied Weakness Radar spec's §17.
 *
 * ## Why this takes the topic as a route param instead of re-fetching it
 *
 * The radar endpoint returns full per-topic detail in one payload precisely so this screen
 * needs no second call — which is what makes it work offline from the same cached response
 * (§15/§21). Re-fetching here would undo that and add a spinner to a screen that already has
 * everything it needs. The trade-off is that a deep link straight to this route has nothing to
 * show, which is handled explicitly below rather than crashing.
 *
 * ## What is deliberately not shown
 *
 * Confidence, in any form. §11 requires it to stay internal, and it already did its job
 * server-side by gating whether a verdict was asserted at all. What replaces it is the
 * evidence line ("30 questions answered"), which is the same information in a form a student
 * can act on. Speed, likewise, is shown as unavailable rather than as a default pace — there
 * is no expected-time benchmark in this app, and §9/§21 both forbid inventing one.
 *
 * English-only, matching the sibling screen and every screen added since the Exam Guide work.
 */
export default function RadarTopicScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const router = useRouter();
  const { examCode, examName, payload } = useLocalSearchParams<{
    examCode: string;
    examName?: string;
    topicId?: string;
    payload?: string;
  }>();

  const topic = useMemo<RadarTopic | null>(() => {
    if (!payload) return null;
    try {
      return JSON.parse(payload) as RadarTopic;
    } catch {
      return null;
    }
  }, [payload]);

  useEffect(() => {
    if (topic) trackEvent("radar_topic_detail_viewed", { examCode, topicId: topic.topicId, state: topic.state });
  }, [examCode, topic]);

  if (!topic) {
    return (
      <>
        <Stack.Screen options={{ title: "Topic" }} />
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="help-circle-outline"
            title="Nothing to show"
            body="Open this from your Preparation Radar so it has the topic's details to work with."
            action={{ label: "Open Preparation Radar", onPress: () => router.replace({ pathname: "/preparation-radar", params: { examCode, examName: examName ?? "" } }) }}
          />
        </View>
      </>
    );
  }

  const visual = stateVisual(topic.state);

  function startPractice() {
    trackEvent("radar_practice_started", {
      examCode,
      topicId: topic!.topicId,
      action: topic!.recommendedAction.primary,
    });
    // The same Practice route every other entry point in this app uses — Practice's own topic
    // list, the Exam Guide's syllabus page, and the Prepare checklist all land here. A
    // separate "radar practice" flow would be a second way to start a quiz, and the levels
    // screen is where difficulty is chosen anyway.
    router.push({
      pathname: "/practice/levels",
      params: {
        examCode: examCode ?? "",
        examLabel: examName ?? "",
        subjectName: topic!.subjectName,
        topicId: topic!.topicId,
        topicName: topic!.topicName,
      },
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: topic.topicName }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.topicName}>{topic.topicName}</Text>
            <Text style={styles.subject}>
              {topic.parentTopicName ? `${topic.subjectName} · ${topic.parentTopicName}` : topic.subjectName}
            </Text>
          </View>
          <RadarStatePill state={topic.state} />
        </View>

        {/* §17: the status, then plainly why it has that status. */}
        <Card variant="container" style={styles.whyCard}>
          <View style={styles.whyHeader}>
            <Ionicons name={visual.icon} size={18} color={visual.color(colors)} />
            <Text style={[styles.whyTitle, { color: visual.color(colors) }]}>{visual.label}</Text>
          </View>
          <Text style={styles.whyBody}>{topic.explanation}</Text>
          {topic.reasonCodes.length > 0 ? (
            <View style={styles.reasonList}>
              {topic.reasonCodes.map((code) => (
                <View key={code} style={styles.reasonRow}>
                  <Ionicons name="ellipse" size={5} color={colors.text.muted} style={styles.bullet} />
                  <Text style={styles.reasonText}>{REASON_COPY[code]}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>

        {/* The numbers, at the precision they deserve (§18) — whole percentages, no scores. */}
        <Card variant="container" style={styles.factsCard}>
          <Fact label="Accuracy" value={topic.accuracyPercent === null ? null : `${topic.accuracyPercent}%`} styles={styles} />
          <Fact
            label="Questions answered"
            value={topic.attemptedCount === 0 ? null : `${topic.correctCount} of ${topic.attemptedCount} correct`}
            styles={styles}
          />
          <Fact
            label="Recent vs earlier"
            value={
              topic.recentAccuracyPercent === null || topic.historicalAccuracyPercent === null
                ? null
                : `${topic.historicalAccuracyPercent}% → ${topic.recentAccuracyPercent}%`
            }
            hint={
              topic.trendDelta === null
                ? "Not enough practice in both periods to compare yet"
                : topic.trendDelta > 0
                  ? `Up ${topic.trendDelta} points`
                  : topic.trendDelta < 0
                    ? `Down ${Math.abs(topic.trendDelta)} points`
                    : "Holding steady"
            }
            styles={styles}
          />
          <Fact
            label="Real exam questions"
            value={
              topic.pyqAccuracyPercent === null
                ? null
                : `${topic.pyqAccuracyPercent}% across ${topic.pyqAttemptedCount}`
            }
            hint={
              topic.pyqAccuracyPercent === null
                ? topic.pyqAttemptedCount > 0
                  ? `Only ${topic.pyqAttemptedCount} answered so far — not enough to read into`
                  : "None answered yet"
                : undefined
            }
            styles={styles}
          />
          {/*
           * Shown as absent on purpose, rather than omitted. §21 wants a missing signal to
           * read as missing; quietly leaving the row out would let a student assume their pace
           * was fine, which is a claim this app cannot make.
           */}
          <Fact
            label="Speed"
            value={topic.speedAvailable ? "Measured" : null}
            hint="Not measured yet — we don't have a reliable time benchmark for these questions"
            styles={styles}
          />
          <Fact
            label="Consistency"
            value={
              topic.consistency === "UNKNOWN"
                ? null
                : topic.consistency === "STEADY"
                  ? "Steady across sessions"
                  : "Swings between sessions"
            }
            styles={styles}
          />
        </Card>

        {topic.unmetPrerequisites.length > 0 ? (
          <Card variant="container" style={styles.prereqCard}>
            <Text style={styles.prereqTitle}>Build these first</Text>
            <Text style={styles.prereqBody}>
              {topic.topicName} builds on {topic.unmetPrerequisites.length === 1 ? "a topic" : "topics"} that
              {topic.unmetPrerequisites.length === 1 ? " isn't" : " aren't"} solid yet:
            </Text>
            {topic.unmetPrerequisites.map((prereq) => (
              <Text key={prereq.topicId} style={styles.prereqName}>
                · {prereq.topicName}
              </Text>
            ))}
          </Card>
        ) : null}

        {/* §14/§17: the plan. The most important thing on the screen. */}
        <Card variant="container" style={styles.planCard}>
          <Text style={styles.planTitle}>Recommended</Text>
          {topic.recommendedAction.steps.map((step, index) => (
            <View key={`${step.action}-${index}`} style={styles.stepRow}>
              <Text style={styles.stepArrow}>→</Text>
              <Text style={styles.stepText}>{stepLabel(step.action, step.questionCount)}</Text>
            </View>
          ))}
          {topic.questionCount === 0 ? (
            <Text style={styles.planNote}>
              There are no practice questions for this topic and exam yet, so the plan starts with the concept.
            </Text>
          ) : null}
        </Card>

        <Button onPress={startPractice} disabled={topic.questionCount === 0}>
          {topic.questionCount === 0 ? "Browse this topic" : "Start recommended practice"}
        </Button>
        {topic.questionCount === 0 ? (
          <Text style={styles.disabledNote}>Practice opens up here once questions are added for this exam.</Text>
        ) : null}
      </ScrollView>
    </>
  );
}

function Fact({
  label,
  value,
  hint,
  styles,
}: {
  label: string;
  value: string | null;
  hint?: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <View style={styles.factValueWrap}>
        {/* An em dash, not a zero: "no data" and "zero" are different facts (§21). */}
        <Text style={[styles.factValue, value === null && styles.factValueAbsent]}>{value ?? "—"}</Text>
        {hint ? <Text style={styles.factHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

/** The step list's copy. Counts come from the server's rule table, never invented here. */
function stepLabel(action: string, questionCount: number | null): string {
  switch (action) {
    case "LEARN_CONCEPT":
      return "Review the concept before more questions";
    case "REVISION":
      return "Revise what you already knew here";
    case "PRACTICE_FOUNDATIONAL":
      return `Practise ${questionCount ?? 10} easier questions to rebuild the basics`;
    case "PRACTICE_MEDIUM":
      return `Practise ${questionCount ?? 10} questions at exam level`;
    case "PRACTICE_ADVANCED":
      return `Try ${questionCount ?? 10} harder questions to stay sharp`;
    case "PRACTICE_PYQ":
      return `Solve ${questionCount ?? 10} real previous-year questions`;
    case "TIMED_PRACTICE":
      return "Finish with a timed mini-test";
    case "MAINTENANCE_PRACTICE":
      return "Light practice to keep this topic warm";
    default:
      return `Practise ${questionCount ?? 10} questions`;
  }
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
      gap: spacing.md,
    },
    emptyWrap: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    headerText: {
      flex: 1,
    },
    topicName: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text.primary,
    },
    subject: {
      fontSize: 12.5,
      color: colors.text.muted,
      marginTop: 2,
    },
    whyCard: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    whyHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs + 2,
    },
    whyTitle: {
      fontSize: 15,
      fontWeight: "700",
    },
    whyBody: {
      fontSize: 13.5,
      lineHeight: 20,
      color: colors.text.primary,
    },
    reasonList: {
      gap: spacing.xs + 2,
      marginTop: spacing.xs,
    },
    reasonRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    bullet: {
      marginTop: 6,
    },
    reasonText: {
      flex: 1,
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    factsCard: {
      padding: spacing.md,
    },
    factRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderSubtle,
      gap: spacing.md,
    },
    factLabel: {
      fontSize: 13,
      color: colors.text.secondary,
      flexShrink: 0,
    },
    factValueWrap: {
      flex: 1,
      alignItems: "flex-end",
    },
    factValue: {
      fontSize: 13.5,
      fontWeight: "600",
      color: colors.text.primary,
      textAlign: "right",
    },
    factValueAbsent: {
      color: colors.text.muted,
      fontWeight: "400",
    },
    factHint: {
      fontSize: 11.5,
      color: colors.text.muted,
      marginTop: 2,
      textAlign: "right",
    },
    prereqCard: {
      padding: spacing.md,
      gap: spacing.xs,
    },
    prereqTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    prereqBody: {
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.text.secondary,
    },
    prereqName: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.text.primary,
    },
    planCard: {
      padding: spacing.md,
      gap: spacing.sm,
      borderRadius: radius.md,
    },
    planTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text.primary,
    },
    stepRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    stepArrow: {
      fontSize: 13,
      color: colors.brand.primary,
      fontWeight: "700",
    },
    stepText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.text.primary,
    },
    planNote: {
      fontSize: 11.5,
      color: colors.text.muted,
      lineHeight: 17,
    },
    disabledNote: {
      fontSize: 11.5,
      color: colors.text.muted,
      textAlign: "center",
      marginTop: spacing.xs,
    },
  });
}
