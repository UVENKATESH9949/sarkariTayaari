package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.BookmarkDtos;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserBookmark;
import com.sarkaritaiyaari.backend.repository.UserBookmarkRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Unlike progress, a bookmark is mutable state, not an append-only event: the same
 * question can be bookmarked and un-bookmarked repeatedly, from more than one device.
 * Each incoming row is applied only if it is newer than what the server already has for
 * that (user, question) pair — last-write-wins on updated_at — so an add from one
 * device can't be clobbered by a stale removal replayed from another, or vice versa.
 */
@Service
@Transactional
public class BookmarkService {

    private final UserBookmarkRepository bookmarks;

    @PersistenceContext
    private EntityManager entityManager;

    public BookmarkService(UserBookmarkRepository bookmarks) {
        this.bookmarks = bookmarks;
    }

    /**
     * The per-row existence check here is genuinely needed for last-write-wins conflict
     * resolution (unlike {@link ProgressService}'s old bug, this isn't accidental) — but
     * doing it once per row was still one round trip per bookmark, and for a brand-new
     * row it doubled up: the explicit check found nothing, then {@code save()} on this
     * entity's manually-assigned id took the {@code merge()} path anyway, which does its
     * *own* existence check before inserting. Batching the lookup and calling {@code
     * persist()} directly for genuinely-new rows collapses that back to one round trip
     * total. Found auditing for the same pattern already hit twice elsewhere — see
     * reports/12-load-test-data-seeding/.
     */
    public BookmarkDtos.SyncResponse upload(User user, BookmarkDtos.SyncRequest request) {
        List<String> ids = request.getBookmarks().stream()
                .map(dto -> user.getId() + ":" + dto.getQuestionId())
                .toList();
        Map<String, UserBookmark> existingById = bookmarks.findAllById(ids).stream()
                .collect(Collectors.toMap(UserBookmark::getId, b -> b));

        int stored = 0;
        for (BookmarkDtos.Bookmark dto : request.getBookmarks()) {
            String id = user.getId() + ":" + dto.getQuestionId();
            UserBookmark existing = existingById.get(id);
            if (existing != null && !dto.getUpdatedAt().isAfter(existing.getUpdatedAt())) {
                // A stale or duplicate retry of a change the server already has — the
                // point of last-write-wins is precisely to ignore this rather than let
                // it flip the state back.
                continue;
            }

            if (existing != null) {
                // Already managed (loaded above, in this same transaction) — mutating it
                // is enough; Hibernate's dirty checking picks it up at flush time.
                existing.setDeleted(dto.isDeleted());
                existing.setUpdatedAt(dto.getUpdatedAt());
            } else {
                UserBookmark row = new UserBookmark();
                row.setId(id);
                row.setUser(user);
                row.setQuestionId(dto.getQuestionId());
                row.setDeleted(dto.isDeleted());
                row.setUpdatedAt(dto.getUpdatedAt());
                entityManager.persist(row);
            }
            stored++;
        }
        return new BookmarkDtos.SyncResponse(stored);
    }

    @Transactional(readOnly = true)
    public BookmarkDtos.RestoreResponse restore(User user) {
        var active = bookmarks.findByUserIdAndDeletedFalse(user.getId()).stream()
                .map(BookmarkService::toDto)
                .toList();
        return new BookmarkDtos.RestoreResponse(active);
    }

    private static BookmarkDtos.Bookmark toDto(UserBookmark row) {
        BookmarkDtos.Bookmark dto = new BookmarkDtos.Bookmark();
        dto.setQuestionId(row.getQuestionId());
        dto.setDeleted(row.isDeleted());
        dto.setUpdatedAt(row.getUpdatedAt());
        return dto;
    }
}
