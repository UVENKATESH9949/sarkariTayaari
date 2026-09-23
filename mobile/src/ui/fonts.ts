import type { TextStyle } from "react-native";

/**
 * Inter, the app's display typeface.
 *
 * Loaded once at the root (see `app/_layout.tsx`) from `@expo-google-fonts/inter`, which
 * ships the TTFs in the bundle — there is no network fetch and nothing to fail offline.
 *
 * WHY EACH WEIGHT IS ITS OWN FAMILY NAME, and why nothing here returns `fontWeight`.
 * React Native on Android does not synthesise a weight from one family: `fontFamily:
 * "Inter"` plus `fontWeight: "600"` renders Regular, silently, while iOS renders the
 * semibold — so the two platforms disagree and only a device shows it. Naming the exact
 * face (`Inter_600SemiBold`) is the only form that behaves identically on both. Setting
 * `fontWeight` alongside it is at best redundant and at worst asks Android to
 * double-embolden an already-bold face, so the central pass drops `fontWeight` once it has
 * resolved the face. Screens never write a family name themselves.
 *
 * HOW IT IS APPLIED: centrally, in `useThemedStyles`, in the same pass that applies zoom —
 * see `applyTypography` in `ThemeContext.tsx`. Screens keep writing ordinary `fontWeight`
 * declarations and never name a face; the resolver below turns the weight into the right
 * family and drops the `fontWeight`. That is the only way this stays correct: there are 334
 * text styles across 43 files, and any per-site scheme is 334 chances to forget one.
 */
export const INTER = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export type InterWeight = keyof typeof INTER;

/**
 * Resolves a React Native `fontWeight` to the Inter face that actually carries it.
 *
 * Only four faces are bundled, so the nine CSS weights collapse onto them. The buckets are
 * chosen so nothing gets *lighter* than it looked before: 100–400 and `normal` read as
 * Regular, 800/900 have nowhere heavier to go than Bold, and `undefined` — a style that
 * sets a size but no weight — is Regular, which is what React Native already rendered.
 *
 * `fontWeight` accepts numbers as well as strings in RN's types, hence the stringify.
 *
 * If a face has not finished loading, React Native falls back to the platform sans-serif.
 * That is a silent, legible fallback, which is worth knowing when checking whether Inter is
 * really live: "it looks fine" is not evidence.
 */
export function interFamilyForWeight(weight: TextStyle["fontWeight"]): string {
  switch (String(weight)) {
    case "500":
      return INTER.medium;
    case "600":
      return INTER.semibold;
    case "700":
    case "800":
    case "900":
    case "bold":
      return INTER.bold;
    default:
      return INTER.regular;
  }
}
