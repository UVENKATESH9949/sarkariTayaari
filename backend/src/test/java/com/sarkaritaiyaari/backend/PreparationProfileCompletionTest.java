package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.PreparationProfile;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.ProfileResponse;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.SyncResponse;
import com.sarkaritaiyaari.backend.repository.UserPreparationProfileRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Onboarding completion as an account fact (V53, 2026-09-24).
 *
 * <p>The rule under test is that {@code onboardingCompletedAt} is <b>monotonic and outside
 * last-write-wins</b>: an upload can set it, an earlier moment replaces a later one, and nothing ever
 * clears it — not a newer upload with null, not an older app that never sends the field. That is
 * what lets a reinstalled app trust the server's answer and skip onboarding.
 */
class PreparationProfileCompletionTest extends AbstractIntegrationTest {

    @Autowired private UserPreparationProfileRepository profileRepository;

    private final String runId = UUID.randomUUID().toString().substring(0, 8);
    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void removeAccounts() {
        for (String email : createdEmails) {
            userRepository.findByEmail(email).ifPresent(u -> {
                profileRepository.findByUserId(u.getId()).ifPresent(profileRepository::delete);
                userRepository.delete(u);
            });
        }
    }

    @Test
    void completionUploadedWithTheProfileIsReturnedOnRead() {
        String token = signUp("profile.done." + runId + "@example.com");
        OffsetDateTime finished = now().minusMinutes(5);

        SyncResponse stored = upload(token, profile(now(), finished));

        assertThat(stored.stored()).isTrue();
        assertThat(read(token).profile().onboardingCompletedAt()).isAtSameInstantAs(finished);
    }

    @Test
    void aNewerUploadWithoutCompletionReplacesFieldsButNeverClearsIt() {
        String token = signUp("profile.keep." + runId + "@example.com");
        OffsetDateTime finished = now().minusHours(2);
        upload(token, profile(now().minusHours(1), finished));

        // A newer edit from a device that does not know (or an older app): it wins last-write-wins
        // for the fields, and must still leave completion alone.
        PreparationProfile newer = new PreparationProfile(
                "Renamed", null, null, 2028, "REVISING", "TWO_TO_FOUR", now(), null);
        SyncResponse result = upload(token, newer);

        assertThat(result.stored()).isTrue();
        ProfileResponse after = read(token);
        assertThat(after.profile().displayName()).isEqualTo("Renamed");
        assertThat(after.profile().onboardingCompletedAt()).isAtSameInstantAs(finished);
    }

    @Test
    void anOlderAppThatNeverSendsTheFieldIsAcceptedAndLeavesCompletionAlone() {
        String token = signUp("profile.oldapp." + runId + "@example.com");
        OffsetDateTime finished = now().minusHours(2);
        upload(token, profile(now().minusHours(1), finished));

        // Raw JSON with no onboardingCompletedAt key at all — the shape every pre-V53 APK sends.
        Map<String, Object> legacy = new HashMap<>();
        legacy.put("displayName", "Old App");
        legacy.put("preparationLevel", "LEARNING");
        legacy.put("dailyStudyTime", "ONE_TO_TWO");
        legacy.put("updatedAt", now().toString());
        ResponseEntity<SyncResponse> response = restTemplate.exchange(
                "/api/me/preparation-profile", HttpMethod.POST, authed(token, legacy), SyncResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(read(token).profile().onboardingCompletedAt()).isAtSameInstantAs(finished);
    }

    @Test
    void aLosingUploadStillRecordsCompletionTheServerDidNotHave() {
        String token = signUp("profile.lose." + runId + "@example.com");
        // The server holds a newer edit with no completion known (e.g. uploaded by an older app).
        upload(token, profile(now(), null));

        // This device finished onboarding, but its edit is older: the fields lose, completion lands.
        OffsetDateTime finished = now().minusDays(1);
        SyncResponse result = upload(token, profile(now().minusHours(3), finished));

        assertThat(result.stored()).isFalse();
        assertThat(result.profile().onboardingCompletedAt()).isAtSameInstantAs(finished);
        assertThat(read(token).profile().onboardingCompletedAt()).isAtSameInstantAs(finished);
    }

    @Test
    void theEarliestCompletionIsKept() {
        String token = signUp("profile.first." + runId + "@example.com");
        OffsetDateTime first = now().minusDays(10);
        OffsetDateTime second = now().minusDays(2);

        upload(token, profile(now().minusHours(2), second));
        upload(token, profile(now().minusHours(1), first));
        assertThat(read(token).profile().onboardingCompletedAt()).isAtSameInstantAs(first);

        // A later "finished" from a second phone does not move it forward again.
        upload(token, profile(now(), second));
        assertThat(read(token).profile().onboardingCompletedAt()).isAtSameInstantAs(first);
    }

    /* ------------------------------------------------------------------------------ helpers */

    /** Postgres stores microseconds; truncating keeps round-trip equality exact. */
    private static OffsetDateTime now() {
        return OffsetDateTime.now().truncatedTo(ChronoUnit.MILLIS);
    }

    private static PreparationProfile profile(OffsetDateTime updatedAt, OffsetDateTime completedAt) {
        return new PreparationProfile("Test Student", null, null, 2027, "PRACTICING", "ONE_TO_TWO",
                updatedAt, completedAt);
    }

    private SyncResponse upload(String token, PreparationProfile profile) {
        ResponseEntity<SyncResponse> response = restTemplate.exchange(
                "/api/me/preparation-profile", HttpMethod.POST, authed(token, profile), SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private ProfileResponse read(String token) {
        ResponseEntity<ProfileResponse> response = restTemplate.exchange(
                "/api/me/preparation-profile", HttpMethod.GET, authed(token, null), ProfileResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("Profile@12345");
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                "/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email);
        return response.getBody().token();
    }

    private <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        return new HttpEntity<>(body, headers);
    }
}
