package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.ExamResponse;
import com.sarkaritaiyaari.backend.dto.ExamTopicResponse;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Epic L / TICKET-2101, 2102, 2103 — the topic model the Preparation Plan engine needs.
 *
 * Covers the parts a database constraint cannot: hierarchy cycles of any length,
 * prerequisite cycles of any length, cross-subject parents, and the full-replace
 * semantics of the exam topic map.
 */
class TopicModelTest extends AbstractIntegrationTest {

    @Autowired
    private ExamTopicRepository examTopicRepository;

    /** Keeps every fixture name/code unique per run — see createSubject for why. */
    private final String runId = UUID.randomUUID().toString().substring(0, 8);

    /**
     * Neither `exam_topics` nor `topic_prerequisites` cascades from `topics`, so the base
     * class's `topicRepository.deleteAllById(...)` would hit a foreign-key violation with
     * rows still pointing at these topics. JUnit runs a subclass @AfterEach *before* the
     * superclass one, so clearing the referencing rows here is enough — and doing it in
     * teardown rather than at the end of each test means a mid-test failure still cleans up.
     */
    @AfterEach
    void clearTopicReferences() {
        for (String examCode : createdExamCodes) {
            examTopicRepository.deleteByExamCode(examCode);
        }
        for (UUID topicId : createdTopicIds) {
            topicRepository.deletePrerequisiteEdges(topicId);
        }
    }

    /* ------------------------------------------------------------------ Hierarchy */

    @Test
    void topicParent_roundTripsAndDefaultsToNull() {
        UUID subjectId = createSubject("TopicModel Hierarchy");
        TopicResponse parent = createTopic(subjectId, "Arithmetic", null);
        assertThat(parent.getParentId()).isNull();

        TopicResponse child = createTopic(subjectId, "Percentage", parent.getId());
        assertThat(child.getParentId()).isEqualTo(parent.getId());
        assertThat(child.getParentName()).isEqualTo("Arithmetic");
    }

