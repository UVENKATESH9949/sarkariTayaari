package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
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
        return toResponse(topicRepository.save(topic));
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
        return new TopicResponse(
                topic.getId(),
                topic.getSubject().getId(),
                topic.getSubject().getName(),
                topic.getName(),
                topic.getDisplayOrder()
        );
    }
}
