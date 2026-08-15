import { useNavigate } from "react-router-dom";
import Modal from "./Modal.jsx";

/**
 * Some seeded rows store correctAnswer as the literal option value ("12") rather than
 * a letter, so fall back to matching it against the English options. Returns the
 * resolved index plus whether the letter convention was actually followed.
 */
function resolveCorrectAnswer(correctAnswer, englishOptions) {
  if (correctAnswer == null) return { index: -1, standard: false };
  const trimmed = String(correctAnswer).trim();
  const upper = trimmed.toUpperCase();

  if (/^[A-D]$/.test(upper)) return { index: upper.charCodeAt(0) - 65, standard: true };
  if (/^[0-3]$/.test(upper)) return { index: Number(upper), standard: true };

  const matched = (englishOptions || []).findIndex((o) => String(o).trim() === trimmed);
  return { index: matched, standard: false };
}

export default function QuestionDetailModal({ question, onClose, onDelete }) {
  const navigate = useNavigate();

  const english = question.translations.find((t) => t.languageCode === "en") || question.translations[0];
  const { index: correctIndex, standard } = resolveCorrectAnswer(
    question.correctAnswer,
    english ? english.options : []
  );

  return (
    <Modal
      title="Question Details"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-danger" onClick={() => onDelete(question.id)}>
            Delete
          </button>
          <button className="btn btn-primary" onClick={() => navigate(`/questions/${question.id}/edit`)}>
            Edit
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="detail-row">
        <span className="detail-label">Subject</span>
        <span>{question.subjectName}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Topic</span>
        <span>{question.topicName}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Exams</span>
        <span>
          {question.examCodes.map((code) => (
            <span className="badge" key={code}>
              {code}
            </span>
          ))}
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Difficulty</span>
        <span className="badge">{question.difficulty}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Correct Answer</span>
        <span>
          {question.correctAnswer}
          {!standard && correctIndex >= 0 && (
            <span className="badge badge-medium" style={{ marginLeft: 8 }}>
              stored as a value, not A–D
            </span>
          )}
          {correctIndex < 0 && (
            <span className="badge badge-hard" style={{ marginLeft: 8 }}>
              does not match any option
            </span>
          )}
        </span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Access</span>
        <span>{question.premium ? "Premium" : "Free"}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Last Updated</span>
        <span>{new Date(question.updatedAt).toLocaleString()}</span>
      </div>
      <div className="detail-row">
        <span className="detail-label">Status</span>
        <span>{question.deleted ? "Deleted" : "Active"}</span>
      </div>

      <h3 style={{ marginTop: 18, marginBottom: 10 }}>Translations</h3>
      {question.translations.map((t) => (
        <div className="translation-view" key={t.languageCode}>
          <span className="badge badge-lang">{t.languageCode}</span>
          <p style={{ margin: "10px 0", fontWeight: 500 }}>{t.questionText}</p>
          <ul className="options-list">
            {t.options.map((opt, i) => (
              <li key={i} className={i === correctIndex ? "correct" : ""}>
                <span>{String.fromCharCode(65 + i)}.</span>
                <span>{opt}</span>
                {i === correctIndex && <span>✓</span>}
              </li>
            ))}
          </ul>
          {t.explanation && (
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              <strong>Explanation:</strong> {t.explanation}
            </p>
          )}
        </div>
      ))}
    </Modal>
  );
}
