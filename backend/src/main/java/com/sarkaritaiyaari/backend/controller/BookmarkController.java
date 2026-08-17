package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.BookmarkDtos;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.BookmarkService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A student's own bookmarks. Scoped to the caller via the token, same as ProgressController. */
@RestController
@RequestMapping("/api/bookmarks")
public class BookmarkController {

    private final AuthService authService;
    private final BookmarkService bookmarkService;

    public BookmarkController(AuthService authService, BookmarkService bookmarkService) {
        this.authService = authService;
        this.bookmarkService = bookmarkService;
    }

    /** Upload whatever changed locally since the last sync. Safe to retry. */
    @PostMapping("/sync")
    public BookmarkDtos.SyncResponse sync(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @Valid @RequestBody BookmarkDtos.SyncRequest request) {
        return bookmarkService.upload(authService.requireUser(authorization), request);
    }

    /** Everything currently bookmarked, for rebuilding a fresh install. */
    @GetMapping
    public BookmarkDtos.RestoreResponse restore(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return bookmarkService.restore(authService.requireUser(authorization));
    }
}
