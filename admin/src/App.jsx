import { Routes, Route, NavLink } from "react-router-dom";
import QuestionsList from "./pages/QuestionsList.jsx";
import QuestionForm from "./pages/QuestionForm.jsx";
import BulkImport from "./pages/BulkImport.jsx";
import Subjects from "./pages/Subjects.jsx";
import Topics from "./pages/Topics.jsx";
import Exams from "./pages/Exams.jsx";
import ExamStructure from "./pages/ExamStructure.jsx";
import Languages from "./pages/Languages.jsx";
import DifficultyLevels from "./pages/DifficultyLevels.jsx";
import PaperTypes from "./pages/PaperTypes.jsx";
import {
  ListIcon,
  PlusIcon,
  UploadIcon,
  SubjectIcon,
  TopicIcon,
  ExamIcon,
  LanguageIcon,
  LevelIcon,
  PaperTypeIcon,
} from "./components/icons.jsx";
import "./App.css";

export default function App() {
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

          <span className="nav-group-label">Reference data</span>
          <NavLink to="/exams"><ExamIcon /> Exams</NavLink>
          <NavLink to="/subjects"><SubjectIcon /> Subjects</NavLink>
          <NavLink to="/topics"><TopicIcon /> Topics</NavLink>
          <NavLink to="/languages"><LanguageIcon /> Languages</NavLink>
          <NavLink to="/difficulty-levels"><LevelIcon /> Difficulty Levels</NavLink>
          <NavLink to="/paper-types"><PaperTypeIcon /> Paper Types</NavLink>
        </nav>
      </aside>

      <div className="main">
        <Routes>
          <Route path="/" element={<QuestionsList />} />
          <Route path="/questions/new" element={<QuestionForm mode="create" />} />
          <Route path="/questions/:id/edit" element={<QuestionForm mode="edit" />} />
          <Route path="/bulk-import" element={<BulkImport />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/exams/:examCode/structure" element={<ExamStructure />} />
          <Route path="/subjects" element={<Subjects />} />
          <Route path="/topics" element={<Topics />} />
          <Route path="/languages" element={<Languages />} />
          <Route path="/difficulty-levels" element={<DifficultyLevels />} />
          <Route path="/paper-types" element={<PaperTypes />} />
        </Routes>
      </div>
    </div>
  );
}
