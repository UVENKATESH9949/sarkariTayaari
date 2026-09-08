import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { buildDiagnosticSet, type DiagnosticQuestion } from "../diagnostic/buildDiagnosticSet";
import { insertDiagnosticAttempt, type DiagnosticTopicResult } from "../db/diagnosticAttempts";
import { deriveState, recordTopicPractice } from "../db/topicProgressStore";
import { useHybridMode } from "../data/hybridSource";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { ContextualLoading } from "../ui/ContextualLoading";
import { CardSkeleton } from "../ui/Skeleton";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import { trackEvent } from "../telemetry/analytics";
import { OptionList } from "../questionRenderer/OptionList";
import { blindRadioStyles } from "../questionRenderer/optionListStyles";

/**
 * Exam Guide spec §21 "Diagnostic Test". Deliberately untimed and silent on
 * correct/incorrect per question — a diagnostic's purpose is to locate where a student
 * stands across the syllabus, not to drill one question at a time with immediate
 * feedback the way Practice's quiz already does. Results appear all at once on
 * diagnostic-result.tsx.
 *
 * Not built on Mock Test's `test.tsx` engine despite that being this project's other
 * timed, multi-subject test-taking screen: that engine is built around `SyncedPaper`'s
 * section/duration/negative-marking model, and a diagnostic has none of those — forcing a
 * synthetic paper shape onto it would be more adapter code than this dedicated screen.
 */
export default function DiagnosticTestScreen() {
  const styles = useThemedStyles(buildStyles);
  const optionListStyles = useThemedStyles(blindRadioStyles);
  const router = useRouter();
  const mode = useHybridMode();
  const { examCode, examName } = useLocalSearchParams<{ examCode: string; examName?: string }>();

  const [questions, setQuestions] = useState<DiagnosticQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const startedAtRef = useState(() => Date.now())[0];

  useEffect(() => {
    if (!examCode) return;
    buildDiagnosticSet(examCode, mode).then(setQuestions);
  }, [examCode, mode]);

  const current = questions?.[index] ?? null;
  const translation = current ? current.translations.en ?? Object.values(current.translations)[0] : undefined;

  async function finish() {
    if (!questions || !examCode) return;
    setSubmitting(true);
    trackEvent("diagnostic_test_completed", { examCode, questionCount: questions.length });

    const byTopic = new Map<string, { topicName: string; subjectName: string; questions: DiagnosticQuestion[] }>();
    questions.forEach((q, i) => {
      const bucket = byTopic.get(q.topicId) ?? { topicName: q.topicName, subjectName: q.subjectName, questions: [] };
      bucket.questions.push(q);
      byTopic.set(q.topicId, bucket);
    });

    const perTopic: DiagnosticTopicResult[] = [];
    let totalCorrect = 0;

    for (const [topicId, bucket] of byTopic) {
      let correctCount = 0;
      bucket.questions.forEach((q) => {
        const qIndex = questions.indexOf(q);
        if (answers[qIndex] === q.correctIndex) correctCount++;
      });
      totalCorrect += correctCount;

      // Feeds the SAME cumulative progress table an ordinary practice session updates —
      // see the migration's own comment for why a diagnostic doesn't get a parallel model.
      await recordTopicPractice({ topicId, correctCount, totalCount: bucket.questions.length });
      const accuracy = Math.round((correctCount / bucket.questions.length) * 100);
      perTopic.push({
        topicId,
        topicName: bucket.topicName,
        subjectName: bucket.subjectName,
        correctCount,
        totalCount: bucket.questions.length,
        // Approximated from this attempt alone (deriveState needs the topic's PRIOR
        // cumulative state, which recordTopicPractice already folded this attempt into —
        // re-deriving here from a NOT_STARTED baseline is a reasonable "what this attempt
        // alone showed" label, distinct from the real cumulative state recordTopicPractice
        // just wrote).
        state: deriveState("NOT_STARTED", bucket.questions.length, accuracy),
      });
    }

    await insertDiagnosticAttempt({
      id: `${examCode}:${Date.now()}`,
      examCode,
      startedAt: startedAtRef,
      completedAt: Date.now(),
      questionCount: questions.length,
      correctCount: totalCorrect,
      perTopic,
    });

    router.replace({ pathname: "/diagnostic-result", params: { examCode, examName: examName ?? "" } });
  }

  if (!examCode) return null;

  if (questions === null) {
    return (
      <View style={styles.screen}>
        <ContextualLoading message="Building your diagnostic..." skeleton={<CardSkeleton height={220} />} />
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState
          icon="analytics-outline"
          title="Not enough content yet"
          body={`${examName ?? examCode} doesn't have enough curated topics or synced questions for a diagnostic test yet.`}
        />
      </View>
    );
  }

  const answered = answers[index] !== undefined;
  const isLast = index === questions.length - 1;

  return (
    <>
      <Stack.Screen options={{ title: "Diagnostic Test", headerBackVisible: !submitting }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.progressText}>
          Question {index + 1} of {questions.length} · {current?.subjectName}
        </Text>

        <Card variant="container" style={styles.card}>
          <Text style={styles.questionText}>{translation?.questionText}</Text>
          {translation && (
            <OptionList
              options={translation.options}
              styles={optionListStyles}
              badge="radio"
              selectedIndex={answers[index] ?? null}
              onSelect={(i) => setAnswers((prev) => ({ ...prev, [index]: i }))}
            />
          )}
        </Card>

        <View style={styles.navRow}>
          <Button variant="secondary" onPress={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
            Previous
          </Button>
          {isLast ? (
            <Button onPress={finish} disabled={!answered || submitting}>
              {submitting ? "Scoring..." : "Finish"}
            </Button>
          ) : (
            <Button onPress={() => setIndex((i) => i + 1)} disabled={!answered}>
              Next
            </Button>
          )}
        </View>
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors, spacing: sp }: Theme) =>
  StyleSheet.create({
    screen: { flex: 1 },
    centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: sp["2xl"] },
    container: { padding: sp.xl, paddingBottom: sp["3xl"] },
    progressText: { fontSize: 12, color: colors.text.muted, marginBottom: sp.sm, fontWeight: "600" },
    card: { padding: sp.lg },
    questionText: { fontSize: 16, fontWeight: "600", color: colors.text.primary, lineHeight: 22, marginBottom: sp.lg },
    navRow: { flexDirection: "row", justifyContent: "space-between", marginTop: sp.xl },
  });
