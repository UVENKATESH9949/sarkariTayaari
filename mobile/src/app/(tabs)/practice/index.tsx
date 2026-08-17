import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { getSyncedExams, type ExamOption } from "../../../db/practiceContent";
import { useSyncStatus } from "../../../sync/SyncContext";
import { PressableScale } from "../../../ui/PressableScale";
import { FadeInItem } from "../../../ui/FadeInList";

// Every exam here is real, locally-synced data — no hardcoded "coming soon" exams.
// Adding a new exam on the backend makes it appear here automatically on next sync.
export default function Practice() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [exams, setExams] = useState<ExamOption[]>([]);

  const { syncVersion } = useSyncStatus();

  useEffect(() => {
    getSyncedExams().then(setExams);
  }, [syncVersion]);

  const openSubjects = (examCode: string, examLabel: string) => {
    router.push({ pathname: "/practice/subjects", params: { examCode, examLabel } });
  };

  // This box used to be decorative — it accepted text and changed nothing, which is
  // worse than having no search at all, because it reads as broken rather than absent.
  const query = search.trim().toLowerCase();
  const filteredExams = useMemo(
    () => (query ? exams.filter((exam) => exam.name.toLowerCase().includes(query)) : exams),
    [exams, query],
  );
  const searching = query.length > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color="#8a94a6" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search exams..."
          placeholderTextColor="#8a94a6"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searching && (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color="#c3cadb" />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* While searching, the "All Government Exams" shortcut is noise — the user has
            told us what they are looking for. */}
        {!searching && (
          <>
            <Text style={styles.sectionLabel}>Recommended</Text>
            <PressableScale
              style={styles.allExamsCard}
              onPress={() => openSubjects("ALL", "All Government Exams")}
            >
              <View style={[styles.iconCircle, styles.allExamsIconCircle]}>
                <Ionicons name="earth" size={26} color="#ffffff" />
              </View>
              <View style={styles.allExamsTextBlock}>
                <Text style={styles.allExamsTitle}>All Government Exams</Text>
                <Text style={styles.allExamsSubtitle}>Common Quant, Reasoning, English & GA content</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#c3cadb" />
            </PressableScale>
          </>
        )}

        <Text style={styles.sectionLabel}>
          {searching ? `${filteredExams.length} result${filteredExams.length === 1 ? "" : "s"}` : "Browse by exam"}
        </Text>
        {/*
          A single-column list rather than a two-up grid: exam names range from "GK"
          to "RRB NTPC (Graduate Level)", and a fixed-width tile either wastes space on
          short names or forces long ones onto three lines. A full-width row also has
          room for a second line, so the count of what's actually synced is visible
          without a tap — the thing an aspirant most wants to know before diving in.
        */}
        <View style={styles.list}>
          {filteredExams.map((exam, index) => (
            <FadeInItem key={exam.code} index={index}>
              <PressableScale onPress={() => openSubjects(exam.code, exam.name)} style={styles.examCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name="document-text-outline" size={22} color="#1a2b4a" />
                </View>
                <View style={styles.examTextBlock}>
                  <Text style={styles.examLabel} numberOfLines={2}>
                    {exam.name}
                  </Text>
                  <Text style={styles.examMeta}>
                    {exam.questionCount === 0
                      ? "Not synced yet"
                      : `${exam.questionCount.toLocaleString()} question${exam.questionCount === 1 ? "" : "s"}`}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#c3cadb" />
              </PressableScale>
            </FadeInItem>
          ))}
          {/* Two different empty states: nothing synced yet is a content gap, while a
              search that found nothing is a dead end the user can back out of. */}
          {filteredExams.length === 0 && (
            <Text style={styles.emptyText}>
              {searching
                ? `No exams match "${search.trim()}"`
                : "More exams are added as they're synced."}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
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
  scrollContent: {
    padding: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8a94a6",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 8,
  },
  allExamsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#1a2b4a",
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
  },
  allExamsCardPressed: {
    backgroundColor: "#142138",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#eef1f8",
    alignItems: "center",
    justifyContent: "center",
  },
  allExamsIconCircle: {
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  allExamsTextBlock: {
    flex: 1,
  },
  allExamsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  allExamsSubtitle: {
    fontSize: 12,
    color: "#c3cadb",
    marginTop: 2,
  },
  list: {
    gap: 12,
  },
  examCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    padding: 14,
  },
  examCardPressed: {
    backgroundColor: "#eef1f8",
    borderColor: "#1a2b4a",
  },
  examTextBlock: {
    flex: 1,
  },
  examLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  examMeta: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: "#8a94a6",
    textAlign: "center",
    paddingVertical: 12,
  },
});
