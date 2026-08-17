package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Shapes for syncing bookmarks. Unlike progress, a bookmark carries no content of its
 * own beyond the question it points at — the question text is already on every device
 * from the content sync, so only the id and the toggle state travel.
 */
public final class BookmarkDtos {

    private BookmarkDtos() {
    }

    public static class SyncRequest {
        @Valid
        private List<Bookmark> bookmarks = List.of();

        public List<Bookmark> getBookmarks() { return bookmarks; }
        public void setBookmarks(List<Bookmark> bookmarks) {
            this.bookmarks = bookmarks == null ? List.of() : bookmarks;
        }
    }

    public static class Bookmark {
        @NotNull private UUID questionId;
        private boolean deleted;
        @NotNull private OffsetDateTime updatedAt;

        public UUID getQuestionId() { return questionId; }
        public void setQuestionId(UUID questionId) { this.questionId = questionId; }
        public boolean isDeleted() { return deleted; }
        public void setDeleted(boolean deleted) { this.deleted = deleted; }
        public OffsetDateTime getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
    }

    public record SyncResponse(int stored) {
    }

    /** Only what's still bookmarked — tombstones stay server-side and never travel back down. */
    public record RestoreResponse(List<Bookmark> bookmarks) {
    }
}
