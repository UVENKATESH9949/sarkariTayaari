const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

async function readError(response) {
  const body = await response.json().catch(() => ({}));
  // Handled errors use {error}; unhandled 500s fall back to Spring's {error, message} shape.
  return body.error || body.message || `Request failed: ${response.status}`;
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  if (response.status === 204) return null;
  return response.json();
}

function jsonBody(method, payload) {
  return { method, body: JSON.stringify(payload) };
}

/* ---------------------------------------------------------------- Questions */

export function listQuestions({ page = 0, size = 20, examCode, subjectId, topicId, difficulty, sort } = {}) {
  const params = new URLSearchParams();
  params.set("page", page);
  params.set("size", size);
  if (examCode) params.set("examCode", examCode);
  // topicId and subjectId are mutually exclusive server-side: topicId wins and subjectId is ignored.
  if (topicId) params.set("topicId", topicId);
  else if (subjectId) params.set("subjectId", subjectId);
  if (difficulty) params.set("difficulty", difficulty);
  if (sort) params.set("sort", sort);
  return request(`/api/questions?${params.toString()}`);
}

export function getQuestion(id) {
  return request(`/api/questions/${id}`);
}

export function createQuestion(payload) {
  return request(`/api/questions`, jsonBody("POST", payload));
}

export function updateQuestion(id, payload) {
  return request(`/api/questions/${id}`, jsonBody("PUT", payload));
}

export function upsertTranslation(id, lang, payload) {
  return request(`/api/questions/${id}/translations/${lang}`, jsonBody("PUT", payload));
}

export function deleteQuestion(id) {
  return request(`/api/questions/${id}`, { method: "DELETE" });
}

export function bulkImportQuestions(questions) {
  return request(`/api/questions/bulk-import`, jsonBody("POST", { questions }));
}

export function bulkDeleteQuestions(ids) {
  return request(`/api/questions/bulk-delete`, jsonBody("POST", { ids }));
}

/* -------------------------------------------------------------------- Exams */

// Active-only; this is the list the mobile app sees.
export function listExams() {
  return request(`/api/exams`);
}

// Includes inactive rows — the correct list for admin screens.
export function listAllExams() {
  return request(`/api/exams/all`);
}

export function getExam(code) {
  return request(`/api/exams/${code}`);
}

export function createExam(payload) {
  return request(`/api/exams`, jsonBody("POST", payload));
}

// Full replace: send every field, or omitted booleans/ints reset to false/0.
export function updateExam(code, payload) {
  return request(`/api/exams/${code}`, jsonBody("PUT", payload));
}

export function deleteExam(code) {
  return request(`/api/exams/${code}`, { method: "DELETE" });
}

/* ---------------------------------------------------------------- Languages */

export function listLanguages() {
  return request(`/api/languages`);
}

export function listAllLanguages() {
  return request(`/api/languages/all`);
}

export function createLanguage(payload) {
  return request(`/api/languages`, jsonBody("POST", payload));
}

export function updateLanguage(code, payload) {
  return request(`/api/languages/${code}`, jsonBody("PUT", payload));
}

export function deleteLanguage(code) {
  return request(`/api/languages/${code}`, { method: "DELETE" });
}

/* ----------------------------------------------------------------- Subjects */

export function listSubjects() {
  return request(`/api/subjects`);
}

export function getSubject(id) {
  return request(`/api/subjects/${id}`);
}

export function createSubject(payload) {
  return request(`/api/subjects`, jsonBody("POST", payload));
}

export function updateSubject(id, payload) {
  return request(`/api/subjects/${id}`, jsonBody("PUT", payload));
}

export function deleteSubject(id) {
  return request(`/api/subjects/${id}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------- Topics */

export function listTopics(subjectId) {
  const params = new URLSearchParams();
  if (subjectId) params.set("subjectId", subjectId);
  const query = params.toString();
  return request(`/api/topics${query ? `?${query}` : ""}`);
}

export function getTopic(id) {
  return request(`/api/topics/${id}`);
}

export function createTopic(payload) {
  return request(`/api/topics`, jsonBody("POST", payload));
}

export function updateTopic(id, payload) {
  return request(`/api/topics/${id}`, jsonBody("PUT", payload));
}

export function deleteTopic(id) {
  return request(`/api/topics/${id}`, { method: "DELETE" });
}

/* ------------------------------------------------------------- Exam syllabus */

// Which subjects an exam covers. Separate from its paper structure — one subject
// belongs to many exams, and an exam can have a syllabus before any papers exist.
export function getExamSyllabus(examCode) {
  return request(`/api/exams/${examCode}/subjects`);
}

export function setExamSyllabus(examCode, subjectIds) {
  return request(`/api/exams/${examCode}/subjects`, jsonBody("PUT", { subjectIds }));
}

/* -------------------------------------------------------- Exam structure tree */

// Whole Stage → Paper → Section → Subjects tree for one exam, in display order.
export function getExamStructure(examCode) {
  return request(`/api/exams/${examCode}/structure`);
}

export function listStages(examCode) {
  const params = new URLSearchParams();
  if (examCode) params.set("examCode", examCode);
  const query = params.toString();
  return request(`/api/exam-stages${query ? `?${query}` : ""}`);
}

export function createStage(payload) {
  return request(`/api/exam-stages`, jsonBody("POST", payload));
}

export function updateStage(id, payload) {
  return request(`/api/exam-stages/${id}`, jsonBody("PUT", payload));
}

// Cascades: removing a stage removes its papers and their sections.
export function deleteStage(id) {
  return request(`/api/exam-stages/${id}`, { method: "DELETE" });
}

export function createPaper(payload) {
  return request(`/api/exam-papers`, jsonBody("POST", payload));
}

export function updatePaper(id, payload) {
  return request(`/api/exam-papers/${id}`, jsonBody("PUT", payload));
}

export function deletePaper(id) {
  return request(`/api/exam-papers/${id}`, { method: "DELETE" });
}

export function createSection(payload) {
  return request(`/api/paper-sections`, jsonBody("POST", payload));
}

export function updateSection(id, payload) {
  return request(`/api/paper-sections/${id}`, jsonBody("PUT", payload));
}

export function deleteSection(id) {
  return request(`/api/paper-sections/${id}`, { method: "DELETE" });
}

/* -------------------------------------------------------- Difficulty levels */

export function listDifficultyLevels() {
  return request(`/api/difficulty-levels`);
}

export function listAllDifficultyLevels() {
  return request(`/api/difficulty-levels/all`);
}

export function createDifficultyLevel(payload) {
  return request(`/api/difficulty-levels`, jsonBody("POST", payload));
}

export function updateDifficultyLevel(code, payload) {
  return request(`/api/difficulty-levels/${code}`, jsonBody("PUT", payload));
}

export function deleteDifficultyLevel(code) {
  return request(`/api/difficulty-levels/${code}`, { method: "DELETE" });
}

/* --------------------------------------------------------------- Paper types */

export function listPaperTypes() {
  return request(`/api/paper-types`);
}

export function createPaperType(payload) {
  return request(`/api/paper-types`, jsonBody("POST", payload));
}

export function updatePaperType(code, payload) {
  return request(`/api/paper-types/${code}`, jsonBody("PUT", payload));
}

export function deletePaperType(code) {
  return request(`/api/paper-types/${code}`, { method: "DELETE" });
}

/* ------------------------------------------------------------------- Images */

// Multipart: the field name must be exactly "file", and Content-Type must be left
// unset so the browser supplies the boundary.
export async function uploadImage(file) {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(`${BASE_URL}/api/images`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}
