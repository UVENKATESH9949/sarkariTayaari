package com.sarkaritaiyaari.backend.ai.feedback;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.ai.AIRequest;
import com.sarkaritaiyaari.backend.ai.AIResponse;
import com.sarkaritaiyaari.backend.ai.AIService;
import com.sarkaritaiyaari.backend.ai.ResponseFormat;
import com.sarkaritaiyaari.backend.ai.exception.AIException;
import com.sarkaritaiyaari.backend.dto.MistakeAnalysisDtos.MistakeAnalysisRequest;
import com.sarkaritaiyaari.backend.dto.ProfileSummaryDtos.ProfileSummaryRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.TopicSnapshotDto;
import com.sarkaritaiyaari.backend.entity.AiTaskId;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserProfileSummary;
import com.sarkaritaiyaari.backend.repository.UserProfileSummaryRepository;
import com.sarkaritaiyaari.backend.service.AiTaskFlagService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Phase 7 -- the orchestrator for {@code SESSION_FEEDBACK} (7.1) and, later, {@code
 * PROFILE_SUMMARY} (7.3). A new sibling package to {@code ai/content/}, deliberately not an
 * extension of it: {@code AiContentGenerationService}'s whole shape is batch-generate-then-a-
 * human-reviews-once ({@code AiContentReviewService}'s DRAFT&rarr;REVIEW&rarr;PUBLISHED), which
 * does not fit "one student, right now, nothing to review because the content does not exist
 * until they finish."
 *
 * <h2>Context is client-supplied, not re-derived server-side</h2>
 * A deliberate trust-boundary call, stated here rather than left implicit: the mobile Summary
 * screen already has (or cheaply fetches from the existing weakness-radar endpoint) everything
 * a {@code SessionFeedbackRequest} needs, and hands it over already built. This service trusts
 * those facts as given -- the same posture {@code AiContentPrompts} already takes toward a
 * question's verified {@code correctAnswer} -- and only validates that the generated
 * <em>narrative</em> stays inside them ({@link PersonalNarrativeValidation}). A manipulated
 * client could in principle claim a flattering accuracy to get an undeservedly encouraging
 * narrative; accepted for v1 since the narrative is cosmetic (no grading, no unlocking), the
 * same trust level already extended to client-reported {@code time_ms}. Closing this later
 * means deriving topic health server-side from already-synced result rows instead of trusting
 * the client's context -- deliberately deferred, not built now.
 *
 * <h2>Flag-gated before anything is spent</h2>
 * {@link AiTaskFlagService#isEnabled(AiTaskId)} is checked first, before a prompt is even built
 * -- never spend a request finding out a feature is off.
 */
@Service
public class PersonalNarrativeService {

    /**
     * The wire-level output ceiling, which is deliberately NOT the same number as the shared task
     * registry's {@code maxOutputTokens: 300} for these two tasks -- that figure is how long the
     * *answer* should be (2-4 sentences), while this one has to also cover what a reasoning model
     * spends before it writes any answer at all.
     *
     * <p>Found by measurement, not by reading docs: {@code openai/gpt-oss-120b} on a realistic
     * {@code PROFILE_SUMMARY} (3 strengths + 3 weaknesses) burned all 300 tokens reasoning and was
     * cut off mid-JSON -- {@code finishReason=length}, which surfaced as a {@code NOT_JSON}
     * rejection and a silent null narrative on the one payload shape a real student is most likely
     * to produce. Raising the ceiling is close to free: a caller is billed for tokens actually
     * generated, never for the cap, so the only thing 300 was "saving" was the cost of a truncated
     * response that gets thrown away in full.
     */
    private static final int MAX_OUTPUT_TOKENS = 1000;

    /**
     * Why a narrative came back null is otherwise invisible: every failure mode here resolves to
     * the same {@code null} a disabled flag produces, deliberately (the caller's contract is "show
     * nothing extra"), which left an operator no way to tell "nobody enabled this" from "the model
     * keeps failing validation." Found the hard way -- a real truncated-JSON failure looked
     * identical to the feature simply being off.
     */
    private static final Logger log = LoggerFactory.getLogger(PersonalNarrativeService.class);

    private final AiTaskFlagService flagService;
    private final AIService aiService;
    private final ObjectMapper objectMapper;
    private final UserProfileSummaryRepository profileSummaryRepository;

    public PersonalNarrativeService(AiTaskFlagService flagService, AIService aiService, ObjectMapper objectMapper,
                                     UserProfileSummaryRepository profileSummaryRepository) {
        this.flagService = flagService;
        this.aiService = aiService;
        this.objectMapper = objectMapper;
        this.profileSummaryRepository = profileSummaryRepository;
    }

    /** Returns {@code null} on disabled/failed-validation/provider error -- never throws for those. */
    public String sessionFeedback(SessionFeedbackRequest request) {
        if (!flagService.isEnabled(AiTaskId.SESSION_FEEDBACK)) {
            return null;
        }

        AIMessage userMessage = PersonalNarrativePrompts.sessionFeedbackUserMessage(
                request, languageName(request.preferredLanguage()));

        AIRequest aiRequest = AIRequest.builder()
                .systemPrompt(PersonalNarrativePrompts.sessionFeedbackSystemPrompt())
                .messages(List.of(userMessage))
                .temperature(0.4)
                .maxTokens(MAX_OUTPUT_TOKENS)
                .responseFormat(ResponseFormat.JSON)
                .metadata(Map.of("feature", "session-feedback"))
                .build();

        try {
            AIResponse response = aiService.generate(aiRequest);
            JsonNode raw = parseJson(response.content());
            PersonalNarrativeGrounding.Grounding grounding = groundingFor(request);
            PersonalNarrativeValidation.Result result = raw == null
                    ? new PersonalNarrativeValidation.Failed("NOT_JSON", "response was not valid JSON")
                    : PersonalNarrativeValidation.validate(raw, grounding);

            return narrativeOrNull(result, AiTaskId.SESSION_FEEDBACK, response);
        } catch (AIException e) {
            log.warn("SESSION_FEEDBACK generation failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Phase 7.4 -- {@code MISTAKE_ANALYSIS}. Same flag-gate/generate/validate/never-throw shape as
     * its two siblings, with one structural difference: the payload is a three-field object rather
     * than a narrative, so it validates through {@link MistakeAnalysisValidation} instead.
     *
     * <p><b>No server-side cache, deliberately, and for a different reason than Phase 7.3's.</b>
     * {@code PROFILE_SUMMARY} needed one because it regenerated automatically on every screen
     * open; this is generated only when a student explicitly taps for it on one question, so the
     * same cost pressure does not exist. The caching that does pay off here is on the device --
     * a finished wrong answer is immutable history, so the client stores the result against the
     * question id and never asks twice. Doing it there also works before the owning session has
     * synced to this backend, which a server-side row keyed on a result could not.
     *
     * @return {@code null} on disabled/failed-validation/provider error -- never throws for those.
     */
    public MistakeAnalysisValidation.Ok mistakeAnalysis(MistakeAnalysisRequest request) {
        if (!flagService.isEnabled(AiTaskId.MISTAKE_ANALYSIS)) {
            return null;
        }

        AIMessage userMessage = PersonalNarrativePrompts.mistakeAnalysisUserMessage(
                request, languageName(request.preferredLanguage()));

        AIRequest aiRequest = AIRequest.builder()
                .systemPrompt(PersonalNarrativePrompts.mistakeAnalysisSystemPrompt())
                .messages(List.of(userMessage))
                .temperature(0.4)
                .maxTokens(MAX_OUTPUT_TOKENS)
                .responseFormat(ResponseFormat.JSON)
                .metadata(Map.of("feature", "mistake-analysis"))
                .build();

        try {
            AIResponse response = aiService.generate(aiRequest);
            JsonNode raw = parseJson(response.content());
            MistakeAnalysisValidation.Result result = raw == null
                    ? new MistakeAnalysisValidation.Failed("NOT_JSON", "response was not valid JSON")
                    : MistakeAnalysisValidation.validate(raw);

            return switch (result) {
                case MistakeAnalysisValidation.Ok ok -> ok;
                case MistakeAnalysisValidation.Failed failed -> {
                    log.warn("{} rejected a generated analysis: {} ({}) [finishReason={}, outputTokens={}]",
                            AiTaskId.MISTAKE_ANALYSIS, failed.code(), failed.detail(),
                            response.finishReason(),
                            response.usage() != null ? response.usage().outputTokens() : null);
                    yield null;
                }
            };
        } catch (AIException e) {
            log.warn("MISTAKE_ANALYSIS generation failed: {}", e.getMessage());
            return null;
        }
    }

    /**
     * Phase 7.3 -- {@code PROFILE_SUMMARY}'s counterpart to {@link #sessionFeedback}. Same
     * flag-gate-before-building-a-prompt/generate/validate/never-throw shape; only the prompt
     * template, the flag checked, and how grounding facts are gathered differ.
     */
    public String profileSummary(User user, ProfileSummaryRequest request) {
        if (!flagService.isEnabled(AiTaskId.PROFILE_SUMMARY)) {
            return null;
        }

        // Checked before a prompt is built, for the same reason the flag is: never spend a
        // request discovering the answer is already known. Measured motivation in
        // V45__profile_summary_cache.sql -- this one surface was ~57% of per-user AI cost purely
        // by regenerating identical narratives on every screen open.
        String contextHash = contextHash(request);
        String cacheId = user.getId() + ":" + request.examCode();
        Optional<UserProfileSummary> cached = profileSummaryRepository.findById(cacheId);
        if (cached.isPresent() && cached.get().getContextHash().equals(contextHash)) {
            return cached.get().getNarrative();
        }

        AIMessage userMessage = PersonalNarrativePrompts.profileSummaryUserMessage(
                request, languageName(request.preferredLanguage()));

        AIRequest aiRequest = AIRequest.builder()
                .systemPrompt(PersonalNarrativePrompts.profileSummarySystemPrompt())
                .messages(List.of(userMessage))
                .temperature(0.4)
                .maxTokens(MAX_OUTPUT_TOKENS)
                .responseFormat(ResponseFormat.JSON)
                .metadata(Map.of("feature", "profile-summary"))
                .build();

        try {
            AIResponse response = aiService.generate(aiRequest);
            JsonNode raw = parseJson(response.content());
            PersonalNarrativeGrounding.Grounding grounding = groundingForProfile(request);
            PersonalNarrativeValidation.Result result = raw == null
                    ? new PersonalNarrativeValidation.Failed("NOT_JSON", "response was not valid JSON")
                    : PersonalNarrativeValidation.validate(raw, grounding);

            String narrative = narrativeOrNull(result, AiTaskId.PROFILE_SUMMARY, response);
            if (narrative != null) {
                cacheProfileSummary(cacheId, user, request, contextHash, narrative);
            }
            return narrative;
        } catch (AIException e) {
            log.warn("PROFILE_SUMMARY generation failed: {}", e.getMessage());
            return null;
        }
    }

    /** Upserts the one cache row for this (user, exam) — a cache, never history, so the previous
     *  narrative for a since-changed radar is simply replaced. */
    private void cacheProfileSummary(String cacheId, User user, ProfileSummaryRequest request,
                                      String contextHash, String narrative) {
        UserProfileSummary row = profileSummaryRepository.findById(cacheId).orElseGet(UserProfileSummary::new);
        row.setId(cacheId);
        row.setUser(user);
        row.setExamCode(request.examCode());
        row.setContextHash(contextHash);
        row.setLanguageCode(request.preferredLanguage());
        row.setNarrative(narrative);
        row.setGeneratedAt(OffsetDateTime.now());
        profileSummaryRepository.save(row);
    }

    /**
     * A stable SHA-256 over exactly the facts a narrative is allowed to mention. Field order is
     * fixed and every value is included explicitly rather than relying on {@code toString()} of a
     * record: the hash is a cache key whose stability across restarts and deploys is the whole
     * point, and a record's generated {@code toString()} is not a format anything should depend on.
     *
     * <p>{@code preferredLanguage} is part of the hash, so a student switching content language
     * correctly regenerates rather than being served the previous language's narrative.
     */
    private static String contextHash(ProfileSummaryRequest request) {
        StringBuilder canonical = new StringBuilder()
                .append(request.examCode()).append('|')
                .append(request.overviewStatus()).append('|')
                .append(request.topicsInSyllabus()).append('|')
                .append(request.topicsWithEvidence()).append('|')
                .append(request.preferredLanguage()).append('|');
        appendTopics(canonical, request.strengths());
        canonical.append("||");
        appendTopics(canonical, request.weaknesses());

        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JDK spec; unreachable outside a broken JRE.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static void appendTopics(StringBuilder canonical, List<TopicSnapshotDto> topics) {
        for (TopicSnapshotDto topic : topics) {
            canonical.append(topic.topicId()).append(',')
                    .append(topic.topicName()).append(',')
                    .append(topic.state()).append(',')
                    .append(topic.trend()).append(',')
                    .append(topic.healthScore()).append(';');
        }
    }

    /**
     * The one place a validated result becomes a narrative-or-null, so a rejection is never
     * silent. {@code finishReason}/{@code outputTokens} are logged alongside the failure code
     * because the most confusing real failure so far was neither a bad model nor a bad prompt:
     * {@code gpt-oss-120b} is a reasoning model that spends output budget thinking before it
     * emits any JSON, so a too-low {@code maxTokens} truncates the response mid-object and shows
     * up as {@code NOT_JSON} -- indistinguishable from a malformed answer unless you can see that
     * the output stopped exactly at the ceiling.
     */
    private static String narrativeOrNull(PersonalNarrativeValidation.Result result, AiTaskId taskId, AIResponse response) {
        return switch (result) {
            case PersonalNarrativeValidation.Ok ok -> ok.narrative();
            case PersonalNarrativeValidation.Failed failed -> {
                log.warn("{} rejected a generated narrative: {} ({}) [finishReason={}, outputTokens={}]",
                        taskId, failed.code(), failed.detail(),
                        response.finishReason(),
                        response.usage() != null ? response.usage().outputTokens() : null);
                yield null;
            }
        };
    }

    private static PersonalNarrativeGrounding.Grounding groundingForProfile(ProfileSummaryRequest request) {
        List<Integer> numbers = new java.util.ArrayList<>(
                List.of(request.topicsInSyllabus(), request.topicsWithEvidence()));
        List<String> topicNames = new java.util.ArrayList<>();
        for (TopicSnapshotDto topic : request.strengths()) {
            topicNames.add(topic.topicName());
            if (topic.healthScore() != null) {
                numbers.add(topic.healthScore());
            }
        }
        for (TopicSnapshotDto topic : request.weaknesses()) {
            topicNames.add(topic.topicName());
            if (topic.healthScore() != null) {
                numbers.add(topic.healthScore());
            }
        }
        return new PersonalNarrativeGrounding.Grounding(numbers, topicNames);
    }

    // No grounding helper for MISTAKE_ANALYSIS, deliberately — see MistakeAnalysisValidation's
    // own doc comment for why both grounding rules were removed after real Groq calls showed
    // them rejecting correct analyses, and what replaces the protection they were giving.

    private static PersonalNarrativeGrounding.Grounding groundingFor(SessionFeedbackRequest request) {
        List<Integer> numbers = new java.util.ArrayList<>(List.of(
                request.answeredCount(), request.correctCount(), request.accuracyPercent()));
        List<String> topicNames = new java.util.ArrayList<>();
        for (TopicSnapshotDto topic : request.topics()) {
            topicNames.add(topic.topicName());
            if (topic.healthScore() != null) {
                numbers.add(topic.healthScore());
            }
        }
        return new PersonalNarrativeGrounding.Grounding(numbers, topicNames);
    }

    private static String languageName(String code) {
        return switch (code) {
            case "hi" -> "Hindi";
            default -> "English";
        };
    }

    private JsonNode parseJson(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        // Same fenced-code-block tolerance as AiContentGenerationService.parseJson -- models
        // wrap JSON in ```json far more often than prompt wording alone prevents.
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
