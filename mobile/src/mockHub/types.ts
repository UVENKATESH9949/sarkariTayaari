/**
 * The Mock Test Hub's 9 formats. `fullLength` is the pre-existing official Stage/Paper/
 * Section pattern (papers.tsx) and never produces an `AdHocMockSpec` — the other 8 do.
 */
export type MockFormat =
  | "topic"
  | "subject"
  | "multiSubject"
  | "speed"
  | "difficulty"
  | "pyq"
  | "fullLength"
  | "weakArea"
  | "revision";

/**
 * A mock test that has no real Stage/Paper/Section behind it — built on the fly from a
 * subject/topic/difficulty/PYQ narrowing (Topic through PYQ Mock), or from a resolved,
 * already-known set of topic ids (Weak Area) / question ids (Revision). `start.tsx` and
 * `test.tsx` accept either this or a `SyncedPaper`; the two are never confused because an
 * ad-hoc route always carries `format` as a param and a real-paper route never does.
 */
export type AdHocMockSpec = {
  format: MockFormat;
  examCode: string;
  examLabel: string;
  /** Shown as the paper name on Start/Test/Result — e.g. "Topic Wise Mock — Percentages". */
  title: string;
  /** For `revision`, this is the exact set of subjects those questions happen to span — informational only, sampling is skipped entirely. */
  subjectIds: string[];
  topicIds?: string[];
  difficultyCode?: string;
  pyqOnly?: boolean;
  /** Revision Mock only — an exact question-id list. When set, `subjectIds`/`topicIds`/`difficultyCode`/`pyqOnly` are ignored for sampling purposes. */
  questionIds?: string[];
  /** The number of questions asked for. The real count may come in lower — see `countAdHocMock`. */
  questionCount: number;
};
