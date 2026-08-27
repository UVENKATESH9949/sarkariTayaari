import { useEffect, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import { useBookmarks } from "../../../practice/bookmarks";
import { useActiveSession } from "../../../practice/activeSessionContext";
import { LANGUAGES, useAppLanguage } from "../../../practice/appLanguage";
import { LanguagePickerModal } from "../../../practice/LanguagePickerModal";
import { AnimatedProgressBar } from "../../../ui/AnimatedProgressBar";
import { Button } from "../../../ui/Button";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { EmptyState } from "../../../ui/EmptyState";
import { QuestionSkeleton } from "../../../ui/Skeleton";
import { colors, radius, spacing } from "../../../ui/theme";
import { getPracticeQuestions, type PracticeQuestion } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";

export default function Quiz() {
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
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const sessionStartRef = useRef<number | null>(null);

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

  const total = questions?.length ?? 0;
  const question = questions?.[currentIndex];
  const isReported = question ? reported.has(question.id) : false;

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

  const goNext = () => {
    if (!question || !questions) return;
    if (currentIndex === total - 1) {
      const finalAnswers = { ...answers, [question.id]: selectedOption! };
      const results = questions.map((q) => {
        const chosen = finalAnswers[q.id];
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
        totalCount: total,
        durationMs,
        results,
      });
      endSession();
      router.replace({ pathname: "/practice/summary", params: { sessionId } });
      return;
    }
    setAnswers((prev) => ({ ...prev, [question.id]: selectedOption! }));
    setCurrentIndex((i) => i + 1);
    setSelectedOption(null);
  };

  if (questions === null) {
    return (
      <>
        <Stack.Screen options={{ title: `${topicName ?? ""} · ${levelLabel ?? ""}` }} />
        <View style={styles.loadingScreen}>
          <ContextualLoading message="Preparing your questions..." skeleton={<QuestionSkeleton />} />
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
            title="No questions available"
            body={
              mode === "unavailable"
                ? "You're offline and this content hasn't downloaded yet. Connect to the internet once to download it."
                : "There's nothing synced for this selection yet."
            }
            action={{ label: "Go back", onPress: () => router.back() }}
          />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: `${topicName} · ${levelLabel}` }} />
      <View style={styles.screen}>
        <View style={styles.progressRow}>
          <AnimatedProgressBar progress={(currentIndex + 1) / total} style={styles.progressTrack} />
          <Text style={styles.progressText}>
            Question {currentIndex + 1} of {total}
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
              Not yet translated to {currentLanguageName} — showing English.
            </Text>
          )}

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
                  onPress={() => setSelectedOption(index)}
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
              <Text style={styles.explanationLabel}>Explanation</Text>
              <Text style={styles.explanationText}>{translation.explanation}</Text>
            </View>
          )}
        </ScrollView>

        {selectedOption !== null && (
          <View style={styles.footer}>
            <Button size="lg" onPress={goNext}>
              {currentIndex === total - 1 ? "Finish" : "Next Question"}
            </Button>
          </View>
        )}
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

const styles = StyleSheet.create({
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
});
