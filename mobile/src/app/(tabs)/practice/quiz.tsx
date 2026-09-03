import { useCallback, useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { recordTopicPractice } from "../../../db/topicProgressStore";
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

export default function Quiz() {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
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
  const isReported = question ? reported.has(question.id) : false;
  // Derived, not stored — see the note on `answers`.
  const selectedOption = question ? answers[question.id] ?? null : null;
  const answeredCount = Object.keys(answers).length;
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
    if (!question || !translation) return;
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

  const goPrevious = () => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const goNext = () => {
    setCurrentIndex((i) => Math.min(total - 1, i + 1));
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

    const results = questions
      .filter((q) => answers[q.id] !== undefined)
      .map((q) => {
        const chosen = answers[q.id];
        const t = q.translations.en;
        return {
          questionId: q.id,
          questionText: t.questionText,
          options: t.options,
          selectedIndex: chosen,
          correctIndex: q.correctIndex,
          explanation: t.explanation,
          isCorrect: chosen === q.correctIndex,
        };
      });

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
    router.replace({ pathname: "/practice/summary", params: { sessionId } });
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
            <Pressable style={styles.iconButton} onPress={handleToggleBookmark}>
              <Ionicons
                name={isBookmarked(question.id) ? "star" : "star-outline"}
                size={22}
                color={isBookmarked(question.id) ? colors.semantic.warning : colors.text.muted}
              />
            </Pressable>
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

          <Text style={styles.questionText}>{translation.questionText}</Text>

          <View style={styles.optionsList}>
            {translation.options.map((option, index) => {
              const isCorrect = index === question.correctIndex;
              const isPickedWrong = selectedOption === index && index !== question.correctIndex;
              const showCorrectHighlight = selectedOption !== null && isCorrect;

              return (
                <Pressable
                  key={index}
                  disabled={selectedOption !== null}
                  onPress={() => selectOption(index)}
                  style={[
                    styles.optionCard,
                    showCorrectHighlight && styles.optionCorrect,
                    isPickedWrong && styles.optionWrong,
                  ]}
                >
                  <View
                    style={[
                      styles.optionBadge,
                      showCorrectHighlight && styles.optionBadgeCorrect,
                      isPickedWrong && styles.optionBadgeWrong,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionBadgeText,
                        (showCorrectHighlight || isPickedWrong) && styles.optionBadgeTextLight,
                      ]}
                    >
                      {String.fromCharCode(65 + index)}
                    </Text>
                  </View>
                  <Text style={styles.optionText}>{option}</Text>
                  {showCorrectHighlight && <Ionicons name="checkmark-circle" size={20} color={colors.semantic.success} />}
                  {isPickedWrong && <Ionicons name="close-circle" size={20} color={colors.semantic.error} />}
                </Pressable>
              );
            })}
          </View>

          {selectedOption !== null && (
            <View style={styles.explanationBox}>
              <Text style={styles.explanationLabel}>{t("common.explanation")}</Text>
              <Text style={styles.explanationText}>{translation.explanation}</Text>
            </View>
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
            {isLastQuestion || selectedOption === null ? (
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
          {!isLastQuestion && selectedOption !== null && answeredCount > 0 && (
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
    optionsList: {
      gap: spacing.md,
    },
    optionCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md + 2,
    },
    optionCorrect: {
      borderColor: colors.semantic.success,
      backgroundColor: colors.semantic.successBg,
    },
    optionWrong: {
      borderColor: colors.semantic.error,
      backgroundColor: colors.semantic.errorBg,
    },
    optionBadge: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.surfaceElevated2,
      alignItems: "center",
      justifyContent: "center",
    },
    optionBadgeCorrect: {
      backgroundColor: colors.semantic.success,
    },
    optionBadgeWrong: {
      backgroundColor: colors.semantic.error,
    },
    optionBadgeText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text.primary,
    },
    optionBadgeTextLight: {
      color: colors.text.onAccent,
    },
    optionText: {
      flex: 1,
      fontSize: 15,
      color: colors.text.primary,
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
