package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserMockAttempt;
import com.sarkaritaiyaari.backend.entity.UserMockAttemptResult;
import com.sarkaritaiyaari.backend.entity.UserPracticeSession;
import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.UserMockAttemptRepository;
import com.sarkaritaiyaari.backend.repository.UserPracticeSessionRepository;
import com.sarkaritaiyaari.backend.repository.UserPracticeSessionResultRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Uploading and restoring a student's history.
 *
 * Everything here is append-only from the app's point of view — a session is written
 * once when it finishes and never edited — so there is no conflict resolution. An
 * upload either introduces a row or replaces an identical one.
 */
@Service
@Transactional
public class ProgressService {

    private static final Logger log = LoggerFactory.getLogger(ProgressService.class);

    private static final int MAX_HISTORY_PAGE_SIZE = 100;

    private final UserPracticeSessionRepository practiceSessions;
    private final UserMockAttemptRepository mockAttempts;
    private final UserPracticeSessionResultRepository practiceSessionResults;
    private final QuestionRepository questions;

    @PersistenceContext
    private EntityManager entityManager;

    public ProgressService(UserPracticeSessionRepository practiceSessions,
                           UserMockAttemptRepository mockAttempts,
                           UserPracticeSessionResultRepository practiceSessionResults,
                           QuestionRepository questions) {
        this.practiceSessions = practiceSessions;
        this.mockAttempts = mockAttempts;
        this.practiceSessionResults = practiceSessionResults;
        this.questions = questions;
    }

    /**
     * IDs here are assigned by the device, not the database, so Spring Data's {@code
     * save()} can't tell a brand-new row from an existing one without a lookup — for an
     * entity with an assigned (non-generated) id, {@code save()} always takes the
     * {@code merge()} path, which does its own {@code SELECT} first. Uploading many
     * sessions at once (a new phone restoring a long history, or exactly the load-test
     * seeding this was found during — see reports/12-load-test-data-seeding/) turned that
     * into one round trip per row, including every cascaded result row. Checking which
     * ids already exist once, up front, and calling {@code persist()} directly for the
     * (usual) brand-new ones skips that lookup entirely; only genuine retries — the
     * actual reason this needs to be idempotent — pay for a {@code merge()}.
     *
     * <h2>Ownership is checked, not assumed (TASK-2801)</h2>
     * That lookup used to ask only "does this id exist", not "whose is it" — and
     * {@link #toEntity} sets the row's user to the caller. So an upload naming an id owned by
     * somebody else {@code merge()}d over their row <em>and reassigned it to the caller</em>:
     * silent data loss for one account and corrupted history for the other. Reachable both by
     * accident (mobile generated {@code session-<millis>} ids, which two students can collide on)
     * and deliberately (those ids are trivially guessable).
     *
     * <p>Such an id is now skipped rather than merged, and named in the response. Skipping one
     * row rather than failing the batch is deliberate: the rest of a device's queue is
     * blameless, and rejecting all of it would strand a student's whole history behind one bad
     * id. The device keeps that row flagged unsynced and will retry it — honest, and strictly
     * better than the previous behaviour of succeeding by overwriting someone else.
     */
    public ProgressDtos.SyncResponse upload(User user, ProgressDtos.SyncRequest request) {
        Map<UUID, Classification> classifications = classifyIncomingQuestions(request);

        List<String> sessionIds = request.getPracticeSessions().stream().map(ProgressDtos.PracticeSession::getId).toList();
        Map<String, UUID> sessionOwners =
                sessionIds.isEmpty() ? Map.of() : ownersOf(practiceSessions.findIdOwners(sessionIds));

        int sessions = 0;
        List<String> rejectedSessionIds = new ArrayList<>();
        for (ProgressDtos.PracticeSession dto : request.getPracticeSessions()) {
            UUID owner = sessionOwners.get(dto.getId());
            if (owner != null && !owner.equals(user.getId())) {
                rejectedSessionIds.add(dto.getId());
                continue;
            }
            UserPracticeSession entity = toEntity(user, dto, classifications);
            if (owner != null) {
                entityManager.merge(entity);
            } else {
                entityManager.persist(entity);
            }
            sessions++;
        }

        List<String> attemptIds = request.getMockAttempts().stream().map(ProgressDtos.MockAttempt::getId).toList();
        Map<String, UUID> attemptOwners =
                attemptIds.isEmpty() ? Map.of() : ownersOf(mockAttempts.findIdOwners(attemptIds));

        int attempts = 0;
        List<String> rejectedAttemptIds = new ArrayList<>();
        for (ProgressDtos.MockAttempt dto : request.getMockAttempts()) {
            UUID owner = attemptOwners.get(dto.getId());
            if (owner != null && !owner.equals(user.getId())) {
                rejectedAttemptIds.add(dto.getId());
                continue;
            }
            UserMockAttempt entity = toEntity(user, dto, classifications);
            if (owner != null) {
                entityManager.merge(entity);
            } else {
                entityManager.persist(entity);
            }
            attempts++;
        }

        if (!rejectedSessionIds.isEmpty() || !rejectedAttemptIds.isEmpty()) {
            log.warn("progress.sync rejected ids owned by another account user={} sessions={} attempts={}",
                    user.getId(), rejectedSessionIds.size(), rejectedAttemptIds.size());
        }

        return new ProgressDtos.SyncResponse(sessions, attempts, rejectedSessionIds, rejectedAttemptIds);
    }

