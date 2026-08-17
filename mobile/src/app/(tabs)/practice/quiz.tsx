import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSessionHistory } from "../../../practice/sessionHistory";
import { useBookmarks } from "../../../practice/bookmarks";
import { LANGUAGES, useAppLanguage } from "../../../practice/appLanguage";
import { LanguagePickerModal } from "../../../practice/LanguagePickerModal";
import { AnimatedProgressBar } from "../../../ui/AnimatedProgressBar";
import { getPracticeQuestions, type PracticeQuestion } from "../../../db/practiceContent";

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
  const { defaultLanguageCode } = useAppLanguage();

  const [questions, setQuestions] = useState<PracticeQuestion[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [languageCode, setLanguageCode] = useState(defaultLanguageCode);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  useEffect(() => {
    if (!topicId || !levelKey) return;
    const difficulty = levelKey as "all" | "easy" | "medium" | "hard";
    getPracticeQuestions(topicId, difficulty, examCode ?? null).then(setQuestions);
  }, [topicId, levelKey, examCode]);

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
      addSession({
        id: sessionId,
        completedAt: Date.now(),
        examLabel: examLabel ?? "",
        subjectName: subjectName ?? "",
        topicName: topicName ?? "",
        levelLabel: levelLabel ?? "",
        correctCount,
        totalCount: total,
        results,
      });
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
        <View style={styles.centeredScreen}>
          <ActivityIndicator size="large" color="#1a2b4a" />
        </View>
      </>
    );
  }

  if (!question || !translation) {
    return (
      <>
        <Stack.Screen options={{ title: topicName ?? "Quiz" }} />
        <View style={styles.centeredScreen}>
          <Ionicons name="alert-circle-outline" size={40} color="#c7cee0" />
          <Text style={styles.emptyTitle}>No questions available</Text>
          <Text style={styles.emptyText}>There's nothing synced for this selection yet.</Text>
          <Pressable style={styles.emptyButton} onPress={() => router.back()}>
            <Text style={styles.emptyButtonText}>Go back</Text>
          </Pressable>
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
            <Ionicons name="language-outline" size={16} color="#1a2b4a" />
            <Text style={styles.languageButtonText}>{currentLanguageName}</Text>
            <Ionicons name="chevron-down" size={14} color="#1a2b4a" />
          </Pressable>

          <View style={styles.toolbarIcons}>
            <Pressable style={styles.iconButton} onPress={toggleReport}>
              <Ionicons name={isReported ? "flag" : "flag-outline"} size={20} color={isReported ? "#c94f4f" : "#8a94a6"} />
            </Pressable>
            <Pressable style={styles.iconButton} onPress={handleToggleBookmark}>
              <Ionicons
                name={isBookmarked(question.id) ? "star" : "star-outline"}
                size={22}
                color={isBookmarked(question.id) ? "#e8a63c" : "#8a94a6"}
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
                  {showCorrectHighlight && <Ionicons name="checkmark-circle" size={20} color="#2f9e64" />}
                  {isPickedWrong && <Ionicons name="close-circle" size={20} color="#c94f4f" />}
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
            <Pressable style={styles.nextButton} onPress={goNext}>
              <Text style={styles.nextButtonText}>{currentIndex === total - 1 ? "Finish" : "Next Question"}</Text>
            </Pressable>
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
  centeredScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  emptyText: {
    fontSize: 13,
    color: "#8a94a6",
    textAlign: "center",
  },
  emptyButton: {
    marginTop: 14,
    backgroundColor: "#1a2b4a",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  emptyButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  progressRow: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#e2e6ee",
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1a2b4a",
  },
  progressText: {
    marginTop: 6,
    fontSize: 12,
    color: "#8a94a6",
  },
  toolbarRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  languageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#eef1f8",
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  languageButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  toolbarIcons: {
    flexDirection: "row",
    gap: 4,
  },
  iconButton: {
    padding: 8,
  },
  container: {
    padding: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  fallbackNote: {
    fontSize: 12,
    color: "#8a94a6",
    fontStyle: "italic",
    marginBottom: 10,
  },
  questionText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a2b4a",
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 12,
    padding: 14,
  },
  optionCorrect: {
    borderColor: "#2f9e64",
    backgroundColor: "#e8f7f0",
  },
  optionWrong: {
    borderColor: "#c94f4f",
    backgroundColor: "#fdecec",
  },
  optionBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#eef1f8",
    alignItems: "center",
    justifyContent: "center",
  },
  optionBadgeCorrect: {
    backgroundColor: "#2f9e64",
  },
  optionBadgeWrong: {
    backgroundColor: "#c94f4f",
  },
  optionBadgeText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  optionBadgeTextLight: {
    color: "#ffffff",
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: "#1a2b4a",
  },
  explanationBox: {
    marginTop: 20,
    backgroundColor: "#eef1f8",
    borderRadius: 12,
    padding: 16,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#5a6a85",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  explanationText: {
    fontSize: 14,
    color: "#1a2b4a",
    lineHeight: 21,
  },
  footer: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e2e6ee",
    backgroundColor: "#ffffff",
  },
  nextButton: {
    backgroundColor: "#1a2b4a",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  nextButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
});
