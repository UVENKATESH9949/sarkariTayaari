/**
 * Question shapes shared by Practice and Mock Test — both engines answer, score and reveal
 * the same nine question types against the same shared evaluator, so the shape they hand to
 * `QuestionBody` is one type, not two near-identical ones. Fields only one engine populates
 * are optional rather than split into separate types: `isPyq`/`pyqYear`/`pyqShift` (Practice)
 * and `sectionName`/`subjectName` (Mock Test, which spans multiple subjects/sections per
 * paper and needs to know which is which).
 */

export type QuestionTranslation = {
  questionText: string;
  options: string[];
  explanation: string;
  /** Assertion/Reason's or Statement-Combination's authored content, or Match/Ordering's item labels. */
  content: Record<string, unknown> | null;
};

export type Question = {
  id: string;
  questionType: string;
  /** Only meaningful for SINGLE_CHOICE/ASSERTION_REASON/STATEMENT_COMBINATION — see isIndexBasedType. */
  correctIndex: number | null;
  answerKey: Record<string, unknown> | null;
  contentStructure: Record<string, unknown> | null;
  questionGroupId: string | null;
  translations: Record<string, QuestionTranslation>;
  /** Practice only. */
  isPyq?: boolean;
  pyqYear?: number | null;
  pyqShift?: string | null;
  /** Mock Test only — which section/subject within the paper this question belongs to. */
  sectionName?: string;
  subjectName?: string;
};

export type QuestionGroupMedia = {
  id: string;
  mediaType: string;
  url: string;
  mimeType: string | null;
  displayOrder: number;
};

export type QuestionGroup = {
  id: string;
  groupType: string;
  /** Passage text per language code, present only for PASSAGE-type groups. */
  passageByLanguage: Record<string, string>;
  media: QuestionGroupMedia[];
};
