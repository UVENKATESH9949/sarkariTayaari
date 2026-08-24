import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { IoniconName } from "../constants/subjects";
import { Button } from "./Button";
import { colors, spacing, typography } from "./theme";

type EmptyStateProps = {
  icon: IoniconName;
  title: string;
  body?: string;
  /** Always a real existing callback/route — never fabricated navigation. */
  action?: { label: string; onPress: () => void };
};

/** Generic empty-state — replaces the ad hoc icon+title+body renderings scattered per screen. */
export function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={28} color={colors.brand.light} />
      </View>
      <Text style={[typography.cardTitle, styles.title]}>{title}</Text>
      {body ? <Text style={[typography.secondary, styles.body]}>{body}</Text> : null}
      {action ? (
        <Button variant="secondary" onPress={action.onPress} style={styles.action}>
          {action.label}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: spacing["3xl"],
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceElevated2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.base,
  },
  title: {
    textAlign: "center",
  },
  body: {
    textAlign: "center",
    marginTop: spacing.xs,
  },
  action: {
    marginTop: spacing.lg,
  },
});
