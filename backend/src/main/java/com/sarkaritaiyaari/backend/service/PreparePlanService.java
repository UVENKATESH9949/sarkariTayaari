package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.PrepareTopicItem;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.PreparePlanResponse;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.entity.TopicProgressState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserTopicProgress;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

/**
 * Exam Guide spec §22 "Personalized Preparation Roadmap" — the app's own Doc 1 audit found
 * the spec assumes a "Roadmap module" that contradicts this app's actual IA (a tab bar, no
 * such section), so this is built as an enhancement to the existing Prepare section instead
 * of a new module: an ordered study checklist derived entirely from Epic L's already-computed
 * topic priority and mastery data, not a new intelligence model.
 *
 * <p>Deliberately its own service rather than folded into {@link ExamGuideService} or
 * {@link TopicIntelligenceService}: it reads Epic L's tables for a different purpose (an
 * ordered checklist, not a scored dashboard) and touches none of either service's own
 * responsibilities.
 */
@Service
@Transactional(readOnly = true)
public class PreparePlanService {

    private final ExamRepository examRepository;
    private final TopicPriorityRepository topicPriorityRepository;
    private final TopicRepository topicRepository;
    private final UserTopicProgressRepository userTopicProgressRepository;
    private final QuestionRepository questionRepository;

    public PreparePlanService(ExamRepository examRepository,
                               TopicPriorityRepository topicPriorityRepository,
                               TopicRepository topicRepository,
                               UserTopicProgressRepository userTopicProgressRepository,
                               QuestionRepository questionRepository) {
        this.examRepository = examRepository;
        this.topicPriorityRepository = topicPriorityRepository;
        this.topicRepository = topicRepository;
        this.userTopicProgressRepository = userTopicProgressRepository;
        this.questionRepository = questionRepository;
    }

    public PreparePlanResponse getPreparePlan(String examCode, User user) {
        if (!examRepository.existsById(examCode)) {
            throw new NoSuchElementException("Exam not found: " + examCode);
        }

        // Already ordered finalPriority desc nulls last, topic name asc, and already
        // join-fetches topic + subject — the same query TopicIntelligenceService's read
        // path uses. Only SCORED topics are eligible for a study checklist: an
        // exam_topics row with nothing computed yet has nothing to rank it by.
        List<TopicPriority> allPriorities =
                topicPriorityRepository.findForExamAndVersion(examCode, TopicIntelligenceService.ALGORITHM_VERSION);
        if (allPriorities.isEmpty()) {
            return new PreparePlanResponse(examCode, List.of());
        }

        // Curated priority (weightage/trend) is scored independently of how many questions
        // this exam actually has tagged for a topic — coverage is only one of several
        // inputs to the score, not a gate on it (see the priority formula's own comment).
        // A topic can therefore rank #1 by priority while having zero practice questions
        // behind it for this exam: found via on-device testing of the diagnostic test
        // (§21), which hit exactly this for most exams. A checklist item nobody can
        // actually practice is worse than not listing it, so it is excluded here rather
        // than surfaced with nothing behind it.
        Map<UUID, Long> questionCounts = new HashMap<>();
        for (Object[] row : questionRepository.countByTopicForExam(examCode)) {
            questionCounts.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        List<TopicPriority> priorities = allPriorities.stream()
                .filter(p -> questionCounts.getOrDefault(p.getTopic().getId(), 0L) > 0)
                .toList();
        if (priorities.isEmpty()) {
            return new PreparePlanResponse(examCode, List.of());
        }

        Set<UUID> topicIds = new HashSet<>();
        for (TopicPriority p : priorities) topicIds.add(p.getTopic().getId());

        // Prerequisites: one fetch-joined query for the whole checklist rather than 1+N —
        // see the repository method's own comment.
        Map<UUID, Topic> topicsWithPrereqs = new HashMap<>();
        for (Topic t : topicRepository.findByIdInWithPrerequisites(topicIds)) {
            topicsWithPrereqs.put(t.getId(), t);
        }

        // Anonymous callers get every topic's mastery as null ("not started" client-side) —
        // same anonymous-degrades-gracefully rule ExamGuideController already applies to
        // document status.
        Map<UUID, TopicProgressState> stateByTopic = new HashMap<>();
        if (user != null) {
            for (UserTopicProgress progress : userTopicProgressRepository.findAllForUser(user.getId())) {
                if (topicIds.contains(progress.getTopic().getId())) {
                    stateByTopic.put(progress.getTopic().getId(), progress.getState());
                }
            }
        }

        List<PrepareTopicItem> items = new java.util.ArrayList<>();
        boolean recommendedAssigned = false;

        for (TopicPriority p : priorities) {
            Topic topic = p.getTopic();
            TopicProgressState state = stateByTopic.get(topic.getId());

            Topic withPrereqs = topicsWithPrereqs.get(topic.getId());
            boolean prerequisitesMet = withPrereqs == null || withPrereqs.getPrerequisites().isEmpty()
                    || withPrereqs.getPrerequisites().stream()
                            .allMatch(prereq -> stateByTopic.get(prereq.getId()) == TopicProgressState.MASTERED);

            boolean isMastered = state == TopicProgressState.MASTERED;
            boolean recommended = !recommendedAssigned && !isMastered && prerequisitesMet;
            if (recommended) recommendedAssigned = true;

            items.add(new PrepareTopicItem(
                    topic.getId(),
                    topic.getName(),
                    topic.getSubject().getName(),
                    p.getFinalPriority(),
                    state != null ? state.name() : null,
                    prerequisitesMet,
                    recommended));
        }

        return new PreparePlanResponse(examCode, items);
    }
}
