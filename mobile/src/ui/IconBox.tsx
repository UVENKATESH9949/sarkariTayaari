import { useState } from "react";
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { IoniconName } from "../constants/subjects";
import { useTheme, useThemedStyles, type Theme } from "./ThemeContext";

type IconBoxProps = {
  icon: IoniconName;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  /** Flat background color. Ignored if `gradientColors` is set. */
  backgroundColor?: string;
  gradientColors?: readonly [string, string];
  /**
   * An admin-uploaded logo for this exam. When set it replaces the icon entirely — a real
   * board logo always beats a generic symbol. The gradient stays as the backdrop so a
   * transparent PNG still reads, and a null/failed image falls back to the icon.
   */
  imageUrl?: string | null;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_SIZE = 56;

/**
 * The rounded-square (not circular) icon container used on exam cards — distinct from
 * every other icon-circle idiom in the app (CardRow, EmptyState, AppDialog), which stay
 * circular for subjects/topics/levels. Only exam-family icons get this shape, matching
 * the redesign mockups.
 */
export function IconBox({
  icon,
  size = DEFAULT_SIZE,
  iconSize,
  iconColor,
  backgroundColor,
  gradientColors,
  imageUrl,
  style,
}: IconBoxProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  // Remembers *which* url failed rather than a bare boolean, so a changed url un-suppresses
  // itself by comparison — no reset effect, and nothing to get stale.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const boxStyle: StyleProp<ViewStyle> = [
    styles.box,
    { width: size, height: size, borderRadius: Math.round(size * 0.27) },
    !gradientColors && { backgroundColor: backgroundColor ?? colors.surfaceElevated2 },
    style,
  ];
  // Default resolved here rather than as a default parameter value (module-load time).
  const resolvedIconColor = iconColor ?? colors.text.onAccent;
  const resolvedIconSize = iconSize ?? Math.round(size * 0.43);
  const showImage = Boolean(imageUrl) && failedUrl !== imageUrl;

  const content = showImage ? (
    <Image
      source={{ uri: imageUrl as string }}
      style={{ width: size * 0.62, height: size * 0.62 }}
      resizeMode="contain"
      onError={() => setFailedUrl(imageUrl ?? null)}
    />
  ) : (
    <Ionicons name={icon} size={resolvedIconSize} color={resolvedIconColor} />
  );

  if (gradientColors) {
    return (
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={boxStyle}>
        {content}
      </LinearGradient>
    );
  }

  return <View style={boxStyle}>{content}</View>;
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    box: {
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.borderSubtle,
    },
  });
