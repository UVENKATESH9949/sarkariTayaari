package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionGroupRequest;
import com.sarkaritaiyaari.backend.dto.CreateQuestionMediaRequest;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionGroupResponse;
import com.sarkaritaiyaari.backend.dto.QuestionGroupTranslationRequest;
import com.sarkaritaiyaari.backend.dto.QuestionMediaResponse;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionGroupRequest;
import com.sarkaritaiyaari.backend.dto.UpsertQuestionGroupTranslationRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2301 Phase P3 (shared content: groups, media, group-aware Mock Test assembly) —
 * verified against the real dev database, the same discipline every prior phase has used.
 */
class QuestionGroupsAndMediaTest extends AbstractIntegrationTest {

    private QuestionGroupResponse createAndTrackGroup(CreateQuestionGroupRequest request) {
        ResponseEntity<QuestionGroupResponse> response = restTemplate.exchange(
                "/api/question-groups", HttpMethod.POST, adminAuth(request), QuestionGroupResponse.class);
        assertThat(response.getStatusCode()).as(response.toString()).isEqualTo(HttpStatus.CREATED);
        QuestionGroupResponse created = response.getBody();
        createdGroupIds.add(created.getId());
        return created;
    }

    private QuestionResponse createAndTrackQuestion(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).as(response.toString()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }

    @Test
    void createsAGroupWithPassageTranslations() {
        CreateQuestionGroupRequest request = new CreateQuestionGroupRequest();
        request.setGroupType("PASSAGE");
        QuestionGroupTranslationRequest en = new QuestionGroupTranslationRequest();
        en.setLanguageCode("en");
        en.setPassageText("Read the following passage and answer the questions below.");
        request.setTranslations(List.of(en));

        QuestionGroupResponse created = createAndTrackGroup(request);

        assertThat(created.getGroupType()).isEqualTo("PASSAGE");
        assertThat(created.isDeleted()).isFalse();
        assertThat(created.getTranslations()).hasSize(1);
        assertThat(created.getTranslations().get(0).getPassageText())
                .isEqualTo("Read the following passage and answer the questions below.");
    }

    @Test
    void rejectsAnUnknownGroupType() {
        CreateQuestionGroupRequest request = new CreateQuestionGroupRequest();
        request.setGroupType("NOT_A_REAL_TYPE");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/question-groups", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void questionsCanJoinAGroupWithAnOrder() {
        QuestionGroupResponse group = createAndTrackGroup(passageGroupRequest());

        CreateQuestionRequest q1 = sampleRequest();
        q1.setQuestionGroupId(group.getId());
        q1.setGroupOrder(0);
        QuestionResponse created1 = createAndTrackQuestion(q1);

        CreateQuestionRequest q2 = sampleRequest();
        q2.setQuestionGroupId(group.getId());
        q2.setGroupOrder(1);
        QuestionResponse created2 = createAndTrackQuestion(q2);

        assertThat(created1.getQuestionGroupId()).isEqualTo(group.getId());
        assertThat(created1.getGroupOrder()).isEqualTo(0);
        assertThat(created2.getGroupOrder()).isEqualTo(1);
    }

