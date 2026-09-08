import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { questionGroups, questionGroupTranslations, questionMedia } from "./schema";

export type LocalMedia = {
  id: string;
  mediaType: string;
  url: string;
  /** A downloaded on-device copy, when Phase P3's pre-download has landed one — see sync/mediaDownload.ts. */
  localUri: string | null;
};

export type QuestionGroupContent = {
  groupType: string;
  /** Keyed by language code, mirroring every other translation map in this app. */
  translations: Record<string, { passageText: string | null }>;
  media: LocalMedia[];
};

/**
 * A shared passage/dataset's content (TASK-2301 Phase P3) — read directly from the local
 * tables by group id, independent of whichever question array the caller assembled it
 * from. Practice's sampler doesn't guarantee every sibling of a group is present in the
 * same session (unlike Mock Test's group-aware pack algorithm), so the renderer looks
 * this up per current question rather than depending on the assembled list to carry it.
 */
export async function getQuestionGroupContent(groupId: string): Promise<QuestionGroupContent | null> {
  const group = await db.select().from(questionGroups).where(eq(questionGroups.id, groupId)).get();
  if (!group) return null;

  const translationRows = await db
    .select()
    .from(questionGroupTranslations)
    .where(eq(questionGroupTranslations.questionGroupId, groupId))
    .all();
  const translations: QuestionGroupContent["translations"] = {};
  for (const row of translationRows) {
    translations[row.languageCode] = { passageText: row.passageText };
  }

  const mediaRows = await db
    .select()
    .from(questionMedia)
    .where(and(eq(questionMedia.questionGroupId, groupId), eq(questionMedia.isDeleted, false)))
    .orderBy(questionMedia.displayOrder)
    .all();

  return {
    groupType: group.groupType,
    translations,
    media: mediaRows.map((m) => ({ id: m.id, mediaType: m.mediaType, url: m.url, localUri: m.localUri })),
  };
}
