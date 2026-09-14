import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { recordTopicPractice } from "../../../db/topicProgressStore";
import { useQuestionTimer } from "../../../practice/useQuestionTimer";
import { PyqBadge } from "../../../ui/PyqBadge";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import { useBookmarks } from "../../../practice/bookmarks";
import { useActiveSession } from "../../../practice/activeSessionContext";
import { useActiveTestBackGuard } from "../../../practice/useActiveTestBackGuard";
import { LANGUAGES, useAppLanguage } from "../../../practice/appLanguage";
import { LanguagePickerModal } from "../../../practice/LanguagePickerModal";
import { AnimatedProgressBar } from "../../../ui/AnimatedProgressBar";
import { Button } from "../../../ui/Button";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { EmptyState } from "../../../ui/EmptyState";
import { QuestionSkeleton } from "../../../ui/Skeleton";
import { radius, spacing } from "../../../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../../../ui/ThemeContext";
import { useT } from "../../../i18n/I18nContext";
import { getPracticeQuestions, type PracticeQuestion } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { OptionList } from "../../../questionRenderer/OptionList";
import { MultiSelectOptionList } from "../../../questionRenderer/MultiSelectOptionList";
import { ContentPreamble } from "../../../questionRenderer/ContentPreamble";
import { GroupContent } from "../../../questionRenderer/GroupContent";
import { AiExplanationCard } from "../../../questionRenderer/AiExplanationCard";
import { FreeTextAnswerInput } from "../../../questionRenderer/FreeTextAnswerInput";
import { MatchPairing, type MatchItem } from "../../../questionRenderer/MatchPairing";
import { OrderingBuilder, type OrderingItem } from "../../../questionRenderer/OrderingBuilder";
import { shuffled } from "../../../questionRenderer/shuffle";
import { revealLetterComfortableStyles } from "../../../questionRenderer/optionListStyles";
import {
  multipleChoiceEvaluator,
  trueFalseEvaluator,
  numericEvaluator,
  textAnswerEvaluator,
  mappingEvaluator,
  sequenceEvaluator,
} from "@sarkaritaiyaari/core/evaluation";
import type { QuestionResult } from "../../../practice/sessionHistory";

