package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Wire shapes for the preparation profile (see {@code api/PREPARATION-PROFILE.md}, TASK-3301).
 *
 * <p>The upload mirrors {@code /api/topic-progress/sync}: the device sends what it has, including
 * the {@code updatedAt} it recorded when the student actually made the change, and the server keeps
 * whichever side is newer. That matters for an edit made offline and uploaded days later — the
 * upload time is not the edit time.
 */
public final class PreparationProfileDtos {

    private PreparationProfileDtos() {
    }

    /**
     * @param displayName      what the student asked to be called
     * @param primaryExamCode  the exam onboarding chose; not a foreign key, since an exam can later
     *                         be deactivated without making an existing profile unwritable
     * @param targetYear       the year they are aiming at, or null if they skipped the step
     * @param preparationLevel one of JUST_STARTING / LEARNING / PRACTICING / REVISING / EXAM_READY
     * @param dailyStudyTime   one of UNDER_1H / ONE_TO_TWO / TWO_TO_FOUR / FOUR_TO_SIX / SIX_PLUS —
     *                         a <b>band</b>, never a number of minutes. The student said "one to
     *                         two hours"; any minutes figure derived from it is the planner's
     *                         assumption and is labelled as one
     * @param updatedAt        when the device recorded this edit. Client-supplied on upload, and
     *                         what last-write-wins compares
     */
    public record PreparationProfile(String displayName,
                                     String primaryExamCode,
                                     UUID examStageId,
                                     Integer targetYear,
                                     String preparationLevel,
                                     String dailyStudyTime,
                                     OffsetDateTime updatedAt) {
    }

    /**
     * @param profile  the stored profile, or null when this account has never uploaded one — a real
     *                 answer, not an error. The planner reads it as "no stated study time" and
     *                 budgets a declared default
     */
    public record ProfileResponse(PreparationProfile profile) {
    }

    /**
     * @param stored  true when the upload won, false when the server already held something newer.
     *                Reported rather than silent, so a device can tell "saved" from "someone else's
     *                edit is newer than mine"
     * @param profile whatever is authoritative after the call — the uploaded row if it won, the
     *                existing one if it did not, so a losing device can correct itself in the same
     *                round trip
     */
    public record SyncResponse(boolean stored, PreparationProfile profile) {
    }
}
