import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View, StyleSheet } from "react-native";
import { getCycleHistory, type CycleHistoryEntry } from "../api/examGuide";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { ContextualLoading } from "../ui/ContextualLoading";
import { ListSkeleton } from "../ui/Skeleton";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Exam Guide spec §63 "Notification History" / §37 "Expired Information" — past
 * recruitment cycles are kept, never deleted, when a new one is promoted to current;
 * this is the screen that lets that history actually be seen rather than just sit
 * unreachable in the database. English-only, like the other new Doc 1 screens this pass.
 */
export default function ExamGuideHistoryScreen() {
  const styles = useThemedStyles(buildStyles);
  const { examCode, examName } = useLocalSearchParams<{ examCode: string; examName?: string }>();
  const [entries, setEntries] = useState<CycleHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!examCode) return;
    getCycleHistory(examCode)
      .then(setEntries)
      .catch((err) => setError(err.message ?? String(err)));
  }, [examCode]);

  if (error) {
    return (
      <View style={styles.centered}>
        <EmptyState icon="alert-circle-outline" title="Couldn't load history" body={error} />
      </View>
    );
  }

  if (entries === null) {
    return (
      <View style={styles.centered}>
        <ContextualLoading message="Loading past cycles..." skeleton={<ListSkeleton />} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Notification History" }} />
      <ScrollView contentContainerStyle={styles.container}>
        {entries.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title="No past cycles yet"
            body={`${examName ?? examCode} only has its current recruitment cycle on record.`}
          />
        ) : (
          entries.map((entry) => (
            <Card key={entry.recruitmentCycleId} variant="container" style={styles.card}>
              <Text style={styles.cycleName}>{entry.cycleName}</Text>
              <Text style={styles.cycleStatus}>{statusLabel(entry.status)}</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Application</Text>
                <Text style={styles.rowValue}>
                  {formatDate(entry.applicationStart)} – {formatDate(entry.applicationEnd)}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Exam</Text>
                <Text style={styles.rowValue}>
                  {formatDate(entry.examStart)} – {formatDate(entry.examEnd)}
                </Text>
              </View>
              {entry.vacancyCount !== null && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Vacancies</Text>
                  <Text style={styles.rowValue}>{entry.vacancyCount}</Text>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>
    </>
  );
}

const buildStyles = ({ colors, spacing, typography }: Theme) =>
  StyleSheet.create({
    centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: spacing["2xl"] },
    container: { padding: spacing.xl, paddingBottom: spacing["3xl"] },
    card: { marginBottom: spacing.md },
    cycleName: { ...typography.cardTitle },
    cycleStatus: { fontSize: 12, color: colors.text.muted, marginTop: 2, marginBottom: spacing.sm },
    row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
    rowLabel: { fontSize: 12, color: colors.text.muted },
    rowValue: { fontSize: 12, color: colors.text.primary, fontWeight: "600" },
  });
