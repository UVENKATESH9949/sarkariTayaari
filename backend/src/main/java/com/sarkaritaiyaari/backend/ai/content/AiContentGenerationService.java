package com.sarkaritaiyaari.backend.ai.content;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.ai.AIRequest;
import com.sarkaritaiyaari.backend.ai.AIResponse;
import com.sarkaritaiyaari.backend.ai.AIService;
import com.sarkaritaiyaari.backend.ai.ResponseFormat;
import com.sarkaritaiyaari.backend.ai.content.AiContentContextLoader.QuestionPromptContext;
import com.sarkaritaiyaari.backend.ai.content.AiContentContextLoader.TopicPromptContext;
import com.sarkaritaiyaari.backend.ai.exception.AIException;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.AiContentItemResult;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.GenerateAiContentResult;
import com.sarkaritaiyaari.backend.entity.AiContent;
import com.sarkaritaiyaari.backend.entity.AiContentTask;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.repository.AiContentRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * TASK-2701 Phase 2 -- the batch that actually spends money. See AI_ARCHITECTURE.md §4: this is
 * Tier 2, generated once per question/topic and reviewed once, never once per student request.
 *
 * Deliberately carries NO class- or method-level {@code @Transactional} on the batch loop. Each
 * item's read, generation call and write are independent of every other item's -- the same shape
 * {@code NoticeDiscoveryService.scan()} was fixed into after a real bug (a shared top-level
 * transaction that a caught-and-logged per-item failure still silently rolled back). A single
 * item failing here must never undo an item that already succeeded, and a slow provider call
 * must never hold a database transaction open underneath it.
 */
@Service
public class AiContentGenerationService {

    private final AiContentContextLoader contextLoader;
    private final AiContentRepository aiContentRepository;
    private final QuestionRepository questionRepository;
    private final TopicRepository topicRepository;
    private final AIService aiService;
    private final ObjectMapper objectMapper;

    public AiContentGenerationService(AiContentContextLoader contextLoader,
                                       AiContentRepository aiContentRepository,
                                       QuestionRepository questionRepository,
                                       TopicRepository topicRepository,
                                       AIService aiService,
                                       ObjectMapper objectMapper) {
        this.contextLoader = contextLoader;
        this.aiContentRepository = aiContentRepository;
        this.questionRepository = questionRepository;
        this.topicRepository = topicRepository;
        this.aiService = aiService;
        this.objectMapper = objectMapper;
    }

    public GenerateAiContentResult generate(AiContentTask taskId, String languageCode, List<UUID> subjectIds) {
        if (!AiContentLanguages.isSupported(languageCode)) {
            throw new IllegalArgumentException(
                    "AI content is not generated in \"" + languageCode + "\" — supported: "
                            + AiContentLanguages.SUPPORTED);
        }
        if (subjectIds == null || subjectIds.isEmpty()) {
            throw new IllegalArgumentException("subjectIds must name at least one question or topic to generate for");
        }

        List<AiContentItemResult> items = new ArrayList<>();
        int generated = 0;
        int skippedExisting = 0;
        int failedValidation = 0;
        int failedProvider = 0;

        for (UUID subjectId : subjectIds) {
            AiContentItemResult result = generateOne(taskId, languageCode, subjectId);
            items.add(result);
            switch (result.outcome()) {
                case "GENERATED" -> generated++;
                case "SKIPPED_EXISTING" -> skippedExisting++;
                case "FAILED_VALIDATION" -> failedValidation++;
                default -> failedProvider++;
            }
        }

        return new GenerateAiContentResult(subjectIds.size(), generated, skippedExisting, failedValidation,
                failedProvider, items);
    }

    private AiContentItemResult generateOne(AiContentTask taskId, String languageCode, UUID subjectId) {
        boolean alreadyExists = taskId.subject() == AiContentTask.AiContentSubject.QUESTION
                ? !aiContentRepository.findLiveForQuestion(subjectId, taskId, languageCode).isEmpty()
                : !aiContentRepository.findLiveForTopic(subjectId, taskId, languageCode).isEmpty();

        // Never regenerate over an existing row in this phase, published or not — an admin
        // wanting a fresh attempt rejects or deletes the old one first. This keeps "how much did
        // this batch cost" answerable from "how many items were actually new."
        if (alreadyExists) {
            return new AiContentItemResult(subjectId, "SKIPPED_EXISTING", "content already exists", null);
        }

        try {
            return switch (taskId) {
                case QUESTION_EXPLANATION -> generateQuestionExplanation(languageCode, subjectId);
                case CONCEPT_EXPLANATION -> generateConceptExplanation(languageCode, subjectId);
            };
        } catch (AIException e) {
            return new AiContentItemResult(subjectId, "FAILED_PROVIDER", e.getMessage(), null);
        }
    }

