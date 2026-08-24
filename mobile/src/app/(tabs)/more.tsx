import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../practice/authContext";
import { useSessionHistory } from "../../practice/sessionHistory";
import { LANGUAGES, useAppLanguage } from "../../practice/appLanguage";
import { LanguagePickerModal } from "../../practice/LanguagePickerModal";
import { useSyncStatus } from "../../sync/SyncContext";
import { Card, CardDivider, CardRow } from "../../ui/Card";
import { colors, spacing, typography } from "../../ui/theme";

function formatLastSynced(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${time}`;
}

export default function More() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { clearSessions } = useSessionHistory();
  const { defaultLanguageCode, setDefaultLanguageCode } = useAppLanguage();
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const { status, synced, total, lastSyncedAt, isRefreshing, refreshError, syncNow } = useSyncStatus();

  const isSyncing = status === "checking" || status === "syncing" || status === "partial" || isRefreshing;
  // Initial sync retries indefinitely on its own (see runInitialSyncUntilDone), so
  // status never settles on "error" for it — only a delta-sync check-for-updates
  // failure can still land here, and existing offline content is unaffected by it.
  const hasFailed = !isSyncing && refreshError !== null;
  const percent = total > 0 ? Math.min(100, Math.round((synced / total) * 100)) : 0;
  const [manualSyncing, setManualSyncing] = useState(false);

  const handleSyncNow = () => {
    setManualSyncing(true);
    syncNow().finally(() => setManualSyncing(false));
  };

  const defaultLanguageName = LANGUAGES.find((l) => l.code === defaultLanguageCode)?.name ?? "English";

  const handleClearHistory = () => {
    Alert.alert(
      "Clear practice history?",
      "This will remove all your recorded practice sessions. Bookmarked questions won't be affected. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: clearSessions },
      ],
    );
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl }]}>
      <Text style={styles.title}>More</Text>

      <Text style={typography.label}>Account</Text>
      <Card variant="container" style={styles.card}>
        <CardRow
          icon={user ? "person-circle-outline" : "cloud-upload-outline"}
          label={user ? "Your account" : "Save your progress"}
          value={user ? user.email : "Not signed in — progress is only on this phone"}
          onPress={() => router.push("/account")}
        />
      </Card>

      <Text style={[typography.label, styles.sectionSpacing]}>Preferences</Text>
      <Card variant="container" style={styles.card}>
        <CardRow
          icon="language-outline"
          label="Default quiz language"
          value={defaultLanguageName}
          onPress={() => setLanguagePickerVisible(true)}
        />
      </Card>

      <Text style={[typography.label, styles.sectionSpacing]}>Data</Text>
      <Card variant="container" style={styles.card}>
        {isSyncing ? (
          <View style={styles.row}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="sync-outline" size={18} color={colors.brand.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>
                {status === "checking" ? "Preparing content sync..." : isRefreshing ? "Checking for updates..." : "Downloading your content..."}
              </Text>
              {status === "syncing" || status === "partial" ? (
                <>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${percent}%` }]} />
                  </View>
                  <Text style={styles.rowValue}>
                    {total > 0
                      ? `${percent}% · ${synced.toLocaleString()} / ${total.toLocaleString()} questions`
                      : "Starting..."}
                  </Text>
                </>
              ) : (
                <Text style={styles.rowValue}>You can keep using the app while this finishes</Text>
              )}
            </View>
          </View>
        ) : hasFailed ? (
          <Pressable style={styles.row} onPress={handleSyncNow} disabled={manualSyncing}>
            <View style={[styles.rowIconCircle, styles.rowIconCircleDanger]}>
              <Ionicons name="warning-outline" size={18} color={colors.semantic.error} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Sync couldn&apos;t be completed</Text>
              <Text style={styles.rowValue}>
                {refreshError ?? "Your existing offline data is still available."}
              </Text>
            </View>
            <Text style={styles.actionText}>{manualSyncing ? "Retrying…" : "Retry"}</Text>
          </Pressable>
        ) : lastSyncedAt !== null ? (
          <Pressable style={styles.row} onPress={handleSyncNow} disabled={manualSyncing}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.brand.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Content is up to date</Text>
              <Text style={styles.rowValue}>Last synced: {formatLastSynced(lastSyncedAt)}</Text>
            </View>
            <Text style={styles.actionText}>{manualSyncing ? "Syncing…" : "Sync Now"}</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.row} onPress={handleSyncNow} disabled={manualSyncing}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="cloud-download-outline" size={18} color={colors.brand.primary} />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Not downloaded yet</Text>
              <Text style={styles.rowValue}>Connect to the internet to download content for offline use</Text>
            </View>
            <Text style={styles.actionText}>{manualSyncing ? "Starting…" : "Sync Now"}</Text>
          </Pressable>
        )}
        <CardDivider />
        <CardRow
          icon="trash-outline"
          iconColor={colors.semantic.error}
          iconBg={colors.semantic.errorBg}
          label="Clear practice history"
          labelColor={colors.semantic.error}
          value="Removes all recorded sessions"
          onPress={handleClearHistory}
          trailing={false}
        />
      </Card>

      <Text style={[typography.label, styles.sectionSpacing]}>About</Text>
      <Card variant="container" style={styles.card}>
        <CardRow icon="information-circle-outline" label="SarkariTaiyaari" value="Version 0.1.0" />
      </Card>

      <LanguagePickerModal
        visible={languagePickerVisible}
        selectedCode={defaultLanguageCode}
        onSelect={setDefaultLanguageCode}
        onClose={() => setLanguagePickerVisible(false)}
        title="Default quiz language"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing["3xl"],
  },
  title: {
    ...typography.pageTitle,
    marginBottom: spacing.lg,
  },
  sectionSpacing: {
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  card: {
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md + 2,
  },
  rowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceElevated2,
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconCircleDanger: {
    backgroundColor: colors.semantic.errorBg,
  },
  rowInfo: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text.primary,
  },
  rowLabelDanger: {
    color: colors.semantic.error,
  },
  rowValue: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 2,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated2,
    marginTop: spacing.sm,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand.primary,
  },
});
