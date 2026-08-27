/**
 * The full name of the organization behind each exam-code prefix — static, universally
 * true information (not fabricated or user-specific), so it's safe to ship as a client
 * lookup rather than waiting on a backend field. Mirrors the prefix grouping in
 * `examTheme.ts`. An exam code with no known prefix simply shows no subtitle.
 */
const ORG_FULL_NAMES: Record<string, string> = {
  SSC: "Staff Selection Commission",
  IBPS: "Institute of Banking Personnel Selection",
  RRB: "Railway Recruitment Board",
  UPSC: "Union Public Service Commission",
  RBI: "Reserve Bank of India",
  LIC: "Life Insurance Corporation of India",
};

export function getExamOrgName(examCode: string): string | null {
  const prefix = examCode.split("_")[0] ?? examCode;
  return ORG_FULL_NAMES[prefix] ?? null;
}
