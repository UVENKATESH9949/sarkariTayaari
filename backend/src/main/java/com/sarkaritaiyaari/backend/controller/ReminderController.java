package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ReminderDtos.DispatchSummary;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.PushTokenRequest;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.ReminderRequest;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.ReminderResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ReminderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Exam Guide spec §8 "Reminder System". All user-facing routes require sign-in — a
 * reminder or a device token with no owner has nothing to be personal to. The dispatch
 * route is admin-only and meant for an external scheduler; see {@link ReminderService}'s
 * class comment for why it isn't a {@code @Scheduled} job.
 */
@RestController
public class ReminderController {

    private final ReminderService reminderService;
    private final AuthService authService;

    public ReminderController(ReminderService reminderService, AuthService authService) {
        this.reminderService = reminderService;
        this.authService = authService;
    }

    @PostMapping("/api/push-tokens")
    public ResponseEntity<Void> registerPushToken(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                   @Valid @RequestBody PushTokenRequest request) {
        User user = authService.requireUser(authorization);
        reminderService.registerPushToken(user, request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/reminders")
    public ResponseEntity<ReminderResponse> createReminder(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                             @Valid @RequestBody ReminderRequest request) {
        User user = authService.requireUser(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(reminderService.createReminder(user, request));
    }

    @GetMapping("/api/reminders")
    public List<ReminderResponse> listReminders(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        User user = authService.requireUser(authorization);
        return reminderService.listReminders(user);
    }

    @DeleteMapping("/api/reminders/{id}")
    public ResponseEntity<Void> cancelReminder(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                @PathVariable UUID id) {
        User user = authService.requireUser(authorization);
        reminderService.cancelReminder(user, id);
        return ResponseEntity.noContent().build();
    }

    /** Meant to be called by an external scheduler (Cloud Scheduler), not a person — see
     * ReminderService's class comment. Admin-token-protected since it's still a real write
     * (marks reminders sent) and a real outbound push to real devices. */
    @PostMapping("/api/admin/reminders/dispatch")
    public DispatchSummary dispatchDueReminders(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return reminderService.dispatchDueReminders();
    }
}
