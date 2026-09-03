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
 *
 * The colours are NOT here: this module has no access to the live theme, and baking in
 * the dark palette is what would make an unstyled subject the one illegible row on a
 * light screen. Callers pass the fallback colours from their own `useTheme()` — see
 * `toSubjectMeta`.
 */
const FALLBACK_ICON: IoniconName = "book-outline";

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
export type SubjectFallbackColors = { iconColor: string; iconBg: string };

export function toSubjectMeta(
  row: SyncedSubjectStyle | null | undefined,
  fallbackName = "",
  fallbackColors?: SubjectFallbackColors,
): SubjectMeta {
  return {
    name: row?.name ?? fallbackName,
    icon: (row?.icon as IoniconName) || FALLBACK_ICON,
    // `""` is treated as absent, same as before: an admin clearing a colour field should
    // fall back, not paint transparent.
    iconColor: row?.color || fallbackColors?.iconColor || "#64748B",
    iconBg: row?.colorBg || fallbackColors?.iconBg || "transparent",
  };
}
