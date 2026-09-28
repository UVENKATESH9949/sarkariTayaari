import { lessonSchema, type Lesson } from "./schema";

/**
 * Validates raw JSON (hand-authored today, LLM-generated from Milestone 5
 * onward) against the lesson schema. Throws a readable, per-field error
 * listing instead of a raw Zod exception — this is the "don't blindly trust
 * generated content" checkpoint the project spec calls for before anything
 * gets rendered.
 */
export function validateLesson(data: unknown): Lesson {
  const result = lessonSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Lesson JSON failed validation:\n${issues}`);
  }
  return result.data;
}
