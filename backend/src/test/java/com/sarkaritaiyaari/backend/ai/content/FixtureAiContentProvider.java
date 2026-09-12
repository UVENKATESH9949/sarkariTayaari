package com.sarkaritaiyaari.backend.ai.content;

import com.sarkaritaiyaari.backend.ai.AICapability;
import com.sarkaritaiyaari.backend.ai.AICredentialStatus;
import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.ai.AIModelInfo;
import com.sarkaritaiyaari.backend.ai.AIRequest;
import com.sarkaritaiyaari.backend.ai.AIResponse;
import com.sarkaritaiyaari.backend.ai.AIUsage;
import com.sarkaritaiyaari.backend.ai.provider.AIProvider;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TASK-2701 Phase 2 test fixture -- registered under its own bean name ("aicontentfixture" -- short, since ai_provider_configs.provider is VARCHAR(20))
 * rather than replacing {@code mock}/{@code claude}, since {@link com.sarkaritaiyaari.backend.ai.provider.AIProviderRegistry}
 * keys providers by bean name and a test selects this one explicitly via the AI Admin Control
 * Center's own dynamic override (the same mechanism {@code AiConfigurationTest} already exercises).
 * This is the same "no real provider can be exercised in this environment, so a fake stands in"
 * precedent as {@code FakeDocumentStorage}/{@code FixtureNoticeSourceAdapter} -- except here the
 * gap is deliberate rather than a missing credential: {@link com.sarkaritaiyaari.backend.ai.provider.mock.MockAIProvider}
 * echoes the prompt as plain text, which correctly fails JSON parsing, so a real end-to-end test
 * of the SUCCESS path needs a provider that actually answers in the shape this pipeline expects.
 *
 * Reads the verified answer straight back out of the prompt {@link AiContentPrompts} builds
 * ("Verified correct answer (do not change this): ...") and echoes it into a valid, grounded
 * {@code QUESTION_EXPLANATION} payload -- so this fixture is only ever as correct as the real
 * prompt template, never a hardcoded answer disconnected from what production code actually
 * sends.
 */
@Component("aicontentfixture")
public class FixtureAiContentProvider implements AIProvider {

    private static final Pattern VERIFIED_ANSWER =
            Pattern.compile("Verified correct answer \\(do not change this\\): (.+)$", Pattern.MULTILINE);
    private static final Pattern TOPIC_LINE = Pattern.compile("Topic: (.+)$", Pattern.MULTILINE);

    @Override
    public String id() {
        return "aicontentfixture";
    }

    @Override
    public AIResponse generate(AIRequest request) {
        String lastUserMessage = request.messages().stream()
                .filter(m -> m.role() == AIMessage.Role.USER)
                .reduce((first, second) -> second)
                .map(AIMessage::content)
                .orElse("");

        Matcher answerMatcher = VERIFIED_ANSWER.matcher(lastUserMessage);
        String content = answerMatcher.find()
                ? questionExplanationJson(answerMatcher.group(1).trim())
                : conceptExplanationJson(lastUserMessage);

        return new AIResponse(content, "fixture-model", id(), AIUsage.of(10, 10), "stop",
                UUID.randomUUID().toString(), 0L);
    }

    private String questionExplanationJson(String verifiedAnswer) {
        String escaped = verifiedAnswer.replace("\"", "\\\"");
        return """
                {"answer":"%s","whyCorrect":"This is correct because the fixture says so.",\
                "whyOthersWrong":[],"concept":"Fixture concept","examTip":"Fixture tip"}""".formatted(escaped);
    }

    private String conceptExplanationJson(String prompt) {
        Matcher topicMatcher = TOPIC_LINE.matcher(prompt);
        String topic = topicMatcher.find() ? topicMatcher.group(1).trim() : "Fixture topic";
        return """
                {"concept":"%s","explanation":"A fixture explanation of the concept.","examTip":"Fixture tip"}\
                """.formatted(topic.replace("\"", "\\\""));
    }

    @Override
    public boolean supports(AICapability capability) {
        return capability == AICapability.TEXT_GENERATION
                || capability == AICapability.CHAT
                || capability == AICapability.STRUCTURED_OUTPUT;
    }

    @Override
    public List<AIModelInfo> listModels() {
        return List.of(new AIModelInfo("fixture-model", "Fixture provider (test only)"));
    }

    @Override
    public AICredentialStatus validateCredentials() {
        return AICredentialStatus.ok();
    }
}
