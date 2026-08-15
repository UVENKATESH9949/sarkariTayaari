import { Text, View, StyleSheet } from "react-native";
import { useSyncStatus } from "./SyncContext";

export function SyncProgressScreen() {
  const { status, synced, total } = useSyncStatus();
  const percent = total > 0 ? Math.round((synced / total) * 100) : 0;
  const isChecking = status === "checking";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SarkariTaiyaari</Text>
      <Text style={styles.subtitle}>
        {isChecking ? "Preparing your question bank..." : "Downloading your question bank..."}
      </Text>

      {!isChecking && (
        <View style={styles.progressBlock}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${percent}%` }]} />
          </View>
          <Text style={styles.percent}>{total > 0 ? `${synced} / ${total} · ${percent}%` : "Starting..."}</Text>
        </View>
      )}

      <Text style={styles.note}>This only happens once — after this, the app works fully offline.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1a2b4a",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#5a6a85",
    textAlign: "center",
  },
  progressBlock: {
    width: "100%",
    marginTop: 32,
    alignItems: "center",
  },
  track: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#e2e6ee",
    overflow: "hidden",
  },
  fill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1a2b4a",
  },
  percent: {
    marginTop: 10,
    fontSize: 13,
    color: "#5a6a85",
  },
  note: {
    marginTop: 40,
    fontSize: 12,
    color: "#8a94a6",
    textAlign: "center",
  },
});
