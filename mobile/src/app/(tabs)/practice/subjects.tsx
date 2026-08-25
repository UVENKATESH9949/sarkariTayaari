import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { toSubjectMeta } from "../../../constants/subjects";
import { useSyncStatus } from "../../../sync/SyncContext";
import { ContextualLoading } from "../../../ui/ContextualLoading";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { ListSkeleton } from "../../../ui/Skeleton";
import { colors, radius, spacing, typography } from "../../../ui/theme";
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
  const [loading, setLoading] = useState(true);

  const { syncVersion } = useSyncStatus();
  const mode = useHybridMode();

  useEffect(() => {
    getSubjectStats(examCode ?? null, mode).then((result) => {
      setSubjects(result);
      setLoading(false);
    });
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
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search subjects..."
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.heading}>Choose a subject</Text>
          <Text style={styles.subheading}>Shared across every exam you're preparing for</Text>

          {loading ? (
            <ContextualLoading
              message={`Preparing subjects for ${examLabel ?? "this exam"}...`}
              skeleton={<ListSkeleton count={5} />}
            />
          ) : (
          <View style={styles.list}>
            {filteredSubjects.map((subject, index) => {
              const meta = toSubjectMeta(subject);
              const disabled = subject.questionCount === 0;
              return (
                <FadeInItem key={subject.id} index={index}>
                  <Card
                    disabled={disabled}
                    onPress={() => openTopics(subject.id, subject.name)}
                    style={styles.card}
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
                    <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                  </Card>
                </FadeInItem>
              );
            })}

            {filteredSubjects.length === 0 && subjects.length > 0 && (
              <EmptyState icon="search-outline" title={`No subjects match "${search}"`} />
            )}
            {subjects.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
            {subjects.length === 0 && mode !== "unavailable" && (
              <EmptyState icon="book-outline" title="No subjects synced yet" body="Subjects appear here once they're synced." />
            )}
          </View>
          )}
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
  container: {
    padding: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing["3xl"],
  },
  heading: {
    ...typography.pageTitle,
    fontSize: 22,
  },
  subheading: {
    ...typography.secondary,
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  list: {
    gap: spacing.md,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md + 2,
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
    color: colors.text.primary,
  },
  subjectStats: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
});
