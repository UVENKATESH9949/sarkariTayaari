import { and, eq } from "drizzle-orm";
import { db } from "./client";
import { aiContent } from "./schema";
import type { QuestionExplanation } from "@sarkaritaiyaari/core/ai";

/**
 * TASK-2701 Phase 3 — the offline read behind "Explain with AI" on a question screen.
 * AI_ARCHITECTURE.md §4: this is Tier 2, and reading it costs nothing and needs no network —
 * the whole point of generating an explanation once, server-side, and syncing it, rather than
 * calling a model per student per question.
 *
 * The row was already grounded and reviewed before an admin published it (see
 * AiContentReviewService / api/AI-CONTENT.md), so this is a plain read, not a second
 * validation pass — re-validating already-reviewed, already-synced content on every question
 * render would be work with nothing left to catch.
 *
 * Returns `null` whenever no published explanation has synced for this question in this
 * language — the caller falls back to the question's own authored `explanation` text, which
 * always exists and is never conditional on AI having run.
 */
export async function getCachedQuestionExplanation(
  questionId: string,
  languageCode: string,
): Promise<QuestionExplanation | null> {
  const row = await db
    .select()
    .from(aiContent)
    .where(
      and(
        eq(aiContent.taskId, "QUESTION_EXPLANATION"),
        eq(aiContent.subjectId, questionId),
        eq(aiContent.languageCode, languageCode),
        eq(aiContent.published, true),
      ),
    )
    .get();

  if (!row || !row.payloadJson) return null;

  // The payload's own shape is exactly QuestionExplanation (validated server-side before
  // publish) — cast rather than re-derive, since the JSON column is already typed loosely
  // as Record<string, unknown> by schema.ts for storage-layer reasons.
  return row.payloadJson as unknown as QuestionExplanation;
}
