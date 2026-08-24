import { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { buildMockTestQuestions, insertMockTestAttempt, type MockTestQuestion } from "../../../db/mockTest";
import { getPaperById, type SyncedPaper } from "../../../db/examStructure";
import { getPaperByIdLive } from "../../../data/mockTestStructureData";
import { buildMockTestQuestionsLive } from "../../../data/mockTestData";
import { useHybridMode } from "../../../data/hybridSource";
import { LANGUAGES, useAppLanguage } from "../../../practice/appLanguage";
import { LanguagePickerModal } from "../../../practice/LanguagePickerModal";
import { useActiveSession } from "../../../practice/activeSessionContext";
import { QuestionSkeleton } from "../../../ui/Skeleton";
import { colors, spacing } from "../../../ui/theme";

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * A sectionally-timed paper's total is the sum of its section limits; otherwise the
 * paper's own duration applies.
 *
 * Note: the total is enforced, but each section's individual limit is not yet — that
 * needs section locking and auto-advance, which is a larger change than this pass.
 */
function totalDurationMinutes(paper: SyncedPaper): number {
  if (paper.sections.some((s) => s.isSectionallyTimed)) {
    return paper.sections.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);
  }
  return paper.durationMinutes ?? 0;
}

export default function MockTestTaking() {
  const router = useRouter();
  const { paperId, examLabel, paperName } = useLocalSearchParams<{
    paperId: string;
    examLabel: string;
    paperName: string;
  }>();
  const { defaultLanguageCode } = useAppLanguage();
  const { beginSession, endSession, abandonSession, resetSignal, pendingDestinationRef } = useActiveSession();
  const [paper, setPaper] = useState<SyncedPaper | null>(null);

  const [questions, setQuestions] = useState<MockTestQuestion[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [navigatorVisible, setNavigatorVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);
  const [submitting, setSubmitting] = useState(false);

  const endTimeRef = useRef<number | null>(null);
  const submittedRef = useRef(false);
  const startedAtRef = useRef(Date.now());
  const mode = useHybridMode();
  // Captured once, deliberately not a dependency below: once an attempt has started, a
  // sync completing mid-test must not flip the data source and refetch a *different*
  // question set out from under the student — see the effect's own comment.
  const modeAtStartRef = useRef(mode);
  // router.dismissAll()/dismissTo() resolve "closest stack" against whichever tab
  // currently has focus, not against this screen's own position in the tree, so
  // they only work reliably while this screen is still the focused one — a plain
  // replace() to this module's own first screen (the same mechanism confirmExit
  // below and submitTest already use) is what abandonment falls back to. The tab
  // bar deliberately doesn't navigate to the destination tab itself: doing that
  // before this fixup runs races this same replace() call on the same router,
  // and whichever one lands second wins the tab focus — so it hands the intended
  // destination off via pendingDestinationRef instead, completed here once this
  // screen's own stack is back to a clean state.
  const seenResetRef = useRef(resetSignal.mock);

  useEffect(() => {
    if (resetSignal.mock !== seenResetRef.current) {
      seenResetRef.current = resetSignal.mock;
      router.replace("/mock-test");
      const destination = pendingDestinationRef.current;
      if (destination) {
        pendingDestinationRef.current = null;
        router.replace(destination);
      }
    }
  }, [resetSignal.mock, router, pendingDestinationRef]);

  useEffect(() => {
    if (!paperId) return;
    const startMode = modeAtStartRef.current;
    (async () => {
      try {
        const loaded = startMode === "local" ? await getPaperById(paperId) : await getPaperByIdLive(paperId);
        if (!loaded) return;
        setPaper(loaded);
        const qs = startMode === "local" ? await buildMockTestQuestions(loaded) : await buildMockTestQuestionsLive(loaded);
        const minutes = totalDurationMinutes(loaded);
        setQuestions(qs);
        if (qs.length > 0) beginSession("mock");
        startedAtRef.current = Date.now();
        endTimeRef.current = Date.now() + minutes * 60 * 1000;
        setRemainingSeconds(minutes * 60);
      } catch (err) {
        console.warn("Failed to load mock test questions", err);
      }
    })();
  }, [paperId, beginSession]);

  const submitTest = useMemo(
    () => async (auto: boolean) => {
      if (submittedRef.current || !questions || !paper) return;
      submittedRef.current = true;
      setSubmitting(true);

      const results = questions.map((q) => {
        const translation = q.translations.en ?? Object.values(q.translations)[0];
        const selectedIndex = answers[q.id] ?? null;
        return {
          questionId: q.id,
          subjectName: q.subjectName,
          questionText: translation.questionText,
          options: translation.options,
          selectedIndex,
          correctIndex: q.correctIndex,
          explanation: translation.explanation,
          markedForReview: markedForReview.has(q.id),
        };
      });

      const correctCount = results.filter((r) => r.selectedIndex !== null && r.selectedIndex === r.correctIndex).length;
      const wrongCount = results.filter((r) => r.selectedIndex !== null && r.selectedIndex !== r.correctIndex).length;
      const unattemptedCount = results.length - correctCount - wrongCount;
      // Papers may legitimately have no marking set; fall back to a plain +1/0 count
      // rather than scoring everything as zero.
      const marksCorrect = paper.marksCorrect ?? 1;
      const marksWrong = paper.marksWrong ?? 0;
      const totalMarksScored = correctCount * marksCorrect - wrongCount * marksWrong;
      const durationSeconds = totalDurationMinutes(paper) * 60;
      const timeTakenSeconds = auto ? durationSeconds : durationSeconds - remainingSeconds;
      const attemptId = `mocktest-${Date.now()}`;

      try {
        await insertMockTestAttempt({
          id: attemptId,
          examCode: paper.examCode,
          examLabel: paperName ? `${examLabel ?? ""} — ${paperName}` : examLabel ?? "",
          startedAt: startedAtRef.current,
          completedAt: Date.now(),
          durationSeconds,
          timeTakenSeconds,
          marksCorrect,
          marksWrong,
          totalMarksScored,
          correctCount,
          wrongCount,
          unattemptedCount,
          totalQuestions: results.length,
          results,
        });
      } catch (err) {
        console.warn("Failed to save mock test attempt", err);
        submittedRef.current = false;
        setSubmitting(false);
        Alert.alert("Couldn't save your result", "Please try submitting again.");
        return;
      }

      endSession();
      router.replace({ pathname: "/mock-test/result", params: { attemptId } });
    },
    [questions, paper, answers, markedForReview, remainingSeconds, examLabel, paperName, router, endSession],
  );

  useEffect(() => {
    if (!endTimeRef.current) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((endTimeRef.current! - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        submitTest(true);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [questions, submitTest]);

  const total = questions?.length ?? 0;
  const question = questions?.[currentIndex];
  const translation = question ? question.translations[languageCode] ?? question.translations.en : undefined;
  const hasRealTranslation = question ? Boolean(question.translations[languageCode]) : false;
  const currentLanguageName = LANGUAGES.find((l) => l.code === languageCode)?.name ?? "English";
  const isMarked = question ? markedForReview.has(question.id) : false;

  const answeredCount = Object.keys(answers).length;
  const markedCount = markedForReview.size;

  const toggleMarkForReview = () => {
    if (!question) return;
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  };

  const selectOption = (index: number) => {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: index }));
  };

  const clearAnswer = () => {
    if (!question) return;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[question.id];
      return next;
    });
  };

  const jumpTo = (index: number) => {
    setCurrentIndex(index);
    setNavigatorVisible(false);
  };

  const confirmSubmit = () => {
    const unanswered = total - answeredCount;
    Alert.alert(
      "Submit test?",
      `${unanswered} question${unanswered === 1 ? "" : "s"} unanswered${markedCount > 0 ? `, ${markedCount} marked for review` : ""}. You can't change answers after submitting.`,
      [
        { text: "Keep reviewing", style: "cancel" },
        { text: "Submit", style: "destructive", onPress: () => submitTest(false) },
      ],
    );
  };

  const confirmExit = () => {
    Alert.alert("Exit without submitting?", "Your progress on this attempt will be lost.", [
      { text: "Keep going", style: "cancel" },
      {
        text: "Exit",
        style: "destructive",
        onPress: () => {
          abandonSession();
          router.replace("/mock-test");
        },
      },
    ]);
  };

  if (questions && !paper) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>This paper is no longer part of the exam's structure.</Text>
      </View>
    );
  }

  if (questions === null || !question || !translation) {
    return (
      <View style={[styles.centered, { paddingTop: spacing["3xl"], alignItems: "stretch" }]}>
        <QuestionSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={confirmExit} disabled={submitting}>
          <Text style={styles.exitText}>Exit</Text>
        </Pressable>
        <View style={styles.timerBlock}>
          <Ionicons name="time-outline" size={16} color={remainingSeconds < 300 ? colors.semantic.error : colors.text.primary} />
          <Text style={[styles.timerText, remainingSeconds < 300 && styles.timerTextLow]}>
            {formatTime(remainingSeconds)}
          </Text>
        </View>
        <Pressable onPress={confirmSubmit} disabled={submitting}>
          <Text style={styles.submitText}>Submit</Text>
        </Pressable>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          Question {currentIndex + 1} of {total} · {question.subjectName}
        </Text>
        <Pressable style={styles.navigatorButton} onPress={() => setNavigatorVisible(true)}>
          <Ionicons name="grid-outline" size={16} color={colors.text.primary} />
          <Text style={styles.navigatorButtonText}>{answeredCount}/{total}</Text>
        </Pressable>
      </View>

      <View style={styles.toolbarRow}>
        <Pressable style={styles.languageButton} onPress={() => setLanguagePickerVisible(true)}>
          <Ionicons name="language-outline" size={14} color={colors.text.primary} />
          <Text style={styles.languageButtonText}>{currentLanguageName}</Text>
          <Ionicons name="chevron-down" size={12} color={colors.text.primary} />
        </Pressable>
        <Pressable style={styles.markButton} onPress={toggleMarkForReview}>
          <Ionicons name={isMarked ? "bookmark" : "bookmark-outline"} size={16} color={isMarked ? colors.semantic.warning : colors.text.muted} />
          <Text style={[styles.markButtonText, isMarked && styles.markButtonTextActive]}>
            {isMarked ? "Marked" : "Mark for review"}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {!hasRealTranslation && (
          <Text style={styles.fallbackNote}>Not yet translated to {currentLanguageName} — showing English.</Text>
        )}

        <Text style={styles.questionText}>{translation.questionText}</Text>

        <View style={styles.optionsList}>
          {translation.options.map((option, index) => {
            const isSelected = answers[question.id] === index;
            return (
              <Pressable
                key={index}
                onPress={() => selectOption(index)}
                style={[styles.optionCard, isSelected && styles.optionSelected]}
              >
                <View style={[styles.optionBadge, isSelected && styles.optionBadgeSelected]}>
                  <Text style={[styles.optionBadgeText, isSelected && styles.optionBadgeTextSelected]}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>
                <Text style={styles.optionText}>{option}</Text>
                {isSelected && <Ionicons name="checkmark-circle" size={20} color={colors.text.primary} />}
              </Pressable>
            );
          })}
        </View>

        {answers[question.id] !== undefined && (
          <Pressable style={styles.clearButton} onPress={clearAnswer}>
            <Text style={styles.clearButtonText}>Clear answer</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          disabled={currentIndex === 0}
          onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          <Text style={[styles.navButtonText, currentIndex === 0 && styles.navButtonTextDisabled]}>Previous</Text>
        </Pressable>
        <Pressable
          style={[styles.navButton, styles.navButtonPrimary, currentIndex === total - 1 && styles.navButtonDisabled]}
          disabled={currentIndex === total - 1}
          onPress={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
        >
          <Text style={styles.navButtonPrimaryText}>Next</Text>
        </Pressable>
      </View>

      <Modal visible={navigatorVisible} transparent animationType="slide" onRequestClose={() => setNavigatorVisible(false)}>
        <Pressable style={styles.navigatorBackdrop} onPress={() => setNavigatorVisible(false)}>
          <Pressable style={styles.navigatorCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.navigatorTitle}>Question Navigator</Text>
            <View style={styles.navigatorLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendAnswered]} />
                <Text style={styles.legendText}>Answered</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendMarked]} />
                <Text style={styles.legendText}>Marked</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendUnanswered]} />
                <Text style={styles.legendText}>Unanswered</Text>
              </View>
            </View>
            <ScrollView style={styles.navigatorGridScroll}>
              <View style={styles.navigatorGrid}>
                {questions.map((q, index) => {
                  const answered = answers[q.id] !== undefined;
                  const marked = markedForReview.has(q.id);
                  const isCurrent = index === currentIndex;
                  return (
                    <Pressable
                      key={q.id}
                      onPress={() => jumpTo(index)}
                      style={[
                        styles.navigatorCell,
                        answered && styles.navigatorCellAnswered,
                        marked && styles.navigatorCellMarked,
                        isCurrent && styles.navigatorCellCurrent,
                      ]}
                    >
                      <Text
                        style={[
                          styles.navigatorCellText,
                          (answered || marked) && styles.navigatorCellTextLight,
                        ]}
                      >
                        {index + 1}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <LanguagePickerModal
        visible={languagePickerVisible}
        selectedCode={languageCode}
        onSelect={setLanguageCode}
        onClose={() => setLanguagePickerVisible(false)}
      />

      {submitting && (
        <View style={styles.submittingOverlay}>
          <ActivityIndicator size="large" color={colors.text.onAccent} />
          <Text style={styles.submittingText}>Submitting your test…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: 50,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
    textAlign: "center",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  exitText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.muted,
  },
  submitText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text.primary,
  },
  timerBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceElevated2,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  timerText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text.primary,
  },
  timerTextLow: {
    color: colors.semantic.error,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  metaText: {
    fontSize: 12,
    color: colors.text.muted,
  },
  navigatorButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceElevated2,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  navigatorButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.primary,
  },
  toolbarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  languageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.surfaceElevated2,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  languageButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.primary,
  },
  markButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  markButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.muted,
  },
  markButtonTextActive: {
    color: colors.semantic.warning,
  },
  container: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  fallbackNote: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: "italic",
    marginBottom: 10,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text.primary,
    lineHeight: 26,
    marginBottom: 20,
  },
  optionsList: {
    gap: 12,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
  },
  optionSelected: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.surfaceElevated2,
  },
  optionBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surfaceElevated2,
    alignItems: "center",
    justifyContent: "center",
  },
  optionBadgeSelected: {
    backgroundColor: colors.brand.primary,
  },
  optionBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.text.primary,
  },
  optionBadgeTextSelected: {
    color: colors.text.onAccent,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
  },
  clearButton: {
    marginTop: 16,
    alignSelf: "center",
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.semantic.error,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceElevated,
  },
  navButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: colors.surfaceElevated2,
  },
  navButtonPrimary: {
    backgroundColor: colors.brand.primary,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
  },
  navButtonTextDisabled: {
    color: colors.text.muted,
  },
  navButtonPrimaryText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.onAccent,
  },
  navigatorBackdrop: {
    flex: 1,
    backgroundColor: "rgba(2, 3, 5, 0.7)",
    justifyContent: "flex-end",
  },
  navigatorCard: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "70%",
  },
  navigatorTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text.primary,
    marginBottom: 14,
  },
  navigatorLegend: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendAnswered: {
    backgroundColor: colors.brand.primary,
  },
  legendMarked: {
    backgroundColor: colors.semantic.warning,
  },
  legendUnanswered: {
    backgroundColor: colors.border,
  },
  legendText: {
    fontSize: 11,
    color: colors.text.secondary,
  },
  navigatorGridScroll: {
    maxHeight: 320,
  },
  navigatorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 10,
  },
  navigatorCell: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  navigatorCellAnswered: {
    backgroundColor: colors.brand.primary,
    borderColor: colors.brand.primary,
  },
  navigatorCellMarked: {
    backgroundColor: colors.semantic.warning,
    borderColor: colors.semantic.warning,
  },
  navigatorCellCurrent: {
    borderWidth: 2,
    borderColor: colors.brand.light,
  },
  navigatorCellText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.primary,
  },
  navigatorCellTextLight: {
    color: colors.text.onAccent,
  },
  submittingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(2, 3, 5, 0.88)",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  submittingText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.onAccent,
  },
});
