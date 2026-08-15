import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { toSubjectMeta } from "../../../constants/subjects";
import { getTopicStats, type TopicStat } from "../../../db/practiceContent";
import { getSubjectMetaByName, type SubjectMetaRow } from "../../../db/subjectMeta";
import { useSyncStatus } from "../../../sync/SyncContext";

function questionsLabel(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

export default function Topics() {
  const router = useRouter();
  const { examCode, examLabel, subjectId, subjectName } = useLocalSearchParams<{
    examCode: string;
    examLabel: string;
    subjectId: string;
    subjectName: string;
  }>();
  const [search, setSearch] = useState("");
  const [topics, setTopics] = useState<TopicStat[]>([]);
  const [subjectStyle, setSubjectStyle] = useState<SubjectMetaRow | null>(null);

  const { syncVersion } = useSyncStatus();

  useEffect(() => {
    if (!subjectId) return;
    getTopicStats(subjectId, examCode ?? null).then(setTopics);
  }, [subjectId, examCode, syncVersion]);

  // Styling is synced per subject rather than looked up from a hardcoded table.
  useEffect(() => {
    if (!subjectName) return;
    getSubjectMetaByName(subjectName).then(setSubjectStyle);
  }, [subjectName]);

  const subjectMeta = toSubjectMeta(subjectStyle, subjectName ?? "");

  const filteredTopics = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return topics;
    return topics.filter((topic) => topic.name.toLowerCase().includes(query));
  }, [search, topics]);

  const openLevels = (topic: TopicStat) => {
    router.push({
      pathname: "/practice/levels",
      params: { examCode, examLabel, subjectName, topicId: topic.id, topicName: topic.name },
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: subjectName ?? "Topics" }} />
      <View style={styles.screen}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#8a94a6" />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search topics in ${subjectName ?? "this subject"}...`}
            placeholderTextColor="#8a94a6"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.heading}>Choose a topic</Text>
          <Text style={styles.subheading}>{topics.length} topics under {subjectName}</Text>

          <View style={styles.list}>
            {filteredTopics.map((topic) => {
              const disabled = topic.questionCount === 0;
              return (
                <Pressable
                  key={topic.id}
                  disabled={disabled}
                  onPress={() => openLevels(topic)}
                  style={({ pressed }) => [
                    styles.card,
                    disabled && styles.cardDisabled,
                    !disabled && pressed && styles.cardPressed,
                  ]}
                >
                  <View style={[styles.iconCircle, { backgroundColor: subjectMeta.iconBg }]}>
                    <Ionicons name="document-text-outline" size={18} color={subjectMeta.iconColor} />
                  </View>
                  <View style={styles.textBlock}>
                    <Text style={styles.topicName}>{topic.name}</Text>
                    <Text style={styles.topicStats}>
                      {disabled ? "No questions yet" : questionsLabel(topic.questionCount)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#c3cadb" />
                </Pressable>
              );
            })}

            {filteredTopics.length === 0 && topics.length > 0 && (
              <Text style={styles.emptyText}>No topics match "{search}"</Text>
            )}
          </View>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#1a2b4a",
    padding: 0,
  },
  container: {
    padding: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  subheading: {
    marginTop: 4,
    fontSize: 13,
    color: "#8a94a6",
    marginBottom: 20,
  },
  list: {
    gap: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 12,
    padding: 12,
  },
  cardPressed: {
    backgroundColor: "#f5f6f9",
  },
  cardDisabled: {
    backgroundColor: "#f5f6f9",
    opacity: 0.6,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  topicName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  topicStats: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 2,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 13,
    color: "#8a94a6",
    textAlign: "center",
  },
});
