import type { useT } from "./I18nContext";

type Translate = ReturnType<typeof useT>;

/**
 * "1 question" / "12 questions".
 *
 * This existed as an identical two-line copy in three screens (Practice subjects, topics
 * and levels). That was harmless while it was a template literal; once it needed the
 * catalogue it became three places to keep a plural rule consistent, so it is one place
 * now.
 *
 * `t` is a parameter rather than a hook call because this is used from inside `useMemo`
 * bodies and other non-component code. Pluralisation is two catalogue keys rather than a
 * CLDR rules engine — see the note in en.ts.
 */
export function questionsLabel(count: number, t: Translate): string {
  return count === 1 ? t("practice.questionsOne") : t("practice.questionsOther", { count });
}
