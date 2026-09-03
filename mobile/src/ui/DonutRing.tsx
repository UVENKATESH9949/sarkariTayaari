import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme, useThemedStyles, type Theme } from "./ThemeContext";

type DonutRingProps = {
  /** 0-100. */
  percent: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  fillColor?: string;
  /** Center label — defaults to "{percent}%". */
  label?: string;
};

/** SVG-based circular progress ring — the readiness score visual on Progress. The one place react-native-svg gets used; AnimatedProgressBar/LoadingMark are both linear-only. */
export function DonutRing({ percent, size = 70, strokeWidth = 7, trackColor, fillColor, label }: DonutRingProps) {
  // Resolved in the body, not as default parameter values: those evaluate at module load,
  // before a theme exists. Both stay overridable.
  const { colors } = useTheme();
  const track = trackColor ?? colors.surfaceElevated2;
  const fill = fillColor ?? colors.brand.light;
  const styles = useThemedStyles(buildStyles);
  const clamped = Math.max(0, Math.min(100, percent));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={radius} stroke={track} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={fill}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference}, ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${center}, ${center}`}
        />
      </Svg>
      <Text style={[styles.label, { fontSize: size * 0.22 }]}>{label ?? `${clamped}%`}</Text>
    </View>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    container: {
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      color: colors.text.primary,
      fontWeight: "800",
    },
  });
