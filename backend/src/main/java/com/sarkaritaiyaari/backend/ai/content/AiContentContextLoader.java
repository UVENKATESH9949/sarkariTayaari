package com.sarkaritaiyaari.backend.ai.content;

import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionTranslation;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * TASK-2701 Phase 2 -- loads exactly the fields a prompt needs, as plain records, and nothing
 * else. Deliberately its own bean rather than a private method on {@code AiContentGenerationService}:
 * {@code question.getTopic().getSubject()} is a lazy association ({@code open-in-view: false} in
 * this app -- the same setting that once 500'd {@code GET /api/auth/me} via a
 * {@code LazyInitializationException}), so the navigation has to happen inside a transaction. A
 * {@code @Transactional} method on the SAME class as its caller would be self-invoked and the
 * proxy would never apply -- calling this as a separate injected bean is what makes the
 * transaction real, the same reason {@code QuestionCandidateStagingService} is its own bean
 * rather than a method on {@code QuestionIngestionService}.
 *
 * Every field returned is a primitive/String/List -- no entity crosses back into the caller, so
 * nothing here can be lazily touched after the transaction closes.
 */
@Service
public class AiContentContextLoader {

    private final QuestionRepository questionRepository;
    private final TopicRepository topicRepository;

    public AiContentContextLoader(QuestionRepository questionRepository, TopicRepository topicRepository) {
        this.questionRepository = questionRepository;
        this.topicRepository = topicRepository;
    }

    public record QuestionPromptContext(
            UUID questionId,
            String correctAnswer,
            List<String> options,
            String questionText,
            String subjectName,
            String topicName) {
    }

    public record TopicPromptContext(UUID topicId, String subjectName, String topicName) {
    }

    @Transactional(readOnly = true)
    public Optional<QuestionPromptContext> loadQuestion(UUID questionId, String languageCode) {
        Question question = questionRepository.findById(questionId).orElse(null);
        if (question == null || question.isDeleted()) {
            return Optional.empty();
        }

        QuestionTranslation translation = question.getTranslations().stream()
                .filter(t -> languageCode.equals(t.getLanguage().getCode()))
                .findFirst()
                .orElse(null);
        if (translation == null) {
            return Optional.empty();
        }

        Topic topic = question.getTopic();
        return Optional.of(new QuestionPromptContext(
                question.getId(),
                question.getCorrectAnswer(),
                List.copyOf(translation.getOptions()),
                translation.getQuestionText(),
                topic.getSubject().getName(),
                topic.getName()));
    }

    @Transactional(readOnly = true)
    public Optional<TopicPromptContext> loadTopic(UUID topicId) {
        Topic topic = topicRepository.findById(topicId).orElse(null);
        if (topic == null) {
            return Optional.empty();
        }
        return Optional.of(new TopicPromptContext(topic.getId(), topic.getSubject().getName(), topic.getName()));
    }
}