    @Test
    void rejectsAnUnknownQuestionGroupId() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionGroupId(java.util.UUID.randomUUID());

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void updateCanMoveAQuestionOutOfItsGroup() {
        QuestionGroupResponse group = createAndTrackGroup(passageGroupRequest());
        CreateQuestionRequest createRequest = sampleRequest();
        createRequest.setQuestionGroupId(group.getId());
        createRequest.setGroupOrder(0);
        QuestionResponse created = createAndTrackQuestion(createRequest);

        var updateRequest = new com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest();
        updateRequest.setCorrectAnswer("A");
        updateRequest.setTopicId(testTopicId);
        updateRequest.setDifficulty("easy");
        updateRequest.setExamCodes(List.of(TEST_EXAM_CODE));
        updateRequest.setQuestionGroupId(null);

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + created.getId(), HttpMethod.PUT, adminAuth(updateRequest), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getQuestionGroupId()).isNull();
        assertThat(response.getBody().getGroupOrder()).isNull();
    }

    @Test
    void groupTranslationCanBeUpsertedAndGroupCanBeUpdatedAndDeleted() {
        QuestionGroupResponse group = createAndTrackGroup(passageGroupRequest());

        UpsertQuestionGroupTranslationRequest hiTranslation = new UpsertQuestionGroupTranslationRequest();
        hiTranslation.setPassageText("नीचे दिए गए अनुच्छेद को पढ़ें।");
        ResponseEntity<QuestionGroupResponse> upserted = restTemplate.exchange(
                "/api/question-groups/" + group.getId() + "/translations/hi", HttpMethod.PUT,
                adminAuth(hiTranslation), QuestionGroupResponse.class);
        assertThat(upserted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(upserted.getBody().getTranslations()).hasSize(2);

        UpdateQuestionGroupRequest updateRequest = new UpdateQuestionGroupRequest();
        updateRequest.setGroupType("DATA_INTERPRETATION");
        ResponseEntity<QuestionGroupResponse> updated = restTemplate.exchange(
                "/api/question-groups/" + group.getId(), HttpMethod.PUT, adminAuth(updateRequest), QuestionGroupResponse.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody().getGroupType()).isEqualTo("DATA_INTERPRETATION");

        ResponseEntity<Void> deleted = restTemplate.exchange(
                "/api/question-groups/" + group.getId(), HttpMethod.DELETE, adminAuth(), Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<QuestionGroupResponse> afterDelete = restTemplate.exchange(
                "/api/question-groups/" + group.getId(), HttpMethod.GET, adminAuth(), QuestionGroupResponse.class);
        assertThat(afterDelete.getBody().isDeleted()).isTrue();
    }

    @Test
    void mediaCanAttachToAQuestionOrAGroupButNotBoth() {
        QuestionResponse question = createAndTrackQuestion(sampleRequest());

        CreateQuestionMediaRequest bothOwners = new CreateQuestionMediaRequest();
        bothOwners.setQuestionId(question.getId());
        bothOwners.setQuestionGroupId(java.util.UUID.randomUUID());
        bothOwners.setMediaType("IMAGE");
        bothOwners.setUrl("https://example.com/diagram.png");
        ResponseEntity<String> rejected = restTemplate.exchange(
                "/api/question-media", HttpMethod.POST, adminAuth(bothOwners), String.class);
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        CreateQuestionMediaRequest neitherOwner = new CreateQuestionMediaRequest();
        neitherOwner.setMediaType("IMAGE");
        neitherOwner.setUrl("https://example.com/diagram.png");
        ResponseEntity<String> rejected2 = restTemplate.exchange(
                "/api/question-media", HttpMethod.POST, adminAuth(neitherOwner), String.class);
        assertThat(rejected2.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        CreateQuestionMediaRequest validRequest = new CreateQuestionMediaRequest();
        validRequest.setQuestionId(question.getId());
        validRequest.setMediaType("IMAGE");
        validRequest.setUrl("https://example.com/diagram.png");
        validRequest.setMimeType("image/png");
        ResponseEntity<QuestionMediaResponse> created = restTemplate.exchange(
                "/api/question-media", HttpMethod.POST, adminAuth(validRequest), QuestionMediaResponse.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdMediaIds.add(created.getBody().getId());

        ResponseEntity<QuestionResponse> reGet = restTemplate.exchange(
                "/api/questions/" + question.getId(), HttpMethod.GET, adminAuth(), QuestionResponse.class);
        assertThat(reGet.getBody().getMedia()).hasSize(1);
        assertThat(reGet.getBody().getMedia().get(0).getUrl()).isEqualTo("https://example.com/diagram.png");

        ResponseEntity<Void> deleted = restTemplate.exchange(
                "/api/question-media/" + created.getBody().getId(), HttpMethod.DELETE, adminAuth(), Void.class);
        assertThat(deleted.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<QuestionResponse> afterDelete = restTemplate.exchange(
                "/api/questions/" + question.getId(), HttpMethod.GET, adminAuth(), QuestionResponse.class);
        assertThat(afterDelete.getBody().getMedia()).isEmpty();
    }

    @Test
    void groupSyncEndpointReturnsACreatedGroup() {
        QuestionGroupResponse group = createAndTrackGroup(passageGroupRequest());

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/question-groups/sync?since=0&size=1000", HttpMethod.GET, null, Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> content = (List<Map<String, Object>>) response.getBody().get("content");
        assertThat(content.stream().anyMatch(g -> group.getId().toString().equals(g.get("id")))).isTrue();
    }

    /**
     * Capability negotiation (V29) — a client that declares nothing gets SINGLE_CHOICE only,
     * byte-identical to every client before any other type existed; a client that declares the
     * type it just saw gets it.
     */
    @Test
    void syncWithoutSupportedTypesOmitsANonSingleChoiceQuestion() {
        // A `since` just before creation, not epoch — the real bank has ~37,900 pre-existing
        // rows, and `since=0` ordered ascending by updatedAt would return the *oldest* page,
        // never reaching a row created just now. UTC (a trailing "Z"), not a "+05:30" offset —
        // a literal "+" in a URL query string is interpreted as a space.
        String since = java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).minusSeconds(5).toString();

        CreateQuestionRequest numeric = sampleRequest();
        numeric.setQuestionType("NUMERIC");
        numeric.setCorrectAnswer(null);
        numeric.setAnswerKey(Map.of("correctValue", 7));
        numeric.getTranslations().get(0).setOptions(List.of());
        QuestionResponse created = createAndTrackQuestion(numeric);

        ResponseEntity<Map> withoutTypes = restTemplate.exchange(
                "/api/questions/sync?since=" + since + "&size=1000", HttpMethod.GET, null, Map.class);
        assertThat(idsIn(withoutTypes)).doesNotContain(created.getId().toString());

        ResponseEntity<Map> withTypes = restTemplate.exchange(
                "/api/questions/sync?since=" + since + "&size=1000&supportedTypes=SINGLE_CHOICE,NUMERIC",
                HttpMethod.GET, null, Map.class);
        assertThat(idsIn(withTypes)).contains(created.getId().toString());
    }

    @Test
    void liveEndpointAlsoRespectsCapabilityNegotiation() {
        CreateQuestionRequest numeric = sampleRequest();
        numeric.setQuestionType("NUMERIC");
        numeric.setCorrectAnswer(null);
        numeric.setAnswerKey(Map.of("correctValue", 7));
        numeric.getTranslations().get(0).setOptions(List.of());
        QuestionResponse created = createAndTrackQuestion(numeric);

        ResponseEntity<Map> withoutTypes = restTemplate.exchange(
                "/api/questions/live?topicId=" + testTopicId + "&size=500", HttpMethod.GET, null, Map.class);
        assertThat(idsIn(withoutTypes)).doesNotContain(created.getId().toString());

        ResponseEntity<Map> withTypes = restTemplate.exchange(
                "/api/questions/live?topicId=" + testTopicId + "&size=500&supportedTypes=SINGLE_CHOICE,NUMERIC",
                HttpMethod.GET, null, Map.class);
        assertThat(idsIn(withTypes)).contains(created.getId().toString());
    }

    @SuppressWarnings("unchecked")
    private static List<String> idsIn(ResponseEntity<Map> response) {
        List<Map<String, Object>> content = (List<Map<String, Object>>) response.getBody().get("content");
        return content.stream().map(m -> (String) m.get("id")).toList();
    }

    /**
     * Group-aware Mock Test assembly (QuestionGroupAssembly) — a passage's three questions must
     * always appear together in a sampled set, never split, however the random pack lands.
     */
    @Test
    void mockSampleNeverSplitsAGroup() {
        QuestionGroupResponse group = createAndTrackGroup(passageGroupRequest());
        Set<java.util.UUID> groupQuestionIds = new java.util.HashSet<>();
        java.util.UUID subjectId = null;
        for (int i = 0; i < 3; i++) {
            CreateQuestionRequest request = sampleRequest();
            request.setQuestionGroupId(group.getId());
            request.setGroupOrder(i);
            QuestionResponse created = createAndTrackQuestion(request);
            groupQuestionIds.add(created.getId());
            // The response's own subjectId, not a re-fetched entity — the entity manager that
            // created this row is long closed by the time this test method runs, so a lazy
            // `.getTopic().getSubject()` navigation on a re-fetched entity would throw
            // LazyInitializationException outside a transaction.
            subjectId = created.getSubjectId();
        }

        // Run several times — the shuffle is random, so a single run passing wouldn't rule out
        // a real splitting bug that only shows up on some orderings.
        for (int attempt = 0; attempt < 15; attempt++) {
            ResponseEntity<QuestionResponse[]> response = restTemplate.getForEntity(
                    "/api/questions/mock-sample?examCode=" + TEST_EXAM_CODE + "&subjectIds=" + subjectId + "&limit=3",
                    QuestionResponse[].class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            List<java.util.UUID> sampledIds = List.of(response.getBody()).stream().map(QuestionResponse::getId).toList();
            long matchCount = sampledIds.stream().filter(groupQuestionIds::contains).count();
            // Either none of the group's questions were sampled (limit=3 exactly fits, but the
            // random unit shuffle may pick a different unit first if other content exists in
            // this subject) or all three were — never 1 or 2.
            assertThat(matchCount).isIn(0L, 3L);
        }
    }

    private CreateQuestionGroupRequest passageGroupRequest() {
        CreateQuestionGroupRequest request = new CreateQuestionGroupRequest();
        request.setGroupType("PASSAGE");
        QuestionGroupTranslationRequest en = new QuestionGroupTranslationRequest();
        en.setLanguageCode("en");
        en.setPassageText("Read the following passage and answer the questions below.");
        request.setTranslations(List.of(en));
        return request;
    }
}
