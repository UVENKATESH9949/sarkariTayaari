package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.TopicProgressDtos;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.TopicProgressState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserTopicProgress;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Per-topic mastery sync (Epic L / TICKET-2105) — the prerequisite that unblocks Epics A,
 * C and D at once.
 *
 * <p>Modelled on {@link BookmarkService}, not {@link ProgressService}: mastery is mutable
 * state per (user, topic) rather than an append-only event, so each incoming row is applied
 * only if it is newer than what the server already has. That stops a stale replay from one
 * device undoing real progress recorded on another.
 */
@Service
@Transactional
public class TopicProgressService {

    private final UserTopicProgressRepository progress;
    private final TopicRepository topics;

    @PersistenceContext
    private EntityManager entityManager;

    public TopicProgressService(UserTopicProgressRepository progress, TopicRepository topics) {
        this.progress = progress;
        this.topics = topics;
    }

    /**
     * Applies an upload, skipping anything stale or illegal.
     *
     * <p>Lookups are batched up front — both the existing progress rows and the referenced
     * topics — rather than queried per row. This runs on every app foreground with as many
     * rows as the student has topics in flight, and the per-row version of this is the same
     * 1+N already fixed in {@link BookmarkService} and the bulk importer.
     */
    public TopicProgressDtos.SyncResponse upload(User user, TopicProgressDtos.SyncRequest request) {
        List<TopicProgressDtos.TopicProgress> incoming = request.getTopics();
        if (incoming.isEmpty()) {
            return new TopicProgressDtos.SyncResponse(0, 0);
        }

        List<String> ids = incoming.stream()
                .map(dto -> UserTopicProgress.idFor(user.getId(), dto.getTopicId()))
                .toList();
        Map<String, UserTopicProgress> existingById = progress.findAllById(ids).stream()
                .collect(Collectors.toMap(UserTopicProgress::getId, p -> p));

        Set<UUID> topicIds = incoming.stream()
                .map(TopicProgressDtos.TopicProgress::getTopicId)
                .collect(Collectors.toSet());
        Map<UUID, Topic> topicsById = topics.findAllById(topicIds).stream()
                .collect(Collectors.toMap(Topic::getId, t -> t));

        int stored = 0;
        int rejected = 0;

        for (TopicProgressDtos.TopicProgress dto : incoming) {
            TopicProgressState state = parseState(dto.getState());
            if (state == null) {
                rejected++;
                continue;
            }
            // A topic deleted server-side, or an id a client invented. Skipped rather than
            // failing the whole upload: one unknown topic must not block a student's other
            // progress from being stored.
            Topic topic = topicsById.get(dto.getTopicId());
            if (topic == null) {
                rejected++;
                continue;
            }
            // The DB CHECK enforces this too, but reaching it aborts the entire transaction
            // and loses every other row in the batch. Rejecting the one bad row here keeps
            // the rest of the upload intact.
            if (dto.getCorrectCount() > dto.getAttemptedCount()) {
                rejected++;
                continue;
            }

            String id = UserTopicProgress.idFor(user.getId(), dto.getTopicId());
            UserTopicProgress existing = existingById.get(id);

            if (existing != null) {
                if (!dto.getUpdatedAt().isAfter(existing.getUpdatedAt())) {
                    // Stale or a duplicate retry of something the server already has. The
                    // point of last-write-wins is to ignore this, not to let it roll state back.
                    continue;
                }
                if (!existing.getState().canTransitionTo(state)) {
                    rejected++;
                    continue;
                }
                // Already managed in this transaction — mutating is enough; Hibernate's
                // dirty checking picks it up at flush.
                apply(existing, dto, state);
            } else {
                UserTopicProgress row = new UserTopicProgress();
                row.setId(id);
                row.setUser(user);
                row.setTopic(topic);
                apply(row, dto, state);
                // persist() rather than save(): the id is manually assigned, so save() takes
                // the merge() path and issues its own redundant SELECT. Same fix as
                // BookmarkService.
                entityManager.persist(row);
            }
            stored++;
        }

        return new TopicProgressDtos.SyncResponse(stored, rejected);
    }

    private void apply(UserTopicProgress row, TopicProgressDtos.TopicProgress dto, TopicProgressState state) {
        row.setState(state);
        row.setAccuracyPercent(dto.getAccuracyPercent());
        row.setAttemptedCount(dto.getAttemptedCount());
        row.setCorrectCount(dto.getCorrectCount());
        row.setTotalTimeMs(dto.getTotalTimeMs());
        row.setLastPracticedAt(dto.getLastPracticedAt());
        row.setUpdatedAt(dto.getUpdatedAt());
    }

    /** Null for an unknown value, so the caller can reject the row rather than throw. */
    private static TopicProgressState parseState(String raw) {
        if (raw == null) return null;
        try {
            return TopicProgressState.valueOf(raw.trim().toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    @Transactional(readOnly = true)
    public TopicProgressDtos.RestoreResponse restore(User user) {
        List<TopicProgressDtos.RestoredTopicProgress> rows = progress.findAllForUser(user.getId()).stream()
                .map(TopicProgressService::toDto)
                .toList();
        return new TopicProgressDtos.RestoreResponse(rows);
    }

    private static TopicProgressDtos.RestoredTopicProgress toDto(UserTopicProgress row) {
        Topic topic = row.getTopic();
        return new TopicProgressDtos.RestoredTopicProgress(
                topic.getId(),
                topic.getName(),
                topic.getSubject().getId(),
                topic.getSubject().getName(),
                row.getState().name(),
                row.getAccuracyPercent(),
                row.getAttemptedCount(),
                row.getCorrectCount(),
                row.getTotalTimeMs(),
                row.getLastPracticedAt(),
                row.getUpdatedAt()
        );
    }
}
