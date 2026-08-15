/**
 * Exam/Subject/Topic/Language deletes are hard deletes. A row still referenced by
 * questions or topics fails on a DB foreign-key constraint, which the backend does
 * not handle — it surfaces as a raw 500 with no usable message.
 */
export function deleteFailureMessage(error, label) {
  const message = error?.message || "";
  if (message.includes("500") || message.toLowerCase().includes("internal server error")) {
    return `Could not delete this ${label} — something still references it. Remove or reassign those records first.`;
  }
  return message || `Could not delete this ${label}.`;
}
