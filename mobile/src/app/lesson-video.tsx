import { useEffect, useState } from "react";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEvent } from "expo";
import { VideoView, useVideoPlayer, type VideoSource } from "expo-video";
import { StyleSheet, View, Text, ActivityIndicator } from "react-native";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";
import { lessonVideoStreamUrl } from "@sarkaritaiyaari/core/api";
import { loadSession } from "../db/authSession";

/**
 * Full-screen playback of a lesson video — either a downloaded local file, or a direct network
 * stream for a student who would rather watch now than wait for a download.
 *
 * <p>Streaming reuses the exact same authenticated `/stream` endpoint the download path already
 * calls, via `expo-video`'s own `{ uri, headers }` source shape — no second backend contract, no
 * weaker entitlement check than the download path already enforces. The bearer token is resolved
 * here, not carried through route params, so it never sits in navigation state.
 *
 * <p>A local file always takes priority when both are somehow present: it needs no network and
 * cannot fail mid-playback the way a stream can.
 */
export default function LessonVideoScreen() {
  const { localUri, streamPath, title } = useLocalSearchParams<{
    localUri?: string;
    streamPath?: string;
    title?: string;
  }>();
  const styles = useThemedStyles(buildStyles);
  const navigation = useNavigation();

  // The caller knows what this lesson is about; the route name does not. AI Videos passes the
  // topic name, so the header reads "Profit & Loss" rather than "Video Lesson".
  useEffect(() => {
    if (title) navigation.setOptions({ title });
  }, [navigation, title]);

  const [streamSource, setStreamSource] = useState<VideoSource | null>(null);
  const [streamError, setStreamError] = useState(false);

  useEffect(() => {
    if (localUri || !streamPath) return;
    let cancelled = false;
    loadSession().then((session) => {
      if (cancelled) return;
      if (!session?.token) {
        setStreamError(true);
        return;
      }
      setStreamSource({
        uri: lessonVideoStreamUrl(streamPath),
        headers: { Authorization: `Bearer ${session.token}` },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [localUri, streamPath]);

  const source: VideoSource | null = localUri ?? streamSource;
  const player = useVideoPlayer(source, (instance) => {
    instance.loop = false;
    instance.play();
  });

  const { status } = useEvent(player, "statusChange", { status: player.status });

  if (!localUri && !streamPath) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>This lesson is not on your device.</Text>
      </View>
    );
  }

  if (streamError) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>
          Couldn&apos;t start playback — sign in again and try once more.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        style={styles.video}
        player={player}
        fullscreenOptions={{ enable: true }}
        allowsPictureInPicture
        nativeControls
        contentFit="contain"
      />
      {(status === "loading" || (!localUri && !streamSource)) && (
        <View style={styles.overlay}>
          <ActivityIndicator />
        </View>
      )}
      {status === "error" && !localUri && (
        <View style={styles.overlay}>
          <Text style={styles.message}>
            Playback stopped — check your connection, or download the lesson to watch offline.
          </Text>
        </View>
      )}
      {title ? <Text style={styles.caption}>{title}</Text> : null}
    </View>
  );
}

function buildStyles({ colors }: Theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.bg,
      justifyContent: "center",
    },
    video: {
      width: "100%",
      aspectRatio: 16 / 9,
      backgroundColor: "#000",
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "center",
    },
    caption: {
      color: colors.text.secondary,
      fontSize: 14,
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    message: {
      color: colors.text.secondary,
      fontSize: 15,
      textAlign: "center",
      paddingHorizontal: 24,
    },
  });
}
