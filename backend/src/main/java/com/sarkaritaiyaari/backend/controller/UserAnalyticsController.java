package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.UserAnalyticsDtos;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.UserAnalyticsService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * A student's own behavioural analytics (TASK-2801 — see {@code api/USER-ANALYTICS.md}).
 *
 * <h2>Scoping</h2>
 * Mounted under {@code /api/me/} because every endpoint here describes the caller and nothing
 * else. There is deliberately no user-id path parameter and no filter by another account: the
 * acting user comes from the bearer token, the same rule every endpoint in
 * {@code api/USER-PROGRESS.md} follows. One student cannot address another's analytics because
 * there is no way to name one.
 *
 * <h2>What it does not return</h2>
 * Summaries only. The raw attempt rows stay behind {@code /api/progress}, which already has a
 * paged, ownership-scoped contract for them — exposing an analytics table directly would make
 * the internal event model a public one and freeze it.
 *
 * <p>And no advice. Nothing here says what to study next; that is a planning layer's job and it
 * does not exist yet. Keeping measurement and recommendation apart is what lets the planner be
 * rewritten later without re-deriving what a student actually did.
 *
 * <h2>Time zones</h2>
 * "Today", a streak and a weekly bucket all depend on where the student is, and this app stores
 * no time zone on {@code users} — onboarding never asked, and the profile is device-local. So the
 * client passes its own {@code zone}; UTC is the documented fallback rather than a guess at the
 * user's locale.
 */
@RestController
@RequestMapping("/api/me/analytics")
public class UserAnalyticsController {

    private final AuthService authService;
    private final UserAnalyticsService analytics;

    public UserAnalyticsController(AuthService authService, UserAnalyticsService analytics) {
        this.authService = authService;
        this.analytics = analytics;
    }

    /** Headline totals, study time, last activity and streaks. */
    @GetMapping("/overview")
    public UserAnalyticsDtos.Overview overview(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @RequestParam(required = false) String zone) {
        User user = authService.requireUser(authorization);
        return analytics.overview(user, zoneOf(zone), OffsetDateTime.now());
    }

    /** Per subject, ordered by how much the student has actually done. */
    @GetMapping("/subjects")
    public List<UserAnalyticsDtos.SubjectStat> subjects(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return analytics.subjects(authService.requireUser(authorization), OffsetDateTime.now());
    }

    /**
     * Per topic, including a derived direction of travel.
     *
     * <p>Unpaged deliberately: this is bounded by the topics one student has actually attempted —
     * tens, not thousands — and a planner wants the whole picture in one read rather than
     * assembling it from pages. If a student's breadth ever makes that untrue, this gains a
     * {@code Page} the same way {@code /api/progress/sessions} did.
     */
    @GetMapping("/topics")
    public List<UserAnalyticsDtos.TopicStat> topics(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return analytics.topics(authService.requireUser(authorization), OffsetDateTime.now());
    }

    /** Per difficulty band, in the admin-curated display order. */
    @GetMapping("/difficulty")
    public List<UserAnalyticsDtos.DifficultyStat> difficulty(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return analytics.difficulty(authService.requireUser(authorization), OffsetDateTime.now());
    }

    /**
     * What happened inside one window.
     *
     * @param window TODAY, 7D, 30D or 90D. An unknown value is a 400 rather than a silent default —
     *               a typo returning a different period's numbers is worse than an error.
     */
    @GetMapping("/activity")
    public UserAnalyticsDtos.ActivitySummary activity(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                      @RequestParam(defaultValue = "7D") String window,
                                                      @RequestParam(required = false) String zone) {
        User user = authService.requireUser(authorization);
        return analytics.activity(user, window, zoneOf(zone), OffsetDateTime.now());
    }

    /** Weekly accuracy over recent history, plus the overall direction of the series. */
    @GetMapping("/trends")
    public UserAnalyticsDtos.TrendSeries trends(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                @RequestParam(defaultValue = "8") int weeks,
                                                @RequestParam(required = false) String zone) {
        User user = authService.requireUser(authorization);
        return analytics.trends(user, weeks, zoneOf(zone), OffsetDateTime.now());
    }

    /**
     * UTC when the client says nothing, and a 400 for a zone that does not exist — never a silent
     * fallback, which would report a streak computed against a different day boundary than the
     * one the caller asked for.
     */
    private static ZoneId zoneOf(String zone) {
        if (zone == null || zone.isBlank()) return ZoneId.of("UTC");
        try {
            return ZoneId.of(zone.trim());
            // DateTimeException covers both a malformed id and ZoneRulesException's
            // "well-formed but unknown region" — the latter is a subclass, so one catch.
        } catch (java.time.DateTimeException e) {
            throw new IllegalArgumentException("Unknown time zone '" + zone + "'");
        }
    }
}
