import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { LANGUAGES } from "./appLanguage";
import { radius, spacing } from "../ui/theme";
import { useTheme, useThemedStyles, type Theme } from "../ui/ThemeContext";
import { useT } from "../i18n/I18nContext";

type Props = {
  visible: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  title?: string;
};

export function LanguagePickerModal({ visible, selectedCode, onSelect, onClose, title }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(buildStyles);
  const t = useT();
  // Default resolved here, not as a default parameter value: the fallback is a
  // translated string and a default parameter is evaluated before any hook runs.
  const resolvedTitle = title ?? t("languagePicker.selectLanguage");
  const [search, setSearch] = useState("");

  const filteredLanguages = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return LANGUAGES;
    return LANGUAGES.filter((l) => l.name.toLowerCase().includes(query));
  }, [search]);

  const handleSelect = (code: string) => {
    onSelect(code);
    setSearch("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{resolvedTitle}</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.text.muted} />
            <TextInput
              style={styles.searchInput}
              placeholder={t("languagePicker.search")}
              placeholderTextColor={colors.text.muted}
              value={search}
              onChangeText={setSearch}
            />
          </View>
          <ScrollView style={styles.list}>
            {filteredLanguages.map((lang) => {
              const isSelected = lang.code === selectedCode;
              return (
                <Pressable
                  key={lang.code}
                  onPress={() => handleSelect(lang.code)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                >
                  <Text style={styles.rowText}>{lang.name}</Text>
                  {isSelected && <Ionicons name="checkmark" size={18} color={colors.brand.light} />}
                </Pressable>
              );
            })}
            {filteredLanguages.length === 0 && (
              <Text style={styles.emptyText}>No languages match "{search}"</Text>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const buildStyles = ({ colors }: Theme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(2, 3, 5, 0.7)",
      justifyContent: "center",
      padding: spacing.xl,
    },
    card: {
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.xl,
      padding: spacing.lg,
      maxHeight: "70%",
    },
    title: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: spacing.md + 2,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      backgroundColor: colors.surfaceElevated2,
      borderRadius: radius.sm + 2,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 1,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: colors.text.primary,
      padding: 0,
    },
    list: {
      maxHeight: 320,
    },
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: spacing.md + 1,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowPressed: {
      backgroundColor: colors.surfaceElevated2,
    },
    rowText: {
      fontSize: 15,
      color: colors.text.primary,
    },
    emptyText: {
      paddingVertical: spacing.xl,
      textAlign: "center",
      fontSize: 13,
      color: colors.text.muted,
    },
  });
