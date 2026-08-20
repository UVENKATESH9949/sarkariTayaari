import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { toSubjectMeta } from "../../../constants/subjects";
import { useSyncStatus } from "../../../sync/SyncContext";
import { PressableScale } from "../../../ui/PressableScale";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { getSubjectStats, type SubjectStat } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";

function questionsLabel(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

export default function Subjects() {
  const router = useRouter();
  const { examCode, examLabel } = useLocalSearchParams<{ examCode: string; examLabel: string }>();
  const [search, setSearch] = useState("");
  const [subjects, setSubjects] = useState<SubjectStat[]>([]);

  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    getSubjectStats(examCode ?? null, mode).then(setSubjects);
  }, [examCode, syncVersion, mode]);

  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return subjects;
    return subjects.filter((subject) => subject.name.toLowerCase().includes(query));
  }, [search, subjects]);

  const openTopics = (subjectId: string, subjectName: string) => {
    router.push({ pathname: "/practice/topics", params: { examCode, examLabel, subjectId, subjectName } });
  };

  return (
    <>
      <Stack.Screen options={{ title: examLabel ?? "Subjects" }} />
      <View style={styles.screen}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#8a94a6" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search subjects..."
            placeholderTextColor="#8a94a6"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.heading}>Choose a subject</Text>
          <Text style={styles.subheading}>Shared across every exam you're preparing for</Text>

          <View style={styles.list}>
            {filteredSubjects.map((subject, index) => {
              const meta = toSubjectMeta(subject);
              const disabled = subject.questionCount === 0;
              return (
                <FadeInItem key={subject.id} index={index}>
                <PressableScale
                  disabled={disabled}
                  onPress={() => openTopics(subject.id, subject.name)}
                  style={[styles.card, disabled && styles.cardDisabled]}
                >
                  <View style={[styles.iconCircle, { backgroundColor: meta.iconBg }]}>
                    <Ionicons name={meta.icon} size={22} color={meta.iconColor} />
                  </View>
                  <View style={styles.textBlock}>
                    <Text style={styles.subjectName}>{subject.name}</Text>
                    <Text style={styles.subjectStats}>
                      {disabled ? "No questions yet" : questionsLabel(subject.questionCount)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color="#c3cadb" />
                </PressableScale>
                </FadeInItem>
              );
            })}

            {filteredSubjects.length === 0 && subjects.length > 0 && (
              <Text style={styles.emptyText}>No subjects match "{search}"</Text>
            )}
            {subjects.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
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
    gap: 12,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 14,
  },
  cardPressed: {
    backgroundColor: "#f5f6f9",
  },
  cardDisabled: {
    backgroundColor: "#f5f6f9",
    opacity: 0.6,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textBlock: {
    flex: 1,
  },
  subjectName: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  subjectStats: {
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
