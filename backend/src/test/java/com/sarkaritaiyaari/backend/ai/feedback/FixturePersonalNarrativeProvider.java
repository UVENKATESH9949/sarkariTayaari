package com.sarkaritaiyaari.backend.ai.feedback;

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
 * Phase 7 test fixture — same "no real provider can be exercised in this environment, so a fake
 * that actually answers in the shape this pipeline expects stands in" precedent as
 * {@code FixtureAiContentProvider} (which {@code MockAIProvider} cannot serve, since it echoes
 * plain text rather than JSON). Reads a grounded number and the first topic name straight back
 * out of the prompt {@link PersonalNarrativePrompts} builds, so this fixture is only ever as
 * correct as the real prompt template, never a hardcoded narrative disconnected from what
 * production code actually sends.
 *
 * <p>Handles two prompt shapes: {@code SESSION_FEEDBACK}'s ({@code "Accuracy: N%"}) and, since
 * Phase 7.3, {@code PROFILE_SUMMARY}'s ({@code "Topics practised: N of M"}, no accuracy line at
 * all) — tried in that order so the original {@code SESSION_FEEDBACK} narrative wording, already
 * asserted against by {@code SessionFeedbackControllerTest}/{@code MockAttemptFeedbackControllerTest},
 * is completely unchanged.
 */
@Component("narrativefixture")
public class FixturePersonalNarrativeProvider implements AIProvider {

    private static final Pattern ACCURACY = Pattern.compile("Accuracy: (\\d+)%");
    private static final Pattern COVERAGE = Pattern.compile("Topics practised: (\\d+) of");
    private static final Pattern FIRST_TOPIC = Pattern.compile("^- (.+?) \\(subject:", Pattern.MULTILINE);

    /**
     * How many times a real generation actually happened — the only deterministic way to prove a
     * cache prevented a model call. Comparing two returned narratives would not: this fixture is
     * deterministic, so a genuine regeneration produces byte-identical text and would look exactly
     * like a cache hit.
     */
    private final java.util.concurrent.atomic.AtomicInteger generateCount =
            new java.util.concurrent.atomic.AtomicInteger();

    public int generateCount() {
        return generateCount.get();
    }

    public void resetGenerateCount() {
        generateCount.set(0);
    }

    @Override
    public String id() {
        return "narrativefixture";
    }

    @Override
    public AIResponse generate(AIRequest request) {
        generateCount.incrementAndGet();
        String prompt = request.messages().stream()
                .filter(m -> m.role() == AIMessage.Role.USER)
                .reduce((first, second) -> second)
                .map(AIMessage::content)
                .orElse("");

        Matcher topicMatcher = FIRST_TOPIC.matcher(prompt);
        Matcher accuracyMatcher = ACCURACY.matcher(prompt);

        String narrative;
        if (accuracyMatcher.find()) {
            String accuracy = accuracyMatcher.group(1);
            narrative = topicMatcher.find()
                    ? "You scored " + accuracy + "% today. " + topicMatcher.group(1) + " needs more attention."
                    : "You scored " + accuracy + "% today.";
        } else {
            Matcher coverageMatcher = COVERAGE.matcher(prompt);
            String covered = coverageMatcher.find() ? coverageMatcher.group(1) : "0";
            narrative = topicMatcher.find()
                    ? "You've covered " + covered + " topics so far. " + topicMatcher.group(1) + " stands out."
                    : "You've covered " + covered + " topics so far.";
        }

        String content = "{\"narrative\":\"" + narrative.replace("\"", "\\\"") + "\"}";
        return new AIResponse(content, "fixture-model", id(), AIUsage.of(10, 10), "stop",
                UUID.randomUUID().toString(), 0L);
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
