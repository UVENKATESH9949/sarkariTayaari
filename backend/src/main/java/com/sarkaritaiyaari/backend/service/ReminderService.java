package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.DispatchSummary;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.PushTokenRequest;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.ReminderRequest;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.ReminderResponse;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.ImportantDate;
import com.sarkaritaiyaari.backend.entity.PushToken;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserReminder;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.ImportantDateRepository;
import com.sarkaritaiyaari.backend.repository.PushTokenRepository;
import com.sarkaritaiyaari.backend.repository.UserReminderRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Exam Guide spec §8 "Reminder System" — confirmed by grep before this was built: no
 * push-notification infrastructure existed anywhere in this repo, backend or mobile.
 *
 * <h2>Why dispatch is an endpoint, not a {@code @Scheduled} job</h2>
 * This backend is deployed to Cloud Run with {@code --max-instances=3} and, critically,
 * <b>scale-to-zero</b> (see {@code reports/14-cloud-run-deployment/}). A plain
 * {@code @Scheduled(fixedRate = ...)} method only fires while some instance happens to be
 * running — on a scale-to-zero service with no other traffic, that could be never. Building
 * one anyway would look correct in local dev (where the process is always running) and be
 * silently broken in the actual production deployment — exactly the shape of bug this
 * project's own history is full of catching. {@link #dispatchDueReminders()} is instead
 * exposed as an explicit, admin-token-protected endpoint
 * ({@code POST /api/admin/reminders/dispatch}), meant to be triggered by an external
 * scheduler (Google Cloud Scheduler hitting it on a cron is the intended production setup —
 * one more piece of one-time {@code gcloud} configuration, the same category as this
 * project's existing GitHub Actions repository variables, and out of scope for this pass to
 * provision). This also makes the feature testable via a direct curl, not a 15-minute wait.
 *
 * <h2>Delivery is best-effort</h2>
 * A reminder is marked {@code sent} once dispatch has attempted it, regardless of whether
 * Expo's push service accepted every token — retrying indefinitely against a token that
 * will never succeed (e.g. one for an uninstalled app) would otherwise loop forever. This
 * matches how push notifications are treated everywhere: a best-effort nudge, not a
 * guaranteed-delivery message.
 */
@Service
public class ReminderService {

    private static final Logger log = LoggerFactory.getLogger(ReminderService.class);
    private static final URI EXPO_PUSH_URI = URI.create("https://exp.host/--/api/v2/push/send");

    private final PushTokenRepository pushTokenRepository;
    private final UserReminderRepository reminderRepository;
    private final ExamRepository examRepository;
    private final ImportantDateRepository importantDateRepository;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ReminderService(PushTokenRepository pushTokenRepository,
                            UserReminderRepository reminderRepository,
                            ExamRepository examRepository,
                            ImportantDateRepository importantDateRepository) {
        this.pushTokenRepository = pushTokenRepository;
        this.reminderRepository = reminderRepository;
        this.examRepository = examRepository;
        this.importantDateRepository = importantDateRepository;
        this.httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    /* =================================================================== Push tokens */

    @Transactional
    public void registerPushToken(User user, PushTokenRequest request) {
        PushToken token = pushTokenRepository.findByUserIdAndExpoToken(user.getId(), request.expoToken())
                .orElseGet(() -> {
                    PushToken created = new PushToken();
                    created.setUser(user);
                    created.setExpoToken(request.expoToken());
                    created.setCreatedAt(OffsetDateTime.now());
                    return created;
                });
        token.setPlatform(request.platform());
        token.setLastSeenAt(OffsetDateTime.now());
        pushTokenRepository.save(token);
    }

    /* =================================================================== Reminders */

    @Transactional
    public ReminderResponse createReminder(User user, ReminderRequest request) {
        Exam exam = examRepository.findById(request.examCode())
                .orElseThrow(() -> new NoSuchElementException("Exam not found: " + request.examCode()));

        ImportantDate importantDate = null;
        if (request.importantDateId() != null) {
            importantDate = importantDateRepository.findById(request.importantDateId())
                    .orElseThrow(() -> new NoSuchElementException("Important date not found: " + request.importantDateId()));
            if (!importantDate.getRecruitmentCycle().getExam().getCode().equals(request.examCode())) {
                throw new IllegalArgumentException("That date does not belong to " + request.examCode());
            }
        }

        UserReminder reminder = new UserReminder();
        reminder.setUser(user);
        reminder.setExam(exam);
        reminder.setImportantDate(importantDate);
        reminder.setRemindAt(request.remindAt());
        reminder.setMessage(request.message());
        reminder.setSent(false);
        reminder.setCreatedAt(OffsetDateTime.now());
        return toResponse(reminderRepository.save(reminder));
    }

    @Transactional(readOnly = true)
    public List<ReminderResponse> listReminders(User user) {
        return reminderRepository.findByUserIdOrderByRemindAtAsc(user.getId()).stream()
                .map(ReminderService::toResponse)
                .toList();
    }

    @Transactional
    public void cancelReminder(User user, UUID id) {
        UserReminder reminder = reminderRepository.findByIdAndUserId(id, user.getId())
                .orElseThrow(() -> new NoSuchElementException("Reminder not found: " + id));
        reminderRepository.delete(reminder);
    }

    /* =================================================================== Dispatch */

    @Transactional
    public DispatchSummary dispatchDueReminders() {
        List<UserReminder> due = reminderRepository.findDue(OffsetDateTime.now());
        int sent = 0;
        int failed = 0;

        for (UserReminder reminder : due) {
            List<PushToken> tokens = pushTokenRepository.findByUserId(reminder.getUser().getId());
            // No registered device is a real non-delivery, not a vacuous success — the
            // summary's sent/failed split is meant to tell an operator whether reminders
            // are actually reaching anyone.
            boolean anySent = false;
            for (PushToken token : tokens) {
                if (sendPush(token.getExpoToken(), reminder.getExam().getName(), reminder.getMessage())) {
                    anySent = true;
                }
            }
            // Marked sent either way: a reminder past its remindAt with no working
            // destination is not something to keep retrying indefinitely (see the class
            // comment's "delivery is best-effort" note).
            reminder.setSent(true);
            reminderRepository.save(reminder);
            if (anySent) sent++;
            else failed++;
        }

        return new DispatchSummary(due.size(), sent, failed);
    }

    /** One push, one token. Never throws — a failed send degrades to "not delivered", not a
     * dispatch-run failure, since one bad token must not stop every other reminder firing. */
    private boolean sendPush(String expoToken, String title, String body) {
        try {
            String payload = objectMapper.writeValueAsString(
                    List.of(Map.of("to", expoToken, "title", title, "body", body)));
            HttpRequest request = HttpRequest.newBuilder(EXPO_PUSH_URI)
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Expo push send returned HTTP {}: {}", response.statusCode(), response.body());
                return false;
            }
            JsonNode body2 = objectMapper.readTree(response.body());
            JsonNode status = body2.path("data").isArray() && body2.path("data").size() > 0
                    ? body2.path("data").get(0).path("status")
                    : null;
            boolean ok = status != null && "ok".equals(status.asText());
            if (!ok) log.warn("Expo push rejected token: {}", response.body());
            return ok;
        } catch (Exception e) {
            log.warn("Expo push send failed", e);
            return false;
        }
    }

    private static ReminderResponse toResponse(UserReminder reminder) {
        return new ReminderResponse(
                reminder.getId(),
                reminder.getExam().getCode(),
                reminder.getImportantDate() != null ? reminder.getImportantDate().getId() : null,
                reminder.getRemindAt(),
                reminder.getMessage(),
                reminder.isSent());
    }
}
