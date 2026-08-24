import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { getSyncedExams, type ExamOption } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { useSyncStatus } from "../../../sync/SyncContext";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { colors, radius, spacing, typography } from "../../../ui/theme";

// Every exam here is real, locally-synced data, same source Practice uses. A mock
// paper always belongs to one exam's structure, so there's no cross-exam "All Exams"
// shortcut here the way Practice has one.
export default function MockTestExamSelection() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [exams, setExams] = useState<ExamOption[]>([]);

  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    getSyncedExams(mode).then(setExams);
  }, [syncVersion, mode]);

  const openPapers = (examCode: string, examLabel: string) => {
    router.push({ pathname: "/mock-test/papers", params: { examCode, examLabel } });
  };

  const query = search.trim().toLowerCase();
  const filteredExams = useMemo(
    () => (query ? exams.filter((exam) => exam.name.toLowerCase().includes(query)) : exams),
    [exams, query],
  );
  const searching = query.length > 0;

  return (
    <View style={styles.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.text.muted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search exams..."
          placeholderTextColor={colors.text.muted}
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searching && (
          <Pressable onPress={() => setSearch("")} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.text.muted} />
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={typography.label}>
          {searching ? `${filteredExams.length} result${filteredExams.length === 1 ? "" : "s"}` : "Choose an exam"}
        </Text>
        <View style={styles.list}>
          {filteredExams.map((exam, index) => (
            <FadeInItem key={exam.code} index={index}>
              <Card onPress={() => openPapers(exam.code, exam.name)} style={styles.examCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name="timer-outline" size={22} color={colors.brand.primary} />
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
                <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
              </Card>
            </FadeInItem>
          ))}
          {filteredExams.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
          {filteredExams.length === 0 && mode !== "unavailable" && (
            <EmptyState
              icon={searching ? "search-outline" : "timer-outline"}
              title={searching ? `No exams match "${search.trim()}"` : "No exams synced yet"}
              body={searching ? undefined : "More exams are added as they're synced."}
            />
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
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    marginHorizontal: spacing.xl,
    marginTop: spacing.base,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm + 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    padding: 0,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing["3xl"],
  },
  list: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  examCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated2,
    alignItems: "center",
    justifyContent: "center",
  },
  examTextBlock: {
    flex: 1,
  },
  examLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text.primary,
  },
  examMeta: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
});
