import { syncQuestionGroups } from "@sarkaritaiyaari/core/api";
import type { QuestionGroup } from "./types";

/**
 * Question groups referenced by a set of questions, keyed by id. `/question-groups/sync` is a
 * bulk paged endpoint (there is no "fetch one group" route), so this pages through it once and
 * keeps only the groups actually needed — the catalogue is small enough that this is one or
 * two requests, not a real cost. Shared by Practice and Mock Test, since both can encounter a
 * grouped (passage/media) question.
 */
export async function getQuestionGroups(groupIds: string[]): Promise<Record<string, QuestionGroup>> {
  const needed = new Set(groupIds);
  const result: Record<string, QuestionGroup> = {};
  if (needed.size === 0) return result;

  let page = 0;
  for (;;) {
    const syncPage = await syncQuestionGroups("0", page, 500);
    for (const g of syncPage.content) {
      if (g.deleted || !needed.has(g.id)) continue;
      const passageByLanguage: Record<string, string> = {};
      for (const t of g.translations) {
        if (t.passageText) passageByLanguage[t.languageCode] = t.passageText;
      }
      result[g.id] = { id: g.id, groupType: g.groupType, passageByLanguage, media: g.media };
    }
    if (syncPage.last || Object.keys(result).length === needed.size) break;
    page += 1;
  }
  return result;
}
