import { Text, View, StyleSheet } from "react-native";
import { useSyncStatus } from "./SyncContext";

export function SyncBanner() {
  const { status, synced, total, isRefreshing, refreshError } = useSyncStatus();

  // A first-ever sync, still running — previously hidden behind a blocking full-screen
  // spinner; now visible non-blocking, same as any other in-progress sync. The app is
  // already usable (reading live from the backend via useHybridMode()) while this shows.
  if (status === "checking" || status === "syncing") {
    const percent = total > 0 ? Math.round((synced / total) * 100) : 0;
    return (
      <View style={styles.banner} pointerEvents="none">
        <Text style={styles.text}>
          {status === "checking"
            ? "Preparing your question bank..."
            : total > 0
              ? `Downloading question bank... ${synced} / ${total} · ${percent}%`
              : "Downloading question bank..."}
        </Text>
      </View>
    );
  }

  if (status === "partial") {
    return (
      <View style={styles.banner} pointerEvents="none">
        <Text style={styles.text}>Syncing more content...</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[styles.banner, styles.bannerError]} pointerEvents="none">
        <Text style={styles.text}>Could not finish syncing. Some content may be missing.</Text>
      </View>
    );
  }

  // Background delta sync. Only worth a banner when it fails — a successful check is
  // meant to be invisible, and existing content stays usable either way.
  if (refreshError) {
    return (
      <View style={[styles.banner, styles.bannerError]} pointerEvents="none">
        <Text style={styles.text}>Couldn&apos;t check for new content. You&apos;re still offline-ready.</Text>
      </View>
    );
  }

  if (isRefreshing) {
    return (
      <View style={styles.banner} pointerEvents="none">
        <Text style={styles.text}>Checking for new content...</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    left: 24,
    right: 24,
    // Clears the default bottom tab bar. This banner used to only ever appear for brief
    // delta syncs on non-tab screens; now that a first-ever sync can show it for minutes
    // while the tabs are the active screen (see the "checking"/"syncing" case above), it
    // has to stay clear of the tab bar rather than only avoiding the very screen edge.
    bottom: 90,
    backgroundColor: "#1a2b4a",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  bannerError: {
    backgroundColor: "#8a3a3a",
  },
  text: {
    color: "#ffffff",
    fontSize: 13,
    textAlign: "center",
  },
});
