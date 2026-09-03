import { getPriorityTopics } from "../db/topicIntelligence";
import { getPracticeQuestions, type PracticeQuestion } from "../data/practiceData";
import type { HybridMode } from "../data/hybridSource";

export type DiagnosticQuestion = PracticeQuestion & {
  topicId: string;
  topicName: string;
  subjectName: string;
};

/** How many of the exam's highest-priority topics the diagnostic samples from. */
const TOPIC_COUNT = 8;
/** Per topic — enough to say something about that topic, not a full practice set. */
const QUESTIONS_PER_TOPIC = 3;
/**
 * How many candidate topics (by priority order) to check before giving up on filling
 * TOPIC_COUNT. Epic L's curated topic priority is seeded independently of which topics
 * actually have questions tagged to this exam locally — on-device testing found most
 * exams have real content for only 1-4 of their top 8 priority topics, so the top 8 alone
 * is not a safe assumption. Widening the candidate pool (priority order preserved) rather
 * than fixing the underlying priority/tagging mismatch, which is a backend data question.
 */
const CANDIDATE_POOL_SIZE = 30;

/**
 * Exam Guide spec §21 "Diagnostic Test" — a syllabus-weighted sample: the exam's
 * highest-priority topics (Epic L's existing ranking, the same source
 * `PreparationPlanCard`/the Prepare checklist already read) with a few mixed-difficulty
 * questions from each. A diagnostic is meant to locate where a student stands across the
 * syllabus, not to drill one topic or one difficulty level.
 *
 * No new backend endpoint: `getPriorityTopics` and `getPracticeQuestions` both already
 * exist and are hybrid-aware, so this composes entirely from data the app already syncs.
 */
export async function buildDiagnosticSet(examCode: string, mode: HybridMode): Promise<DiagnosticQuestion[]> {
  const candidates = await getPriorityTopics(examCode, CANDIDATE_POOL_SIZE);

  const perCandidate = await Promise.all(
    candidates.map(async (topic) => {
      const questions = await getPracticeQuestions(topic.topicId, "all", examCode, mode);
      // Already RANDOM()-ordered by getPracticeQuestions itself — taking the first few is
      // a genuine random sample, not a biased "always the same questions" slice.
      return questions.slice(0, QUESTIONS_PER_TOPIC).map((q) => ({
        ...q,
        topicId: topic.topicId,
        topicName: topic.topicName,
        subjectName: topic.subjectName,
      }));
    }),
  );

  // Keep priority order, but only the first TOPIC_COUNT topics that actually returned
  // questions — a topic with none contributes nothing to the diagnostic either way.
  return perCandidate.filter((qs) => qs.length > 0).slice(0, TOPIC_COUNT).flat();
}
