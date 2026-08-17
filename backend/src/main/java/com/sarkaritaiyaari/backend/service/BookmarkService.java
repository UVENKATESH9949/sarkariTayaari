package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.BookmarkDtos;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserBookmark;
import com.sarkaritaiyaari.backend.repository.UserBookmarkRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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

    public BookmarkService(UserBookmarkRepository bookmarks) {
        this.bookmarks = bookmarks;
    }

    public BookmarkDtos.SyncResponse upload(User user, BookmarkDtos.SyncRequest request) {
        int stored = 0;
        for (BookmarkDtos.Bookmark dto : request.getBookmarks()) {
            UserBookmark existing = bookmarks.findByUserIdAndQuestionId(user.getId(), dto.getQuestionId())
                    .orElse(null);
            if (existing != null && !dto.getUpdatedAt().isAfter(existing.getUpdatedAt())) {
                // A stale or duplicate retry of a change the server already has — the
                // point of last-write-wins is precisely to ignore this rather than let
                // it flip the state back.
                continue;
            }

            UserBookmark row = existing != null ? existing : new UserBookmark();
            row.setId(user.getId() + ":" + dto.getQuestionId());
            row.setUser(user);
            row.setQuestionId(dto.getQuestionId());
            row.setDeleted(dto.isDeleted());
            row.setUpdatedAt(dto.getUpdatedAt());
            bookmarks.save(row);
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