/** `null` for an empty/non-numeric entry — the same "not really a number" case NumericEvaluator itself treats as unattempted, not zero. */
function parseNumericInput(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

export default function Quiz() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const optionListStyles = useThemedStyles(revealLetterComfortableStyles);
  const t = useT();
  const router = useRouter();
  const { examCode, examLabel, subjectName, topicId, topicName, levelKey, levelLabel } = useLocalSearchParams<{
    examCode: string;
    examLabel: string;
    subjectName: string;
    topicId: string;
    topicName: string;
    levelKey: string;
    levelLabel: string;
  }>();
  const { addSession } = useSessionHistory();
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const { beginSession, endSession, resetSignal, pendingDestinationRef } = useActiveSession();
  const { defaultLanguageCode } = useAppLanguage();

  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  /**
   * questionId -> chosen option index, written the moment an option is tapped.
   *
   * This is now the single source of truth for what the student has answered, and it is
   * what makes Previous (Doc 2 §6) work at all. Before, the chosen option lived in its own
   * `selectedOption` state that was cleared on every advance and only folded into `answers`
   * on the way out, so going back had nothing to restore from. Deriving the current
   * selection from this map instead means backward and forward navigation are the same
   * operation on `currentIndex` and cannot desynchronise.
   */
  const [answers, setAnswers] = useState<Record<string, number>>({});
  /**
   * The same "written the moment it's decided" model as `answers`, one map per response
   * shape (TASK-2301 Phase P2 Wave A). Kept separate rather than folding into one
   * `Record<string, StudentResponse>` map so every existing SINGLE_CHOICE/ASSERTION_REASON/
   * STATEMENT_COMBINATION codepath above — Previous/Next, `selectedOption`, the bookmark
   * button — stays exactly as verified, untouched by the two new types.
   */
  const [multiAnswers, setMultiAnswers] = useState<Record<string, number[]>>({});
  /** Which MULTIPLE_CHOICE questions have had "Confirm Answer" pressed — see confirmMultiAnswer. */
  const [confirmedMulti, setConfirmedMulti] = useState<Set<string>>(new Set());
  const [boolAnswers, setBoolAnswers] = useState<Record<string, boolean>>({});
  /**
   * NUMERIC/FILL_BLANK/MATCH/ORDERING's answer maps (TASK-2301 Phase P2 Wave B) — one map
   * per response shape, same reasoning as multiAnswers/boolAnswers above. Ids never collide
   * across these four maps either, since a question only has one questionType.
   */
  const [numericAnswers, setNumericAnswers] = useState<Record<string, string>>({});
  const [fillBlankAnswers, setFillBlankAnswers] = useState<Record<string, string>>({});
  const [matchAnswers, setMatchAnswers] = useState<Record<string, Record<string, string>>>({});
  const [orderingAnswers, setOrderingAnswers] = useState<Record<string, string[]>>({});
  /**
   * Shared "Confirm Answer" gate for all four Wave B types — none of them can infer "done"
   * from a single tap the way single-choice/TRUE_FALSE can, exactly like MULTIPLE_CHOICE's
   * own confirmedMulti above. One set rather than four, since ids never collide.
   */
  const [confirmedFreeform, setConfirmedFreeform] = useState<Set<string>>(new Set());
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const sessionStartRef = useRef<number | null>(null);
  // A ref as well as state: `addSession` is fire-and-forget and the session id is
  // `session-${Date.now()}`, so two taps a millisecond apart used to write two real
  // sessions (and two taps inside the same millisecond collided on the primary key and
  // lost one silently). State alone can't stop that — it hasn't re-rendered yet when the
  // second tap lands. Same shape as mock-test/test.tsx's submittedRef.
  const finishedRef = useRef(false);
  const [finishing, setFinishing] = useState(false);

  const mode = useHybridMode();
  // router.dismissAll() resolves "closest stack" against whichever tab currently
  // has focus, not against this screen's own position in the tree, so it only
  // works reliably while this screen is still focused — a plain replace() to
  // Practice's own first screen (the same mechanism the quiz-completion path
  // already uses) is what abandonment falls back to. The tab bar hands off the
  // intended destination via pendingDestinationRef rather than navigating there
  // itself, since doing that before this fixup runs races this same replace()
  // call on the same router — see the longer note in mock-test/test.tsx.
  const seenResetRef = useRef(resetSignal.practice);

  useEffect(() => {
    if (resetSignal.practice !== seenResetRef.current) {
      seenResetRef.current = resetSignal.practice;
      router.replace("/practice");
      const destination = pendingDestinationRef.current;
      if (destination) {
        pendingDestinationRef.current = null;
        router.replace(destination);
      }
    }
  }, [resetSignal.practice, router, pendingDestinationRef]);

  useEffect(() => {
    if (!topicId || !levelKey) return;
    const difficulty = levelKey as "all" | "easy" | "medium" | "hard";
    getPracticeQuestions(topicId, difficulty, examCode ?? null, mode).then((qs) => {
      setQuestions(qs);
      if (qs.length > 0) {
        sessionStartRef.current = Date.now();
        beginSession("practice");
      }
    });
  }, [topicId, levelKey, examCode, mode, beginSession]);

  /**
   * Ends the session whenever this screen goes away, however it went away.
   *
   * This is the actual fix for Doc 2 §3. `beginSession("practice")` was set when the
   * questions loaded and `endSession()` was only called on the completion path, so backing
   * out of the quiz left the flag set: the student reached Practice Home with no test
   * running, tapped Mock Test, and got "Leave this test?" about a test they had already
   * left. Nothing else cleared it.
   *
   * An unmount cleanup covers every exit — Back button, Back gesture, the header's back
   * arrow, and the completion path — instead of one more place remembering to call it.
   * Calling it twice is harmless (it sets the same null).
   */
  useEffect(() => endSession, [endSession]);

  const total = questions?.length ?? 0;
  const question = questions?.[currentIndex];
  /*
   * Per-question time, for the nullable `time_ms` column added by migration 0018.
   *
   * Nothing reads it yet -- there is no expected-time benchmark in this app, so the Weakness
   * Radar's speed signal is deliberately off (see practice/useQuestionTimer.ts). Capturing it
   * now is what gives a later version history to build a benchmark from.
   */
  const questionTimer = useQuestionTimer(question?.id ?? null);
  const isReported = question ? reported.has(question.id) : false;
  // Derived, not stored — see the note on `answers`.
  const selectedOption = question ? answers[question.id] ?? null : null;
  // Ids never collide across the maps — a question only has one questionType.
  const answeredCount =
    Object.keys(answers).length + confirmedMulti.size + Object.keys(boolAnswers).length + confirmedFreeform.size;
  /**
   * The one generalisation of `selectedOption !== null` the footer actually needs
   * (Finish/Next gating, the explanation box, "finish early"). Single-select can infer
   * "answered" from having a selection at all; MULTIPLE_CHOICE can't (see confirmedMulti),
   * and neither can any of the four Wave B types (see confirmedFreeform).
   */
  const isCurrentAnswered = question
    ? question.questionType === "MULTIPLE_CHOICE"
      ? confirmedMulti.has(question.id)
      : question.questionType === "TRUE_FALSE"
        ? boolAnswers[question.id] !== undefined
        : question.questionType === "NUMERIC" ||
            question.questionType === "FILL_BLANK" ||
            question.questionType === "MATCH" ||
            question.questionType === "ORDERING"
          ? confirmedFreeform.has(question.id)
          : selectedOption !== null
    : false;
  const isLastQuestion = total > 0 && currentIndex === total - 1;

  /*
   * Back button / Back gesture, Doc 2 §2.
   *
   * Same rule and same wording as the tab bar's guard, because §2's requirement is that no
   * navigation method bypass the behaviour implemented for another. Gated on
   * `answeredCount > 0`: warning someone who has answered nothing protects no work and just
   * makes Back feel broken.
   */
  const confirmLeave = useCallback(() => {
    endSession();
    router.back();
  }, [endSession, router]);

  useActiveTestBackGuard({
    // `finishing` rather than `finishedRef.current`: the two are set together in
    // finishSession, and reading a ref during render is both a lint error and genuinely
    // unreliable (a ref mutation does not re-run this).
    active: answeredCount > 0 && !finishing,
    title: t("quiz.leaveTitle"),
    message: t("quiz.leaveMessage"),
    onConfirmLeave: confirmLeave,
  });

  const translation = question ? question.translations[languageCode] ?? question.translations.en : undefined;
  const hasRealTranslation = question ? Boolean(question.translations[languageCode]) : false;
  const currentLanguageName = LANGUAGES.find((l) => l.code === languageCode)?.name ?? "English";

  const handleToggleBookmark = () => {
    // Bookmarks (schema `correct_index NOT NULL`) predate the response model and still
    // assume a single index — deliberately out of scope for TASK-2301 Wave A. Guarded
    // here rather than extended, so MULTIPLE_CHOICE/TRUE_FALSE questions just can't be
    // bookmarked yet instead of writing a meaningless index.
    if (!question || !translation || question.correctIndex === null) return;
    toggleBookmark({
      questionId: question.id,
      questionText: translation.questionText,
      options: translation.options,
      correctIndex: question.correctIndex,
      explanation: translation.explanation,
      subjectName: subjectName ?? "",
      topicName: topicName ?? "",
      examLabel: examLabel ?? "",
      bookmarkedAt: Date.now(),
    });
  };

  const toggleReport = () => {
    if (!question) return;
    setReported((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  };

  const selectOption = (index: number) => {
    if (!question) return;
    // Immediate-feedback quiz: the first tap on a question is final, and the correct
    // answer plus explanation are revealed straight away. Re-tapping a question that is
    // already answered must therefore not change the recorded answer — which is also what
    // makes it safe to navigate back into an answered question.
    if (answers[question.id] !== undefined) return;
    setAnswers((prev) => ({ ...prev, [question.id]: index }));
  };

  const selectBoolean = (value: boolean) => {
    if (!question) return;
    // Same "first tap is final" rule as selectOption — a single tap fully answers TRUE_FALSE.
    if (boolAnswers[question.id] !== undefined) return;
    setBoolAnswers((prev) => ({ ...prev, [question.id]: value }));
  };

  const toggleMultiOption = (index: number) => {
    if (!question) return;
    if (confirmedMulti.has(question.id)) return;
    setMultiAnswers((prev) => {
      const current = prev[question.id] ?? [];
      const next = current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index].sort((a, b) => a - b);
      return { ...prev, [question.id]: next };
    });
  };

  /** Locks in the ticked set and reveals — a checklist can't infer "done" from one tap. */
  const confirmMultiAnswer = () => {
    if (!question) return;
    setConfirmedMulti((prev) => new Set(prev).add(question.id));
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

  /** Shared confirm for all four Wave B types — see confirmedFreeform's own comment. */
  const confirmFreeform = () => {
    if (!question) return;
    setConfirmedFreeform((prev) => new Set(prev).add(question.id));
  };

  // MATCH's left column stays in authored order (it's the "given" side); the right column is
  // shuffled once per question so its position can't give the pairing away. Re-shuffles only
  // when the question or language changes, not on every keystroke/tap re-render.
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

  // ORDERING's pool is authored in the correct order, so it must always be shuffled for
  // display — same reshuffle-only-on-question-change reasoning as matchRightItems above.
  const orderingPoolItems: OrderingItem[] = useMemo(() => {
    if (!question || question.questionType !== "ORDERING" || !translation) return [];
    const itemKeys = (question.contentStructure?.itemKeys as string[] | undefined) ?? [];
    const itemLabels = (translation.content?.itemLabels as Record<string, string> | undefined) ?? {};
    return shuffled(itemKeys.map((key) => ({ key, label: itemLabels[key] ?? key })));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reshuffle only on question/language change, not on every tap
  }, [question?.id, languageCode]);

  const goPrevious = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
  };

  /**
   * One result shape out of three different answer maps (TASK-2301 Phase P2 Wave A).
   * `null` means "not answered" for that question, exactly like the old
   * `answers[q.id] !== undefined` filter this replaces.
   *
   * SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION keep the original direct
   * `chosen === q.correctIndex` comparison rather than routing through
   * `questionEvaluatorFor`'s SINGLE_CHOICE branch — that branch reads
   * `answerKey.correctOption`, which legacy content synced before this phase never
   * populated, where `correctIndex` (resolved from the always-present `correctAnswer`
   * string) is proven correct for every question in the bank. MULTIPLE_CHOICE/TRUE_FALSE
   * have no such fallback to protect: Wave A's own authoring validation requires an
   * `answerKey` for both at creation time, so the evaluator is the only source of truth
   * there — there's nothing legacy to be compatible with.
   */
  const buildResultForQuestion = (q: PracticeQuestion): QuestionResult | null => {
    const type = q.questionType ?? "SINGLE_CHOICE";
    const en = q.translations.en;
    const timeMs = questionTimer.timeMsFor(q.id);

    if (type === "MULTIPLE_CHOICE") {
      if (!confirmedMulti.has(q.id)) return null;
      const response = { selectedOptions: multiAnswers[q.id] ?? [] };
      const evaluation = multipleChoiceEvaluator(q.answerKey, null, response);
      return {
        questionId: q.id,
        questionText: en.questionText,
        options: en.options,
        selectedIndex: null,
        correctIndex: null,
        explanation: en.explanation,
        isCorrect: evaluation.outcome === "CORRECT",
        timeMs,
        questionType: type,
        response,
        outcome: evaluation.outcome,
        scoreFraction: evaluation.scoreFraction,
      };
    }

    if (type === "TRUE_FALSE") {
      if (boolAnswers[q.id] === undefined) return null;
      const response = { selectedBoolean: boolAnswers[q.id] };
      const evaluation = trueFalseEvaluator(q.answerKey, null, response);
      return {
        questionId: q.id,
        questionText: en.questionText,
        options: en.options,
        selectedIndex: null,
        correctIndex: null,
        explanation: en.explanation,
        isCorrect: evaluation.outcome === "CORRECT",
        timeMs,
        questionType: type,
        response,
        outcome: evaluation.outcome,
        scoreFraction: evaluation.scoreFraction,
      };
    }

    if (type === "NUMERIC") {
      if (!confirmedFreeform.has(q.id)) return null;
      const response = { enteredValue: parseNumericInput(numericAnswers[q.id]) };
      const evaluation = numericEvaluator(q.answerKey, null, response);
      return {
        questionId: q.id,
        questionText: en.questionText,
        options: en.options,
        selectedIndex: null,
        correctIndex: null,
        explanation: en.explanation,
        isCorrect: evaluation.outcome === "CORRECT",
        timeMs,
        questionType: type,
        response,
        outcome: evaluation.outcome,
        scoreFraction: evaluation.scoreFraction,
      };
    }

    if (type === "FILL_BLANK") {
      if (!confirmedFreeform.has(q.id)) return null;
      const response = { enteredText: fillBlankAnswers[q.id] ?? "" };
      const evaluation = textAnswerEvaluator(q.answerKey, null, response);
      return {
        questionId: q.id,
        questionText: en.questionText,
        options: en.options,
        selectedIndex: null,
        correctIndex: null,
        explanation: en.explanation,
        isCorrect: evaluation.outcome === "CORRECT",
        timeMs,
        questionType: type,
        response,
        outcome: evaluation.outcome,
        scoreFraction: evaluation.scoreFraction,
      };
    }

    if (type === "MATCH") {
      if (!confirmedFreeform.has(q.id)) return null;
      const response = { mapping: matchAnswers[q.id] ?? {} };
      const evaluation = mappingEvaluator(q.answerKey, null, response);
      return {
        questionId: q.id,
        questionText: en.questionText,
        options: en.options,
        selectedIndex: null,
        correctIndex: null,
        explanation: en.explanation,
        isCorrect: evaluation.outcome === "CORRECT",
        timeMs,
        questionType: type,
        response,
        outcome: evaluation.outcome,
        scoreFraction: evaluation.scoreFraction,
      };
    }

    if (type === "ORDERING") {
      if (!confirmedFreeform.has(q.id)) return null;
      const response = { order: orderingAnswers[q.id] ?? [] };
      const evaluation = sequenceEvaluator(q.answerKey, null, response);
      return {
        questionId: q.id,
        questionText: en.questionText,
        options: en.options,
        selectedIndex: null,
        correctIndex: null,
        explanation: en.explanation,
        isCorrect: evaluation.outcome === "CORRECT",
        timeMs,
        questionType: type,
        response,
        outcome: evaluation.outcome,
        scoreFraction: evaluation.scoreFraction,
      };
    }

    const chosen = answers[q.id];
    if (chosen === undefined) return null;
    const isCorrect = chosen === q.correctIndex;
    return {
      questionId: q.id,
      questionText: en.questionText,
      options: en.options,
      selectedIndex: chosen,
      correctIndex: q.correctIndex,
      explanation: en.explanation,
      isCorrect,
      timeMs,
      questionType: type,
      response: { selectedOption: chosen },
      outcome: isCorrect ? "CORRECT" : "INCORRECT",
      scoreFraction: isCorrect ? 1 : 0,
    };
  };

  /**
   * Ends the session with whatever has been answered so far (Doc 2 §7).
   *
   * Reached from the "Finish" button, which is available from the first answered question
   * onward rather than only on question 50 — and from the last question's Next, which is
   * the same action.
   *
   * The counting here is the §8 half of the same change, and the two cannot be separated:
   *
   *  - `totalCount` is the number ANSWERED. It is the denominator of accuracy on the
   *    summary, in history, on Progress, in per-exam progress and in the uploaded payload,
   *    so it has to mean "attempted" or every one of those figures becomes wrong the first
   *    time somebody stops early.
   *  - `availableCount` is what the set offered, recorded for display only.
   *  - `results` covers ONLY answered questions. An unanswered question has
   *    `isCorrect === false` under any encoding, and `getWrongAnswers()` collects every
   *    result with `isCorrect === false` into Revise — so including skipped questions would
   *    fill a student's revision list with questions they never saw.
   */
  const finishSession = () => {
    if (!questions) return;
    if (finishedRef.current) return;
    if (answeredCount === 0) return;
    finishedRef.current = true;
    setFinishing(true);
    // Banks the question still on screen. The timer's own effect cleanup only fires on
    // unmount, which happens after these results have already been built.
    questionTimer.commitCurrent();

    const results = questions
      .map((q) => buildResultForQuestion(q))
      .filter((r): r is QuestionResult => r !== null);

    const correctCount = results.filter((r) => r.isCorrect).length;
    const sessionId = `session-${Date.now()}`;
    const durationMs = sessionStartRef.current !== null ? Date.now() - sessionStartRef.current : null;
    addSession({
      id: sessionId,
      completedAt: Date.now(),
      examLabel: examLabel ?? "",
      // "ALL" is the sentinel for the "All Government Exams" shortcut — that session
      // isn't attributable to one exam, so it's excluded from per-exam progress.
      examCode: examCode && examCode !== "ALL" ? examCode : null,
      subjectName: subjectName ?? "",
      topicName: topicName ?? "",
      levelLabel: levelLabel ?? "",
      correctCount,
      totalCount: results.length,
      availableCount: total,
      durationMs,
      results,
    });
    /*
     * Epic L / TICKET-2105 — fold this session into the topic's cumulative mastery.
     *
     * Done here rather than inside addSession() because SessionRecord carries only
     * `topicName`, a denormalized string. That is precisely the gap the §18.2 audit found:
     * no code could aggregate practice by topic because the topic *id* was never stored.
     * This screen has the real id from its route params, so it is the cheapest correct place
     * to record it - the alternative is another local migration to add topicId to
     * practice_sessions, which buys nothing else today.
     *
     * Passes the ANSWERED count, not the set size: user_topic_progress carries
     * `CHECK (correct_count <= attempted_count)`, and attributing 50 attempts to a student
     * who answered 17 would both trip that intent and overstate their coverage of the topic.
     *
     * Fire-and-forget, matching addSession above: finishing a quiz must never wait on a
     * write, and a failure here costs a mastery update, not the session itself.
     */
    if (topicId) {
      recordTopicPractice({
        topicId,
        correctCount,
        totalCount: results.length,
        durationMs: durationMs ?? undefined,
      }).catch((err) => console.warn("Failed to record topic mastery", err));
    }

    endSession();
    // topicId/examCode ride along here (TASK-2701 Phase 7.1) rather than needing a new
    // persisted column — a practice session is single-topic by construction, so this
    // param only has to survive the few seconds until Summary builds the AI feedback
    // context, exactly the reasoning in the comment above for why recordTopicPractice
    // reads topicId here instead of from SessionRecord.
    router.replace({
      pathname: "/practice/summary",
      params: { sessionId, ...(topicId ? { topicId } : {}), ...(examCode ? { examCode } : {}) },
    });
  };

  if (questions === null) {
    return (
      <>
        <Stack.Screen options={{ title: `${topicName ?? ""} · ${levelLabel ?? ""}` }} />
        <View style={styles.loadingScreen}>
          <ContextualLoading message={t("quiz.loading")} skeleton={<QuestionSkeleton />} />
        </View>
      </>
    );
  }

  if (!question || !translation) {
    return (
      <>
        <Stack.Screen options={{ title: topicName ?? "Quiz" }} />
        <View style={styles.centeredScreen}>
          <EmptyState
            icon="alert-circle-outline"
            title={t("quiz.noQuestions")}
            body={
              mode === "unavailable"
                ? t("quiz.noQuestionsOffline")
                : t("quiz.noQuestionsSynced")
            }
            action={{ label: t("common.goBack"), onPress: () => router.back() }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `${topicName} · ${levelLabel}` }} />
      <View style={styles.screen}>
        {/* Doc 2 §8: the bar tracks questions ANSWERED, not the position of the cursor.
            They were the same number only while every question had to be answered in
            order; with Previous and early finishing they are different, and "how far
            through am I" is the answered count. The cursor position is still shown, as
            text, because it is a different and also useful fact. */}
        <View style={styles.progressRow}>
          <AnimatedProgressBar progress={total > 0 ? answeredCount / total : 0} style={styles.progressTrack} />
          <Text style={styles.progressText}>
            {t("quiz.progress", { current: currentIndex + 1, total, answered: answeredCount })}
          </Text>
        </View>

        <View style={styles.toolbarRow}>
          <Pressable style={styles.languageButton} onPress={() => setLanguagePickerVisible(true)}>
            <Ionicons name="language-outline" size={16} color={colors.brand.primary} />
            <Text style={styles.languageButtonText}>{currentLanguageName}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.brand.primary} />
          </Pressable>

          <View style={styles.toolbarIcons}>
            <Pressable style={styles.iconButton} onPress={toggleReport}>
              <Ionicons name={isReported ? "flag" : "flag-outline"} size={20} color={isReported ? colors.semantic.error : colors.text.muted} />
            </Pressable>
            {question.correctIndex !== null && (
              <Pressable style={styles.iconButton} onPress={handleToggleBookmark}>
                <Ionicons
                  name={isBookmarked(question.id) ? "star" : "star-outline"}
                  size={22}
                  color={isBookmarked(question.id) ? colors.semantic.warning : colors.text.muted}
                />
              </Pressable>
            )}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          {!hasRealTranslation && (
            <Text style={styles.fallbackNote}>
              {t("quiz.notTranslated", { language: currentLanguageName })}
            </Text>
          )}

          {/* Above the question text, not beside it: this is context for what follows, and a
              student should see "this really appeared in 2023" before reading the question. */}
          <PyqBadge isPyq={question.isPyq} year={question.pyqYear} shift={question.pyqShift} />

          <GroupContent key={question.id} questionGroupId={question.questionGroupId} language={languageCode} />

          <Text style={styles.questionText}>{translation.questionText}</Text>

          {question.questionType === "MULTIPLE_CHOICE" ? (
            <>
              <MultiSelectOptionList
                options={translation.options}
                styles={optionListStyles}
                selectedIndices={multiAnswers[question.id] ?? []}
                correctIndices={
                  confirmedMulti.has(question.id) && Array.isArray(question.answerKey?.correctOptions)
                    ? (question.answerKey!.correctOptions as number[])
                    : null
                }
                onToggle={toggleMultiOption}
                submitted={confirmedMulti.has(question.id)}
                disabled={confirmedMulti.has(question.id)}
              />
              {!confirmedMulti.has(question.id) && (
                <Button variant="secondary" onPress={confirmMultiAnswer} style={styles.confirmMultiButton}>
                  {t("quiz.confirmAnswer")}
                </Button>
              )}
            </>
          ) : question.questionType === "TRUE_FALSE" ? (
            <OptionList
              options={[t("quiz.trueOption"), t("quiz.falseOption")]}
              styles={optionListStyles}
              badge="none"
              selectedIndex={boolAnswers[question.id] === undefined ? null : boolAnswers[question.id] ? 0 : 1}
              correctIndex={
                typeof question.answerKey?.correctBoolean === "boolean"
                  ? question.answerKey!.correctBoolean
                    ? 0
                    : 1
                  : null
              }
              onSelect={(index) => selectBoolean(index === 0)}
              disabled={boolAnswers[question.id] !== undefined}
            />
          ) : question.questionType === "NUMERIC" ? (
            <>
              <FreeTextAnswerInput
                value={numericAnswers[question.id] ?? ""}
                onChangeText={selectNumeric}
                keyboardType="numeric"
                placeholder={t("quiz.numericPlaceholder")}
                disabled={confirmedFreeform.has(question.id)}
                isCorrect={
                  confirmedFreeform.has(question.id)
                    ? numericEvaluator(question.answerKey, null, {
                        enteredValue: parseNumericInput(numericAnswers[question.id]),
                      }).outcome === "CORRECT"
                    : null
                }
              />
              {!confirmedFreeform.has(question.id) && (
                <Button
                  variant="secondary"
                  onPress={confirmFreeform}
                  disabled={!numericAnswers[question.id]?.trim()}
                  style={styles.confirmMultiButton}
                >
                  {t("quiz.confirmAnswer")}
                </Button>
              )}
            </>
          ) : question.questionType === "FILL_BLANK" ? (
            <>
              <FreeTextAnswerInput
                value={fillBlankAnswers[question.id] ?? ""}
                onChangeText={selectFillBlank}
                placeholder={t("quiz.fillBlankPlaceholder")}
                disabled={confirmedFreeform.has(question.id)}
                isCorrect={
                  confirmedFreeform.has(question.id)
                    ? textAnswerEvaluator(question.answerKey, null, {
                        enteredText: fillBlankAnswers[question.id] ?? "",
                      }).outcome === "CORRECT"
                    : null
                }
              />
              {!confirmedFreeform.has(question.id) && (
                <Button
                  variant="secondary"
                  onPress={confirmFreeform}
                  disabled={!fillBlankAnswers[question.id]?.trim()}
                  style={styles.confirmMultiButton}
                >
                  {t("quiz.confirmAnswer")}
                </Button>
              )}
            </>
          ) : question.questionType === "MATCH" ? (
            <>
              <MatchPairing
                leftItems={matchLeftItems}
                rightItems={matchRightItems}
                mapping={matchAnswers[question.id] ?? {}}
                onPair={confirmedFreeform.has(question.id) ? undefined : pairMatch}
                disabled={confirmedFreeform.has(question.id)}
                correctMapping={
                  confirmedFreeform.has(question.id)
                    ? ((question.answerKey?.correctMapping as Record<string, string> | undefined) ?? null)
                    : null
                }
              />
              {!confirmedFreeform.has(question.id) && (
                <Button
                  variant="secondary"
                  onPress={confirmFreeform}
                  disabled={Object.keys(matchAnswers[question.id] ?? {}).length < matchLeftItems.length}
                  style={styles.confirmMultiButton}
                >
                  {t("quiz.confirmAnswer")}
                </Button>
              )}
            </>
          ) : question.questionType === "ORDERING" ? (
            <>
              <OrderingBuilder
                items={orderingPoolItems}
                order={orderingAnswers[question.id] ?? []}
                onToggle={confirmedFreeform.has(question.id) ? undefined : toggleOrderingItem}
                disabled={confirmedFreeform.has(question.id)}
                correctOrder={
                  confirmedFreeform.has(question.id)
                    ? ((question.answerKey?.correctOrder as string[] | undefined) ?? null)
                    : null
                }
              />
              {!confirmedFreeform.has(question.id) && (
                <Button
                  variant="secondary"
                  onPress={confirmFreeform}
                  disabled={(orderingAnswers[question.id]?.length ?? 0) < orderingPoolItems.length}
                  style={styles.confirmMultiButton}
                >
                  {t("quiz.confirmAnswer")}
                </Button>
              )}
            </>
          ) : (
            <>
              <ContentPreamble questionType={question.questionType} content={translation.content} />
              <OptionList
                options={translation.options}
                styles={optionListStyles}
                badge="letter"
                selectedIndex={selectedOption}
                correctIndex={question.correctIndex}
                onSelect={selectOption}
                disabled={selectedOption !== null}
              />
            </>
          )}

          {isCurrentAnswered && (
            <View style={styles.explanationBox}>
              <Text style={styles.explanationLabel}>{t("common.explanation")}</Text>
              <Text style={styles.explanationText}>{translation.explanation}</Text>
            </View>
          )}
          {isCurrentAnswered && (
            <AiExplanationCard key={question.id} questionId={question.id} languageCode={languageCode} />
          )}
        </ScrollView>

        {/*
          * Always rendered, rather than only once the current question is answered.
          *
          * The footer previously appeared on selection and vanished again on the next
          * question, so there was no persistent place for Previous to live and no way to
          * leave a question unanswered. Now the row is stable and the buttons enable and
          * disable within it, which also stops the layout jumping on every tap.
          */}
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Button
              variant="secondary"
              onPress={goPrevious}
              disabled={currentIndex === 0 || finishing}
              icon="chevron-back"
              style={styles.footerSecondary}
            >
              {t("common.previous")}
            </Button>

            {/* Doc 2 §7: finishing is available from the first answered question onward, not
                only on the last one. On the final question it is the only forward action. */}
            {isLastQuestion || !isCurrentAnswered ? (
              <Button
                onPress={finishSession}
                disabled={answeredCount === 0 || finishing}
                loading={finishing}
                style={styles.footerPrimary}
              >
                {answeredCount === 0 ? t("common.finish") : t("quiz.finishWithCount", { count: answeredCount })}
              </Button>
            ) : (
              <Button onPress={goNext} disabled={finishing} icon="chevron-forward" style={styles.footerPrimary}>
                {t("common.next")}
              </Button>
            )}
          </View>

          {/* Offered only where it is actually useful: mid-set, with the current question
              answered, so "Finish" is not the primary button but stopping is still allowed. */}
          {!isLastQuestion && isCurrentAnswered && answeredCount > 0 && (
            <Pressable style={styles.finishEarly} onPress={finishSession} disabled={finishing}>
              <Text style={styles.finishEarlyText}>
                {t("quiz.finishNow", { answered: answeredCount, total })}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      <LanguagePickerModal
        visible={languagePickerVisible}
        selectedCode={languageCode}
        onSelect={setLanguageCode}
        onClose={() => setLanguagePickerVisible(false)}
      />
    </>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    loadingScreen: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.xl,
    },
    centeredScreen: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: spacing["2xl"],
    },
    progressRow: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.base,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: "hidden",
    },
    progressText: {
      marginTop: spacing.sm - 2,
      fontSize: 12,
      color: colors.text.muted,
    },
    toolbarRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    languageButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm - 2,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs + 3,
      paddingHorizontal: spacing.md,
    },
    languageButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.primary,
    },
    toolbarIcons: {
      flexDirection: "row",
      gap: spacing.xs,
    },
    iconButton: {
      padding: spacing.sm,
    },
    container: {
      padding: spacing.xl,
      paddingTop: spacing.sm,
      paddingBottom: spacing["3xl"],
    },
    fallbackNote: {
      fontSize: 12,
      color: colors.text.muted,
      fontStyle: "italic",
      marginBottom: spacing.sm + 2,
    },
    questionText: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text.primary,
      lineHeight: 26,
      marginBottom: spacing.xl,
    },
    confirmMultiButton: {
      marginTop: spacing.md,
    },
    explanationBox: {
      marginTop: spacing.xl,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.md,
      padding: spacing.base,
    },
    explanationLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.text.secondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.xs + 2,
    },
    explanationText: {
      fontSize: 14,
      color: colors.text.primary,
      lineHeight: 21,
    },
    footer: {
      padding: spacing.xl,
      paddingTop: spacing.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.surfaceElevated,
    },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    // Previous is deliberately the narrower of the two: going forward is the common action,
    // and at the largest zoom step the row still has to fit on a small phone.
    footerSecondary: {
      flex: 1,
    },
    footerPrimary: {
      flex: 1.4,
    },
    finishEarly: {
      marginTop: spacing.md,
      alignItems: "center",
      paddingVertical: spacing.sm,
    },
    finishEarlyText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.brand.light,
    },
  });
