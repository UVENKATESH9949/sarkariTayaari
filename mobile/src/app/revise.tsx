import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { FlatList, Pressable, Text, View, StyleSheet } from "react-native";
import { useBookmarks } from "../practice/bookmarks";
import { useSessionHistory } from "../practice/sessionHistory";
import { getWrongAnswers, type WrongAnswerItem } from "../practice/wrongAnswers";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { colors, radius, spacing } from "../ui/theme";

type ReviseTab = "bookmarks" | "wrong";
type ReviseItem = WrongAnswerItem;

export default function Revise() {
  const { initialTab } = useLocalSearchParams<{ initialTab?: string }>();
  const { bookmarks, toggleBookmark } = useBookmarks();
  const { sessions } = useSessionHistory();
  const [activeTab, setActiveTab] = useState<ReviseTab>(initialTab === "wrong" ? "wrong" : "bookmarks");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const wrongAnswers = useMemo(() => getWrongAnswers(sessions), [sessions]);

  const bookmarkItems: ReviseItem[] = bookmarks.map((b) => ({
    id: b.questionId,
    questionText: b.questionText,
    options: b.options,
    correctIndex: b.correctIndex,
    selectedIndex: null,
    explanation: b.explanation,
    subjectName: b.subjectName,
    topicName: b.topicName,
  }));

  const items = activeTab === "bookmarks" ? bookmarkItems : wrongAnswers;

  return (
    <>
      <Stack.Screen options={{ title: "Revise" }} />
      <View style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.segmentedControl}>
            <Pressable
              style={[styles.segment, activeTab === "bookmarks" && styles.segmentActive]}
              onPress={() => setActiveTab("bookmarks")}
            >
              <Text style={[styles.segmentText, activeTab === "bookmarks" && styles.segmentTextActive]}>
                Bookmarked
              </Text>
            </Pressable>
            <Pressable
              style={[styles.segment, activeTab === "wrong" && styles.segmentActive]}
              onPress={() => setActiveTab("wrong")}
            >
              <Text style={[styles.segmentText, activeTab === "wrong" && styles.segmentTextActive]}>
                Wrong Answers
              </Text>
            </Pressable>
          </View>
        </View>

        {/*
          Virtualized, unlike every other list in this app, because this one genuinely
          grows without bound: a user can bookmark every question they ever see, and the
          Wrong Answers tab flattens all 50 retained sessions' results. A plain ScrollView
          mounted all of them at once. `key` is tied to the tab so switching tabs resets
          scroll position instead of stranding the user mid-way down the other list.
        */}
        <FlatList
          key={activeTab}
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon={activeTab === "bookmarks" ? "star-outline" : "checkmark-done-circle-outline"}
              title={activeTab === "bookmarks" ? "No bookmarks yet" : "No wrong answers yet"}
              body={
                activeTab === "bookmarks"
                  ? "Tap the star icon while practicing to save a question here for later revision."
                  : "Great job so far — questions you get wrong during practice will show up here for revision."
              }
            />
          }
          renderItem={({ item }) => {
            const isExpanded = expandedId === item.id;
            return (
              <Card onPress={() => setExpandedId(isExpanded ? null : item.id)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTag}>
                    {item.subjectName} · {item.topicName}
                  </Text>
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={colors.text.muted} />
                </View>
                <Text style={styles.cardQuestion} numberOfLines={isExpanded ? undefined : 2}>
                  {item.questionText}
                </Text>

                {isExpanded && (
                  <View style={styles.expandedContent}>
                    <View style={styles.optionsList}>
                      {item.options.map((option, index) => {
                        const isCorrect = index === item.correctIndex;
                        const isPickedWrong = item.selectedIndex === index && index !== item.correctIndex;
                        return (
                          <View
                            key={index}
                            style={[
                              styles.optionRow,
                              isCorrect && styles.optionCorrect,
                              isPickedWrong && styles.optionWrong,
                            ]}
                          >
                            <Text style={styles.optionText}>{option}</Text>
                            {isCorrect && <Ionicons name="checkmark-circle" size={18} color={colors.semantic.success} />}
                            {isPickedWrong && <Ionicons name="close-circle" size={18} color={colors.semantic.error} />}
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.explanationBox}>
                      <Text style={styles.explanationLabel}>Explanation</Text>
                      <Text style={styles.explanationText}>{item.explanation}</Text>
                    </View>
                    {activeTab === "bookmarks" && (
                      <Pressable
                        style={styles.removeButton}
                        onPress={() => {
                          const original = bookmarks.find((b) => b.questionId === item.id);
                          if (original) toggleBookmark(original);
                          setExpandedId(null);
                        }}
                      >
                        <Ionicons name="star" size={16} color={colors.semantic.warning} />
                        <Text style={styles.removeButtonText}>Remove bookmark</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Card>
            );
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.base,
    paddingBottom: spacing.base,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.surfaceElevated2,
    borderRadius: radius.sm + 2,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.surfaceElevated2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text.muted,
  },
  segmentTextActive: {
    color: colors.text.primary,
  },
  list: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing["3xl"],
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardTag: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.text.secondary,
  },
  cardQuestion: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 21,
  },
  expandedContent: {
    marginTop: spacing.md + 2,
  },
  optionsList: {
    gap: spacing.sm,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm + 2,
    padding: spacing.md - 1,
  },
  optionCorrect: {
    borderColor: colors.semantic.success,
    backgroundColor: colors.semantic.successBg,
  },
  optionWrong: {
    borderColor: colors.semantic.error,
    backgroundColor: colors.semantic.errorBg,
  },
  optionText: {
    fontSize: 13,
    color: colors.text.primary,
    flex: 1,
  },
  explanationBox: {
    marginTop: spacing.md,
    backgroundColor: colors.surfaceElevated2,
    borderRadius: radius.sm + 2,
    padding: spacing.md,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  explanationText: {
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 19,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm - 2,
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.semantic.error,
  },
});
