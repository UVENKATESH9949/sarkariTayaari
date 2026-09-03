package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.FollowedExamDtos;
import com.sarkaritaiyaari.backend.entity.FollowedExam;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.FollowedExamRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Mirrors {@link BookmarkService} exactly: a follow is mutable state, not an append-only
 * event, so each incoming row is applied only if it is newer than what the server
 * already has for that (user, exam) pair — last-write-wins on updated_at.
 */
@Service
@Transactional
public class FollowedExamService {

    private final FollowedExamRepository followedExams;

    @PersistenceContext
    private EntityManager entityManager;

    public FollowedExamService(FollowedExamRepository followedExams) {
        this.followedExams = followedExams;
    }

    public FollowedExamDtos.SyncResponse upload(User user, FollowedExamDtos.SyncRequest request) {
        List<String> ids = request.getExams().stream()
                .map(dto -> user.getId() + ":" + dto.getExamCode())
                .toList();
        Map<String, FollowedExam> existingById = followedExams.findAllById(ids).stream()
                .collect(Collectors.toMap(FollowedExam::getId, f -> f));

        int stored = 0;
        for (FollowedExamDtos.FollowedExam dto : request.getExams()) {
            String id = user.getId() + ":" + dto.getExamCode();
            FollowedExam existing = existingById.get(id);
            if (existing != null && !dto.getUpdatedAt().isAfter(existing.getUpdatedAt())) {
                continue;
            }

            if (existing != null) {
                existing.setDeleted(dto.isDeleted());
                existing.setUpdatedAt(dto.getUpdatedAt());
            } else {
                FollowedExam row = new FollowedExam();
                row.setId(id);
                row.setUser(user);
                row.setExamCode(dto.getExamCode());
                row.setDeleted(dto.isDeleted());
                row.setUpdatedAt(dto.getUpdatedAt());
                entityManager.persist(row);
            }
            stored++;
        }
        return new FollowedExamDtos.SyncResponse(stored);
    }

    @Transactional(readOnly = true)
    public FollowedExamDtos.RestoreResponse restore(User user) {
        var active = followedExams.findByUserIdAndDeletedFalse(user.getId()).stream()
                .map(FollowedExamService::toDto)
                .toList();
        return new FollowedExamDtos.RestoreResponse(active);
    }

    private static FollowedExamDtos.FollowedExam toDto(FollowedExam row) {
        FollowedExamDtos.FollowedExam dto = new FollowedExamDtos.FollowedExam();
        dto.setExamCode(row.getExamCode());
        dto.setDeleted(row.isDeleted());
        dto.setUpdatedAt(row.getUpdatedAt());
        return dto;
    }
}
