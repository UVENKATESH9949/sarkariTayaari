import { useState, type FormEvent } from "react";
import { ApiError } from "@sarkaritaiyaari/core/api";
import { useAuth } from "../auth/AuthContext";
import { AlertIcon, UserIcon } from "../components/icons";

/**
 * Sign in / sign up / sign out.
 *
 * Accounts are optional here, exactly as they are on the phone — nothing gates the app behind
 * a sign-up wall. What signing in buys is that practice history, bookmarks, followed exams and
 * topic mastery become the same server-side records the phone app reads, so a student can move
 * between the two.
 */
export default function Account() {
  const { user, signIn, signUp, signOut, initialising } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signIn") await signIn(email, password);
      else await signUp(email, password, displayName);
      setPassword("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (initialising) {
    return <p className="muted">Checking your session…</p>;
  }

  if (user) {
    return (
      <div className="auth-page">
        <div className="page-header">
          <h1>Your account</h1>
        </div>
        <div className="card stack">
          <div className="stat-row" style={{ borderTop: "none", padding: "2px" }}>
            <span className="stat-icon" aria-hidden="true"><UserIcon /></span>
            <div className="stat-body">
              <div className="stat-name">{user.displayName ?? "Signed in"}</div>
              <div className="subtle">{user.email}</div>
            </div>
          </div>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="page-header">
        <h1>{mode === "signIn" ? "Sign in" : "Create an account"}</h1>
        <p className="subtle">
          Optional — you can practise without one. Signing in keeps your history across this
          browser and your phone.
        </p>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        {error && (
          <div className="banner banner-error" role="alert">
            <AlertIcon aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {mode === "signUp" && (
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="field-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}

        <label className="field">
          <span className="field-label">Email</span>
          <input
            className="field-input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="field-input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          />
        </label>

        <button type="submit" className="btn btn-block" disabled={busy}>
          {busy ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="auth-toggle">
        {mode === "signIn" ? "No account yet?" : "Already have an account?"}{" "}
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(mode === "signIn" ? "signUp" : "signIn");
            setError(null);
          }}
        >
          {mode === "signIn" ? "Create one" : "Sign in"}
        </button>
      </p>
    </div>
  );
}
