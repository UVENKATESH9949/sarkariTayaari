import { apiFetch } from "./client";
import type { AuthResult } from "./auth";

/**
 * Passwordless sign-in with a one-time code emailed to the student (see `api/AUTH.md`).
 *
 * There is no separate register call. The server knows whether the address has an account and
 * does the right thing — asking the student to choose is asking them a question the system can
 * already answer, and gets it wrong the moment somebody forgets whether they signed up.
 *
 * Password sign-in (`login`, `register` in `./auth`) is untouched and still serves the admin
 * console. This is an additional way in, not a replacement.
 */

export type RequestCodeResponse = {
  /** Deliberately says nothing about whether the address has an account. */
  message: string;
  expiresInMinutes: number;
  /** False when the server has no mail account configured and logged the code instead. */
  emailed: boolean;
  /** Only ever present in a developer deployment that opted into exposing it. */
  code: string | null;
};

/**
 * Asks the server to email a code.
 *
 * **A 200 does not mean the address has an account**, and must never be presented as if it does.
 * A 400 means the address was rejected outright — not a Gmail address, or a resend inside the
 * cooldown — and its `error` is safe to show.
 */
export function requestEmailOtp(email: string) {
  return apiFetch<RequestCodeResponse>("/auth/otp/request", {
    method: "POST",
    body: { email },
  });
}

/**
 * Redeems the code and returns a session, creating the account on first use.
 *
 * Every failure is the same 401 with the same message, by design — distinguishing "wrong code"
 * from "expired" from "too many attempts" would tell an attacker which addresses have a live code
 * outstanding. **There is a hard cap of five wrong guesses per code**, so a client must not retry
 * automatically.
 */
export function verifyEmailOtp(email: string, code: string, deviceLabel?: string) {
  return apiFetch<AuthResult>("/auth/otp/verify", {
    method: "POST",
    body: { email, code, deviceLabel },
  });
}
