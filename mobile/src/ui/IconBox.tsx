import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { IoniconName } from "../constants/subjects";
import { colors } from "./theme";

type IconBoxProps = {
  icon: IoniconName;
  size?: number;
  iconSize?: number;
  iconColor?: string;
  /** Flat background color. Ignored if `gradientColors` is set. */
  backgroundColor?: string;
  gradientColors?: readonly [string, string];
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
  iconColor = colors.text.onAccent,
  backgroundColor,
  gradientColors,
  style,
}: IconBoxProps) {
  const boxStyle: StyleProp<ViewStyle> = [
    styles.box,
    { width: size, height: size, borderRadius: Math.round(size * 0.27) },
    !gradientColors && { backgroundColor: backgroundColor ?? colors.surfaceElevated2 },
    style,
  ];
  const resolvedIconSize = iconSize ?? Math.round(size * 0.43);

  if (gradientColors) {
    return (
      <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={boxStyle}>
        <Ionicons name={icon} size={resolvedIconSize} color={iconColor} />
      </LinearGradient>
    );
  }

  return (
    <View style={boxStyle}>
      <Ionicons name={icon} size={resolvedIconSize} color={iconColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
});
