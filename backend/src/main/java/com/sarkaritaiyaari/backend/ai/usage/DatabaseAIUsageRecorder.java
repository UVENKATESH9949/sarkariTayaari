package com.sarkaritaiyaari.backend.ai.usage;

import com.sarkaritaiyaari.backend.entity.AiUsageRecord;
import com.sarkaritaiyaari.backend.repository.AiUsageRecordRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Persists every AI call, taking over from {@link LoggingAIUsageRecorder} via {@code @Primary} —
 * precisely the swap {@link AIUsageRecorder}'s own doc comment predicted, with zero change to
 * {@code AIServiceImpl}, which still depends only on the interface.
 *
 * <p>It <em>delegates</em> to the logging recorder rather than replacing it: the structured
 * {@code ai.usage} log line is what makes a live call tailable while debugging, and that was
 * genuinely how this project's first real per-call token measurements were taken. Storing rows
 * and printing a line are complementary, not alternatives.
 *
 * <h2>Recording must never be able to break the feature it is measuring</h2>
 * Two deliberate protections, both learned from this codebase's own history rather than added
 * speculatively:
 * <ul>
 *   <li><b>Nothing propagates.</b> A failed usage write must not turn a perfectly good AI
 *       response into an error for the student — the call already succeeded and was already
 *       billed by the time this runs. Failures are logged and swallowed.</li>
 *   <li><b>{@code REQUIRES_NEW}.</b> Usage is a fact about something that already happened, so it
 *       must survive a caller's later rollback. This is safe here specifically because the insert
 *       references no uncommitted parent row — the exact condition that made {@code REQUIRES_NEW}
 *       the *wrong* answer in {@code DocumentStoreService}, where a separate transaction could not
 *       see its caller's not-yet-committed notice.</li>
 * </ul>
 */
@Component
@Primary
public class DatabaseAIUsageRecorder implements AIUsageRecorder {

    private static final Logger log = LoggerFactory.getLogger(DatabaseAIUsageRecorder.class);

    private final AiUsageRecordRepository repository;
    private final LoggingAIUsageRecorder loggingRecorder;

    public DatabaseAIUsageRecorder(AiUsageRecordRepository repository, LoggingAIUsageRecorder loggingRecorder) {
        this.repository = repository;
        this.loggingRecorder = loggingRecorder;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AIUsageEvent event) {
        loggingRecorder.record(event);
        try {
            AiUsageRecord row = new AiUsageRecord();
            row.setId(UUID.randomUUID());
            row.setProvider(event.provider());
            row.setModel(event.model());
            row.setFeature(event.feature());
            row.setRequestId(event.requestId());
            row.setInputTokens(event.inputTokens());
            row.setOutputTokens(event.outputTokens());
            row.setTotalTokens(event.totalTokens());
            row.setLatencyMs(event.latencyMs());
            row.setStatus(event.status());
            row.setErrorType(event.errorType());
            row.setOccurredAt(event.timestamp() != null ? event.timestamp() : OffsetDateTime.now());
            repository.save(row);
        } catch (RuntimeException e) {
            log.warn("Failed to persist AI usage event (the AI call itself was unaffected): {}", e.getMessage());
        }
    }
}
