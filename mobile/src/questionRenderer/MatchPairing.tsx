import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useThemedStyles, type Theme } from "../ui/ThemeContext";

export type MatchItem = { key: string; label: string };

export type MatchPairingProps = {
  leftItems: MatchItem[];
  /** Already shuffled by the caller — see mock-test/test.tsx's shuffle note. */
  rightItems: MatchItem[];
  /** The student's current pairing so far: leftKey -> rightKey. */
  mapping: Record<string, string>;
  /** Present = tappable. Absent = read-only review (mirrors OptionList's onSelect convention). */
  onPair?: (leftKey: string, rightKey: string) => void;
  disabled?: boolean;
  /** The real correctMapping, for reveal. Omitted/null = blind (Mock Test). */
  correctMapping?: Record<string, string> | null;
};

/**
 * MATCH's renderer (TASK-2301 Phase P2 Wave B) — tap a left item to select it (blue), then
 * tap a right item to pair them; both get the same numbered badge. Tapping an already-
 * selected left item again deselects it without changing its existing pairing; tapping a
 * left item that already has a pairing re-selects it so the next right tap replaces that
 * pairing. Chosen over a drag-and-drop grid because it needs no gesture library and is
 * trivially driveable by a single tap, matching every other renderer in this module.
 */
export function MatchPairing({ leftItems, rightItems, mapping, onPair, disabled, correctMapping }: MatchPairingProps) {
  const styles = useThemedStyles(buildStyles);
  const [activeLeftKey, setActiveLeftKey] = useState<string | null>(null);
  const revealed = correctMapping !== undefined && correctMapping !== null;

  // A shared 1-based badge number per pair, ordered by leftItems' own display order.
  const badgeByLeftKey = new Map<string, number>();
  let nextBadge = 1;
  for (const item of leftItems) {
    if (mapping[item.key] !== undefined) {
      badgeByLeftKey.set(item.key, nextBadge++);
    }
  }
  const rightKeyToLeftKey = new Map<string, string>();
  for (const [leftKey, rightKey] of Object.entries(mapping)) {
    rightKeyToLeftKey.set(rightKey, leftKey);
  }

  function handleLeftPress(leftKey: string) {
    if (disabled || !onPair) return;
    setActiveLeftKey((prev) => (prev === leftKey ? null : leftKey));
  }

  function handleRightPress(rightKey: string) {
    if (disabled || !onPair || !activeLeftKey) return;
    onPair(activeLeftKey, rightKey);
    setActiveLeftKey(null);
  }

  return (
    <View style={styles.row}>
      <View style={styles.column}>
        {leftItems.map((item) => {
          const isActive = activeLeftKey === item.key;
          const isPaired = mapping[item.key] !== undefined;
          const isCorrect = revealed && isPaired && correctMapping![item.key] === mapping[item.key];
          const isWrong = revealed && isPaired && correctMapping![item.key] !== mapping[item.key];
          return (
            <Pressable
              key={item.key}
              style={[styles.item, isActive && styles.itemActive, isCorrect && styles.itemCorrect, isWrong && styles.itemWrong]}
              onPress={() => handleLeftPress(item.key)}
              disabled={disabled}
            >
              {isPaired && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeByLeftKey.get(item.key)}</Text>
                </View>
              )}
              <Text style={styles.itemText}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.column}>
        {rightItems.map((item) => {
          const pairedLeftKey = rightKeyToLeftKey.get(item.key);
          const isPairedHere = pairedLeftKey !== undefined;
          const isCorrect = revealed && isPairedHere && correctMapping![pairedLeftKey!] === item.key;
          const isWrong = revealed && isPairedHere && correctMapping![pairedLeftKey!] !== item.key;
          return (
            <Pressable
              key={item.key}
              style={[
                styles.item,
                isPairedHere && !revealed && styles.itemActive,
                isCorrect && styles.itemCorrect,
                isWrong && styles.itemWrong,
              ]}
              onPress={() => handleRightPress(item.key)}
              disabled={disabled}
            >
              {isPairedHere && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeByLeftKey.get(pairedLeftKey!)}</Text>
                </View>
              )}
              <Text style={styles.itemText}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const buildStyles = ({ colors, spacing, radius }: Theme) =>
  StyleSheet.create({
    row: { flexDirection: "row", gap: spacing.md },
    column: { flex: 1, gap: spacing.sm },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.sm + 2,
      backgroundColor: colors.surfaceElevated,
    },
    itemActive: { borderColor: colors.brand.primary, backgroundColor: colors.surfaceElevated2 },
    itemCorrect: { borderColor: colors.semantic.success, backgroundColor: colors.semantic.successBg },
    itemWrong: { borderColor: colors.semantic.error, backgroundColor: colors.semantic.errorBg },
    badge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.brand.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: { fontSize: 11, fontWeight: "700", color: colors.text.onAccent },
    itemText: { flex: 1, fontSize: 13, color: colors.text.primary },
  });
