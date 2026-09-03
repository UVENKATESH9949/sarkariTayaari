package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Spec §8 "Reminder System". See ReminderService's class comment for how dispatch actually runs. */
public final class ReminderDtos {

    private ReminderDtos() {
    }

    public record PushTokenRequest(
            @NotBlank String expoToken,
            /** ANDROID | IOS, informational only. */
            String platform) {
    }

    public record ReminderRequest(
            @NotBlank String examCode,
            /** Nullable — a reminder can be general to the exam rather than tied to one date. */
            UUID importantDateId,
            @NotNull OffsetDateTime remindAt,
            @NotBlank String message) {
    }

    public record ReminderResponse(
            UUID id,
            String examCode,
            UUID importantDateId,
            OffsetDateTime remindAt,
            String message,
            boolean sent) {
    }

    /** What POST /api/admin/reminders/dispatch reports back — see ReminderService. */
    public record DispatchSummary(int dueCount, int sentCount, int failedCount) {
    }
}
