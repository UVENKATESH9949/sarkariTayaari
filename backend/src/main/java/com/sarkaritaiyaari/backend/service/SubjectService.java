package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@Transactional
public class SubjectService {

    private final SubjectRepository subjectRepository;

    public SubjectService(SubjectRepository subjectRepository) {
        this.subjectRepository = subjectRepository;
    }

    public SubjectResponse create(SubjectRequest request) {
        if (subjectRepository.findByNameIgnoreCase(request.getName()).isPresent()) {
            throw new IllegalArgumentException("Subject already exists: " + request.getName());
        }
        Subject subject = new Subject();
        applyRequest(subject, request);
        return toResponse(subjectRepository.save(subject));
    }

    @Transactional(readOnly = true)
    public SubjectResponse get(UUID id) {
        return toResponse(getEntity(id));
    }

    @Transactional(readOnly = true)
    public List<SubjectResponse> list() {
        return subjectRepository.findAllByOrderByDisplayOrderAscNameAsc()
                .stream().map(SubjectService::toResponse).toList();
    }

    public SubjectResponse update(UUID id, SubjectRequest request) {
        Subject subject = getEntity(id);
        applyRequest(subject, request);
        return toResponse(subjectRepository.save(subject));
    }

    public void delete(UUID id) {
        if (!subjectRepository.existsById(id)) {
            throw new NoSuchElementException("Subject not found: " + id);
        }
        subjectRepository.deleteById(id);
    }

    private Subject getEntity(UUID id) {
        return subjectRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Subject not found: " + id));
    }

    private static void applyRequest(Subject subject, SubjectRequest request) {
        subject.setName(request.getName());
        subject.setDisplayOrder(request.getDisplayOrder());
        subject.setIcon(request.getIcon());
        subject.setColor(request.getColor());
        subject.setColorBg(request.getColorBg());
    }

    static SubjectResponse toResponse(Subject subject) {
        return new SubjectResponse(
                subject.getId(),
                subject.getName(),
                subject.getDisplayOrder(),
                subject.getIcon(),
                subject.getColor(),
                subject.getColorBg(),
                subject.getExams().stream().map(Exam::getCode).sorted().toList()
        );
    }
}
