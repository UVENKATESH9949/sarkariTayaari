package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.CreateQuestionOccurrenceRequest;
import com.sarkaritaiyaari.backend.dto.QuestionMapper;
import com.sarkaritaiyaari.backend.dto.QuestionOccurrenceResponse;
import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionOccurrence;
import com.sarkaritaiyaari.backend.repository.ExamPaperRepository;
import com.sarkaritaiyaari.backend.repository.QuestionOccurrenceRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * TASK-2501 Phase 1 -- lets an already-existing question record more than one real-world
 * exam appearance, the actual new capability the design's {@code question_occurrences}
 * table exists to ship (see V36's own migration comment). Deliberately separate from
 * {@code QuestionService}, whose own {@code syncLegacyOccurrence} keeps the *legacy* singular
 * PYQ columns' derived occurrence in sync -- this service only ever manages *additional*,
 * explicitly-recorded occurrences an admin adds directly.
 */
@Service
@Transactional
public class QuestionOccurrenceService {

    private final QuestionRepository questionRepository;
    private final QuestionOccurrenceRepository occurrenceRepository;
    private final ExamPaperRepository examPaperRepository;

    public QuestionOccurrenceService(QuestionRepository questionRepository,
                                      QuestionOccurrenceRepository occurrenceRepository,
                                      ExamPaperRepository examPaperRepository) {
        this.questionRepository = questionRepository;
        this.occurrenceRepository = occurrenceRepository;
        this.examPaperRepository = examPaperRepository;
    }

    public QuestionOccurrenceResponse add(UUID questionId, CreateQuestionOccurrenceRequest request) {
        Question question = requireQuestion(questionId);

        if (request.getSourcePaperId() != null && !examPaperRepository.existsById(request.getSourcePaperId())) {
            throw new IllegalArgumentException("Unknown sourcePaperId: " + request.getSourcePaperId());
        }

        QuestionOccurrence occurrence = new QuestionOccurrence();
        occurrence.setQuestion(question);
        occurrence.setExamCode(blankToNull(request.getExamCode()));
        occurrence.setPyqYear(request.getPyqYear());
        occurrence.setPyqShift(blankToNull(request.getPyqShift()));
        occurrence.setSourcePaperId(request.getSourcePaperId());
        occurrence.setQuestionNumber(request.getQuestionNumber());
        occurrence.setSourceUrl(blankToNull(request.getSourceUrl()));
        occurrence.setLegacyDerived(false);
        occurrence.setCreatedAt(OffsetDateTime.now());

        return QuestionMapper.toOccurrenceResponse(occurrenceRepository.save(occurrence));
    }

    @Transactional(readOnly = true)
    public List<QuestionOccurrenceResponse> list(UUID questionId) {
        requireQuestion(questionId);
        return occurrenceRepository.findByQuestion_IdOrderByCreatedAtAsc(questionId).stream()
                .map(QuestionMapper::toOccurrenceResponse)
                .toList();
    }

    public void delete(UUID questionId, UUID occurrenceId) {
        requireQuestion(questionId);
        QuestionOccurrence occurrence = occurrenceRepository.findById(occurrenceId)
                .orElseThrow(() -> new NoSuchElementException("Occurrence not found: " + occurrenceId));
        if (!occurrence.getQuestion().getId().equals(questionId)) {
            throw new IllegalArgumentException("Occurrence " + occurrenceId + " does not belong to question " + questionId);
        }
        occurrenceRepository.delete(occurrence);
    }

    private Question requireQuestion(UUID questionId) {
        return questionRepository.findById(questionId)
                .orElseThrow(() -> new NoSuchElementException("Question not found: " + questionId));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
