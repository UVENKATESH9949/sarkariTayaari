package com.sarkaritaiyaari.backend.entitlement;

import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Decides whether a user holds a {@link Capability}.
 *
 * <p><strong>There is no subscription system in this project</strong>, and this class does not
 * invent one. {@code questions.is_premium} has existed since V2 and is read by nothing; the admin
 * form that sets it says so on its own label. Building payments to satisfy a video feature would
 * be the wrong order of work.
 *
 * <p>So this is the seam, not the mechanism. Today the answer comes from configuration
 * ({@code app.entitlements.ai-video-open-to-all}, default true), which means nothing is locked
 * while the feature is being built, and flipping one value locks it. When real entitlements
 * exist - a plan on the user, a purchase table, a store receipt - only this class changes; every
 * caller already asks the right question.
 *
 * <p>Admins always hold every capability, so a reviewer can watch an unpublished video without
 * needing a subscription.
 */
@Service
public class EntitlementService {

    private final boolean aiVideoOpenToAll;

    public EntitlementService(
            @Value("${app.entitlements.ai-video-open-to-all:true}") boolean aiVideoOpenToAll) {
        this.aiVideoOpenToAll = aiVideoOpenToAll;
    }

    public boolean has(User user, Capability capability) {
        if (user == null) {
            return false;
        }
        if (user.getRole() == Role.ADMIN || user.getRole() == Role.REVIEWER) {
            return true;
        }
        return switch (capability) {
            case AI_VIDEO -> aiVideoOpenToAll;
        };
    }

    /** True when this deployment is currently gating video behind an entitlement nobody has. */
    public boolean isAiVideoGated() {
        return !aiVideoOpenToAll;
    }
}
