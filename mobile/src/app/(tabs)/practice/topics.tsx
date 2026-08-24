import { useEffect, useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { toSubjectMeta } from "../../../constants/subjects";
import { getTopicStats, type TopicStat } from "../../../data/practiceData";
import { useHybridMode } from "../../../data/hybridSource";
import { getSubjectMetaByName, type SubjectMetaRow } from "../../../db/subjectMeta";
import { useSyncStatus } from "../../../sync/SyncContext";
import { FadeInItem } from "../../../ui/FadeInList";
import { OfflineNoDataNotice } from "../../../ui/OfflineNoDataNotice";
import { Card } from "../../../ui/Card";
import { EmptyState } from "../../../ui/EmptyState";
import { colors, radius, spacing, typography } from "../../../ui/theme";

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
  const mode = useHybridMode();

  useEffect(() => {
    if (!subjectId) return;
    getTopicStats(subjectId, examCode ?? null, mode).then(setTopics);
  }, [subjectId, examCode, syncVersion, mode]);

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
          <Ionicons name="search" size={18} color={colors.text.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search topics in ${subjectName ?? "this subject"}...`}
            placeholderTextColor={colors.text.muted}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.heading}>Choose a topic</Text>
          <Text style={styles.subheading}>{topics.length} topics under {subjectName}</Text>

          <View style={styles.list}>
            {filteredTopics.map((topic, index) => {
              const disabled = topic.questionCount === 0;
              return (
                <FadeInItem key={topic.id} index={index}>
                  <Card
                    disabled={disabled}
                    onPress={() => openLevels(topic)}
                    style={styles.card}
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
                    <Ionicons name="chevron-forward" size={18} color={colors.text.muted} />
                  </Card>
                </FadeInItem>
              );
            })}

            {filteredTopics.length === 0 && topics.length > 0 && (
              <EmptyState icon="search-outline" title={`No topics match "${search}"`} />
            )}
            {topics.length === 0 && mode === "unavailable" && <OfflineNoDataNotice />}
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
    gap: spacing.sm + 2,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
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
    color: colors.text.primary,
  },
  topicStats: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
});
