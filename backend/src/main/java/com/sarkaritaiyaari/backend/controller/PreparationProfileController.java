package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.PreparationProfile;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.ProfileResponse;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.SyncResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.PreparationProfileService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The calling student's preparation profile (TASK-3301 — see {@code api/PREPARATION-PROFILE.md}).
 *
 * <p>Mounted under {@code /api/me/} with the acting user taken from the token, like every other
 * personalization endpoint: there is no user-id parameter anywhere, so one account cannot read or
 * overwrite another's profile.
 *
 * <p>Onboarding still runs before sign-in and still writes to the device. This endpoint exists
 * because the daily planner runs on the server and cannot budget a day without knowing how much
 * time the student has.
 */
@RestController
@RequestMapping("/api/me/preparation-profile")
public class PreparationProfileController {

    private final AuthService authService;
    private final PreparationProfileService profiles;

    public PreparationProfileController(AuthService authService, PreparationProfileService profiles) {
        this.authService = authService;
        this.profiles = profiles;
    }

    /** The stored profile, or {@code {"profile": null}} for an account that never uploaded one. */
    @GetMapping
    public ProfileResponse get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        User user = authService.requireUser(authorization);
        return new ProfileResponse(profiles.find(user).orElse(null));
    }

    /** Last-write-wins upload. A losing upload is a 200 with {@code stored: false}, not an error. */
    @PostMapping
    public SyncResponse upload(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                               @RequestBody PreparationProfile profile) {
        User user = authService.requireUser(authorization);
        return profiles.upload(user, profile);
    }
}
