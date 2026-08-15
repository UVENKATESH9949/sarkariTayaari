const REQUIRED_ROOT_LANGUAGE = "en";

function isBlank(str) {
  return typeof str !== "string" || str.trim() === "";
}

function validateTranslation(t, knownLanguageCodes, errors, path) {
  if (typeof t !== "object" || t === null) {
    errors.push(`${path}: must be an object`);
    return;
  }
  if (isBlank(t.languageCode)) {
    errors.push(`${path}.languageCode: required`);
  } else if (!knownLanguageCodes.has(t.languageCode)) {
    errors.push(
      `${path}.languageCode: "${t.languageCode}" is not a known language in the system (add it under Languages first)`
    );
  }
  if (isBlank(t.questionText)) {
    errors.push(`${path}.questionText: required`);
  }
  if (!Array.isArray(t.options) || t.options.length !== 4) {
    errors.push(
      `${path}.options: must be an array of exactly 4 items (found ${
        Array.isArray(t.options) ? t.options.length : "none"
      })`
    );
  } else if (t.options.some((o) => isBlank(o))) {
    errors.push(`${path}.options: no option may be empty`);
  }
}

function correctAnswerMatchesOption(correctAnswer, options) {
  if (typeof correctAnswer !== "string") return false;
  const trimmed = correctAnswer.trim().toUpperCase();
  if (/^[A-D]$/.test(trimmed)) {
    const idx = trimmed.charCodeAt(0) - 65;
    return Array.isArray(options) && idx < options.length;
  }
  if (/^[0-3]$/.test(trimmed)) {
    return Array.isArray(options) && Number(trimmed) < options.length;
  }
  return false;
}

/**
 * Validates a parsed array of questions against the rules the backend enforces, plus
 * data-quality checks (correct-answer format, duplicates).
 *
 * This matters more than it looks: the backend's bean validation runs before the
 * controller, so a single malformed item rejects the WHOLE batch with a 400 rather
 * than landing in the per-item `failures` list. Catching those here is what keeps one
 * bad row from sinking an entire import.
 *
 * Returns { results, validCount, invalidCount } where
 * results[i] = { index, valid, errors, warnings, question }.
 */
export function validateQuestions(questions, knownLanguages, knownExamCodes, knownDifficulties) {
  const knownLanguageCodes = new Set((knownLanguages || []).map((l) => l.code));
  const examCodes = new Set(knownExamCodes || []);
  const difficultyCodes = new Set(knownDifficulties || []);
  const seenKeys = new Map();
  const results = [];

  questions.forEach((q, index) => {
    const errors = [];
    const warnings = [];

    if (typeof q !== "object" || q === null) {
      results.push({ index, valid: false, errors: ["must be an object"], warnings: [], question: q });
      return;
    }

    if (isBlank(q.subjectName)) errors.push("subjectName: required");
    if (isBlank(q.topicName)) errors.push("topicName: required");
    if (isBlank(q.difficulty)) {
      errors.push("difficulty: required");
    } else if (difficultyCodes.size > 0 && !difficultyCodes.has(q.difficulty)) {
      errors.push(
        `difficulty: "${q.difficulty}" is not a known level (choose one of ${[...difficultyCodes].join(", ")}, or add it under Difficulty Levels)`
      );
    }
    if (isBlank(q.correctAnswer)) {
      errors.push("correctAnswer: required");
    }

    if (!Array.isArray(q.examCodes) || q.examCodes.length === 0) {
      errors.push("examCodes: at least one exam code is required");
    } else {
      // Subjects and topics are auto-created by name, but exams are not — an unknown
      // code fails that item server-side.
      q.examCodes.forEach((code) => {
        if (isBlank(code)) {
          errors.push("examCodes: contains a blank entry");
        } else if (examCodes.size > 0 && !examCodes.has(code)) {
          errors.push(`examCodes: "${code}" is not a known exam (create it under Exams first)`);
        }
      });
    }

    if (q.premium !== undefined && typeof q.premium !== "boolean") {
      errors.push(`premium: must be true or false, got "${q.premium}"`);
    }

    if (!Array.isArray(q.translations) || q.translations.length === 0) {
      errors.push("translations: at least one translation is required");
    } else {
      const hasRoot = q.translations.some((t) => t && t.languageCode === REQUIRED_ROOT_LANGUAGE);
      if (!hasRoot) errors.push(`translations: must include the root language "${REQUIRED_ROOT_LANGUAGE}"`);

      q.translations.forEach((t, tIndex) => {
        validateTranslation(t, knownLanguageCodes, errors, `translations[${tIndex}]`);
      });

      const enTranslation = q.translations.find((t) => t && t.languageCode === REQUIRED_ROOT_LANGUAGE);
      if (enTranslation && !isBlank(q.correctAnswer) && Array.isArray(enTranslation.options)) {
        if (!correctAnswerMatchesOption(q.correctAnswer, enTranslation.options)) {
          errors.push(
            `correctAnswer: "${q.correctAnswer}" does not correspond to a valid option (expected A-D or 0-3)`
          );
        }
      }

      q.translations.forEach((t, tIndex) => {
        if (t && isBlank(t.explanation)) {
          warnings.push(`translations[${tIndex}].explanation: empty (recommended, not required)`);
        }
      });
    }

    if (!isBlank(q.subjectName) && !isBlank(q.topicName)) {
      const enText = Array.isArray(q.translations)
        ? q.translations.find((t) => t && t.languageCode === REQUIRED_ROOT_LANGUAGE)?.questionText
        : undefined;
      if (!isBlank(enText)) {
        const dupKey = [
          q.subjectName.trim().toLowerCase(),
          q.topicName.trim().toLowerCase(),
          enText.trim().toLowerCase(),
        ].join("|");
        if (seenKeys.has(dupKey)) {
          warnings.push(
            `possible duplicate of question #${seenKeys.get(dupKey) + 1} in this batch (same subject/topic/English text)`
          );
        } else {
          seenKeys.set(dupKey, index);
        }
      }
    }

    results.push({ index, valid: errors.length === 0, errors, warnings, question: q });
  });

  return {
    results,
    validCount: results.filter((r) => r.valid).length,
    invalidCount: results.filter((r) => !r.valid).length,
  };
}
