import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useBookmarks } from "../practice/bookmarks";
import { useSessionHistory } from "../practice/sessionHistory";
import { getWrongAnswers, type WrongAnswerItem } from "../practice/wrongAnswers";

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

        <ScrollView contentContainerStyle={styles.list}>
          {items.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons
                name={activeTab === "bookmarks" ? "star-outline" : "checkmark-done-circle-outline"}
                size={40}
                color="#c7cee0"
              />
              <Text style={styles.emptyTitle}>
                {activeTab === "bookmarks" ? "No bookmarks yet" : "No wrong answers yet"}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === "bookmarks"
                  ? "Tap the star icon while practicing to save a question here for later revision."
                  : "Great job so far — questions you get wrong during practice will show up here for revision."}
              </Text>
            </View>
          )}

          {items.map((item) => {
            const isExpanded = expandedId === item.id;
            return (
              <Pressable
                key={item.id}
                style={styles.card}
                onPress={() => setExpandedId(isExpanded ? null : item.id)}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTag}>
                    {item.subjectName} · {item.topicName}
                  </Text>
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color="#8a94a6" />
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
                            {isCorrect && <Ionicons name="checkmark-circle" size={18} color="#2f9e64" />}
                            {isPickedWrong && <Ionicons name="close-circle" size={18} color="#c94f4f" />}
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
                        <Ionicons name="star" size={16} color="#e8a63c" />
                        <Text style={styles.removeButtonText}>Remove bookmark</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#f5f6f9",
    borderRadius: 10,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: "#ffffff",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8a94a6",
  },
  segmentTextActive: {
    color: "#1a2b4a",
  },
  list: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 12,
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    paddingHorizontal: 20,
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
    lineHeight: 19,
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTag: {
    fontSize: 12,
    fontWeight: "600",
    color: "#5a6a85",
  },
  cardQuestion: {
    fontSize: 15,
    color: "#1a2b4a",
    lineHeight: 21,
  },
  expandedContent: {
    marginTop: 14,
  },
  optionsList: {
    gap: 8,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 10,
    padding: 11,
  },
  optionCorrect: {
    borderColor: "#2f9e64",
    backgroundColor: "#e8f7f0",
  },
  optionWrong: {
    borderColor: "#c94f4f",
    backgroundColor: "#fdecec",
  },
  optionText: {
    fontSize: 13,
    color: "#1a2b4a",
    flex: 1,
  },
  explanationBox: {
    marginTop: 12,
    backgroundColor: "#eef1f8",
    borderRadius: 10,
    padding: 12,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5a6a85",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  explanationText: {
    fontSize: 13,
    color: "#1a2b4a",
    lineHeight: 19,
  },
  removeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
  },
  removeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#c94f4f",
  },
});
