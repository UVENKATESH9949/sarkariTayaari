package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Shapes for syncing followed exams. Mirrors {@link BookmarkDtos} exactly — a follow
 * carries no content of its own beyond the exam code it points at, so only the code and
 * the toggle state travel.
 */
public final class FollowedExamDtos {

    private FollowedExamDtos() {
    }

    public static class SyncRequest {
        @Valid
        private List<FollowedExam> exams = List.of();

        public List<FollowedExam> getExams() { return exams; }
        public void setExams(List<FollowedExam> exams) {
            this.exams = exams == null ? List.of() : exams;
        }
    }

    public static class FollowedExam {
        @NotBlank private String examCode;
        private boolean deleted;
        @NotNull private OffsetDateTime updatedAt;

        public String getExamCode() { return examCode; }
        public void setExamCode(String examCode) { this.examCode = examCode; }
        public boolean isDeleted() { return deleted; }
        public void setDeleted(boolean deleted) { this.deleted = deleted; }
        public OffsetDateTime getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
    }

    public record SyncResponse(int stored) {
    }

    /** Only what's still followed — tombstones stay server-side and never travel back down. */
    public record RestoreResponse(List<FollowedExam> exams) {
    }
}