    /**
     * How a question was classified at the moment an answer was recorded (V47, TASK-2801).
     *
     * @param pyq boxed on purpose -- {@code null} is "the question is no longer in the bank, so
     *            we cannot say", which is a different fact from "not a previous-year question".
     */
    private record Classification(UUID topicId, UUID subjectId, String difficultyCode, Boolean pyq) {
    }

    /**
     * One lookup for every question referenced anywhere in the upload.
     *
     * <p>Batched rather than per-result: a restoring device can send hundreds of sessions at
     * once, and a query per answer is the 1+N shape this codebase has now fixed six times.
     *
     * <p>Classifying at upload time rather than at read time is the whole point -- it freezes
     * the classification against later content edits. It is not quite classification at
     * <em>answer</em> time: a device that practises offline for weeks while an admin re-tags a
     * question records the newer tagging. That window is narrow and bounded by how long a device
     * stays offline, whereas the case this fixes -- a retag months after everyone synced -- is
     * unbounded and was silently rewriting all of history.
     */
    private Map<UUID, Classification> classifyIncomingQuestions(ProgressDtos.SyncRequest request) {
        Set<UUID> ids = new HashSet<>();
        for (ProgressDtos.PracticeSession session : request.getPracticeSessions()) {
            for (ProgressDtos.PracticeResult r : session.getResults()) {
                if (r.getQuestionId() != null) ids.add(r.getQuestionId());
            }
        }
        for (ProgressDtos.MockAttempt attempt : request.getMockAttempts()) {
            for (ProgressDtos.MockResult r : attempt.getResults()) {
                if (r.getQuestionId() != null) ids.add(r.getQuestionId());
            }
        }
        if (ids.isEmpty()) return Map.of();

        Map<UUID, Classification> byId = new HashMap<>();
        for (Object[] row : questions.findClassifications(ids)) {
            byId.put((UUID) row[0],
                    new Classification((UUID) row[1], (UUID) row[2], (String) row[3], (Boolean) row[4]));
        }
        return byId;
    }

    /**
     * Writes the snapshot onto one attempt, leaving all four fields null when the question is no
     * longer in the bank. Null is the honest answer there and every reader treats it as unknown --
     * never as an "Other" bucket, which would invent a category the student never practised.
     */
    private static void applyClassification(Map<UUID, Classification> classifications, UUID questionId,
                                            java.util.function.Consumer<Classification> target) {
        Classification c = classifications.get(questionId);
        if (c != null) target.accept(c);
    }

    /**
     * Turns the repository's {@code [id, userId]} rows into a lookup.
     *
     * <p>Callers skip the query entirely for an empty id list rather than relying on a guard in
     * here — an upload carrying only practice sessions (or only mock attempts) passes nothing for
     * the other half, and that is the common case, not an edge case.
     */
    private static Map<String, UUID> ownersOf(List<Object[]> rows) {
        return rows.stream().collect(Collectors.toMap(r -> (String) r[0], r -> (UUID) r[1]));
    }

    @Transactional(readOnly = true)
    public ProgressDtos.RestoreResponse restore(User user) {
        List<ProgressDtos.PracticeSession> sessions =
                practiceSessions.findByUserIdOrderByCompletedAtDesc(user.getId())
                        .stream().map(ProgressService::toDto).toList();

        List<ProgressDtos.MockAttempt> attempts =
                mockAttempts.findByUserIdOrderByCompletedAtDesc(user.getId())
                        .stream().map(ProgressService::toDto).toList();

        return new ProgressDtos.RestoreResponse(sessions, attempts);
    }

    /* ------------------------------------------- Phase 3 (TASK-2601, web history/review) */

