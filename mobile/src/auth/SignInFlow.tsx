import { useCallback, useRef, useState } from "react";
import { useAuth } from "../practice/authContext";
import { trackEvent } from "../telemetry/analytics";
import { CodeStep } from "./CodeStep";
import { EmailStep } from "./EmailStep";
import { getGoogleIdToken, isGoogleSignInAvailable } from "./googleSignIn";

/**
 * The first screen after installation: sign in, or create an account, with a code emailed to a
 * Gmail address (migration V51). Redesigned 2026-09-24 into two screens — `EmailStep` and
 * `CodeStep` — sharing `AuthLayout`; this file only owns the flow between them.
 *
 * <h2>This screen is a gate, and that is a deliberate reversal</h2>
 * The app was built to work fully signed out. **The project owner asked on 2026-09-21 for an
 * account to be required**, so `AppStartGate` shows this before anything else. The signed-out code
 * paths underneath were NOT deleted: they are still correct, and a session can still expire.
 *
 * <h2>One flow, not two</h2>
 * There is no "sign up" tab. The server knows whether the address has an account and does the
 * right thing; making the student choose is asking a question the system can answer.
 *
 * <h2>What the copy must never claim</h2>
 * Requesting a code answers identically for a known and an unknown address, on purpose — so this
 * flow cannot say "welcome back" or "we've created your account" at that point. It says a code is
 * on its way, and nothing more.
 */
export function SignInFlow() {
  const { requestSignInCode, signInWithCode, signInWithGoogle } = useAuth();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ at: number; expiresInMinutes: number; emailed: boolean } | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  // Read once: whether this build contains the native Google module. It cannot change at runtime.
  const [googleAvailable] = useState(isGoogleSignInAvailable);

  // Guards a double tap on a slow connection: the state flag above has not re-rendered yet when a
  // second tap lands in the same frame, and a second request inside the server's 60-second
  // cooldown would come back as an error the student did nothing to deserve.
  const inFlight = useRef(false);

  const requestCode = useCallback(
    async (address: string, isResend: boolean) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setRequesting(true);
      setEmailError(null);
      setCodeError(null);
      try {
        const result = await requestSignInCode(address);
        trackEvent(isResend ? "sign_in_code_resent" : "sign_in_code_requested");
        setEmail(address);
        setSent({ at: Date.now(), expiresInMinutes: result.expiresInMinutes, emailed: result.emailed });
        setStep("code");
      } catch (err) {
        const message = friendlyMessage(err, "We couldn't send a code just now. Please try again.");
        if (isResend) setCodeError(message);
        else setEmailError(message);
      } finally {
        setRequesting(false);
        inFlight.current = false;
      }
    },
    [requestSignInCode],
  );

  const verify = useCallback(
    async (code: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setVerifying(true);
      setCodeError(null);
      try {
        await signInWithCode(email, code);
        // No success state to set: signing in unmounts this screen.
      } catch (err) {
        // Never retried automatically — see CodeStep. Five wrong guesses kill the code.
        setCodeError(friendlyMessage(err, "That code didn't work. Check it and try again."));
        trackEvent("sign_in_code_rejected");
      } finally {
        setVerifying(false);
        inFlight.current = false;
      }
    },
    [signInWithCode, email],
  );

  /*
   * "Continue with Google": Google's own account chooser, then the server verifies the token and
   * signs in exactly as a code would. Cancelling is not an error and shows nothing. The same Gmail
   * as an existing code account opens that account - there is no second one.
   */
  const continueWithGoogle = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setGoogleBusy(true);
    setGoogleError(null);
    setEmailError(null);
    try {
      const outcome = await getGoogleIdToken();
      if (outcome.kind === "cancelled") return;
      if (outcome.kind === "error") {
        setGoogleError(outcome.message);
        return;
      }
      trackEvent("sign_in_google_started");
      await signInWithGoogle(outcome.idToken);
      // No success state: signing in unmounts this screen.
    } catch (err) {
      setGoogleError(friendlyMessage(err, "Google sign-in didn't work. Please try again, or use your email."));
    } finally {
      setGoogleBusy(false);
      inFlight.current = false;
    }
  }, [signInWithGoogle]);

  if (step === "code" && sent) {
    return (
      <CodeStep
        email={email}
        sentAt={sent.at}
        expiresInMinutes={sent.expiresInMinutes}
        emailed={sent.emailed}
        verifying={verifying}
        resending={requesting}
        error={codeError}
        onVerify={verify}
        onResend={() => requestCode(email, true)}
        onEdit={() => setCodeError(null)}
        onChangeEmail={() => {
          setStep("email");
          setCodeError(null);
        }}
      />
    );
  }

  return (
    <EmailStep
      initialEmail={email}
      busy={requesting}
      serverError={emailError}
      onSubmit={(address) => requestCode(address, false)}
      google={googleAvailable ? { busy: googleBusy, error: googleError, onPress: continueWithGoogle } : undefined}
    />
  );
}

/**
 * Prefers the server's own message, which is written for a student and already avoids saying
 * anything it should not — the address-exists question above all. A raw transport failure is
 * replaced, because "Network request failed" is not a sentence anyone should read.
 */
function friendlyMessage(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message.trim() : "";
  if (!message) return fallback;
  if (/network request failed|failed to fetch|timeout|aborted/i.test(message)) {
    return "You seem to be offline. Check your connection and try again.";
  }
  return message;
}
