/**
 * Ids for the rows this device creates and later uploads (TASK-2801).
 *
 * ## Why this exists
 *
 * Practice sessions and mock attempts used `session-${Date.now()}` and
 * `mocktest-${Date.now()}`. Those ids are the **idempotency key** the server stores as a primary
 * key — they are what makes a retried upload overwrite rather than duplicate. A millisecond
 * timestamp is unique on one device and emphatically not unique across a user base: two students
 * finishing a quiz in the same millisecond produce the same id, and the ids are also trivially
 * guessable by anyone who wants to collide deliberately.
 *
 * The server now refuses to merge an id owned by another account (see `ProgressService.upload`),
 * so a collision can no longer corrupt anyone's history. This closes the other half: it stops
 * collisions happening at all, so a student's own row is never the one that gets refused.
 *
 * ## Why not a dependency
 *
 * `expo-crypto` is not installed and this project does not add a dependency for something this
 * small (`AI_RULES.md` §3.7). `crypto.getRandomValues` is used when the runtime provides it; the
 * fallback is `Math.random`, which is not cryptographically strong but is not being asked to be:
 * these ids are collision-avoidance, never a secret or a capability. Ownership is enforced by the
 * bearer token, not by an id being unguessable.
 *
 * Existing rows keep their old ids. An already-synced row is already stored under the right
 * account, so it is safe; an unsynced legacy row keeps its timestamp id and carries the (tiny)
 * residual collision chance until it uploads.
 */

const HEX: string[] = [];
for (let i = 0; i < 256; i += 1) HEX.push((i + 0x100).toString(16).slice(1));

function randomBytes16(): Uint8Array {
  const bytes = new Uint8Array(16);
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
    return bytes;
  }
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** A RFC-4122 version-4 UUID string. */
export function uuidv4(): string {
  const b = randomBytes16();
  // Version 4 and the RFC's variant bits, so this is a well-formed v4 rather than 16 loose bytes.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return (
    HEX[b[0]] + HEX[b[1]] + HEX[b[2]] + HEX[b[3]] + "-" +
    HEX[b[4]] + HEX[b[5]] + "-" +
    HEX[b[6]] + HEX[b[7]] + "-" +
    HEX[b[8]] + HEX[b[9]] + "-" +
    HEX[b[10]] + HEX[b[11]] + HEX[b[12]] + HEX[b[13]] + HEX[b[14]] + HEX[b[15]]
  );
}

/**
 * `session-<uuid>` — the id of a practice session this device is about to record.
 *
 * The prefix is kept purely so a row is recognisable in a log or a database client. Length is 44,
 * within the server's `VARCHAR(64)`; each result row is `${sessionId}:${orderIndex}`, comfortably
 * within its own `VARCHAR(96)`.
 */
export function newPracticeSessionId(): string {
  return `session-${uuidv4()}`;
}

/** `mocktest-<uuid>` — same reasoning as {@link newPracticeSessionId}. */
export function newMockAttemptId(): string {
  return `mocktest-${uuidv4()}`;
}
