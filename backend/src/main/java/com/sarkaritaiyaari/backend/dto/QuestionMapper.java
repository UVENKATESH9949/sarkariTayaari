package com.sarkaritaiyaari.backend.dto;

import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionMedia;
import com.sarkaritaiyaari.backend.entity.QuestionOccurrence;
import com.sarkaritaiyaari.backend.entity.QuestionTranslation;

import java.util.Comparator;
import java.util.List;

public final class QuestionMapper {

    private QuestionMapper() {
    }

    /** No media — for a call site that genuinely has none to report (a question just created can't have any yet). */
    public static QuestionResponse toResponse(Question question) {
        return toResponse(question, List.of());
    }

    /** No occurrences — see the 3-arg overload's own note on which call sites bother to fetch them. */
    public static QuestionResponse toResponse(Question question, List<QuestionMedia> media) {
        return toResponse(question, media, List.of());
    }

    /**
     * @param media this question's own media (a diagram), pre-fetched by the caller —
     *              {@link Question} has no entity-level association to {@link QuestionMedia}
     *              (see that entity's own note), and a paged caller batch-fetches media for a
     *              whole page at once rather than one query per row (TASK-2301 Phase P3).
     * @param occurrences this question's exam appearances (TASK-2501 Phase 1), pre-fetched by
     *                    the caller. Left {@code List.of()} on the student-facing sync/live/
     *                    mock-sample paths — same "dead weight on every synced row" reasoning
     *                    {@link QuestionResponse#getDuplicateOfQuestionIds()} already states —
     *                    and populated only on the admin CRUD reads that actually show it.
     */
    public static QuestionResponse toResponse(Question question, List<QuestionMedia> media,
                                               List<QuestionOccurrence> occurrences) {
        QuestionResponse response = new QuestionResponse();
        response.setId(question.getId());
        response.setCorrectAnswer(question.getCorrectAnswer());
        response.setSubjectId(question.getTopic().getSubject().getId());
        response.setSubjectName(question.getTopic().getSubject().getName());
        response.setTopicId(question.getTopic().getId());
        response.setTopicName(question.getTopic().getName());
        response.setDifficulty(question.getDifficulty());
        response.setExamCodes(question.getExams().stream()
                .map(Exam::getCode)
                .sorted()
                .toList());
        response.setPremium(question.isPremium());
        response.setUpdatedAt(question.getUpdatedAt());
        response.setDeleted(question.isDeleted());
        response.setTranslations(question.getTranslations().stream()
                .sorted(Comparator.comparing(t -> t.getLanguage().getCode()))
                .map(QuestionMapper::toTranslationResponse)
                .toList());

        // TICKET-2104. Mapped unconditionally rather than behind an "is it a PYQ" check:
        // the columns are cheap scalars already loaded with the row, and a conditional here
        // would mean the admin form could not distinguish "not a PYQ" from "fields withheld".
        response.setPyq(question.isPyq());
        response.setPyqYear(question.getPyqYear());
        response.setPyqShift(question.getPyqShift());
        response.setSourcePaperId(question.getSourcePaperId());
        response.setQuestionNumber(question.getQuestionNumber());
        response.setSourceUrl(question.getSourceUrl());

        // TASK-2301 Phase P1. Mapped unconditionally, same reasoning as the PYQ fields above.
        response.setQuestionType(question.getQuestionType());
        response.setAnswerKey(question.getAnswerKey());
        response.setAnswerConfig(question.getAnswerConfig());
        response.setContentStructure(question.getContentStructure());

        // TASK-2301 Phase P3.
        response.setQuestionGroupId(question.getQuestionGroup() == null ? null : question.getQuestionGroup().getId());
        response.setGroupOrder(question.getGroupOrder());
        response.setMedia(media.stream()
                .sorted(Comparator.comparingInt(QuestionMedia::getDisplayOrder))
                .map(QuestionMapper::toMediaResponse)
                .toList());

        // TASK-2501 Phase 1.
        response.setOccurrences(occurrences.stream()
                .map(QuestionMapper::toOccurrenceResponse)
                .toList());

        // TASK-2501 Phase 2.
        response.setContentStatus(question.getContentStatus().name());
        return response;
    }

    public static QuestionOccurrenceResponse toOccurrenceResponse(QuestionOccurrence occurrence) {
        QuestionOccurrenceResponse response = new QuestionOccurrenceResponse();
        response.setId(occurrence.getId());
        response.setQuestionId(occurrence.getQuestion().getId());
        response.setExamCode(occurrence.getExamCode());
        response.setPyqYear(occurrence.getPyqYear());
        response.setPyqShift(occurrence.getPyqShift());
        response.setSourcePaperId(occurrence.getSourcePaperId());
        response.setQuestionNumber(occurrence.getQuestionNumber());
        response.setSourceUrl(occurrence.getSourceUrl());
        response.setSourceDocumentId(occurrence.getSourceDocumentId());
        response.setPageNumber(occurrence.getPageNumber());
        response.setLegacyDerived(occurrence.isLegacyDerived());
        response.setCreatedAt(occurrence.getCreatedAt());
        return response;
    }

    public static QuestionMediaResponse toMediaResponse(QuestionMedia media) {
        QuestionMediaResponse response = new QuestionMediaResponse();
        response.setId(media.getId());
        response.setMediaType(media.getMediaType());
        response.setUrl(media.getUrl());
        response.setMimeType(media.getMimeType());
        response.setDisplayOrder(media.getDisplayOrder());
        return response;
    }

    private static TranslationResponse toTranslationResponse(QuestionTranslation translation) {
        return new TranslationResponse(
                translation.getLanguage().getCode(),
                translation.getQuestionText(),
                translation.getOptions(),
                translation.getExplanation(),
                translation.getContent()
        );
    }

    public static List<QuestionResponse> toResponseList(List<Question> questions) {
        return questions.stream().map(QuestionMapper::toResponse).toList();
    }
}
