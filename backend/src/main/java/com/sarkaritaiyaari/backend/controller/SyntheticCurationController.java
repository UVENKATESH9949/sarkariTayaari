package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.SyntheticCurationService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Seeds and removes synthetic Epic L curation data.
 *
 * <p>Two independent gates, both required: an admin token, and
 * {@code app.epic-l.synthetic-seed-enabled=true}. The flag alone would let an unauthenticated
 * caller rewrite content; the token alone would let a legitimate admin on a production
 * instance write demo data over real editorial work by clicking the wrong thing. Neither is
 * sufficient on its own, so both are enforced.
 *
 * <p>Under {@code /api/admin/} rather than beside the content endpoints, so it is obvious from
 * the path that this is an operational tool and not part of the product's API.
 */
@RestController
@RequestMapping("/api/admin/synthetic-curation")
public class SyntheticCurationController {

    private final AuthService authService;
    private final SyntheticCurationService synthetic;

    public SyntheticCurationController(AuthService authService, SyntheticCurationService synthetic) {
        this.authService = authService;
        this.synthetic = synthetic;
    }

    /** Whether seeding is currently possible, so a caller can check before attempting it. */
    @GetMapping("/status")
    public Map<String, Object> status(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return Map.of(
                "enabled", synthetic.isEnabled(),
                "marker", SyntheticCurationService.SYNTHETIC_MARKER);
    }

    @PostMapping("/seed")
    public Map<String, Object> seed(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return synthetic.seed();
    }

    @PostMapping("/purge")
    public Map<String, Object> purge(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return synthetic.purge();
    }
}
