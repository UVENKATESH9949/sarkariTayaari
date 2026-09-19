import { asc, eq } from "drizzle-orm";
import { db } from "./client";
import { contentLanguagePreferences, languages } from "./schema";

/**
 * The student's chosen content languages, and the list they chose from.
 *
 * ## The distinction this module exists to keep
 *
 * The app has two language concepts and they are not the same question:
 *
 * | | Where | Supported set |
 * |---|---|---|
 * | **Interface** language | `app_preferences.ui_language`, `I18nProvider` | languages with a translation catalogue (`en`, `te`) |
 * | **Content** language | this table | languages the question bank is authored in (`languages`) |
 *
 * Hindi is the case that proves they must stay separate: it has real question content and no UI
 * catalogue at all. Deriving one from the other would make a Hindi-studying student impossible
 * to serve.
 *
 * ## Where the offered list comes from
 *
 * The synced `languages` table, which mirrors `GET /api/languages`. **Not** the `LANGUAGES`
 * array in `practice/appLanguage.tsx` — that is a hardcoded mock, as its own comment says, and
 * using it would offer languages the question bank has never had.
 */

export type ContentLanguage = {
  code: string;
  name: string;
};

/**
 * Every active language the question bank supports, in a stable order.
 *
 * Empty on a device whose first reference sync has not landed yet, which the caller has to
 * handle rather than treat as an error — it is the same "nothing to choose from yet" state the
 * exam step already deals with.
 */
export async function getAvailableContentLanguages(): Promise<ContentLanguage[]> {
  try {
    return await db
      .select({ code: languages.code, name: languages.name })
      .from(languages)
      .where(eq(languages.isActive, true))
      .orderBy(asc(languages.code))
      .all();
  } catch (err) {
    console.warn("Failed to read available content languages", err);
    return [];
  }
}

/** The chosen codes, in the order they were chosen — the first is what screens default to. */
export async function getContentLanguages(): Promise<string[]> {
  try {
    const rows = await db
      .select({ code: contentLanguagePreferences.languageCode })
      .from(contentLanguagePreferences)
      .orderBy(asc(contentLanguagePreferences.displayOrder))
      .all();
    return rows.map((r) => r.code);
  } catch (err) {
    console.warn("Failed to read content languages", err);
    return [];
  }
}

/**
 * Replaces the whole selection.
 *
 * A full replace rather than an incremental diff because the selection is at most two rows and
 * is always chosen as a set — a partial update would have to reason about ordering when one of
 * two is swapped, for no benefit. Runs in a transaction so a failure between the delete and the
 * insert cannot leave the student with no content language at all.
 */
export async function setContentLanguages(codes: readonly string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(contentLanguagePreferences);
    if (codes.length === 0) return;
    await tx
      .insert(contentLanguagePreferences)
      .values(codes.map((code, index) => ({ languageCode: code, displayOrder: index })));
  });
}
