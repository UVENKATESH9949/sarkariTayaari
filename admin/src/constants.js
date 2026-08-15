// Exams, subjects, topics, difficulty levels and paper types are all real records —
// fetch them from the API rather than hardcoding them here.

// Mirrors spring.servlet.multipart.max-file-size. Exceeding it server-side returns
// an unmapped 500, so the upload is blocked here first.
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

// Column widths from the DB schema. The backend does not bean-validate these, so
// exceeding one returns a raw 500 instead of a readable 400 — enforce them here.
export const MAX_LENGTHS = {
  examCode: 30,
  examName: 100,
  languageCode: 10,
  languageName: 50,
  subjectName: 100,
  topicName: 100,
  correctAnswer: 10,
  difficulty: 20,
};
