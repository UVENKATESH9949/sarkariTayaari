import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getQuestion,
  createQuestion,
  updateQuestion,
  upsertTranslation,
  listLanguages,
  listSubjects,
  listTopics,
  listAllExams,
  listDifficultyLevels,
  listQuestionTypes,
  getExamStructure,
  listQuestionGroups,
} from "../api.js";
import { useConfirm } from "../hooks/useConfirm.jsx";

/**
 * `content` is per-type: {assertion, reason} for ASSERTION_REASON, {statements: [...]} for
 * STATEMENT_COMBINATION, {leftLabels, rightLabels} for MATCH, {itemLabels} for ORDERING
 * (TASK-2301 Phase P2 Wave B), unused (stays {}) for the rest. `options` starts as 4 blanks
 * for every type except the ones with no fixed option list at all — see
 * NO_OPTIONS_TYPES/buildTranslationPayload below.
 */
const EMPTY_TRANSLATION = { languageCode: "", questionText: "", options: ["", "", "", ""], explanation: "", content: {} };
const ANSWER_LETTERS = ["A", "B", "C", "D"];

/**
 * Question types this form knows how to render (TASK-2301 Phase P2 Wave A/B). Bulk import
 * stays SINGLE_CHOICE-only by design — see QuestionService's own comment — so this form is
 * the only authoring path for every other type.
 */
const OPTION_SET_TYPES_WITH_LETTER_OPTIONS = new Set([
  "SINGLE_CHOICE",
  "ASSERTION_REASON",
  "STATEMENT_COMBINATION",
]);

/** Mirrors QuestionService.java's NO_OPTIONS_TYPES exactly — no fixed 4-option list. */
const NO_OPTIONS_TYPES = new Set(["TRUE_FALSE", "NUMERIC", "FILL_BLANK", "MATCH", "ORDERING"]);

const BLANK_FORM = {
  questionType: "SINGLE_CHOICE",
  subjectId: "",
  topicId: "",
  difficulty: "",
  correctAnswer: "A",
  // MULTIPLE_CHOICE: which letters are ticked. TRUE_FALSE: the picked boolean, or null
  // until the admin picks one — kept separate from correctAnswer above rather than
  // overloading one field with three incompatible shapes (a letter, a letter set, a
  // boolean).
  correctOptions: [],
  correctBoolean: null,
  // NUMERIC (TASK-2301 Phase P2 Wave B). Held as strings while editing, same reasoning as
  // pyqYear below — a half-typed value shouldn't be coerced mid-keystroke.
  correctValue: "",
  tolerance: "0",
  // FILL_BLANK. Language-independent, like every other answer-key field on this form —
  // see the field's own note further down for why that's a real, disclosed limitation.
  acceptedAnswers: [""],
  // MATCH. Keys only, not labels — labels are per-language, held on each translation's
  // content.leftLabels/rightLabels instead. Immutable after creation (see
  // CreateQuestionRequest's own note), so edit mode loads these from the existing question
  // and never lets addMatchItem/removeMatchItem touch them again.
  matchLeftKeys: [],
  matchRightKeys: [],
  matchCorrectMapping: {},
  // ORDERING. Same "keys only" reasoning as MATCH above — labels live on
  // content.itemLabels. Order IS mutable after creation (unlike the key set itself), since
  // it's the answer, not the structure.
  orderingKeys: [],
  // Shared group (TASK-2301 Phase P3) — organisational, not evaluator-critical, so both
  // remain mutable after creation unlike questionType/contentStructure above.
  questionGroupId: "",
  groupOrder: "",
  examCodes: [],
  premium: false,
  // Epic L / TICKET-2104. Held as strings while editing (see the year input below) so a
  // half-typed value is not coerced mid-keystroke.
  pyq: false,
  pyqYear: "",
  pyqShift: "",
  sourcePaperId: "",
  questionNumber: "",
  sourceUrl: "",
};

/**
 * Sanity bounds for a PYQ year, matching the server's own @Min/@Max.
 *
 * Checked here too because the server's rejection is a bare 400 that loses whatever else the
 * admin had typed — and a typo'd year is not harmless, it silently skews every trend computed
 * from the question.
 */
const PYQ_YEAR_MIN = 1950;
const PYQ_YEAR_MAX = 2100;

/** Flattens an exam's stage tree into a selectable paper list for the source-paper picker. */
function papersFromStructures(structures) {
  const papers = [];
  for (const structure of structures) {
    for (const stage of structure.stages ?? []) {
      for (const paper of stage.papers ?? []) {
        papers.push({
          id: paper.id,
          label: `${structure.examCode} · ${stage.name} · ${paper.name}`,
        });
      }
    }
  }
  return papers;
}

/** Existing rows may store the option value rather than a letter; normalise to a letter. */
function toAnswerLetter(correctAnswer, englishOptions) {
  const trimmed = String(correctAnswer ?? "").trim();
  const upper = trimmed.toUpperCase();
  if (/^[A-D]$/.test(upper)) return { letter: upper, converted: false };
  if (/^[0-3]$/.test(upper)) return { letter: ANSWER_LETTERS[Number(upper)], converted: true };
  const matched = (englishOptions || []).findIndex((o) => String(o).trim() === trimmed);
  if (matched >= 0) return { letter: ANSWER_LETTERS[matched], converted: true };
  return { letter: "", converted: false };
}

