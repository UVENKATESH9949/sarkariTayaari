import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import { diagnosticAttempts } from "./schema";

export type DiagnosticTopicResult = {
  topicId: string;
  topicName: string;
  subjectName: string;
  correctCount: number;
  totalCount: number;
  /** The mastery state this topic resolved to immediately after this attempt was folded
   * into topicProgress — see diagnostic-result.tsx. */
  state: string;
};

export type DiagnosticAttemptRecord = {
  id: string;
  examCode: string;
  startedAt: number;
  completedAt: number;
  questionCount: number;
  correctCount: number;
  perTopic: DiagnosticTopicResult[];
};

/** Local-only record that a diagnostic happened — see the migration's own comment for why
 * this doesn't also carry the scoring (that goes through the same topicProgress table an
 * ordinary practice session updates). */
export async function insertDiagnosticAttempt(record: DiagnosticAttemptRecord): Promise<void> {
  await db.insert(diagnosticAttempts).values({
    id: record.id,
    examCode: record.examCode,
    startedAt: new Date(record.startedAt),
    completedAt: new Date(record.completedAt),
    questionCount: record.questionCount,
    correctCount: record.correctCount,
    perTopicJson: JSON.stringify(record.perTopic),
  });
}

export async function hasTakenDiagnostic(examCode: string): Promise<boolean> {
  const row = await db
    .select({ id: diagnosticAttempts.id })
    .from(diagnosticAttempts)
    .where(eq(diagnosticAttempts.examCode, examCode))
    .get();
  return row !== undefined;
}

export async function getLatestDiagnosticAttempt(examCode: string): Promise<DiagnosticAttemptRecord | null> {
  const row = await db
    .select()
    .from(diagnosticAttempts)
    .where(eq(diagnosticAttempts.examCode, examCode))
    .orderBy(desc(diagnosticAttempts.completedAt))
    .get();
  if (!row) return null;
  return {
    id: row.id,
    examCode: row.examCode,
    startedAt: row.startedAt.getTime(),
    completedAt: row.completedAt.getTime(),
    questionCount: row.questionCount,
    correctCount: row.correctCount,
    perTopic: JSON.parse(row.perTopicJson),
  };
}