    private AiContentItemResult generateQuestionExplanation(String languageCode, UUID questionId) {
        Optional<QuestionPromptContext> context = contextLoader.loadQuestion(questionId, languageCode);
        if (context.isEmpty()) {
            return new AiContentItemResult(questionId, "FAILED_VALIDATION",
                    "no question found with a translation in \"" + languageCode + "\"", null);
        }
        QuestionPromptContext question = context.get();

        AIMessage userMessage = AiContentPrompts.questionExplanationUserMessage(
                question, AiContentLanguages.displayName(languageCode));

        AIRequest request = AIRequest.builder()
                .systemPrompt(AiContentPrompts.questionExplanationSystemPrompt())
                .messages(List.of(userMessage))
                .temperature(0.2)
                .maxTokens(500)
                .responseFormat(ResponseFormat.JSON)
                .metadata(Map.of("feature", "ai-content-question-explanation"))
                .build();

        AIResponse response = aiService.generate(request);
        JsonNode raw = parseJson(response.content());
        AiContentValidation.Result validation = raw == null
                ? new AiContentValidation.Failed("NOT_JSON", "response was not valid JSON")
                : AiContentValidation.validateQuestionExplanation(raw, question.correctAnswer(), question.options());

        return persistIfValid(AiContentTask.QUESTION_EXPLANATION, languageCode, questionId, null, response, validation);
    }

    private AiContentItemResult generateConceptExplanation(String languageCode, UUID topicId) {
        Optional<TopicPromptContext> context = contextLoader.loadTopic(topicId);
        if (context.isEmpty()) {
            return new AiContentItemResult(topicId, "FAILED_VALIDATION", "no topic found with that id", null);
        }
        TopicPromptContext topic = context.get();

        AIMessage userMessage = AiContentPrompts.conceptExplanationUserMessage(topic,
                AiContentLanguages.displayName(languageCode));

        AIRequest request = AIRequest.builder()
                .systemPrompt(AiContentPrompts.conceptExplanationSystemPrompt())
                .messages(List.of(userMessage))
                .temperature(0.2)
                .maxTokens(600)
                .responseFormat(ResponseFormat.JSON)
                .metadata(Map.of("feature", "ai-content-concept-explanation"))
                .build();

        AIResponse response = aiService.generate(request);
        JsonNode raw = parseJson(response.content());
        AiContentValidation.Result validation = raw == null
                ? new AiContentValidation.Failed("NOT_JSON", "response was not valid JSON")
                : AiContentValidation.validateConceptExplanation(raw);

        return persistIfValid(AiContentTask.CONCEPT_EXPLANATION, languageCode, null, topicId, response, validation);
    }

    private AiContentItemResult persistIfValid(AiContentTask taskId, String languageCode, UUID questionId,
                                                UUID topicId, AIResponse response,
                                                AiContentValidation.Result validation) {
        UUID subjectId = questionId != null ? questionId : topicId;

        if (validation instanceof AiContentValidation.Failed failed) {
            return new AiContentItemResult(subjectId, "FAILED_VALIDATION",
                    failed.code() + ": " + failed.detail(), null);
        }

        AiContentValidation.Ok ok = (AiContentValidation.Ok) validation;

        AiContent content = new AiContent();
        content.setTaskId(taskId);
        if (questionId != null) {
            content.setQuestion(questionRepository.getReferenceById(questionId));
        } else {
            content.setTopic(topicRepository.getReferenceById(topicId));
        }
        content.setLanguageCode(languageCode);
        content.setPromptVersion(AiContentPrompts.PROMPT_VERSION);
        content.setProvider(response.provider());
        content.setModelId(response.model());
        content.setPayload(ok.payload());
        content.setContentStatus(ContentStatus.DRAFT);
        OffsetDateTime now = OffsetDateTime.now();
        content.setGeneratedAt(now);
        content.setUpdatedAt(now);

        AiContent saved = aiContentRepository.save(content);
        return new AiContentItemResult(subjectId, "GENERATED", null, saved.getId());
    }

    private JsonNode parseJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        // Tolerates a fenced code block, exactly like parseAiJson in validate.ts — models wrap
        // JSON in ```json far more often than prompt wording alone prevents.
        String candidate = raw.trim();
        int fenceStart = candidate.indexOf("```");
        if (fenceStart >= 0) {
            int contentStart = candidate.indexOf('\n', fenceStart);
            int fenceEnd = candidate.lastIndexOf("```");
            if (contentStart >= 0 && fenceEnd > contentStart) {
                candidate = candidate.substring(contentStart + 1, fenceEnd).trim();
            }
        }
        try {
            return objectMapper.readTree(candidate);
        } catch (Exception e) {
            return null;
        }
    }
}
