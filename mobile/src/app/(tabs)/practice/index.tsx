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

// Every exam here is real, locally-synced data — no hardcoded "coming soon" exams.
// Adding a new exam on the backend makes it appear here automatically on next sync.
export default function Practice() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [exams, setExams] = useState<ExamOption[]>([]);

  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    getSyncedExams(mode).then(setExams);
  }, [syncVersion, mode]);

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
        {/* While searching, the "All Government Exams" shortcut is noise — the user has
            told us what they are looking for. */}
        {!searching && (
          <>
            <Text style={typography.label}>Recommended</Text>
            <Card
              variant="filled"
              onPress={() => openSubjects("ALL", "All Government Exams")}
              style={styles.allExamsCard}
            >
              <View style={[styles.iconCircle, styles.allExamsIconCircle]}>
                <Ionicons name="earth" size={26} color={colors.text.onAccent} />
              </View>
              <View style={styles.allExamsTextBlock}>
                <Text style={styles.allExamsTitle}>All Government Exams</Text>
                <Text style={styles.allExamsSubtitle}>Common Quant, Reasoning, English & GA content</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
            </Card>
          </>
        )}

        <Text style={[typography.label, styles.sectionLabel]}>
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
              <Card onPress={() => openSubjects(exam.code, exam.name)} style={styles.examCard}>
                <View style={styles.iconCircle}>
                  <Ionicons name="document-text-outline" size={22} color={colors.brand.primary} />
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
          {/* Two different empty states: nothing synced yet is a content gap, while a
              search that found nothing is a dead end the user can back out of. */}
          {filteredExams.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
          {filteredExams.length === 0 && mode !== "unavailable" && (
            <EmptyState
              icon={searching ? "search-outline" : "document-text-outline"}
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
  sectionLabel: {
    marginTop: spacing.sm,
  },
  allExamsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceElevated2,
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
    color: colors.text.onAccent,
  },
  allExamsSubtitle: {
    fontSize: 12,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },
  list: {
    gap: spacing.md,
  },
  examCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
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
