/**
 * The authored block ASSERTION_REASON and STATEMENT_COMBINATION show above their (still
 * ordinary, index-based) OptionList — the four options remain "which combination is
 * correct" text; this is what that text refers to.
 */
export function ContentPreamble({
  questionType,
  content,
}: {
  questionType?: string | null;
  content?: Record<string, unknown> | null;
}) {
  if (!content) return null;

  if (questionType === "ASSERTION_REASON") {
    const assertion = typeof content.assertion === "string" ? content.assertion : "";
    const reason = typeof content.reason === "string" ? content.reason : "";
    if (!assertion && !reason) return null;
    return (
      <div className="content-preamble">
        <p><strong>Assertion:</strong> {assertion}</p>
        <p><strong>Reason:</strong> {reason}</p>
      </div>
    );
  }

  if (questionType === "STATEMENT_COMBINATION") {
    const statements = Array.isArray(content.statements)
      ? content.statements.filter((s): s is string => typeof s === "string")
      : [];
    if (statements.length === 0) return null;
    return (
      <div className="content-preamble">
        {statements.map((statement, index) => (
          <p key={index}>
            <strong>{index + 1}.</strong> {statement}
          </p>
        ))}
      </div>
    );
  }

  return null;
}