    @Transactional(readOnly = true)
    public Page<ProgressDtos.PracticeSessionSummary> listSessions(User user, int page, int size) {
        int clampedSize = Math.min(Math.max(size, 1), MAX_HISTORY_PAGE_SIZE);
        var pageable = PageRequest.of(page, clampedSize,
                Sort.by("completedAt").descending());
        return practiceSessions.findByUserId(user.getId(), pageable).map(ProgressService::toSummary);
    }

    /** 404s (via {@link NoSuchElementException}) for an unknown id or one owned by someone else — never distinguished. */
    @Transactional(readOnly = true)
    public ProgressDtos.PracticeSession getSession(User user, String id) {
        return practiceSessions.findByIdAndUserId(id, user.getId())
                .map(ProgressService::toDto)
                .orElseThrow(() -> new NoSuchElementException("No practice session " + id));
    }

    @Transactional(readOnly = true)
    public Page<ProgressDtos.MockAttemptSummary> listAttempts(User user, int page, int size) {
        int clampedSize = Math.min(Math.max(size, 1), MAX_HISTORY_PAGE_SIZE);
        var pageable = PageRequest.of(page, clampedSize,
                Sort.by("completedAt").descending());
        return mockAttempts.findByUserId(user.getId(), pageable).map(ProgressService::toSummary);
    }

    @Transactional(readOnly = true)
    public ProgressDtos.MockAttempt getAttempt(User user, String id) {
        return mockAttempts.findByIdAndUserId(id, user.getId())
                .map(ProgressService::toDto)
                .orElseThrow(() -> new NoSuchElementException("No mock attempt " + id));
    }

    /**
     * Revise's "Wrong Answers" tab. Deliberately not deduplicated by questionId here — the
     * caller accumulates pages and dedupes client-side, the same reduction mobile's own
     * {@code getWrongAnswers} already performs over its (locally unbounded) input list.
     */
    @Transactional(readOnly = true)
    public Page<ProgressDtos.WrongAnswerRow> listWrongAnswers(User user, int page, int size) {
        int clampedSize = Math.min(Math.max(size, 1), MAX_HISTORY_PAGE_SIZE);
        return practiceSessionResults.findWrongAnswers(user.getId(), PageRequest.of(page, clampedSize))
                .map(r -> new ProgressDtos.WrongAnswerRow(
                        r.getQuestionId(),
                        r.getSession().getSubjectName(),
                        r.getSession().getTopicName(),
                        r.getSession().getCompletedAt(),
                        r.getQuestionType(),
                        r.getResponse(),
                        r.getSelectedIndex(),
                        r.getCorrectIndex()));
    }

    /* ------------------------------------------------------------------ mapping */

    private static UserPracticeSession toEntity(User user, ProgressDtos.PracticeSession dto,
                                                Map<UUID, Classification> classifications) {
        UserPracticeSession session = new UserPracticeSession();
        session.setId(dto.getId());
        session.setUser(user);
        session.setCompletedAt(dto.getCompletedAt());
        // V47 / TASK-2801 — null-safe by construction: an older client omits all four and the
        // columns stay null, which every reader treats as "not recorded" rather than zero.
        session.setStartedAt(dto.getStartedAt());
        session.setDurationMs(dto.getDurationMs());
        session.setAvailableCount(dto.getAvailableCount());
        session.setExamCode(dto.getExamCode());
        session.setExamLabel(dto.getExamLabel());
        session.setSubjectName(dto.getSubjectName());
        session.setTopicName(dto.getTopicName());
        session.setLevelLabel(dto.getLevelLabel());
        session.setCorrectCount(dto.getCorrectCount());
        session.setTotalCount(dto.getTotalCount());

        List<UserPracticeSessionResult> results = new ArrayList<>();
        for (ProgressDtos.PracticeResult r : dto.getResults()) {
            UserPracticeSessionResult entity = new UserPracticeSessionResult();
            // Derived from the parent id so a re-upload replaces the same rows rather
            // than appending a second copy of every answer.
            entity.setId(dto.getId() + ":" + r.getOrderIndex());
            entity.setSession(session);
            entity.setOrderIndex(r.getOrderIndex());
            entity.setQuestionId(r.getQuestionId());
            entity.setSelectedIndex(r.getSelectedIndex());
            entity.setCorrectIndex(r.getCorrectIndex());
            entity.setCorrect(r.isCorrect());
            entity.setTimeMs(r.getTimeMs());
            // V26 / TASK-2301 Phase P2 Wave A. A client older than this release omits these —
            // defaulted the same way isPyq/pyqYear default on the question side (P1): every
            // such row is, by definition, a SINGLE_CHOICE answer, mirrored from the legacy
            // index columns rather than left null, so a reader never has to special-case it.
            entity.setQuestionType(r.getQuestionType() != null ? r.getQuestionType() : "SINGLE_CHOICE");
            entity.setResponse(r.getResponse() != null ? r.getResponse()
                    : r.getSelectedIndex() != null ? Map.of("selectedOption", r.getSelectedIndex()) : null);
            entity.setOutcome(r.getOutcome() != null ? r.getOutcome() : (r.isCorrect() ? "CORRECT" : "INCORRECT"));
            entity.setScoreFraction(r.getScoreFraction() != null ? r.getScoreFraction()
                    : (r.isCorrect() ? BigDecimal.ONE : BigDecimal.ZERO));
            // V47 / TASK-2801 — freeze the classification so a later retag cannot rewrite it.
            applyClassification(classifications, r.getQuestionId(), c -> {
                entity.setTopicId(c.topicId());
                entity.setSubjectId(c.subjectId());
                entity.setDifficultyCode(c.difficultyCode());
                entity.setPyq(c.pyq());
            });
            results.add(entity);
        }
        session.setResults(results);
        return session;
    }

