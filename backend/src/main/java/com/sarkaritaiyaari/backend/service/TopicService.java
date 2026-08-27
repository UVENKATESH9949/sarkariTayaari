package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

@Service
@Transactional
public class TopicService {

    private final TopicRepository topicRepository;
    private final SubjectRepository subjectRepository;

    public TopicService(TopicRepository topicRepository, SubjectRepository subjectRepository) {
        this.topicRepository = topicRepository;
        this.subjectRepository = subjectRepository;
    }

    public TopicResponse create(TopicRequest request) {
        Subject subject = requireSubject(request.getSubjectId());
        if (topicRepository.findBySubjectIdAndNameIgnoreCase(subject.getId(), request.getName()).isPresent()) {
            throw new IllegalArgumentException("Topic already exists under this subject: " + request.getName());
        }
        Topic topic = new Topic();
        topic.setSubject(subject);
        topic.setName(request.getName());
        topic.setDisplayOrder(request.getDisplayOrder());
        applyParent(topic, request.getParentId());
        applyPrerequisites(topic, request.getPrerequisiteTopicIds());
        return toResponse(topicRepository.save(topic));
    }

    @Transactional(readOnly = true)
    public TopicResponse get(UUID id) {
        return toResponse(getEntity(id));
    }

    @Transactional(readOnly = true)
    public List<TopicResponse> list(UUID subjectId) {
        List<Topic> topics = subjectId != null
                ? topicRepository.findBySubjectIdOrderByDisplayOrderAscNameAsc(subjectId)
                : topicRepository.findAllByOrderByDisplayOrderAscNameAsc();
        return topics.stream().map(TopicService::toResponse).toList();
    }

    public TopicResponse update(UUID id, TopicRequest request) {
        Topic topic = getEntity(id);
        topic.setSubject(requireSubject(request.getSubjectId()));
        topic.setName(request.getName());
        topic.setDisplayOrder(request.getDisplayOrder());
        applyParent(topic, request.getParentId());
        applyPrerequisites(topic, request.getPrerequisiteTopicIds());
        return toResponse(topicRepository.save(topic));
    }

    /* ------------------------------------------------ Hierarchy and prerequisites */

    /**
     * Sets the parent, rejecting anything that would make the tree invalid. The database
     * cannot express these: a FK allows any existing topic, and a CHECK can only catch the
     * one-node case.
     */
    private void applyParent(Topic topic, UUID parentId) {
        if (parentId == null) {
            topic.setParent(null);
            return;
        }
        Topic parent = topicRepository.findById(parentId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown parentId: " + parentId));
        if (topic.getId() != null && parentId.equals(topic.getId())) {
            throw new IllegalArgumentException("A topic cannot be its own parent");
        }
        // Walking up from the proposed parent must never reach this topic, or the tree
        // becomes a cycle and any recursive read of it never terminates.
        for (Topic ancestor = parent; ancestor != null; ancestor = ancestor.getParent()) {
            if (ancestor.getId().equals(topic.getId())) {
                throw new IllegalArgumentException("That parent would create a cycle in the topic hierarchy");
            }
        }
        if (!parent.getSubject().getId().equals(topic.getSubject().getId())) {
            throw new IllegalArgumentException("A topic's parent must belong to the same subject");
        }
        topic.setParent(parent);
    }

    /**
     * Full replacement, mirroring the exam-syllabus endpoint. A null list means "leave
     * unchanged" so a client that predates this field can't silently wipe curated edges;
     * an empty list is an explicit clear.
     */
    private void applyPrerequisites(Topic topic, List<UUID> prerequisiteTopicIds) {
        if (prerequisiteTopicIds == null) return;

        Set<Topic> resolved = new LinkedHashSet<>();
        for (UUID prerequisiteId : prerequisiteTopicIds) {
            if (topic.getId() != null && prerequisiteId.equals(topic.getId())) {
                throw new IllegalArgumentException("A topic cannot be its own prerequisite");
            }
            resolved.add(topicRepository.findById(prerequisiteId)
                    .orElseThrow(() -> new IllegalArgumentException("Unknown prerequisiteTopicId: " + prerequisiteId)));
        }
        // Prerequisites form a directed graph, so a cycle can be arbitrarily long
        // (A needs B, B needs C, C needs A). Only reachability catches that, and getting it
        // wrong would make Epic D's sequencing loop forever rather than fail loudly here.
        if (topic.getId() != null) {
            for (Topic candidate : resolved) {
                if (dependsOn(candidate, topic.getId(), new HashSet<>())) {
                    throw new IllegalArgumentException(
                            "That prerequisite would create a cycle: " + candidate.getName() + " already depends on this topic");
                }
            }
        }
        topic.setPrerequisites(resolved);
    }

    /** Depth-first reachability over the prerequisite graph, guarding against pre-existing cycles. */
    private boolean dependsOn(Topic topic, UUID targetId, Set<UUID> visited) {
        if (!visited.add(topic.getId())) return false;
        for (Topic prerequisite : topic.getPrerequisites()) {
            if (prerequisite.getId().equals(targetId) || dependsOn(prerequisite, targetId, visited)) {
                return true;
            }
        }
        return false;
    }

    public void delete(UUID id) {
        if (!topicRepository.existsById(id)) {
            throw new NoSuchElementException("Topic not found: " + id);
        }
        topicRepository.deleteById(id);
    }

    private Topic getEntity(UUID id) {
        return topicRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Topic not found: " + id));
    }

    private Subject requireSubject(UUID subjectId) {
        return subjectRepository.findById(subjectId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown subjectId: " + subjectId));
    }

    private static TopicResponse toResponse(Topic topic) {
        Topic parent = topic.getParent();
        return new TopicResponse(
                topic.getId(),
                topic.getSubject().getId(),
                topic.getSubject().getName(),
                topic.getName(),
                topic.getDisplayOrder(),
                parent != null ? parent.getId() : null,
                parent != null ? parent.getName() : null,
                topic.getPrerequisites().stream().map(Topic::getId).toList()
        );
    }
}