export default function QuestionForm({ mode }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState(BLANK_FORM);
  const [translations, setTranslations] = useState([{ ...EMPTY_TRANSLATION, languageCode: "en" }]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [exams, setExams] = useState([]);
  const [difficulties, setDifficulties] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [questionTypes, setQuestionTypes] = useState([]);
  const [questionGroups, setQuestionGroups] = useState([]);
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [answerNote, setAnswerNote] = useState(null);
  const [sourcePapers, setSourcePapers] = useState([]);
  const [confirm, confirmDialog] = useConfirm();

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * MATCH/ORDERING item keys (TASK-2301 Phase P2 Wave B) — assigned once, at add-time, and
   * never regenerated from array position. That's what lets a mid-list removal leave every
   * other item's key (and anything already keyed against it — matchCorrectMapping, a
   * translation's leftLabels/rightLabels/itemLabels) untouched, instead of silently
   * reshuffling identities out from under the admin's existing answers.
   */
  const keyCounterRef = useRef(0);
  function nextKey(prefix) {
    keyCounterRef.current += 1;
    return `${prefix}${keyCounterRef.current}`;
  }

  useEffect(() => {
    Promise.all([
      listLanguages(),
      listSubjects(),
      listTopics(),
      listAllExams(),
      listDifficultyLevels(),
      listQuestionTypes(),
      listQuestionGroups({ size: 200 }),
    ])
      .then(([languageRows, subjectRows, topicRows, examRows, difficultyRows, typeRows, groupPage]) => {
        setLanguages(languageRows);
        setSubjects(subjectRows);
        setTopics(topicRows);
        setExams([...examRows].sort((a, b) => a.displayOrder - b.displayOrder));
        setDifficulties(difficultyRows);
        setQuestionTypes(typeRows);
        setQuestionGroups(groupPage.content ?? groupPage);
        // Default to the first active level rather than assuming one is called "easy".
        setForm((prev) => (prev.difficulty ? prev : { ...prev, difficulty: difficultyRows[0]?.code || "" }));
      })
      .catch((e) => setError(e.message));
  }, []);

  /*
   * The source-paper picker's options.
   *
   * Loaded per selected exam rather than all at once: `getExamStructure` is one request per exam,
   * and fetching all 11 up front would be 11 requests on a form where most authors never open the
   * PYQ section at all. Failures are swallowed to an empty list — a missing picker is a degraded
   * form, not a broken one, and every other field still works.
   */
  useEffect(() => {
    if (form.examCodes.length === 0) {
      setSourcePapers([]);
      return;
    }
    let cancelled = false;
    Promise.all(form.examCodes.map((code) => getExamStructure(code).catch(() => null)))
      .then((structures) => {
        if (cancelled) return;
        setSourcePapers(papersFromStructures(structures.filter(Boolean)));
      })
      .catch(() => setSourcePapers([]));
    // Guarded against a late response from a previous exam selection overwriting a newer one.
    return () => {
      cancelled = true;
    };
  }, [form.examCodes]);

  useEffect(() => {
    if (mode !== "edit") return;
    getQuestion(id)
      .then((q) => {
        const questionType = q.questionType || "SINGLE_CHOICE";
        const english = q.translations.find((t) => t.languageCode === "en") || q.translations[0];

        // Answer state is type-shaped (V26, TASK-2301 Phase P2 Wave A) — only the three
        // option-set-with-a-letter types (SINGLE_CHOICE/ASSERTION_REASON/
        // STATEMENT_COMBINATION) go through the letter-matching/answerNote logic;
        // MULTIPLE_CHOICE and TRUE_FALSE read their answer straight from answerKey, which
        // the server always keeps in step with correctAnswer, so there is nothing to
        // reconcile for them.
        let letter = "";
        let correctOptions = [];
        let correctBoolean = null;
        // NUMERIC/FILL_BLANK/MATCH/ORDERING (TASK-2301 Phase P2 Wave B) — same "read straight
        // from answerKey" reasoning as MULTIPLE_CHOICE/TRUE_FALSE above; contentStructure is
        // the only source for MATCH/ORDERING's keys, since it's immutable and never resent.
        let correctValue = "";
        let tolerance = "0";
        let acceptedAnswers = [""];
        let matchLeftKeys = [];
        let matchRightKeys = [];
        let matchCorrectMapping = {};
        let orderingKeys = [];
        if (OPTION_SET_TYPES_WITH_LETTER_OPTIONS.has(questionType)) {
          const matched = toAnswerLetter(q.correctAnswer, english ? english.options : []);
          letter = matched.letter;
          if (matched.converted) {
            setAnswerNote(
              `This question stored its correct answer as "${q.correctAnswer}" rather than a letter. It has been matched to ${letter} — saving will store it in the standard form.`
            );
          } else if (!letter) {
            setAnswerNote(
              `The stored correct answer ("${q.correctAnswer}") does not match any option. Pick the right one before saving.`
            );
          }
        } else if (questionType === "MULTIPLE_CHOICE") {
          const indices = (q.answerKey && q.answerKey.correctOptions) || [];
          correctOptions = indices.map((i) => ANSWER_LETTERS[i]).filter(Boolean);
        } else if (questionType === "TRUE_FALSE") {
          correctBoolean = q.answerKey ? Boolean(q.answerKey.correctBoolean) : null;
        } else if (questionType === "NUMERIC") {
          correctValue = q.answerKey && q.answerKey.correctValue !== undefined ? String(q.answerKey.correctValue) : "";
          tolerance = q.answerKey && q.answerKey.tolerance !== undefined ? String(q.answerKey.tolerance) : "0";
        } else if (questionType === "FILL_BLANK") {
          acceptedAnswers = (q.answerKey && q.answerKey.acceptedAnswers) || [""];
        } else if (questionType === "MATCH") {
          matchLeftKeys = (q.contentStructure && q.contentStructure.leftKeys) || [];
          matchRightKeys = (q.contentStructure && q.contentStructure.rightKeys) || [];
          matchCorrectMapping = (q.answerKey && q.answerKey.correctMapping) || {};
        } else if (questionType === "ORDERING") {
          orderingKeys =
            (q.answerKey && q.answerKey.correctOrder) || (q.contentStructure && q.contentStructure.itemKeys) || [];
        }

        setForm({
          questionType,
          subjectId: q.subjectId || "",
          topicId: q.topicId || "",
          difficulty: q.difficulty,
          correctAnswer: letter,
          correctOptions,
          correctBoolean,
          correctValue,
          tolerance,
          acceptedAnswers,
          matchLeftKeys,
          matchRightKeys,
          matchCorrectMapping,
          orderingKeys,
          questionGroupId: q.questionGroupId || "",
          groupOrder: q.groupOrder ?? "",
          examCodes: q.examCodes || [],
          premium: Boolean(q.premium),
          // Nullable columns become "" so the inputs stay controlled — same convention as the
          // exam form's imageUrl/difficulty/badge.
          pyq: Boolean(q.pyq),
          pyqYear: q.pyqYear ?? "",
          pyqShift: q.pyqShift ?? "",
          sourcePaperId: q.sourcePaperId ?? "",
          questionNumber: q.questionNumber ?? "",
          sourceUrl: q.sourceUrl ?? "",
        });
        setTranslations(
          q.translations.map((t) => ({ ...t, explanation: t.explanation || "", content: t.content || {} }))
        );
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [mode, id]);

  function updateTranslation(index, field, value) {
    setTranslations((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  function updateOption(index, optionIndex, value) {
    setTranslations((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        const options = [...t.options];
        options[optionIndex] = value;
        return { ...t, options };
      })
    );
  }

  /** ASSERTION_REASON's two content fields, per translation. */
  function updateContentField(index, field, value) {
    setTranslations((prev) =>
      prev.map((t, i) => (i === index ? { ...t, content: { ...t.content, [field]: value } } : t))
    );
  }

  /** STATEMENT_COMBINATION's statement list, per translation. */
  function updateStatement(index, statementIndex, value) {
    setTranslations((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        const statements = [...(t.content.statements || [])];
        statements[statementIndex] = value;
        return { ...t, content: { ...t.content, statements } };
      })
    );
  }

  function addStatement(index) {
    setTranslations((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, content: { ...t.content, statements: [...(t.content.statements || []), ""] } } : t
      )
    );
  }

  function removeStatement(index, statementIndex) {
    setTranslations((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        const statements = (t.content.statements || []).filter((_, si) => si !== statementIndex);
        return { ...t, content: { ...t.content, statements } };
      })
    );
  }

  /** MATCH's/ORDERING's per-language label for one item, on one translation (TASK-2301 Phase P2 Wave B). */
  function updateItemLabel(index, labelsField, key, value) {
    setTranslations((prev) =>
      prev.map((t, i) =>
        i === index ? { ...t, content: { ...t.content, [labelsField]: { ...(t.content[labelsField] || {}), [key]: value } } } : t
      )
    );
  }

  /** Drops one key's label from every translation — paired with removeMatchItem/removeOrderingItem below. */
  function dropItemLabelEverywhere(labelsField, key) {
    setTranslations((prev) =>
      prev.map((t) => {
        if (!t.content[labelsField]) return t;
        const next = { ...t.content[labelsField] };
        delete next[key];
        return { ...t, content: { ...t.content, [labelsField]: next } };
      })
    );
  }

  /**
   * MATCH's left/right item lists (TASK-2301 Phase P2 Wave B). Create-only — see
   * CreateQuestionRequest's own note on why contentStructure (which these key lists become)
   * is immutable after creation; the edit-mode JSX below never renders these add/remove
   * buttons at all, so calling them post-creation isn't reachable through the UI.
   */
  function addMatchItem(side) {
    const key = nextKey(side === "left" ? "L" : "R");
    setForm((prev) => ({ ...prev, [side === "left" ? "matchLeftKeys" : "matchRightKeys"]: [...prev[side === "left" ? "matchLeftKeys" : "matchRightKeys"], key] }));
  }

  function removeMatchItem(side, key) {
    setForm((prev) => {
      const field = side === "left" ? "matchLeftKeys" : "matchRightKeys";
      const matchCorrectMapping = { ...prev.matchCorrectMapping };
      if (side === "left") {
        delete matchCorrectMapping[key];
      } else {
        for (const [leftKey, rightKey] of Object.entries(matchCorrectMapping)) {
          if (rightKey === key) delete matchCorrectMapping[leftKey];
        }
      }
      return { ...prev, [field]: prev[field].filter((k) => k !== key), matchCorrectMapping };
    });
    dropItemLabelEverywhere(side === "left" ? "leftLabels" : "rightLabels", key);
  }

  function setMatchMapping(leftKey, rightKey) {
    setForm((prev) => ({ ...prev, matchCorrectMapping: { ...prev.matchCorrectMapping, [leftKey]: rightKey } }));
  }

  /**
   * ORDERING's item list, in correct order (TASK-2301 Phase P2 Wave B). Add/remove are
   * create-only, same reasoning as MATCH above — but moving an item IS allowed after
   * creation, since the order itself is the answer (answerKey.correctOrder, mutable via
   * update()), not the structural key set (contentStructure.itemKeys, immutable).
   */
  function addOrderingItem() {
    const key = nextKey("I");
    setForm((prev) => ({ ...prev, orderingKeys: [...prev.orderingKeys, key] }));
  }

  function removeOrderingItem(key) {
    setForm((prev) => ({ ...prev, orderingKeys: prev.orderingKeys.filter((k) => k !== key) }));
    dropItemLabelEverywhere("itemLabels", key);
  }

  function moveOrderingItem(index, direction) {
    setForm((prev) => {
      const keys = [...prev.orderingKeys];
      const target = index + direction;
      if (target < 0 || target >= keys.length) return prev;
      [keys[index], keys[target]] = [keys[target], keys[index]];
      return { ...prev, orderingKeys: keys };
    });
  }

  /** FILL_BLANK's accepted-answer list — classification-level, not per-translation; see the field's own note in BLANK_FORM. */
  function updateAcceptedAnswer(index, value) {
    setForm((prev) => {
      const acceptedAnswers = [...prev.acceptedAnswers];
      acceptedAnswers[index] = value;
      return { ...prev, acceptedAnswers };
    });
  }

  function addAcceptedAnswer() {
    setForm((prev) => ({ ...prev, acceptedAnswers: [...prev.acceptedAnswers, ""] }));
  }

  function removeAcceptedAnswer(index) {
    setForm((prev) => ({ ...prev, acceptedAnswers: prev.acceptedAnswers.filter((_, i) => i !== index) }));
  }

  /** MULTIPLE_CHOICE's correct-answer set — toggles one letter in form.correctOptions. */
  function toggleCorrectOption(letter) {
    setForm((prev) => ({
      ...prev,
      correctOptions: prev.correctOptions.includes(letter)
        ? prev.correctOptions.filter((l) => l !== letter)
        : [...prev.correctOptions, letter],
    }));
  }

  function availableLanguagesFor(index) {
    const usedElsewhere = new Set(translations.filter((_, i) => i !== index).map((t) => t.languageCode));
    return languages.filter((l) => !usedElsewhere.has(l.code));
  }

  function addTranslation() {
    setTranslations((prev) => [...prev, { ...EMPTY_TRANSLATION }]);
  }

  async function removeTranslation(index) {
    const t = translations[index];
    const hasContent = t.questionText.trim() || t.explanation.trim() || t.options.some((o) => o.trim());
    if (hasContent) {
      const ok = await confirm("Remove this language? The text you've entered for it will be lost.", {
        title: "Remove translation",
        confirmLabel: "Remove",
        danger: true,
      });
      if (!ok) return;
    }
    setTranslations((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleExam(code) {
    setForm((prev) => ({
      ...prev,
      examCodes: prev.examCodes.includes(code)
        ? prev.examCodes.filter((c) => c !== code)
        : [...prev.examCodes, code],
    }));
  }

  /**
   * Every non-letter-based type's validation and payload shape (TASK-2301 Phase P2 Wave
   * A/B). Returns `{ correctAnswer, answerKey }` matching what QuestionService.resolveAnswer
   * expects — `correctAnswer` is sent for the three letter-based types (server derives
   * answerKey from it, unchanged since P1); `answerKey` is sent directly for every other
   * type, which has no letter to derive from.
   */
  function resolveAnswerForSubmit() {
    if (form.questionType === "MULTIPLE_CHOICE") {
      if (form.correctOptions.length === 0) {
        throw new Error("Tick at least one correct option.");
      }
      return { answerKey: { correctOptions: form.correctOptions.map((l) => ANSWER_LETTERS.indexOf(l)) } };
    }
    if (form.questionType === "TRUE_FALSE") {
      if (form.correctBoolean === null) {
        throw new Error("Pick True or False.");
      }
      return { answerKey: { correctBoolean: form.correctBoolean } };
    }
    if (form.questionType === "NUMERIC") {
      if (form.correctValue === "" || Number.isNaN(Number(form.correctValue))) {
        throw new Error("Enter the correct numeric value.");
      }
      const tolerance = form.tolerance === "" ? 0 : Number(form.tolerance);
      if (Number.isNaN(tolerance) || tolerance < 0) {
        throw new Error("Tolerance must be a non-negative number.");
      }
      return { answerKey: { correctValue: Number(form.correctValue), tolerance } };
    }
    if (form.questionType === "FILL_BLANK") {
      const acceptedAnswers = form.acceptedAnswers.map((a) => a.trim()).filter(Boolean);
      if (acceptedAnswers.length === 0) {
        throw new Error("Enter at least one accepted answer.");
      }
      return { answerKey: { acceptedAnswers } };
    }
    if (form.questionType === "MATCH") {
      if (form.matchLeftKeys.length < 2 || form.matchRightKeys.length < 2) {
        throw new Error("Add at least 2 left items and 2 right items.");
      }
      const correctMapping = {};
      for (const leftKey of form.matchLeftKeys) {
        const rightKey = form.matchCorrectMapping[leftKey];
        if (!rightKey) {
          throw new Error("Pick a match for every left item.");
        }
        correctMapping[leftKey] = rightKey;
      }
      return { answerKey: { correctMapping } };
    }
    if (form.questionType === "ORDERING") {
      if (form.orderingKeys.length < 2) {
        throw new Error("Add at least 2 items to order.");
      }
      return { answerKey: { correctOrder: form.orderingKeys } };
    }
    if (!form.correctAnswer) {
      throw new Error("Pick the correct answer.");
    }
    return { correctAnswer: form.correctAnswer };
  }

  /**
   * The immutable-after-creation key skeleton for MATCH/ORDERING (TASK-2301 Phase P2 Wave
   * B) — sent only on create, never on update, matching CreateQuestionRequest's own note.
   */
  function buildContentStructure() {
    if (form.questionType === "MATCH") {
      return { leftKeys: form.matchLeftKeys, rightKeys: form.matchRightKeys };
    }
    if (form.questionType === "ORDERING") {
      return { itemKeys: form.orderingKeys };
    }
    return undefined;
  }

  /** Per-translation validation and payload shape for the type-specific content block. */
  function buildTranslationPayload(t) {
    if (form.questionType === "TRUE_FALSE" || form.questionType === "NUMERIC" || form.questionType === "FILL_BLANK") {
      return { languageCode: t.languageCode, questionText: t.questionText, options: [], explanation: t.explanation };
    }
    if (form.questionType === "ASSERTION_REASON") {
      const assertion = (t.content.assertion || "").trim();
      const reason = (t.content.reason || "").trim();
      if (!assertion || !reason) {
        throw new Error(`${t.languageCode || "Every language"}: both Assertion and Reason are required.`);
      }
      return { ...t, content: { assertion, reason } };
    }
    if (form.questionType === "STATEMENT_COMBINATION") {
      const statements = (t.content.statements || []).map((s) => s.trim()).filter(Boolean);
      if (statements.length < 2) {
        throw new Error(`${t.languageCode || "Every language"}: at least 2 statements are required.`);
      }
      return { ...t, content: { statements } };
    }
    if (form.questionType === "MATCH") {
      const leftLabels = {};
      for (const key of form.matchLeftKeys) {
        const label = ((t.content.leftLabels || {})[key] || "").trim();
        if (!label) throw new Error(`${t.languageCode || "Every language"}: every left item needs a label.`);
        leftLabels[key] = label;
      }
      const rightLabels = {};
      for (const key of form.matchRightKeys) {
        const label = ((t.content.rightLabels || {})[key] || "").trim();
        if (!label) throw new Error(`${t.languageCode || "Every language"}: every right item needs a label.`);
        rightLabels[key] = label;
      }
      return { languageCode: t.languageCode, questionText: t.questionText, options: [], explanation: t.explanation, content: { leftLabels, rightLabels } };
    }
    if (form.questionType === "ORDERING") {
      const itemLabels = {};
      for (const key of form.orderingKeys) {
        const label = ((t.content.itemLabels || {})[key] || "").trim();
        if (!label) throw new Error(`${t.languageCode || "Every language"}: every item needs a label.`);
        itemLabels[key] = label;
      }
      return { languageCode: t.languageCode, questionText: t.questionText, options: [], explanation: t.explanation, content: { itemLabels } };
    }
    return t;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!form.topicId) return setError("Pick a subject and topic.");
    if (form.examCodes.length === 0) return setError("Tag this question to at least one exam.");
    if (!translations.some((t) => t.languageCode === "en")) {
      return setError("English is the root language — every question needs an 'en' translation.");
    }

    if (form.pyq && form.pyqYear !== "") {
      const year = Number(form.pyqYear);
      if (!Number.isInteger(year) || year < PYQ_YEAR_MIN || year > PYQ_YEAR_MAX) {
        return setError(`A previous-year year must be between ${PYQ_YEAR_MIN} and ${PYQ_YEAR_MAX}.`);
      }
    }

    let answer;
    let payloadTranslations;
    try {
      answer = resolveAnswerForSubmit();
      payloadTranslations = translations.map(buildTranslationPayload);
    } catch (err) {
      return setError(err.message);
    }

    setSaving(true);
    const corePayload = {
      questionType: form.questionType,
      ...answer,
      // Only on create — contentStructure is immutable after that, and UpdateQuestionRequest
      // has no field for it at all (see CreateQuestionRequest's own note).
      ...(mode === "create" ? { contentStructure: buildContentStructure() } : {}),
      topicId: form.topicId,
      difficulty: form.difficulty,
      questionGroupId: form.questionGroupId || null,
      groupOrder: form.groupOrder === "" ? null : Number(form.groupOrder),
      examCodes: form.examCodes,
      premium: form.premium,
      // Epic L / TICKET-2104. Empty strings become null rather than being sent as "": the
      // server treats a blank as "not set", and an empty string would be stored as one.
      pyq: form.pyq,
      pyqYear: form.pyqYear === "" ? null : Number(form.pyqYear),
      pyqShift: form.pyqShift.trim() || null,
      sourcePaperId: form.sourcePaperId || null,
      questionNumber: form.questionNumber === "" ? null : Number(form.questionNumber),
      sourceUrl: form.sourceUrl.trim() || null,
    };

    try {
      if (mode === "create") {
        await createQuestion({ ...corePayload, translations: payloadTranslations });
      } else {
        // Metadata and translation content are separate endpoints: one PUT for the
        // question, then one per language. questionType is not sent here — a question's
        // type is fixed at creation (UpdateQuestionRequest has no field for it).
        await updateQuestion(id, corePayload);
        for (const t of payloadTranslations) {
          await upsertTranslation(id, t.languageCode, {
            questionText: t.questionText,
            options: t.options,
            explanation: t.explanation,
            content: t.content,
          });
        }
      }
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Loading...</p>;

  const topicOptions = topics
    .filter((t) => t.subjectId === form.subjectId)
    .sort((a, b) => a.name.localeCompare(b.name));
  const englishOptions = (translations.find((t) => t.languageCode === "en") || {}).options || [];
  // MATCH/ORDERING item labels are read-only display here (edited for real per-translation,
  // further down) — this just gives the Classification card's mapping/ordering UI something
  // human-readable to show instead of a bare key (TASK-2301 Phase P2 Wave B).
  const englishContent = (translations.find((t) => t.languageCode === "en") || translations[0] || {}).content || {};

  return (
    <div>
      <div className="page-header">
        <h1>{mode === "create" ? "Add Question" : "Edit Question"}</h1>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {answerNote && <div className="banner banner-warn">{answerNote}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Classification</h2>
          <div className="form-row">
            <div className="form-field">
              <label>Question type</label>
              <select
                value={form.questionType}
                onChange={(e) => set("questionType", e.target.value)}
                disabled={mode === "edit"}
                required
              >
                {questionTypes
                  .filter((t) => t.authoringEnabled || t.code === form.questionType)
                  .map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
              </select>
              {mode === "edit" ? (
                <span className="field-note">
                  A question&apos;s type can&apos;t be changed after it&apos;s created — delete and recreate it
                  under a different type instead.
                </span>
              ) : (
                <span className="field-note">Fixed once you save — choose carefully.</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Subject</label>
              <select
                value={form.subjectId}
                onChange={(e) => setForm((prev) => ({ ...prev, subjectId: e.target.value, topicId: "" }))}
                required
              >
                <option value="" disabled>
                  Select subject...
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Topic</label>
              <select
                value={form.topicId}
                onChange={(e) => set("topicId", e.target.value)}
                disabled={!form.subjectId}
                required
              >
                <option value="" disabled>
                  {form.subjectId ? "Select topic..." : "Pick a subject first"}
                </option>
                {topicOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {form.subjectId && topicOptions.length === 0 && (
                <span className="field-note">This subject has no topics yet — add one under Topics.</span>
              )}
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Shared group (optional)</label>
              <select value={form.questionGroupId} onChange={(e) => set("questionGroupId", e.target.value)}>
                <option value="">None — standalone question</option>
                {questionGroups.map((g) => {
                  const englishPassage = g.translations?.find((t) => t.languageCode === "en")?.passageText;
                  const preview = englishPassage ? `${englishPassage.slice(0, 40)}...` : g.id.slice(0, 8);
                  return (
                    <option key={g.id} value={g.id}>
                      {g.groupType} — {preview}
                    </option>
                  );
                })}
              </select>
              <span className="field-note">
                Attaches this question to a shared passage/dataset — manage the passage text and
                media itself under Question Groups.
              </span>
            </div>
            {form.questionGroupId && (
              <div className="form-field">
                <label>Order within group</label>
                <input
                  type="number"
                  min={0}
                  value={form.groupOrder}
                  onChange={(e) => set("groupOrder", e.target.value)}
                  placeholder="0"
                />
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Difficulty</label>
              <select value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)} required>
                <option value="" disabled>
                  Select difficulty...
                </option>
                {difficulties.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {OPTION_SET_TYPES_WITH_LETTER_OPTIONS.has(form.questionType) && (
              <div className="form-field">
                <label>Correct answer</label>
                <select
                  value={form.correctAnswer}
                  onChange={(e) => set("correctAnswer", e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  {ANSWER_LETTERS.map((letter, i) => (
                    <option key={letter} value={letter}>
                      {letter}
                      {englishOptions[i] ? ` — ${englishOptions[i]}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {form.questionType === "MULTIPLE_CHOICE" && (
              <div className="form-field" style={{ maxWidth: "none" }}>
                <label>Correct answers (tick every one that applies)</label>
                <div className="checkbox-grid">
                  {ANSWER_LETTERS.map((letter, i) => (
                    <label className="checkbox-field" key={letter}>
                      <input
                        type="checkbox"
                        checked={form.correctOptions.includes(letter)}
                        onChange={() => toggleCorrectOption(letter)}
                      />
                      {letter}
                      {englishOptions[i] ? ` — ${englishOptions[i]}` : ""}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.questionType === "TRUE_FALSE" && (
              <div className="form-field">
                <label>Correct answer</label>
                <select
                  value={form.correctBoolean === null ? "" : String(form.correctBoolean)}
                  onChange={(e) => set("correctBoolean", e.target.value === "true")}
                  required
                >
                  <option value="" disabled>
                    Select...
                  </option>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </div>
            )}

            {form.questionType === "NUMERIC" && (
              <div className="form-field">
                <label>Correct value</label>
                <input
                  type="number"
                  step="any"
                  value={form.correctValue}
                  onChange={(e) => set("correctValue", e.target.value)}
                  required
                />
              </div>
            )}

            {form.questionType === "NUMERIC" && (
              <div className="form-field">
                <label>Tolerance (±)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.tolerance}
                  onChange={(e) => set("tolerance", e.target.value)}
                />
                <span className="field-note">0 means an exact match is required.</span>
              </div>
            )}
          </div>

          {form.questionType === "FILL_BLANK" && (
            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Accepted answers (any one matches, case/whitespace-insensitive)</label>
              <p className="field-note" style={{ marginTop: 0 }}>
                One shared list for every language this question is translated into — a real,
                disclosed limitation for now: a Hindi-typed answer is still checked against these
                (likely English) strings, so multi-language FILL_BLANK content needs answers that
                work across languages (numbers, names) until this gets a per-language answer key.
              </p>
              {form.acceptedAnswers.map((answer, ai) => (
                <div className="option-row" key={ai}>
                  <input
                    value={answer}
                    onChange={(e) => updateAcceptedAnswer(ai, e.target.value)}
                    placeholder={`Accepted answer ${ai + 1}`}
                    required
                  />
                  {form.acceptedAnswers.length > 1 && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeAcceptedAnswer(ai)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="btn btn-sm" onClick={addAcceptedAnswer}>
                + Add accepted answer
              </button>
            </div>
          )}

          <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
            <label>Access</label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.premium}
                onChange={(e) => set("premium", e.target.checked)}
              />
              Premium (reserved — no paywall is enforced yet)
            </label>
          </div>
        </div>

        {form.questionType === "MATCH" && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Match items</h2>
            <p className="field-note" style={{ marginTop: 0 }}>
              Left and right items get their real text below, per language — these lists just
              fix how many there are (and, once saved, can&apos;t be resized). Set which right
              item is correct for each left item here.
            </p>
            <div className="form-row">
              <div className="form-field" style={{ maxWidth: "none" }}>
                <label>Left items</label>
                {form.matchLeftKeys.map((key) => (
                  <div className="option-row" key={key}>
                    <input value={englishContent.leftLabels?.[key] || ""} readOnly placeholder="(edit label below)" />
                    {mode === "create" && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeMatchItem("left", key)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {mode === "create" && (
                  <button type="button" className="btn btn-sm" onClick={() => addMatchItem("left")}>
                    + Add left item
                  </button>
                )}
              </div>

              <div className="form-field" style={{ maxWidth: "none" }}>
                <label>Right items</label>
                {form.matchRightKeys.map((key) => (
                  <div className="option-row" key={key}>
                    <input value={englishContent.rightLabels?.[key] || ""} readOnly placeholder="(edit label below)" />
                    {mode === "create" && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeMatchItem("right", key)}>
                        Remove
                      </button>
                    )}
                  </div>
                ))}
                {mode === "create" && (
                  <button type="button" className="btn btn-sm" onClick={() => addMatchItem("right")}>
                    + Add right item
                  </button>
                )}
              </div>
            </div>

            {form.matchLeftKeys.length > 0 && form.matchRightKeys.length > 0 && (
              <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
                <label>Correct mapping</label>
                {form.matchLeftKeys.map((leftKey) => (
                  <div className="option-row" key={leftKey}>
                    <span className="option-index">{englishContent.leftLabels?.[leftKey] || leftKey}</span>
                    <select
                      value={form.matchCorrectMapping[leftKey] || ""}
                      onChange={(e) => setMatchMapping(leftKey, e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        Select match...
                      </option>
                      {form.matchRightKeys.map((rightKey) => (
                        <option key={rightKey} value={rightKey}>
                          {englishContent.rightLabels?.[rightKey] || rightKey}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {form.questionType === "ORDERING" && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Ordering items</h2>
            <p className="field-note" style={{ marginTop: 0 }}>
              Add items in their correct order — that order is the answer a student's attempt is
              scored against, and a student sees them shuffled. Give each item&apos;s real text
              below, per language.
            </p>
            <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
              {form.orderingKeys.map((key, oi) => (
                <div className="option-row" key={key}>
                  <span className="option-index">{oi + 1}</span>
                  <input value={englishContent.itemLabels?.[key] || ""} readOnly placeholder="(edit label below)" />
                  <button type="button" className="btn btn-sm" disabled={oi === 0} onClick={() => moveOrderingItem(oi, -1)}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={oi === form.orderingKeys.length - 1}
                    onClick={() => moveOrderingItem(oi, 1)}
                  >
                    ↓
                  </button>
                  {mode === "create" && (
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeOrderingItem(key)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {mode === "create" && (
                <button type="button" className="btn btn-sm" onClick={addOrderingItem}>
                  + Add item
                </button>
              )}
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Exams</h2>
          <p className="field-note" style={{ marginTop: 0, marginBottom: 10 }}>
            A question can belong to several exams. It appears in every one you tick.
          </p>
          <div className="checkbox-grid">
            {exams.map((exam) => (
              <label className="checkbox-field" key={exam.code}>
                <input
                  type="checkbox"
                  checked={form.examCodes.includes(exam.code)}
                  onChange={() => toggleExam(exam.code)}
                />
                {exam.name}
                {!exam.active && <span className="badge">inactive</span>}
              </label>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 20 }}>
          <h2>Previous-year question (PYQ)</h2>
          <p className="field-note" style={{ marginTop: 0, marginBottom: 10 }}>
            Tag a question that actually appeared in a real paper. This is what topic trend and
            priority are computed from — an untagged bank produces no trend at all. It also shows
            as an &quot;Asked in 2023&quot; badge to students.
          </p>

          <div className="form-field" style={{ maxWidth: "none" }}>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.pyq}
                onChange={(e) => set("pyq", e.target.checked)}
              />
              This question appeared in a previous year&apos;s paper
            </label>
          </div>

          {/* Everything below is disabled rather than hidden when the box is unticked, so the
              fields stay discoverable and an admin can see what tagging would ask for. The
              server clears these columns when pyq is false, so leaving stale values in the
              inputs cannot persist a contradictory row. */}
          <div className="form-row">
            <div className="form-field">
              <label>Year</label>
              <input
                type="number"
                value={form.pyqYear}
                onChange={(e) => set("pyqYear", e.target.value)}
                disabled={!form.pyq}
                min={PYQ_YEAR_MIN}
                max={PYQ_YEAR_MAX}
                placeholder="2023"
              />
              <span className="field-note">
                Leave blank if you know it is a PYQ but not which year — that is a real state, and
                the trend simply ignores it.
              </span>
            </div>

            <div className="form-field">
              <label>Shift</label>
              <input
                value={form.pyqShift}
                onChange={(e) => set("pyqShift", e.target.value)}
                disabled={!form.pyq}
                maxLength={30}
                placeholder="Shift 2 / Morning"
              />
              <span className="field-note">Free text — shifts are named differently per exam.</span>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Source paper</label>
              <select
                value={form.sourcePaperId}
                onChange={(e) => set("sourcePaperId", e.target.value)}
                disabled={!form.pyq || sourcePapers.length === 0}
              >
                <option value="">Not set</option>
                {sourcePapers.map((paper) => (
                  <option key={paper.id} value={paper.id}>
                    {paper.label}
                  </option>
                ))}
              </select>
              <span className="field-note">
                {form.examCodes.length === 0
                  ? "Tick an exam above to choose from its papers."
                  : sourcePapers.length === 0
                  ? "The selected exam(s) have no paper pattern defined yet."
                  : "Optional — pins the question to a specific paper."}
              </span>
            </div>

            <div className="form-field">
              <label>Question number</label>
              <input
                type="number"
                min="1"
                value={form.questionNumber}
                onChange={(e) => set("questionNumber", e.target.value)}
                disabled={!form.pyq}
                placeholder="47"
              />
            </div>
          </div>

          <div className="form-field" style={{ maxWidth: "none", marginBottom: 0 }}>
            <label>Source URL</label>
            <input
              value={form.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
              placeholder="https://..."
            />
            <span className="field-note">
              Deliberately still editable when the PYQ box is off — where a question came from stays
              true whether or not anyone has classified it as a previous-year one.
            </span>
          </div>
        </div>

        <h2>Translations</h2>
        {translations.map((t, i) => (
          <div className="translation-block" key={i}>
            <div className="translation-block-header">
              <div className="form-field" style={{ marginBottom: 0, maxWidth: 200 }}>
                <label>Language</label>
                <select
                  value={t.languageCode}
                  disabled={mode === "edit" && Boolean(t.questionText)}
                  onChange={(e) => updateTranslation(i, "languageCode", e.target.value)}
                  required
                >
                  <option value="" disabled>
                    Select language...
                  </option>
                  {availableLanguagesFor(i).map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>
              {translations.length > 1 && t.languageCode !== "en" && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => removeTranslation(i)}>
                  Remove
                </button>
              )}
            </div>

            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Question text</label>
              <textarea
                rows={3}
                value={t.questionText}
                onChange={(e) => updateTranslation(i, "questionText", e.target.value)}
                required
              />
            </div>

            {form.questionType === "ASSERTION_REASON" && (
              <>
                <div className="form-field" style={{ maxWidth: "none" }}>
                  <label>Assertion (A)</label>
                  <textarea
                    rows={2}
                    value={t.content.assertion || ""}
                    onChange={(e) => updateContentField(i, "assertion", e.target.value)}
                    required
                  />
                </div>
                <div className="form-field" style={{ maxWidth: "none" }}>
                  <label>Reason (R)</label>
                  <textarea
                    rows={2}
                    value={t.content.reason || ""}
                    onChange={(e) => updateContentField(i, "reason", e.target.value)}
                    required
                  />
                </div>
                <p className="field-note" style={{ marginTop: 0 }}>
                  The 4 options below are the usual relationship choices — e.g. &quot;Both A and R are
                  true and R is the correct explanation of A&quot;.
                </p>
              </>
            )}

            {form.questionType === "STATEMENT_COMBINATION" && (
              <div className="form-field" style={{ maxWidth: "none" }}>
                <label>Statements (at least 2)</label>
                {(t.content.statements || []).map((statement, si) => (
                  <div className="option-row" key={si}>
                    <span className="option-index">{si + 1}</span>
                    <input
                      value={statement}
                      onChange={(e) => updateStatement(i, si, e.target.value)}
                      placeholder={`Statement ${si + 1}`}
                      required
                    />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeStatement(i, si)}>
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className="btn btn-sm" onClick={() => addStatement(i)}>
                  + Add statement
                </button>
                <p className="field-note">
                  The 4 options below are the usual combination choices — e.g. &quot;1 and 2 only&quot;,
                  &quot;All of the above&quot;.
                </p>
              </div>
            )}

            {form.questionType === "MATCH" && (
              <div className="form-field" style={{ maxWidth: "none" }}>
                <label>Left item labels</label>
                {form.matchLeftKeys.map((key) => (
                  <div className="option-row" key={key}>
                    <input
                      value={(t.content.leftLabels || {})[key] || ""}
                      onChange={(e) => updateItemLabel(i, "leftLabels", key, e.target.value)}
                      placeholder="Label"
                      required
                    />
                  </div>
                ))}
                <label style={{ marginTop: 10, display: "block" }}>Right item labels</label>
                {form.matchRightKeys.map((key) => (
                  <div className="option-row" key={key}>
                    <input
                      value={(t.content.rightLabels || {})[key] || ""}
                      onChange={(e) => updateItemLabel(i, "rightLabels", key, e.target.value)}
                      placeholder="Label"
                      required
                    />
                  </div>
                ))}
              </div>
            )}

            {form.questionType === "ORDERING" && (
              <div className="form-field" style={{ maxWidth: "none" }}>
                <label>Item labels (in the correct order set above)</label>
                {form.orderingKeys.map((key, oi) => (
                  <div className="option-row" key={key}>
                    <span className="option-index">{oi + 1}</span>
                    <input
                      value={(t.content.itemLabels || {})[key] || ""}
                      onChange={(e) => updateItemLabel(i, "itemLabels", key, e.target.value)}
                      placeholder="Label"
                      required
                    />
                  </div>
                ))}
              </div>
            )}

            {!NO_OPTIONS_TYPES.has(form.questionType) && (
              <div className="form-field" style={{ maxWidth: "none" }}>
                <label>Options (exactly 4)</label>
                {t.options.map((opt, oi) => {
                  const letter = ANSWER_LETTERS[oi];
                  const isCorrect =
                    form.questionType === "MULTIPLE_CHOICE"
                      ? form.correctOptions.includes(letter)
                      : letter === form.correctAnswer;
                  return (
                    <div className="option-row" key={oi}>
                      <span className={`option-index${isCorrect ? " correct" : ""}`}>{letter}</span>
                      <input
                        value={opt}
                        onChange={(e) => updateOption(i, oi, e.target.value)}
                        placeholder={`Option ${oi + 1}`}
                        required
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="form-field" style={{ maxWidth: "none" }}>
              <label>Explanation</label>
              <textarea
                rows={2}
                value={t.explanation}
                onChange={(e) => updateTranslation(i, "explanation", e.target.value)}
              />
            </div>
          </div>
        ))}

        {availableLanguagesFor(translations.length).length > 0 && (
          <button type="button" className="btn btn-sm" onClick={addTranslation}>
            + Add another language
          </button>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
      {confirmDialog}
    </div>
  );
}