    private static UserMockAttempt toEntity(User user, ProgressDtos.MockAttempt dto,
                                            Map<UUID, Classification> classifications) {
        UserMockAttempt attempt = new UserMockAttempt();
        attempt.setId(dto.getId());
        attempt.setUser(user);
        attempt.setExamCode(dto.getExamCode());
        attempt.setExamLabel(dto.getExamLabel());
        attempt.setStartedAt(dto.getStartedAt());
        attempt.setCompletedAt(dto.getCompletedAt());
        attempt.setDurationSeconds(dto.getDurationSeconds());
        attempt.setTimeTakenSeconds(dto.getTimeTakenSeconds());
        attempt.setMarksCorrect(dto.getMarksCorrect());
        attempt.setMarksWrong(dto.getMarksWrong());
        attempt.setTotalMarksScored(dto.getTotalMarksScored());
        attempt.setCorrectCount(dto.getCorrectCount());
        attempt.setWrongCount(dto.getWrongCount());
        attempt.setUnattemptedCount(dto.getUnattemptedCount());
        attempt.setTotalQuestions(dto.getTotalQuestions());

        List<UserMockAttemptResult> results = new ArrayList<>();
        for (ProgressDtos.MockResult r : dto.getResults()) {
            UserMockAttemptResult entity = new UserMockAttemptResult();
            entity.setId(dto.getId() + ":" + r.getOrderIndex());
            entity.setAttempt(attempt);
            entity.setOrderIndex(r.getOrderIndex());
            entity.setSubjectName(r.getSubjectName());
            entity.setQuestionId(r.getQuestionId());
            entity.setSelectedIndex(r.getSelectedIndex());
            entity.setCorrectIndex(r.getCorrectIndex());
            entity.setMarkedForReview(r.isMarkedForReview());
            entity.setTimeMs(r.getTimeMs());
            // V26 / TASK-2301 Phase P2 Wave A — same defaulting as the practice path above.
            // "Unattempted" derives from selectedIndex being null, matching V6's existing rule.
            entity.setQuestionType(r.getQuestionType() != null ? r.getQuestionType() : "SINGLE_CHOICE");
            entity.setResponse(r.getResponse() != null ? r.getResponse()
                    : r.getSelectedIndex() != null ? Map.of("selectedOption", r.getSelectedIndex()) : null);
            entity.setOutcome(r.getOutcome() != null ? r.getOutcome()
                    : r.getSelectedIndex() == null ? "UNATTEMPTED"
                    : r.getSelectedIndex().equals(r.getCorrectIndex()) ? "CORRECT" : "INCORRECT");
            entity.setScoreFraction(r.getScoreFraction() != null ? r.getScoreFraction()
                    : r.getSelectedIndex() != null && r.getSelectedIndex().equals(r.getCorrectIndex())
                            ? BigDecimal.ONE : BigDecimal.ZERO);
            // V47 / TASK-2801 — same snapshot as the practice path above.
            applyClassification(classifications, r.getQuestionId(), c -> {
                entity.setTopicId(c.topicId());
                entity.setSubjectId(c.subjectId());
                entity.setDifficultyCode(c.difficultyCode());
                entity.setPyq(c.pyq());
            });
            results.add(entity);
        }
        attempt.setResults(results);
        return attempt;
    }

