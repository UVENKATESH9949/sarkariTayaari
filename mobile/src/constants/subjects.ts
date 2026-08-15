import type { ComponentProps } from "react";
import type { Ionicons } from "@expo/vector-icons";

export type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type SubjectMeta = {
  name: string;
  icon: IoniconName;
  iconColor: string;
  iconBg: string;
};

/**
 * Used for subjects the admin hasn't styled yet, and for screens that reference a
 * subject by a name no longer present locally. Deliberately neutral rather than a
 * guess — the real icon and colours are synced per subject.
 */
const FALLBACK_SUBJECT_META: SubjectMeta = {
  name: "",
  icon: "book-outline",
  iconColor: "#5a6a85",
  iconBg: "#eef1f8",
};

type SyncedSubjectStyle = {
  name?: string;
  icon?: string | null;
  color?: string | null;
  colorBg?: string | null;
};

/**
 * Turns a synced subject row into display metadata. Styling comes from the row, so a
 * subject added or restyled by an admin renders correctly after a sync, with no app
 * release and no name-keyed lookup table to fall out of date.
 */
export function toSubjectMeta(row: SyncedSubjectStyle | null | undefined, fallbackName = ""): SubjectMeta {
  if (!row) return { ...FALLBACK_SUBJECT_META, name: fallbackName };
  return {
    name: row.name ?? fallbackName,
    icon: (row.icon as IoniconName) || FALLBACK_SUBJECT_META.icon,
    iconColor: row.color || FALLBACK_SUBJECT_META.iconColor,
    iconBg: row.colorBg || FALLBACK_SUBJECT_META.iconBg,
  };
}
