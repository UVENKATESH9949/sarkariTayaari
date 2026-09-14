import { Routes, Route, NavLink } from "react-router-dom";
import QuestionsList from "./pages/QuestionsList.jsx";
import QuestionForm from "./pages/QuestionForm.jsx";
import BulkImport from "./pages/BulkImport.jsx";
import Duplicates from "./pages/Duplicates.jsx";
import TopicIntelligence from "./pages/TopicIntelligence.jsx";
import WeaknessRadar from "./pages/WeaknessRadar.jsx";
import Subjects from "./pages/Subjects.jsx";
import Topics from "./pages/Topics.jsx";
import Exams from "./pages/Exams.jsx";
import ExamStructure from "./pages/ExamStructure.jsx";
import ExamGuide from "./pages/ExamGuide.jsx";
import ExamSources from "./pages/ExamSources.jsx";
import IngestionSources from "./pages/IngestionSources.jsx";
import IngestionReview from "./pages/IngestionReview.jsx";
import QuestionIngestion from "./pages/QuestionIngestion.jsx";
import QuestionGroups from "./pages/QuestionGroups.jsx";
import Languages from "./pages/Languages.jsx";
import DifficultyLevels from "./pages/DifficultyLevels.jsx";
import PaperTypes from "./pages/PaperTypes.jsx";
import AiControlCenter from "./pages/AiControlCenter.jsx";
import AiContentReview from "./pages/AiContentReview.jsx";
import Login from "./pages/Login.jsx";
import { useAuth } from "./auth/AuthContext.jsx";
import {
  ListIcon,
  PlusIcon,
  UploadIcon,
  DuplicateIcon,
  IntelligenceIcon,
  SubjectIcon,
  TopicIcon,
  ExamIcon,
  LanguageIcon,
  LevelIcon,
  PaperTypeIcon,
  SourceIcon,
  GuideIcon,
  AiIcon,
} from "./components/icons.jsx";
import "./App.css";

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return null;

  if (!user || user.role !== "ADMIN") {
    return (
      <>
        {user && (
          <div className="login-page">
            <div className="login-card">
              <div className="sidebar-brand">
                <div className="logo">ST</div>
                <div>
                  <div className="name">SarkariTaiyaari</div>
                  <div className="subtitle">Content Admin</div>
                </div>
              </div>
              <div className="banner banner-error">
                {user.email} is signed in but is not an admin account.
              </div>
              <button className="btn btn-primary" onClick={logout}>
                Sign out
              </button>
            </div>
          </div>
        )}
        {!user && <Login />}
      </>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">ST</div>
          <div>
            <div className="name">SarkariTaiyaari</div>
            <div className="subtitle">Content Admin</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-group-label">Content</span>
          <NavLink to="/" end><ListIcon /> Questions</NavLink>
          <NavLink to="/questions/new"><PlusIcon /> Add Question</NavLink>
          <NavLink to="/bulk-import"><UploadIcon /> Bulk Import</NavLink>
          <NavLink to="/duplicates"><DuplicateIcon /> Duplicates</NavLink>
          <NavLink to="/question-groups"><GuideIcon /> Question Groups</NavLink>

          <span className="nav-group-label">Exam intelligence</span>
          <NavLink to="/topic-intelligence"><IntelligenceIcon /> Topic Priority</NavLink>
          {/* TASK-2201 §22 — read-only evidence view for "why does the app say I'm weak here?" */}
          <NavLink to="/weakness-radar"><IntelligenceIcon /> Weakness Radar</NavLink>
          <NavLink to="/exam-sources"><SourceIcon /> Exam Guide Sources</NavLink>
          <NavLink to="/ingestion-sources"><SourceIcon /> Ingestion Sources</NavLink>
          {/* TASK-2401 Task 9 -- Accept/Reject a candidate into a real Exam Guide row */}
          <NavLink to="/ingestion-review"><GuideIcon /> Ingestion Review</NavLink>
          {/* TASK-2501 Phase 2 -- PDF -> candidates -> Accept into a real question */}
          <NavLink to="/question-ingestion"><UploadIcon /> Question Ingestion</NavLink>

          <span className="nav-group-label">Reference data</span>
          <NavLink to="/exams"><ExamIcon /> Exams</NavLink>
          <NavLink to="/subjects"><SubjectIcon /> Subjects</NavLink>
          <NavLink to="/topics"><TopicIcon /> Topics</NavLink>
          <NavLink to="/languages"><LanguageIcon /> Languages</NavLink>
          <NavLink to="/difficulty-levels"><LevelIcon /> Difficulty Levels</NavLink>
          <NavLink to="/paper-types"><PaperTypeIcon /> Paper Types</NavLink>

          <span className="nav-group-label">Settings</span>
          <NavLink to="/ai-control-center"><AiIcon /> AI Control Center</NavLink>
          {/* TASK-2701 Phase 2 -- generate, review, and publish AI-authored explanations */}
          <NavLink to="/ai-content-review"><AiIcon /> AI Content Review</NavLink>
        </nav>

        <div className="sidebar-account">
          <div className="email">{user.email}</div>
          <button className="btn btn-sm" onClick={logout}>Sign out</button>
        </div>
      </aside>

      <div className="main">
        <Routes>
          <Route path="/" element={<QuestionsList />} />
          <Route path="/questions/new" element={<QuestionForm mode="create" />} />
          <Route path="/questions/:id/edit" element={<QuestionForm mode="edit" />} />
          <Route path="/bulk-import" element={<BulkImport />} />
          <Route path="/duplicates" element={<Duplicates />} />
          <Route path="/question-groups" element={<QuestionGroups />} />
          <Route path="/topic-intelligence" element={<TopicIntelligence />} />
          <Route path="/weakness-radar" element={<WeaknessRadar />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/exams/:examCode/structure" element={<ExamStructure />} />
          <Route path="/exams/:examCode/guide" element={<ExamGuide />} />
          <Route path="/exam-sources" element={<ExamSources />} />
          <Route path="/ingestion-sources" element={<IngestionSources />} />
          <Route path="/ingestion-review" element={<IngestionReview />} />
          <Route path="/question-ingestion" element={<QuestionIngestion />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/languages" element={<Languages />} />
          <Route path="/difficulty-levels" element={<DifficultyLevels />} />
          <Route path="/paper-types" element={<PaperTypes />} />
          <Route path="/ai-control-center" element={<AiControlCenter />} />
          <Route path="/ai-content-review" element={<AiContentReview />} />
        </Routes>
      </div>
    </div>
  );
}