    private static ProgressDtos.PracticeSessionSummary toSummary(UserPracticeSession session) {
        return new ProgressDtos.PracticeSessionSummary(
                session.getId(),
                session.getCompletedAt(),
                session.getExamLabel(),
                session.getSubjectName(),
                session.getTopicName(),
                session.getLevelLabel(),
                session.getCorrectCount(),
                session.getTotalCount());
    }

    private static ProgressDtos.MockAttemptSummary toSummary(UserMockAttempt attempt) {
        return new ProgressDtos.MockAttemptSummary(
                attempt.getId(),
                attempt.getExamCode(),
                attempt.getExamLabel(),
                attempt.getStartedAt(),
                attempt.getCompletedAt(),
                attempt.getDurationSeconds(),
                attempt.getTimeTakenSeconds(),
                attempt.getMarksCorrect(),
                attempt.getMarksWrong(),
                attempt.getTotalMarksScored(),
                attempt.getCorrectCount(),
                attempt.getWrongCount(),
                attempt.getUnattemptedCount(),
                attempt.getTotalQuestions());
    }

    private static ProgressDtos.PracticeSession toDto(UserPracticeSession session) {
        ProgressDtos.PracticeSession dto = new ProgressDtos.PracticeSession();
        dto.setId(session.getId());
        dto.setCompletedAt(session.getCompletedAt());
        // Returned on restore, not just accepted on upload — otherwise a new device would drop
        // the session's real duration and exam the moment it rebuilt its history, which is the
        // bug these four columns exist to stop.
        dto.setStartedAt(session.getStartedAt());
        dto.setDurationMs(session.getDurationMs());
        dto.setAvailableCount(session.getAvailableCount());
        dto.setExamCode(session.getExamCode());
        dto.setExamLabel(session.getExamLabel());
        dto.setSubjectName(session.getSubjectName());
        dto.setTopicName(session.getTopicName());
        dto.setLevelLabel(session.getLevelLabel());
        dto.setCorrectCount(session.getCorrectCount());
        dto.setTotalCount(session.getTotalCount());
        dto.setResults(session.getResults().stream().map(r -> {
            ProgressDtos.PracticeResult out = new ProgressDtos.PracticeResult();
            out.setOrderIndex(r.getOrderIndex());
            out.setQuestionId(r.getQuestionId());
            out.setSelectedIndex(r.getSelectedIndex());
            out.setCorrectIndex(r.getCorrectIndex());
            out.setCorrect(r.isCorrect());
            out.setTimeMs(r.getTimeMs());
            out.setQuestionType(r.getQuestionType());
            out.setResponse(r.getResponse());
            out.setOutcome(r.getOutcome());
            out.setScoreFraction(r.getScoreFraction());
            return out;
        }).toList());
        return dto;
    }

    private static ProgressDtos.MockAttempt toDto(UserMockAttempt attempt) {
        ProgressDtos.MockAttempt dto = new ProgressDtos.MockAttempt();
        dto.setId(attempt.getId());
        dto.setExamCode(attempt.getExamCode());
        dto.setExamLabel(attempt.getExamLabel());
        dto.setStartedAt(attempt.getStartedAt());
        dto.setCompletedAt(attempt.getCompletedAt());
        dto.setDurationSeconds(attempt.getDurationSeconds());
        dto.setTimeTakenSeconds(attempt.getTimeTakenSeconds());
        dto.setMarksCorrect(attempt.getMarksCorrect());
        dto.setMarksWrong(attempt.getMarksWrong());
        dto.setTotalMarksScored(attempt.getTotalMarksScored());
        dto.setCorrectCount(attempt.getCorrectCount());
        dto.setWrongCount(attempt.getWrongCount());
        dto.setUnattemptedCount(attempt.getUnattemptedCount());
        dto.setTotalQuestions(attempt.getTotalQuestions());
        dto.setResults(attempt.getResults().stream().map(r -> {
            ProgressDtos.MockResult out = new ProgressDtos.MockResult();
            out.setOrderIndex(r.getOrderIndex());
            out.setSubjectName(r.getSubjectName());
            out.setQuestionId(r.getQuestionId());
            out.setSelectedIndex(r.getSelectedIndex());
            out.setCorrectIndex(r.getCorrectIndex());
            out.setMarkedForReview(r.isMarkedForReview());
            out.setTimeMs(r.getTimeMs());
            out.setQuestionType(r.getQuestionType());
            out.setResponse(r.getResponse());
            out.setOutcome(r.getOutcome());
            out.setScoreFraction(r.getScoreFraction());
            return out;
        }).toList());
        return dto;
    }
}
