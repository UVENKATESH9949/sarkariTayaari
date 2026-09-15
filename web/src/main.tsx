import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { configureApi } from "@sarkaritaiyaari/core/api";

import { applyTheme, readStoredAppearance } from "./theme/applyTheme";
import { ThemeProvider } from "./theme/ThemeProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import { AuthProvider } from "./auth/AuthProvider";
import { ActiveSessionProvider } from "./practice/ActiveSessionProvider";
import App from "./App";
import "./styles/index.css";

/**
 * The shared API client has no default base URL on purpose — mobile derives one from Expo's
 * hostUri, web reads it from the environment — so it must be configured before the first
 * request. Failing loudly here beats a silently wrong URL, which looks like a backend outage
 * and gets debugged in the wrong place.
 */
const baseUrl = import.meta.env.VITE_API_BASE_URL;
if (!baseUrl) {
  throw new Error(
    "VITE_API_BASE_URL is not set. Copy web/.env.example to web/.env.local and point it at a " +
      "running backend (it must include the /api suffix).",
  );
}
configureApi({ baseUrl });

// Before React renders, so the first paint is already the right theme rather than a flash of
// the default one.
const stored = readStoredAppearance();
applyTheme(stored.mode, stored.zoom);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <ActiveSessionProvider>
              <App />
            </ActiveSessionProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
