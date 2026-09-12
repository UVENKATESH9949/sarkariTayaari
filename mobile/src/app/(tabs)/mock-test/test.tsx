import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { insertMockTestAttempt } from "../../../db/mockTest";
import {
  buildMockTestQuestions,
  getPaperById,
  type MockTestQuestion,
  type SyncedPaper,
} from "../../../data/mockTestAccess";
import { useHybridMode } from "../../../data/hybridSource";
import { LANGUAGES, useAppLanguage } from "../../../practice/appLanguage";
import { LanguagePickerModal } from "../../../practice/LanguagePickerModal";
import { useActiveSession } from "../../../practice/activeSessionContext";
import { useActiveTestBackGuard } from "../../../practice/useActiveTestBackGuard";
import { useQuestionTimer } from "../../../practice/useQuestionTimer";
import { AppAlert } from "../../../ui/AppDialog";
import { EmptyState } from "../../../ui/EmptyState";
import { QuestionSkeleton } from "../../../ui/Skeleton";
import { spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";
import { OptionList } from "../../../questionRenderer/OptionList";
import { MultiSelectOptionList } from "../../../questionRenderer/MultiSelectOptionList";
import { ContentPreamble } from "../../../questionRenderer/ContentPreamble";
import { GroupContent } from "../../../questionRenderer/GroupContent";
import { FreeTextAnswerInput } from "../../../questionRenderer/FreeTextAnswerInput";
import { MatchPairing, type MatchItem } from "../../../questionRenderer/MatchPairing";
import { OrderingBuilder, type OrderingItem } from "../../../questionRenderer/OrderingBuilder";
import { shuffled } from "../../../questionRenderer/shuffle";
import { blindLetterComfortableStyles } from "../../../questionRenderer/optionListStyles";
import {
  multipleChoiceEvaluator,
  trueFalseEvaluator,
  numericEvaluator,
  textAnswerEvaluator,
  mappingEvaluator,
  sequenceEvaluator,
} from "@sarkaritaiyaari/core/evaluation";
import type { EvaluationOutcome } from "@sarkaritaiyaari/core/evaluation";

/** `null` for an empty/non-numeric entry — mirrors quiz.tsx's identical helper. */
function parseNumericInput(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

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
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const optionListStyles = useThemedStyles(blindLetterComfortableStyles);
  const t = useT();
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
  /** MULTIPLE_CHOICE/TRUE_FALSE siblings of `answers` (TASK-2301 Phase P2 Wave A) — see
   * quiz.tsx's identical note. Unlike quiz.tsx, nothing here locks once set: a mock
   * attempt only scores at Submit, so every type stays freely re-selectable until then,
   * matching `answers`' own existing behaviour (no "first tap is final" rule here). */
  const [multiAnswers, setMultiAnswers] = useState<Record<string, number[]>>({});
  const [boolAnswers, setBoolAnswers] = useState<Record<string, boolean>>({});
  /**
   * NUMERIC/FILL_BLANK/MATCH/ORDERING's answer maps (TASK-2301 Phase P2 Wave B) — same
   * "freely re-selectable until Submit" behaviour as every other map here, no confirm gate
   * (blind mode never reveals mid-attempt, so there's nothing for a confirm step to lock).
   */
  const [numericAnswers, setNumericAnswers] = useState<Record<string, string>>({});
  const [fillBlankAnswers, setFillBlankAnswers] = useState<Record<string, string>>({});
  const [matchAnswers, setMatchAnswers] = useState<Record<string, Record<string, string>>>({});
  const [orderingAnswers, setOrderingAnswers] = useState<Record<string, string[]>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [navigatorVisible, setNavigatorVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);
  const [submitting, setSubmitting] = useState(false);

  /*
   * Per-question time, for the nullable `time_ms` column added by migration 0018. Declared
   * here rather than beside `question` further down, because the submit callback below closes
   * over it and is defined first.
   *
   * Nothing reads it yet -- the Weakness Radar's speed signal is deliberately off until this
   * app has a real expected-time benchmark (see practice/useQuestionTimer.ts).
   */
  const questionTimer = useQuestionTimer(questions?.[currentIndex]?.id ?? null);

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
        const loaded = await getPaperById(paperId, startMode);
        if (!loaded) return;
        setPaper(loaded);
        const qs = await buildMockTestQuestions(loaded, startMode);
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

  /**
   * Ends the session however this screen goes away — the same fix as quiz.tsx, and for the
   * same reason: `beginSession("mock")` was set when the questions loaded and cleared only
   * on the submit and explicit-exit paths, so a hardware Back press left the flag set and
   * the next tab tap warned about a test that was no longer running (Doc 2 §3).
   */
  useEffect(() => endSession, [endSession]);

  /**
   * Whether `q` has something recorded, dispatched by type (TASK-2301 Phase P2 Wave A) —
   * one place for the meta row's count, the navigator grid's per-cell dot, the Clear
   * Answer button's visibility, and Submit's confirmation copy to agree.
   */
  const isQuestionAnswered = useCallback(
    (q: MockTestQuestion): boolean => {
      if (q.questionType === "MULTIPLE_CHOICE") return (multiAnswers[q.id]?.length ?? 0) > 0;
      if (q.questionType === "TRUE_FALSE") return boolAnswers[q.id] !== undefined;
      if (q.questionType === "NUMERIC") return Boolean(numericAnswers[q.id]?.trim());
      if (q.questionType === "FILL_BLANK") return Boolean(fillBlankAnswers[q.id]?.trim());
      if (q.questionType === "MATCH") return Object.keys(matchAnswers[q.id] ?? {}).length > 0;
      if (q.questionType === "ORDERING") return (orderingAnswers[q.id]?.length ?? 0) > 0;
      return answers[q.id] !== undefined;
    },
    [answers, multiAnswers, boolAnswers, numericAnswers, fillBlankAnswers, matchAnswers, orderingAnswers],
  );

  const submitTest = useMemo(
    () => async (auto: boolean) => {
      if (submittedRef.current || !questions || !paper) return;
      submittedRef.current = true;
      setSubmitting(true);
      // Banks the question still on screen -- including on an auto-submit when the clock runs
      // out, where nothing else would.
      questionTimer.commitCurrent();

      const results = questions.map((q) => {
        const translation = q.translations.en ?? Object.values(q.translations)[0];
        const marked = markedForReview.has(q.id);
        const timeMs = questionTimer.timeMsFor(q.id);
        const type = q.questionType ?? "SINGLE_CHOICE";

        if (type === "MULTIPLE_CHOICE") {
          const selected = multiAnswers[q.id] ?? [];
          const response = selected.length > 0 ? { selectedOptions: selected } : null;
          const evaluation = multipleChoiceEvaluator(q.answerKey, null, response);
          return {
            questionId: q.id,
            subjectName: q.subjectName,
            questionText: translation.questionText,
            options: translation.options,
            selectedIndex: null,
            correctIndex: null,
            explanation: translation.explanation,
            markedForReview: marked,
            timeMs,
            questionType: type,
            response,
            outcome: evaluation.outcome,
            scoreFraction: evaluation.scoreFraction,
          };
        }

        if (type === "TRUE_FALSE") {
          const selectedBoolean = boolAnswers[q.id];
          const response = selectedBoolean === undefined ? null : { selectedBoolean };
          const evaluation = trueFalseEvaluator(q.answerKey, null, response);
          return {
            questionId: q.id,
            subjectName: q.subjectName,
            questionText: translation.questionText,
            options: translation.options,
            selectedIndex: null,
            correctIndex: null,
            explanation: translation.explanation,
            markedForReview: marked,
            timeMs,
            questionType: type,
            response,
            outcome: evaluation.outcome,
            scoreFraction: evaluation.scoreFraction,
          };
        }

        if (type === "NUMERIC") {
          const enteredValue = parseNumericInput(numericAnswers[q.id]);
          const response = enteredValue === null ? null : { enteredValue };
          const evaluation = numericEvaluator(q.answerKey, null, response);
          return {
            questionId: q.id,
            subjectName: q.subjectName,
            questionText: translation.questionText,
            options: translation.options,
            selectedIndex: null,
            correctIndex: null,
            explanation: translation.explanation,
            markedForReview: marked,
            timeMs,
            questionType: type,
            response,
            outcome: evaluation.outcome,
            scoreFraction: evaluation.scoreFraction,
          };
        }

        if (type === "FILL_BLANK") {
          const enteredText = fillBlankAnswers[q.id] ?? "";
          const response = enteredText.trim().length === 0 ? null : { enteredText };
          const evaluation = textAnswerEvaluator(q.answerKey, null, response);
          return {
            questionId: q.id,
            subjectName: q.subjectName,
            questionText: translation.questionText,
            options: translation.options,
            selectedIndex: null,
            correctIndex: null,
            explanation: translation.explanation,
            markedForReview: marked,
            timeMs,
            questionType: type,
            response,
            outcome: evaluation.outcome,
            scoreFraction: evaluation.scoreFraction,
          };
        }

        if (type === "MATCH") {
          const mapping = matchAnswers[q.id] ?? {};
          const response = Object.keys(mapping).length === 0 ? null : { mapping };
          const evaluation = mappingEvaluator(q.answerKey, null, response);
          return {
            questionId: q.id,
            subjectName: q.subjectName,
            questionText: translation.questionText,
            options: translation.options,
            selectedIndex: null,
            correctIndex: null,
            explanation: translation.explanation,
            markedForReview: marked,
            timeMs,
            questionType: type,
            response,
            outcome: evaluation.outcome,
            scoreFraction: evaluation.scoreFraction,
          };
        }

        if (type === "ORDERING") {
          const order = orderingAnswers[q.id] ?? [];
          const response = order.length === 0 ? null : { order };
          const evaluation = sequenceEvaluator(q.answerKey, null, response);
          return {
            questionId: q.id,
            subjectName: q.subjectName,
            questionText: translation.questionText,
            options: translation.options,
            selectedIndex: null,
            correctIndex: null,
            explanation: translation.explanation,
            markedForReview: marked,
            timeMs,
            questionType: type,
            response,
            outcome: evaluation.outcome,
            scoreFraction: evaluation.scoreFraction,
          };
        }

        const selectedIndex = answers[q.id] ?? null;
        const isCorrect = selectedIndex !== null && selectedIndex === q.correctIndex;
        const outcome: EvaluationOutcome = selectedIndex === null ? "UNATTEMPTED" : isCorrect ? "CORRECT" : "INCORRECT";
        return {
          questionId: q.id,
          subjectName: q.subjectName,
          questionText: translation.questionText,
          options: translation.options,
          selectedIndex,
          correctIndex: q.correctIndex,
          explanation: translation.explanation,
          markedForReview: marked,
          timeMs,
          questionType: type,
          response: selectedIndex === null ? null : { selectedOption: selectedIndex },
          outcome,
          scoreFraction: outcome === "CORRECT" ? 1 : 0,
        };
      });

      const correctCount = results.filter((r) => r.outcome === "CORRECT").length;
      const wrongCount = results.filter((r) => r.outcome === "INCORRECT").length;
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
        AppAlert.alert(t("mock.saveFailed"), t("mock.saveFailedBody"), undefined, "error");
        return;
      }

      endSession();
      router.replace({ pathname: "/mock-test/result", params: { attemptId } });
    },
    [
      questions,
      paper,
      answers,
      multiAnswers,
      boolAnswers,
      numericAnswers,
      fillBlankAnswers,
      matchAnswers,
      orderingAnswers,
      markedForReview,
      remainingSeconds,
      examLabel,
      paperName,
      router,
      endSession,
      questionTimer,
      t,
    ],
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
  const isCurrentAnswered = question ? isQuestionAnswered(question) : false;

  const answeredCount = questions?.filter(isQuestionAnswered).length ?? 0;
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

  const selectBoolean = (value: boolean) => {
    if (!question) return;
    setBoolAnswers((prev) => ({ ...prev, [question.id]: value }));
  };

  const toggleMultiOption = (index: number) => {
    if (!question) return;
    setMultiAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index].sort((a, b) => a - b);
      return { ...prev, [question.id]: next };
    });
  };

  const selectNumeric = (text: string) => {
    if (!question) return;
    setNumericAnswers((prev) => ({ ...prev, [question.id]: text }));
  };

  const selectFillBlank = (text: string) => {
    if (!question) return;
    setFillBlankAnswers((prev) => ({ ...prev, [question.id]: text }));
  };

  const pairMatch = (leftKey: string, rightKey: string) => {
    if (!question) return;
    setMatchAnswers((prev) => ({
      ...prev,
      [question.id]: { ...(prev[question.id] ?? {}), [leftKey]: rightKey },
    }));
  };

  const toggleOrderingItem = (key: string) => {
    if (!question) return;
    setOrderingAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      return { ...prev, [question.id]: next };
    });
  };

  // Same reshuffle-only-on-question/language-change reasoning as quiz.tsx's identical memos.
  const matchLeftItems: MatchItem[] = useMemo(() => {
    if (!question || question.questionType !== "MATCH" || !translation) return [];
    const leftKeys = (question.contentStructure?.leftKeys as string[] | undefined) ?? [];
    const leftLabels = (translation.content?.leftLabels as Record<string, string> | undefined) ?? {};
    return leftKeys.map((key) => ({ key, label: leftLabels[key] ?? key }));
  }, [question, translation]);

  const matchRightItems: MatchItem[] = useMemo(() => {
    if (!question || question.questionType !== "MATCH" || !translation) return [];
    const rightKeys = (question.contentStructure?.rightKeys as string[] | undefined) ?? [];
    const rightLabels = (translation.content?.rightLabels as Record<string, string> | undefined) ?? {};
    return shuffled(rightKeys.map((key) => ({ key, label: rightLabels[key] ?? key })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reshuffle only on question/language change, not on every pairing tap
  }, [question?.id, languageCode]);

  const orderingPoolItems: OrderingItem[] = useMemo(() => {
    if (!question || question.questionType !== "ORDERING" || !translation) return [];
    const itemKeys = (question.contentStructure?.itemKeys as string[] | undefined) ?? [];
    const itemLabels = (translation.content?.itemLabels as Record<string, string> | undefined) ?? {};
    return shuffled(itemKeys.map((key) => ({ key, label: itemLabels[key] ?? key })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reshuffle only on question/language change, not on every tap
  }, [question?.id, languageCode]);

  const clearAnswer = () => {
    if (!question) return;
    if (question.questionType === "MULTIPLE_CHOICE") {
      setMultiAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      return;
    }
    if (question.questionType === "TRUE_FALSE") {
      setBoolAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      return;
    }
    if (question.questionType === "NUMERIC") {
      setNumericAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      return;
    }
    if (question.questionType === "FILL_BLANK") {
      setFillBlankAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      return;
    }
    if (question.questionType === "MATCH") {
      setMatchAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      return;
    }
    if (question.questionType === "ORDERING") {
      setOrderingAnswers((prev) => {
        const next = { ...prev };
        delete next[question.id];
        return next;
      });
      return;
    }
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
    AppAlert.alert(
      t("mock.submitTitle"),
      t("mock.submitMessage", {
        unanswered: unanswered === 1 ? t("practice.questionsOne") : t("practice.questionsOther", { count: unanswered }),
        marked: markedCount > 0 ? t("mock.submitMessageMarked", { count: markedCount }) : "",
      }),
      [
        { text: t("mock.keepReviewing"), style: "cancel" },
        { text: t("common.submit"), style: "destructive", onPress: () => submitTest(false) },
      ],
    );
  };

  const exitWithoutSubmitting = useCallback(() => {
    abandonSession();
    router.replace("/mock-test");
  }, [abandonSession, router]);

  const confirmExit = () => {
    AppAlert.alert(t("mock.exitTitle"), t("mock.exitMessage"), [
      { text: t("mock.keepGoing"), style: "cancel" },
      { text: t("common.exit"), style: "destructive", onPress: exitWithoutSubmitting },
    ]);
  };

  /*
   * Doc 2 §2. The stack already sets `gestureEnabled: false` for this screen, so the swipe
   * was covered; the hardware Back button was not, and popped the attempt with no warning
   * at all. Same wording and same action as the Exit button in the header, so all three
   * routes out of a running attempt now behave identically.
   */
  useActiveTestBackGuard({
    // `submitting` state, not `submittedRef.current` — same reasoning as quiz.tsx.
    active: !submitting,
    title: t("mock.exitTitle"),
    message: t("mock.exitMessage"),
    onConfirmLeave: exitWithoutSubmitting,
  });

  if (questions && !paper) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="alert-circle-outline"
          title={t("mock.notAvailable")}
          body={t("mock.notAvailableBody")}
        />
      </View>
    );
  }

  // Distinct from questions === null (still loading): the fetch completed but genuinely
  // found nothing — e.g. offline with this paper never synced, or too few questions
  // exist yet for the required sections. Without this check, an empty array fell through
  // to the loading branch below and got stuck showing "Preparing your questions..."
  // forever, which is worse than a blank screen: it looks alive but never resolves.
  if (questions !== null && questions.length === 0) {
    return (
      <View style={styles.centered}>
        <EmptyState
          icon="alert-circle-outline"
          title={t("quiz.noQuestions")}
          body={
            mode === "unavailable"
              ? "You're offline and this content hasn't downloaded yet. Connect to the internet once to download it."
              : t("mock.notEnoughSynced")
          }
          action={{ label: t("common.goBack"), onPress: () => router.replace("/mock-test") }}
        />
      </View>
    );
  }

  if (questions === null || !question || !translation) {
    return (
      <View style={[styles.centered, { paddingTop: spacing["3xl"], alignItems: "stretch" }]}>
        <Text style={styles.loadingMessage}>{t("quiz.loading")}</Text>
        <QuestionSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={confirmExit} disabled={submitting}>
          <Text style={styles.exitText}>{t("common.exit")}</Text>
        </Pressable>
        <View style={styles.timerBlock}>
          <Ionicons name="time-outline" size={16} color={remainingSeconds < 300 ? colors.semantic.error : colors.text.primary} />
          <Text style={[styles.timerText, remainingSeconds < 300 && styles.timerTextLow]}>
            {formatTime(remainingSeconds)}
          </Text>
        </View>
        <Pressable onPress={confirmSubmit} disabled={submitting}>
          <Text style={styles.submitText}>{t("common.submit")}</Text>
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
            {isMarked ? t("mock.marked") : t("mock.markForReview")}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.container}>
        {!hasRealTranslation && (
          <Text style={styles.fallbackNote}>Not yet translated to {currentLanguageName} — showing English.</Text>
        )}

        <GroupContent key={question.id} questionGroupId={question.questionGroupId} language={languageCode} />

        <Text style={styles.questionText}>{translation.questionText}</Text>

        {question.questionType === "MULTIPLE_CHOICE" ? (
          <MultiSelectOptionList
            options={translation.options}
            styles={optionListStyles}
            selectedIndices={multiAnswers[question.id] ?? []}
            onToggle={toggleMultiOption}
          />
        ) : question.questionType === "TRUE_FALSE" ? (
          <OptionList
            options={[t("quiz.trueOption"), t("quiz.falseOption")]}
            styles={optionListStyles}
            badge="letter"
            selectedIndex={boolAnswers[question.id] === undefined ? null : boolAnswers[question.id] ? 0 : 1}
            onSelect={(index) => selectBoolean(index === 0)}
          />
        ) : question.questionType === "NUMERIC" ? (
          <FreeTextAnswerInput
            value={numericAnswers[question.id] ?? ""}
            onChangeText={selectNumeric}
            keyboardType="numeric"
            placeholder={t("quiz.numericPlaceholder")}
          />
        ) : question.questionType === "FILL_BLANK" ? (
          <FreeTextAnswerInput
            value={fillBlankAnswers[question.id] ?? ""}
            onChangeText={selectFillBlank}
            placeholder={t("quiz.fillBlankPlaceholder")}
          />
        ) : question.questionType === "MATCH" ? (
          <MatchPairing
            leftItems={matchLeftItems}
            rightItems={matchRightItems}
            mapping={matchAnswers[question.id] ?? {}}
            onPair={pairMatch}
          />
        ) : question.questionType === "ORDERING" ? (
          <OrderingBuilder
            items={orderingPoolItems}
            order={orderingAnswers[question.id] ?? []}
            onToggle={toggleOrderingItem}
          />
        ) : (
          <>
            <ContentPreamble questionType={question.questionType} content={translation.content} />
            <OptionList
              options={translation.options}
              styles={optionListStyles}
              badge="letter"
              selectedIndex={answers[question.id] ?? null}
              onSelect={selectOption}
            />
          </>
        )}

        {isCurrentAnswered && (
          <Pressable style={styles.clearButton} onPress={clearAnswer}>
            <Text style={styles.clearButtonText}>{t("mock.clearAnswer")}</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
          disabled={currentIndex === 0}
          onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        >
          <Text style={[styles.navButtonText, currentIndex === 0 && styles.navButtonTextDisabled]}>{t("common.previous")}</Text>
        </Pressable>
        <Pressable
          style={[styles.navButton, styles.navButtonPrimary, currentIndex === total - 1 && styles.navButtonDisabled]}
          disabled={currentIndex === total - 1}
          onPress={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
        >
          <Text style={styles.navButtonPrimaryText}>{t("common.next")}</Text>
        </Pressable>
      </View>

      <Modal visible={navigatorVisible} transparent animationType="slide" onRequestClose={() => setNavigatorVisible(false)}>
        <Pressable style={styles.navigatorBackdrop} onPress={() => setNavigatorVisible(false)}>
          <Pressable style={styles.navigatorCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.navigatorTitle}>{t("mock.navigator")}</Text>
            <View style={styles.navigatorLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendAnswered]} />
                <Text style={styles.legendText}>{t("common.answered")}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendMarked]} />
                <Text style={styles.legendText}>{t("mock.marked")}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendUnanswered]} />
                <Text style={styles.legendText}>{t("common.unanswered")}</Text>
              </View>
            </View>
            <ScrollView style={styles.navigatorGridScroll}>
              <View style={styles.navigatorGrid}>
                {questions.map((q, index) => {
                  const answered = isQuestionAnswered(q);
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
          <Text style={styles.submittingText}>{t("mock.submitting")}</Text>
        </View>
      )}
    </View>
  );
}

const buildStyles = ({ colors, typography }: Theme) =>
  StyleSheet.create({
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
    loadingMessage: {
      ...typography.secondary,
      textAlign: "center",
      marginBottom: spacing.lg,
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
