import { Text, View, StyleSheet } from "react-native";
import { useSyncStatus } from "./SyncContext";

export function SyncBanner() {
  const { status, isRefreshing, refreshError } = useSyncStatus();

  if (status === "partial") {
    return (
      <View style={styles.banner}>
        <Text style={styles.text}>Syncing more content...</Text>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={[styles.banner, styles.bannerError]}>
        <Text style={styles.text}>Could not finish syncing. Some content may be missing.</Text>
      </View>
    );
  }

  // Background delta sync. Only worth a banner when it fails — a successful check is
  // meant to be invisible, and existing content stays usable either way.
  if (refreshError) {
    return (
      <View style={[styles.banner, styles.bannerError]}>
        <Text style={styles.text}>Couldn&apos;t check for new content. You&apos;re still offline-ready.</Text>
      </View>
    );
  }

  if (isRefreshing) {
    return (
      <View style={styles.banner}>
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
    bottom: 24,
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
