import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Alert, Pressable, ScrollView, Text, View, StyleSheet } from "react-native";
import { useAuth } from "../../practice/authContext";
import { useSessionHistory } from "../../practice/sessionHistory";
import { LANGUAGES, useAppLanguage } from "../../practice/appLanguage";
import { LanguagePickerModal } from "../../practice/LanguagePickerModal";
import { useSyncStatus } from "../../sync/SyncContext";

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
  const { user } = useAuth();
  const { clearSessions } = useSessionHistory();
  const { defaultLanguageCode, setDefaultLanguageCode } = useAppLanguage();
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const { status, synced, total, lastSyncedAt, isRefreshing, refreshError, syncNow } = useSyncStatus();

  const isSyncing = status === "checking" || status === "syncing" || status === "partial" || isRefreshing;
  const hasFailed = !isSyncing && (status === "error" || refreshError !== null);
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
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>More</Text>

      <Text style={styles.sectionTitle}>Account</Text>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => router.push("/account")}>
          <View style={styles.rowIconCircle}>
            <Ionicons name={user ? "person-circle-outline" : "cloud-upload-outline"} size={18} color="#1a2b4a" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>{user ? "Your account" : "Save your progress"}</Text>
            <Text style={styles.rowValue}>
              {user
                ? user.email
                : "Not signed in — progress is only on this phone"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#c7cee0" />
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Preferences</Text>
      <View style={styles.card}>
        <Pressable style={styles.row} onPress={() => setLanguagePickerVisible(true)}>
          <View style={styles.rowIconCircle}>
            <Ionicons name="language-outline" size={18} color="#1a2b4a" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>Default quiz language</Text>
            <Text style={styles.rowValue}>{defaultLanguageName}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#c7cee0" />
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Data</Text>
      <View style={styles.card}>
        {isSyncing ? (
          <View style={styles.row}>
            <View style={styles.rowIconCircle}>
              <Ionicons name="sync-outline" size={18} color="#1a2b4a" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>
                {status === "checking" ? "Preparing content sync..." : isRefreshing ? "Checking for updates..." : "Syncing content..."}
              </Text>
              <Text style={styles.rowValue}>
                {total > 0
                  ? `${synced} / ${total} questions — you can keep using the app`
                  : "You can keep using the app while this finishes"}
              </Text>
            </View>
          </View>
        ) : hasFailed ? (
          <Pressable style={styles.row} onPress={handleSyncNow} disabled={manualSyncing}>
            <View style={[styles.rowIconCircle, styles.rowIconCircleDanger]}>
              <Ionicons name="warning-outline" size={18} color="#c94f4f" />
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
              <Ionicons name="checkmark-circle-outline" size={18} color="#1a2b4a" />
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
              <Ionicons name="cloud-download-outline" size={18} color="#1a2b4a" />
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowLabel}>Not downloaded yet</Text>
              <Text style={styles.rowValue}>Connect to the internet to download content for offline use</Text>
            </View>
            <Text style={styles.actionText}>{manualSyncing ? "Starting…" : "Sync Now"}</Text>
          </Pressable>
        )}
        <View style={styles.divider} />
        <Pressable style={styles.row} onPress={handleClearHistory}>
          <View style={[styles.rowIconCircle, styles.rowIconCircleDanger]}>
            <Ionicons name="trash-outline" size={18} color="#c94f4f" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={[styles.rowLabel, styles.rowLabelDanger]}>Clear practice history</Text>
            <Text style={styles.rowValue}>Removes all recorded sessions</Text>
          </View>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>About</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowIconCircle}>
            <Ionicons name="information-circle-outline" size={18} color="#1a2b4a" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowLabel}>SarkariTaiyaari</Text>
            <Text style={styles.rowValue}>Version 0.1.0</Text>
          </View>
        </View>
      </View>

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
    padding: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a2b4a",
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8a94a6",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 20,
  },
  card: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e6ee",
    borderRadius: 14,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  rowIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#eef1f8",
    alignItems: "center",
    justifyContent: "center",
  },
  rowIconCircleDanger: {
    backgroundColor: "#fdecec",
  },
  rowInfo: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1a2b4a",
  },
  rowLabelDanger: {
    color: "#c94f4f",
  },
  rowValue: {
    fontSize: 12,
    color: "#8a94a6",
    marginTop: 2,
  },
  actionText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  divider: {
    height: 1,
    backgroundColor: "#eef1f8",
    marginLeft: 60,
  },
});
