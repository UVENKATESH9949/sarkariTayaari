import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

// Mock language list — only "en" and "hi" have real question content anywhere
// in this prototype; the rest exist so language pickers (Quiz, More) have
// enough entries for search to be worth having, and so the "not translated
// yet" fallback has somewhere real to show up. Real list comes from
// GET /api/languages once the app is wired to the backend.
export const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "kn", name: "Kannada" },
  { code: "bn", name: "Bengali" },
  { code: "mr", name: "Marathi" },
  { code: "gu", name: "Gujarati" },
  { code: "pa", name: "Punjabi" },
  { code: "ml", name: "Malayalam" },
  { code: "ur", name: "Urdu" },
];

type AppLanguageContextValue = {
  defaultLanguageCode: string;
  setDefaultLanguageCode: (code: string) => void;
};

const AppLanguageContext = createContext<AppLanguageContextValue>({
  defaultLanguageCode: "en",
  setDefaultLanguageCode: () => {},
});

export function useAppLanguage() {
  return useContext(AppLanguageContext);
}

export function AppLanguageProvider({ children }: { children: ReactNode }) {
  const [defaultLanguageCode, setDefaultLanguageCode] = useState("en");

  return (
    <AppLanguageContext.Provider value={{ defaultLanguageCode, setDefaultLanguageCode }}>
      {children}
    </AppLanguageContext.Provider>
  );
}
