package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The sync endpoint always returns the entire question bank (paginated by updatedAt) —
 * clients filter by exam locally after syncing everything, so there's no examType param
 * anymore (see the content-model redesign notes in the requirements doc). Tests use a
 * "since = just before creating" cutoff rather than since=0, so assertions don't depend
 * on how much real data already exists in the dev database.
 */
class SyncEndpointTest extends AbstractIntegrationTest {

    @Test
    void sinceZero_returns200AndRespectsPageSize() {
        Map<?, ?> body = sync("0", 0, 10);
        assertThat(body.get("size")).isEqualTo(10);
        assertThat(((List<?>) body.get("content")).size()).isLessThanOrEqualTo(10);
    }

    @Test
    void deltaSync_onlyReturnsChangesAfterCutoff() throws InterruptedException {
        QuestionResponse older = createQuestion(sampleRequest());
        String cutoff = older.getUpdatedAt().toString();

        Thread.sleep(50); // guarantee a distinct updatedAt timestamp for the next write
        QuestionResponse newer = createQuestion(sampleRequest());

        Map<?, ?> body = sync(cutoff, 0, 500);
        List<UUID> ids = idsOf(body);
        assertThat(ids).contains(newer.getId());
        assertThat(ids).doesNotContain(older.getId());
    }

    @Test
    void deletedQuestions_areIncludedInSyncResults() {
        OffsetDateTime before = OffsetDateTime.now();
        QuestionResponse created = createQuestion(sampleRequest());
        restTemplate.exchange("/api/questions/" + created.getId(), HttpMethod.DELETE, adminAuth(), Void.class);

        Map<?, ?> body = sync(before.toString(), 0, 500);
        List<Map<?, ?>> content = (List<Map<?, ?>>) body.get("content");
        Map<?, ?> match = content.stream()
                .filter(q -> created.getId().toString().equals(q.get("id")))
                .findFirst().orElseThrow();
        assertThat(match.get("deleted")).isEqualTo(true);
    }

    @Test
    void invalidSinceFormat_returns400() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/api/questions/sync?since=not-a-date", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void pageSize_isRespected() {
        OffsetDateTime before = OffsetDateTime.now();
        for (int i = 0; i < 3; i++) {
            createQuestion(sampleRequest());
        }

        Map<?, ?> body = sync(before.toString(), 0, 2);
        List<?> content = (List<?>) body.get("content");
        assertThat(content).hasSize(2);
        assertThat(body.get("size")).isEqualTo(2);
    }

    private Map<?, ?> sync(String since, int page, int size) {
        // since often contains "+05:30" (a zone offset) — pass it as a URI template
        // variable rather than concatenating it into the string, so RestTemplate encodes
        // it exactly once. (Pre-encoding it ourselves double-encodes, since RestTemplate
        // also encodes template variables; leaving it raw lets the servlet container read
        // a literal "+" back as a space.)
        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/questions/sync?since={since}&page={page}&size={size}", Map.class, since, page, size);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private List<UUID> idsOf(Map<?, ?> pageBody) {
        List<Map<?, ?>> content = (List<Map<?, ?>>) pageBody.get("content");
        return content.stream().map(q -> UUID.fromString((String) q.get("id"))).toList();
    }

    private QuestionResponse createQuestion(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response =
                restTemplate.exchange("/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }
}