    @Test
    void topicCannotBeItsOwnParent() {
        UUID subjectId = createSubject("TopicModel SelfParent");
        TopicResponse topic = createTopic(subjectId, "Standalone", null);

        TopicRequest update = topicRequest(subjectId, "Standalone");
        update.setParentId(topic.getId());

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/topics/" + topic.getId(), HttpMethod.PUT, adminAuth(update), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void topicParentCycleIsRejected() {
        UUID subjectId = createSubject("TopicModel Cycle");
        TopicResponse grandparent = createTopic(subjectId, "Level A", null);
        TopicResponse parent = createTopic(subjectId, "Level B", grandparent.getId());
        TopicResponse child = createTopic(subjectId, "Level C", parent.getId());

        // Pointing the grandparent at its own descendant would close the loop, which no FK
        // or CHECK can catch — a recursive read of the tree would then never terminate.
        TopicRequest update = topicRequest(subjectId, "Level A");
        update.setParentId(child.getId());

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/topics/" + grandparent.getId(), HttpMethod.PUT, adminAuth(update), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void parentFromAnotherSubjectIsRejected() {
        UUID subjectA = createSubject("TopicModel SubjectA");
        UUID subjectB = createSubject("TopicModel SubjectB");
        TopicResponse foreignParent = createTopic(subjectA, "Foreign Parent", null);
        TopicResponse topic = createTopic(subjectB, "Local Topic", null);

        TopicRequest update = topicRequest(subjectB, "Local Topic");
        update.setParentId(foreignParent.getId());

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/topics/" + topic.getId(), HttpMethod.PUT, adminAuth(update), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* -------------------------------------------------------------- Prerequisites */

    @Test
    void prerequisites_roundTripAndNullLeavesThemUnchanged() {
        UUID subjectId = createSubject("TopicModel Prereq");
        TopicResponse basics = createTopic(subjectId, "Basic Percentage", null);
        TopicResponse advanced = createTopic(subjectId, "Profit and Loss", null);

        TopicRequest withPrereq = topicRequest(subjectId, "Profit and Loss");
        withPrereq.setPrerequisiteTopicIds(List.of(basics.getId()));
        ResponseEntity<TopicResponse> saved = restTemplate.exchange(
                "/api/topics/" + advanced.getId(), HttpMethod.PUT, adminAuth(withPrereq), TopicResponse.class);
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(saved.getBody().getPrerequisiteTopicIds()).containsExactly(basics.getId());

        // A request that omits the field entirely must not wipe curated edges — that's the
        // difference between "leave unchanged" (null) and "clear" (empty list).
        TopicRequest withoutField = topicRequest(subjectId, "Profit and Loss");
        ResponseEntity<TopicResponse> untouched = restTemplate.exchange(
                "/api/topics/" + advanced.getId(), HttpMethod.PUT, adminAuth(withoutField), TopicResponse.class);
        assertThat(untouched.getBody().getPrerequisiteTopicIds()).containsExactly(basics.getId());

        TopicRequest cleared = topicRequest(subjectId, "Profit and Loss");
        cleared.setPrerequisiteTopicIds(List.of());
        ResponseEntity<TopicResponse> emptied = restTemplate.exchange(
                "/api/topics/" + advanced.getId(), HttpMethod.PUT, adminAuth(cleared), TopicResponse.class);
        assertThat(emptied.getBody().getPrerequisiteTopicIds()).isEmpty();
    }

    @Test
    void indirectPrerequisiteCycleIsRejected() {
        UUID subjectId = createSubject("TopicModel PrereqCycle");
        TopicResponse a = createTopic(subjectId, "Cycle A", null);
        TopicResponse b = createTopic(subjectId, "Cycle B", null);
        TopicResponse c = createTopic(subjectId, "Cycle C", null);

        setPrerequisites(subjectId, b, "Cycle B", List.of(a.getId()));
        setPrerequisites(subjectId, c, "Cycle C", List.of(b.getId()));

        // A -> C would close A -> C -> B -> A. Only reachability catches this; getting it
        // wrong would make Epic D's sequencing loop rather than fail loudly.
        TopicRequest update = topicRequest(subjectId, "Cycle A");
        update.setPrerequisiteTopicIds(List.of(c.getId()));
        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/topics/" + a.getId(), HttpMethod.PUT, adminAuth(update), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* ------------------------------------------------------------- Exam topic map */

    @Test
    void examTopics_replaceWholesaleAndCarryWeightage() {
        UUID subjectId = createSubject("TopicModel ExamMap");
        TopicResponse first = createTopic(subjectId, "Mapped One", null);
        TopicResponse second = createTopic(subjectId, "Mapped Two", null);
        String examCode = createExam("TOPICMODEL_EXAM");

        assertThat(getExamTopics(examCode)).isEmpty();

        ExamTopicsRequest request = new ExamTopicsRequest();
        ExamTopicsRequest.Entry withWeight = new ExamTopicsRequest.Entry();
        withWeight.setTopicId(first.getId());
        withWeight.setWeightagePercent(new BigDecimal("12.50"));
        ExamTopicsRequest.Entry withoutWeight = new ExamTopicsRequest.Entry();
        withoutWeight.setTopicId(second.getId());
        request.setTopics(List.of(withWeight, withoutWeight));

        ResponseEntity<ExamTopicResponse[]> saved = restTemplate.exchange(
                "/api/exams/" + examCode + "/topics", HttpMethod.PUT, adminAuth(request), ExamTopicResponse[].class);
        assertThat(saved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(saved.getBody()).hasSize(2);

        ExamTopicResponse mappedFirst = List.of(saved.getBody()).stream()
                .filter(t -> t.topicId().equals(first.getId())).findFirst().orElseThrow();
        assertThat(mappedFirst.weightagePercent()).isEqualByComparingTo("12.50");
        ExamTopicResponse mappedSecond = List.of(saved.getBody()).stream()
                .filter(t -> t.topicId().equals(second.getId())).findFirst().orElseThrow();
        // Absent rather than defaulted to zero: "not assessed" and "worth 0%" differ.
        assertThat(mappedSecond.weightagePercent()).isNull();

        // Re-sending a shorter list replaces rather than merges, and re-sending a topic that
        // was already mapped must not trip the natural-key UNIQUE.
        ExamTopicsRequest replacement = new ExamTopicsRequest();
        ExamTopicsRequest.Entry keepFirst = new ExamTopicsRequest.Entry();
        keepFirst.setTopicId(first.getId());
        replacement.setTopics(List.of(keepFirst));
        restTemplate.exchange("/api/exams/" + examCode + "/topics", HttpMethod.PUT,
                adminAuth(replacement), ExamTopicResponse[].class);

        List<ExamTopicResponse> after = getExamTopics(examCode);
        assertThat(after).hasSize(1);
        assertThat(after.get(0).topicId()).isEqualTo(first.getId());
    }

    @Test
    void examTopics_rejectDuplicateAndUnknownTopic() {
        UUID subjectId = createSubject("TopicModel ExamMapErrors");
        TopicResponse topic = createTopic(subjectId, "Dup Candidate", null);
        String examCode = createExam("TOPICMODEL_ERR_EXAM");

        ExamTopicsRequest duplicate = new ExamTopicsRequest();
        ExamTopicsRequest.Entry one = new ExamTopicsRequest.Entry();
        one.setTopicId(topic.getId());
        ExamTopicsRequest.Entry two = new ExamTopicsRequest.Entry();
        two.setTopicId(topic.getId());
        duplicate.setTopics(List.of(one, two));
        // Without an explicit check the synthetic id silently collapses these into one row,
        // so the admin would see fewer topics saved than it sent, with no error.
        assertThat(restTemplate.exchange("/api/exams/" + examCode + "/topics", HttpMethod.PUT,
                adminAuth(duplicate), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        ExamTopicsRequest unknown = new ExamTopicsRequest();
        ExamTopicsRequest.Entry ghost = new ExamTopicsRequest.Entry();
        ghost.setTopicId(UUID.randomUUID());
        unknown.setTopics(List.of(ghost));
        assertThat(restTemplate.exchange("/api/exams/" + examCode + "/topics", HttpMethod.PUT,
                adminAuth(unknown), Map.class).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* ------------------------------------------------------------------- Fixtures */

    private List<ExamTopicResponse> getExamTopics(String examCode) {
        ResponseEntity<ExamTopicResponse[]> response = restTemplate.exchange(
                "/api/exams/" + examCode + "/topics", HttpMethod.GET, adminAuth(), ExamTopicResponse[].class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return List.of(response.getBody());
    }

    private void setPrerequisites(UUID subjectId, TopicResponse topic, String name, List<UUID> prerequisiteIds) {
        TopicRequest request = topicRequest(subjectId, name);
        request.setPrerequisiteTopicIds(prerequisiteIds);
        ResponseEntity<TopicResponse> response = restTemplate.exchange(
                "/api/topics/" + topic.getId(), HttpMethod.PUT, adminAuth(request), TopicResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private TopicRequest topicRequest(UUID subjectId, String name) {
        TopicRequest request = new TopicRequest();
        request.setSubjectId(subjectId);
        request.setName(name);
        request.setDisplayOrder(0);
        return request;
    }

    private TopicResponse createTopic(UUID subjectId, String name, UUID parentId) {
        TopicRequest request = topicRequest(subjectId, name);
        request.setParentId(parentId);
        ResponseEntity<TopicResponse> response = restTemplate.exchange(
                "/api/topics", HttpMethod.POST, adminAuth(request), TopicResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        // Registered newest-first: a child must be deleted before its parent, and the base
        // class deletes in list order.
        createdTopicIds.add(0, response.getBody().getId());
        return response.getBody();
    }

    /**
     * Names are suffixed with a per-run id because `subjects.name` and
     * `(topics.subject_id, name)` are UNIQUE. Reusing a leftover row instead would be worse
     * than colliding: a stale topic could arrive carrying a parent or prerequisites from an
     * earlier run and silently invalidate the assertions here.
     */
    private UUID createSubject(String name) {
        SubjectRequest request = new SubjectRequest();
        request.setName(name + " " + runId);
        request.setDisplayOrder(0);
        ResponseEntity<SubjectResponse> response = restTemplate.exchange(
                "/api/subjects", HttpMethod.POST, adminAuth(request), SubjectResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdSubjectIds.add(response.getBody().getId());
        return response.getBody().getId();
    }

    private String createExam(String codePrefix) {
        String code = codePrefix + "_" + runId.substring(0, 4);
        com.sarkaritaiyaari.backend.dto.ExamRequest request = new com.sarkaritaiyaari.backend.dto.ExamRequest();
        request.setCode(code);
        request.setName(code);
        request.setActive(false);
        request.setDisplayOrder(90);
        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams", HttpMethod.POST, adminAuth(request), ExamResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);
        return code;
    }
}
