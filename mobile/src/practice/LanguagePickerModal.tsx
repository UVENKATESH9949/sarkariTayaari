import { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from "react-native";
import { LANGUAGES } from "./appLanguage";

type Props = {
  visible: boolean;
  selectedCode: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  title?: string;
};

export function LanguagePickerModal({ visible, selectedCode, onSelect, onClose, title = "Select language" }: Props) {
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
          <Text style={styles.title}>{title}</Text>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#8a94a6" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search languages..."
              placeholderTextColor="#8a94a6"
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
                  {isSelected && <Ionicons name="checkmark" size={18} color="#1a2b4a" />}
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20, 30, 50, 0.5)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    maxHeight: "70%",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1a2b4a",
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#f5f6f9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: "#1a2b4a",
    padding: 0,
  },
  list: {
    maxHeight: 320,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f1f4",
  },
  rowPressed: {
    backgroundColor: "#f5f6f9",
  },
  rowText: {
    fontSize: 15,
    color: "#1a2b4a",
  },
  emptyText: {
    paddingVertical: 20,
    textAlign: "center",
    fontSize: 13,
    color: "#8a94a6",
  },
});
