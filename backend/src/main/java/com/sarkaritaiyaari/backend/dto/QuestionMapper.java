package com.sarkaritaiyaari.backend.dto;

import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionTranslation;

import java.util.Comparator;
import java.util.List;

public final class QuestionMapper {

    private QuestionMapper() {
    }

    public static QuestionResponse toResponse(Question question) {
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
        return response;
    }

    private static TranslationResponse toTranslationResponse(QuestionTranslation translation) {
        return new TranslationResponse(
                translation.getLanguage().getCode(),
                translation.getQuestionText(),
                translation.getOptions(),
                translation.getExplanation()
        );
    }

    public static List<QuestionResponse> toResponseList(List<Question> questions) {
        return questions.stream().map(QuestionMapper::toResponse).toList();
    }
}
