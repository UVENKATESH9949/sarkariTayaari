/**
 * The device half of "Continue with Google" (2026-09-25). Opens Google's own account chooser and
 * returns the ID token, which authContext sends to the server to verify.
 *
 * <h2>Why the native module is loaded lazily</h2>
 * `@react-native-google-signin/google-signin` is a native module. A build made before it was added
 * (an older dev client, an older APK) does not contain it, and a top-level import would crash the
 * whole sign-in screen there. So it is required on first use, and `isGoogleSignInAvailable()` hides
 * the button instead of offering one that cannot work.
 *
 * <h2>The client id</h2>
 * It is the WEB OAuth client id — Google puts it in the token's `aud`, and the server only accepts
 * tokens carrying it. The Android client ids registered in Google Cloud (package name + SHA-1 of
 * the release and debug signing keys) are what authorise THIS app to ask; they never appear in code.
 * Not a secret. Overridable per build with EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.
 */

const WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  "815653276881-bgt8v5luik1jfee7c941510i1d20sb9u.apps.googleusercontent.com";

type GoogleModule = typeof import("@react-native-google-signin/google-signin");

let loaded: GoogleModule | null | undefined;
let configured = false;

function load(): GoogleModule | null {
  if (loaded !== undefined) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require("@react-native-google-signin/google-signin") as GoogleModule;
  } catch {
    loaded = null;
  }
  return loaded;
}

function ready(): GoogleModule | null {
  const mod = load();
  if (!mod) return null;
  if (!configured) {
    try {
      // Only the ID token is needed: no offline access, no extra scopes beyond email/profile.
      mod.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
      configured = true;
    } catch {
      return null;
    }
  }
  return mod;
}

/** False on a build that predates the native module — the button is then not shown at all. */
export function isGoogleSignInAvailable(): boolean {
  return ready() !== null;
}

export type GoogleSignInOutcome =
  | { kind: "token"; idToken: string }
  | { kind: "cancelled" }
  | { kind: "error"; message: string };

/** Never throws: every outcome is a value the screen can show. */
export async function getGoogleIdToken(): Promise<GoogleSignInOutcome> {
  const mod = ready();
  if (!mod) {
    return { kind: "error", message: "Google sign-in isn't available in this version of the app." };
  }
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = mod;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Always show the account chooser: a phone with two Google accounts must let the student pick,
    // rather than silently reusing whichever account signed in last time.
    await GoogleSignin.signOut().catch(() => undefined);
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return { kind: "cancelled" };
    const idToken = response.data.idToken;
    if (!idToken) {
      return { kind: "error", message: "Google didn't return a sign-in token. Please try again." };
    }
    return { kind: "token", idToken };
  } catch (err) {
    if (isErrorWithCode(err)) {
      if (err.code === statusCodes.SIGN_IN_CANCELLED) return { kind: "cancelled" };
      if (err.code === statusCodes.IN_PROGRESS) return { kind: "cancelled" };
      if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { kind: "error", message: "Google Play services is needed for Google sign-in. Please use your email instead." };
      }
      // "10" is DEVELOPER_ERROR: the app's package name / signing key is not registered in Google
      // Cloud, or the web client id is wrong. Logged for developers; the student gets a way forward.
      if (__DEV__) console.warn("[google-signin] error code", err.code, err.message);
    }
    return { kind: "error", message: "Google sign-in didn't work. Please try again, or use your email." };
  }
}

/** Best effort, on app sign-out, so the next Google sign-in offers the account chooser again. */
export async function signOutOfGoogle(): Promise<void> {
  const mod = load();
  if (!mod || !configured) return;
  try {
    await mod.GoogleSignin.signOut();
  } catch {
    // Nothing to undo: the app session is what matters, and it is already gone.
  }
}
