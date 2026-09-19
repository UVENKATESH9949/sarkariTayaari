import { useI18n, AVAILABLE_LANGUAGES } from "../i18n/I18nContext";
import { useTheme } from "../theme/ThemeContext";
import { ZOOM_STEPS } from "../theme/applyTheme";

const LANGUAGE_LABELS: Record<string, string> = { en: "English", te: "తెలుగు" };

/**
 * Appearance and language.
 *
 * Mirrors the phone app's Settings screen, including its deliberate separation of the
 * *interface* language from the *question content* language — a student may want the app in
 * English while reading questions in Hindi. Only the interface half exists here so far;
 * content language belongs with the question screens in Phase 1.
 */
export default function Settings() {
  const { mode, zoom, setMode, setZoom } = useTheme();
  const { language, setLanguage } = useI18n();

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="card stack">
        <div>
          <h2>Appearance</h2>
          <p className="subtle">Saved on this device only.</p>
        </div>

        <div>
          <span className="field-label">Theme</span>
          <div className="row">
            {(["dark", "light"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={option === mode ? "btn" : "btn btn-secondary"}
                onClick={() => setMode(option)}
                aria-pressed={option === mode}
              >
                {option === "light" ? "Light" : "Dark"}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Text size</span>
          <div className="row">
            {ZOOM_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                className={step === zoom ? "btn" : "btn btn-secondary"}
                onClick={() => setZoom(step)}
                aria-pressed={step === zoom}
              >
                {Math.round(step * 100)}%
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card stack">
        <div>
          <h2>Language</h2>
          <p className="subtle">
            The interface language. Question content has its own language setting, which arrives
            with the practice screens.
          </p>
        </div>
        <div className="row">
          {AVAILABLE_LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className={code === language ? "btn" : "btn btn-secondary"}
              onClick={() => setLanguage(code)}
              aria-pressed={code === language}
            >
              {LANGUAGE_LABELS[code] ?? code}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
