import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import Home from "./pages/Home";
import Account from "./pages/Account";
import Settings from "./pages/Settings";
import ComingSoon from "./pages/ComingSoon";
import PracticeExams from "./practice/PracticeExams";
import PracticeSubjects from "./practice/PracticeSubjects";
import PracticeTopics from "./practice/PracticeTopics";
import PracticeLevels from "./practice/PracticeLevels";
import PracticeQuiz from "./practice/PracticeQuiz";
import PracticeSummary from "./practice/PracticeSummary";
import MockTestExams from "./mocktest/MockTestExams";
import MockTestPapers from "./mocktest/MockTestPapers";
import MockTestStart from "./mocktest/MockTestStart";
import MockTestEngine from "./mocktest/MockTestEngine";
import MockTestResult from "./mocktest/MockTestResult";

/**
 * Routes, declared in one place — the same shape `admin/`'s App.jsx uses, deliberately, so the
 * two web apps in this repo stay legible to the same reader.
 *
 * The placeholder routes are real destinations with honest copy rather than stubs that render
 * nothing, so the responsive shell and navigation can be walked and tested before the feature
 * screens land.
 */
export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/practice" element={<PracticeExams />} />
        <Route path="/practice/subjects" element={<PracticeSubjects />} />
        <Route path="/practice/topics" element={<PracticeTopics />} />
        <Route path="/practice/levels" element={<PracticeLevels />} />
        <Route path="/practice/quiz" element={<PracticeQuiz />} />
        <Route path="/practice/summary" element={<PracticeSummary />} />

        <Route path="/mock-test" element={<MockTestExams />} />
        <Route path="/mock-test/papers" element={<MockTestPapers />} />
        <Route path="/mock-test/start" element={<MockTestStart />} />
        <Route path="/mock-test/test" element={<MockTestEngine />} />
        <Route path="/mock-test/result" element={<MockTestResult />} />
        <Route
          path="/progress"
          element={
            <ComingSoon
              title="Progress"
              phase="Phase 3"
              summary="Your readiness, accuracy by subject, and past sessions."
            />
          }
        />
        <Route
          path="/exams/*"
          element={
            <ComingSoon
              title="Exams"
              phase="Phase 4"
              summary="Discover exams, follow them, and read the full recruitment guide."
            />
          }
        />
        <Route path="/account" element={<Account />} />
        <Route path="/settings" element={<Settings />} />
        <Route
          path="*"
          element={
            <ComingSoon
              title="Page not found"
              phase="—"
              summary="That address does not match anything in the app."
              notFound
            />
          }
        />
      </Routes>
    </AppShell>
  );
}
