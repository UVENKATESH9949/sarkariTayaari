package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.BookmarkDtos;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BookmarkSyncTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    @Test
    void uploadThenRestore_returnsOnlyWhatsStillBookmarked() {
        String token = signUp("bookmark.one@example.com");
        UUID keep = UUID.randomUUID();
        UUID remove = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();

        sync(token, bookmark(keep, false, now), bookmark(remove, false, now));
        // Removed a moment later — this is the state that must win.
        sync(token, bookmark(remove, true, now.plusSeconds(5)));

        BookmarkDtos.RestoreResponse restored = restore(token);

        assertThat(restored.bookmarks()).hasSize(1);
        assertThat(restored.bookmarks().get(0).getQuestionId()).isEqualTo(keep);
    }

    /**
     * The whole reason this isn't a plain upsert: a stale retry (or a second device
     * replaying an older toggle) must not undo a newer change already on the server.
     */
    @Test
    void anOlderUpdate_neverOverwritesANewerOne() {
        String token = signUp("bookmark.two@example.com");
        UUID question = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();

        sync(token, bookmark(question, false, now));
        // A removal timestamped BEFORE the add above arrives late (e.g. a queued
        // request from a device that was offline). It must not win.
        sync(token, bookmark(question, true, now.minusMinutes(1)));

        BookmarkDtos.RestoreResponse restored = restore(token);

        assertThat(restored.bookmarks()).hasSize(1);
        assertThat(restored.bookmarks().get(0).getQuestionId()).isEqualTo(question);
        assertThat(restored.bookmarks().get(0).isDeleted()).isFalse();
    }

    @Test
    void reSyncingTheSameToggle_doesNotDuplicateOrError() {
        String token = signUp("bookmark.three@example.com");
        UUID question = UUID.randomUUID();
        BookmarkDtos.Bookmark toggle = bookmark(question, false, OffsetDateTime.now());

        sync(token, toggle);
        sync(token, toggle);

        assertThat(restore(token).bookmarks()).hasSize(1);
    }

    @Test
    void oneUsersBookmarksAreInvisibleToAnother() {
        String alice = signUp("bookmark.alice@example.com");
        String bob = signUp("bookmark.bob@example.com");

        sync(alice, bookmark(UUID.randomUUID(), false, OffsetDateTime.now()));

        assertThat(restore(alice).bookmarks()).hasSize(1);
        assertThat(restore(bob).bookmarks()).isEmpty();
    }

    @Test
    void bookmarkEndpointsRequireSigningIn() {
        BookmarkDtos.SyncRequest request = new BookmarkDtos.SyncRequest();
        request.setBookmarks(List.of(bookmark(UUID.randomUUID(), false, OffsetDateTime.now())));

        ResponseEntity<Map> upload = restTemplate.postForEntity("/api/bookmarks/sync", request, Map.class);
        ResponseEntity<Map> read = restTemplate.getForEntity("/api/bookmarks", Map.class);

        assertThat(upload.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(read.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /* ------------------------------------------------------------------- helpers */

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("practice123");

        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email);
        return response.getBody().token();
    }

    private void sync(String token, BookmarkDtos.Bookmark... toUpload) {
        BookmarkDtos.SyncRequest request = new BookmarkDtos.SyncRequest();
        request.setBookmarks(List.of(toUpload));
        ResponseEntity<BookmarkDtos.SyncResponse> response = restTemplate.exchange(
                "/api/bookmarks/sync", HttpMethod.POST, authed(token, request), BookmarkDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private BookmarkDtos.RestoreResponse restore(String token) {
        ResponseEntity<BookmarkDtos.RestoreResponse> response = restTemplate.exchange(
                "/api/bookmarks", HttpMethod.GET, authed(token, null), BookmarkDtos.RestoreResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private static BookmarkDtos.Bookmark bookmark(UUID questionId, boolean deleted, OffsetDateTime updatedAt) {
        BookmarkDtos.Bookmark dto = new BookmarkDtos.Bookmark();
        dto.setQuestionId(questionId);
        dto.setDeleted(deleted);
        dto.setUpdatedAt(updatedAt);
        return dto;
    }

    private static <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
