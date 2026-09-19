package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.PreparationProfile;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.SyncResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserPreparationProfile;
import com.sarkaritaiyaari.backend.repository.UserPreparationProfileRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The account-wide preparation profile (TASK-3301, Phase 5). Read by the daily planner, written by
 * whichever device the student onboarded on.
 *
 * <h2>Last-write-wins, and why the client supplies the timestamp</h2>
 * Two devices can disagree, and the winner is decided on {@code updatedAt} — the same rule
 * {@code user_bookmarks} and {@code followed_exams} already use. The device supplies that
 * timestamp rather than the server stamping arrival, because an edit made offline and uploaded
 * three days later happened three days ago. Stamping on arrival would let a stale edit overwrite a
 * newer one purely by syncing second.
 *
 * <p>An upload that loses is <b>not</b> an error: the response says {@code stored: false} and hands
 * back what the server actually holds, so the losing device can correct itself in the same round
 * trip rather than discovering the disagreement later.
 */
@Service
@Transactional
public class PreparationProfileService {

    /**
     * The device's own vocabulary, mirrored. {@code packages/core/src/onboarding/profile.ts} is the
     * definition — these are here so an unknown value is rejected at the boundary rather than
     * reaching the planner, which would then have to guess what an unrecognised band means.
     *
     * <p>Deliberately not a Java enum and not a database CHECK: either would be a third copy, and
     * this project has already watched one enum's values drift from another's.
     */
    static final Set<String> PREPARATION_LEVELS =
            Set.of("JUST_STARTING", "LEARNING", "PRACTICING", "REVISING", "EXAM_READY");

    static final Set<String> DAILY_STUDY_TIMES =
            Set.of("UNDER_1H", "ONE_TO_TWO", "TWO_TO_FOUR", "FOUR_TO_SIX", "SIX_PLUS");

    private final UserPreparationProfileRepository profiles;

    public PreparationProfileService(UserPreparationProfileRepository profiles) {
        this.profiles = profiles;
    }

    @Transactional(readOnly = true)
    public Optional<PreparationProfile> find(User user) {
        return profiles.findByUserId(user.getId()).map(PreparationProfileService::toDto);
    }

    public SyncResponse upload(User user, PreparationProfile incoming) {
        validate(incoming);

        UserPreparationProfile existing = profiles.findByUserId(user.getId()).orElse(null);

        if (existing != null && existing.getUpdatedAt() != null
                && existing.getUpdatedAt().isAfter(incoming.updatedAt())) {
            // The server holds a newer edit. Not an error — hand back the winner so the device that
            // just lost can correct itself immediately.
            return new SyncResponse(false, toDto(existing));
        }

        UserPreparationProfile row = existing != null ? existing : new UserPreparationProfile();
        if (existing == null) {
            row.setUserId(user.getId());
            row.setCreatedAt(OffsetDateTime.now());
        }

        /*
         * Every field is replaced, including with null. The profile is one thing the student edits
         * as a whole in onboarding or settings, not a set of independently-owned fields — so a
         * cleared target year has to be able to reach the server. Merging non-null fields only
         * would make "I removed that" unrepresentable.
         */
        row.setDisplayName(incoming.displayName());
        row.setPrimaryExamCode(incoming.primaryExamCode());
        row.setExamStageId(incoming.examStageId());
        row.setTargetYear(incoming.targetYear());
        row.setPreparationLevel(incoming.preparationLevel());
        row.setDailyStudyTime(incoming.dailyStudyTime());
        row.setUpdatedAt(incoming.updatedAt());

        return new SyncResponse(true, toDto(profiles.save(row)));
    }

    private static void validate(PreparationProfile incoming) {
        if (incoming == null) {
            throw new IllegalArgumentException("A profile is required");
        }
        if (incoming.updatedAt() == null) {
            // Without it there is no way to resolve two devices, and defaulting to "now" would let
            // a stale edit win by syncing last.
            throw new IllegalArgumentException("updatedAt is required — it is what resolves two devices");
        }
        requireKnown("preparationLevel", incoming.preparationLevel(), PREPARATION_LEVELS);
        requireKnown("dailyStudyTime", incoming.dailyStudyTime(), DAILY_STUDY_TIMES);
        if (incoming.targetYear() != null
                && (incoming.targetYear() < 2000 || incoming.targetYear() > 2100)) {
            throw new IllegalArgumentException("targetYear is out of range: " + incoming.targetYear());
        }
    }

    /** Null is always allowed — a student can finish onboarding having skipped a step. */
    private static void requireKnown(String field, String value, Set<String> allowed) {
        if (value != null && !allowed.contains(value)) {
            throw new IllegalArgumentException(
                    field + " must be one of " + List.copyOf(allowed) + ", got: " + value);
        }
    }

    private static PreparationProfile toDto(UserPreparationProfile row) {
        return new PreparationProfile(
                row.getDisplayName(),
                row.getPrimaryExamCode(),
                row.getExamStageId(),
                row.getTargetYear(),
                row.getPreparationLevel(),
                row.getDailyStudyTime(),
                row.getUpdatedAt());
    }
}
