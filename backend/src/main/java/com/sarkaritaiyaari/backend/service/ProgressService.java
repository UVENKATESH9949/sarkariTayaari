package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserMockAttempt;
import com.sarkaritaiyaari.backend.entity.UserMockAttemptResult;
import com.sarkaritaiyaari.backend.entity.UserPracticeSession;
import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import com.sarkaritaiyaari.backend.repository.UserMockAttemptRepository;
import com.sarkaritaiyaari.backend.repository.UserPracticeSessionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

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

    private final UserPracticeSessionRepository practiceSessions;
    private final UserMockAttemptRepository mockAttempts;

    public ProgressService(UserPracticeSessionRepository practiceSessions,
                           UserMockAttemptRepository mockAttempts) {
        this.practiceSessions = practiceSessions;
        this.mockAttempts = mockAttempts;
    }

    public ProgressDtos.SyncResponse upload(User user, ProgressDtos.SyncRequest request) {
        int sessions = 0;
        for (ProgressDtos.PracticeSession dto : request.getPracticeSessions()) {
            // save() on an existing id replaces it, which is what makes a retried upload
            // harmless rather than a source of duplicate history.
            practiceSessions.save(toEntity(user, dto));
            sessions++;
        }

        int attempts = 0;
        for (ProgressDtos.MockAttempt dto : request.getMockAttempts()) {
            mockAttempts.save(toEntity(user, dto));
            attempts++;
        }

        return new ProgressDtos.SyncResponse(sessions, attempts);
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

    /* ------------------------------------------------------------------ mapping */

    private static UserPracticeSession toEntity(User user, ProgressDtos.PracticeSession dto) {
        UserPracticeSession session = new UserPracticeSession();
        session.setId(dto.getId());
        session.setUser(user);
        session.setCompletedAt(dto.getCompletedAt());
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
            results.add(entity);
        }
        session.setResults(results);
        return session;
    }

    private static UserMockAttempt toEntity(User user, ProgressDtos.MockAttempt dto) {
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
            results.add(entity);
        }
        attempt.setResults(results);
        return attempt;
    }

    private static ProgressDtos.PracticeSession toDto(UserPracticeSession session) {
        ProgressDtos.PracticeSession dto = new ProgressDtos.PracticeSession();
        dto.setId(session.getId());
        dto.setCompletedAt(session.getCompletedAt());
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
            return out;
        }).toList());
        return dto;
    }
}
