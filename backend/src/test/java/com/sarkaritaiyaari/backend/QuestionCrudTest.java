package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.UpsertTranslationRequest;
import com.sarkaritaiyaari.backend.entity.Topic;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class QuestionCrudTest extends AbstractIntegrationTest {

    @Test
    void createThenGet_returnsSameData() {
        QuestionResponse created = createQuestion(sampleRequest());

        ResponseEntity<QuestionResponse> getResponse =
                restTemplate.getForEntity("/api/questions/" + created.getId(), QuestionResponse.class);

        assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(getResponse.getBody().getTopicName()).isEqualTo(TEST_TOPIC_NAME);
        assertThat(getResponse.getBody().getSubjectName()).isEqualTo(TEST_SUBJECT_NAME);
        assertThat(getResponse.getBody().getExamCodes()).containsExactly(TEST_EXAM_CODE);
        assertThat(getResponse.getBody().getTranslations()).hasSize(1);
        assertThat(getResponse.getBody().getTranslations().get(0).getLanguageCode()).isEqualTo("en");
    }

    @Test
    void update_changesCoreFields() {
        QuestionResponse created = createQuestion(sampleRequest());

        Topic otherTopic = new Topic();
        otherTopic.setSubject(topicRepository.findById(testTopicId).orElseThrow().getSubject());
        otherTopic.setName("Automated Test Topic (alt)");
        otherTopic = topicRepository.save(otherTopic);
        createdTopicIds.add(otherTopic.getId());

        UpdateQuestionRequest update = new UpdateQuestionRequest();
        update.setCorrectAnswer("B");
        update.setTopicId(otherTopic.getId());
        update.setDifficulty("hard");
        update.setExamCodes(List.of(TEST_EXAM_CODE));

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + created.getId(), HttpMethod.PUT, new HttpEntity<>(update), QuestionResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getTopicId()).isEqualTo(otherTopic.getId());
        assertThat(response.getBody().getDifficulty()).isEqualTo("hard");
        assertThat(response.getBody().getUpdatedAt()).isAfter(created.getUpdatedAt());
    }

    @Test
    void upsertTranslation_addsNewLanguageWithoutRemovingExisting() {
        QuestionResponse created = createQuestion(sampleRequest());

        UpsertTranslationRequest hi = new UpsertTranslationRequest();
        hi.setQuestionText("नमूना प्रश्न?");
        hi.setOptions(List.of("एक", "दो", "तीन", "चार"));
        hi.setExplanation("क्योंकि।");

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + created.getId() + "/translations/hi",
                HttpMethod.PUT, new HttpEntity<>(hi), QuestionResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getTranslations()).hasSize(2);
        assertThat(response.getBody().getTranslations())
                .extracting("languageCode")
                .containsExactlyInAnyOrder("en", "hi");
    }

    @Test
    void delete_softDeletes_stillReadableAsDeleted() {
        QuestionResponse created = createQuestion(sampleRequest());

        restTemplate.delete("/api/questions/" + created.getId());

        ResponseEntity<QuestionResponse> getResponse =
                restTemplate.getForEntity("/api/questions/" + created.getId(), QuestionResponse.class);

        assertThat(getResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(getResponse.getBody().isDeleted()).isTrue();
    }

    @Test
    void create_missingRootLanguage_returns400() {
        CreateQuestionRequest request = sampleRequest();
        TranslationRequest hiOnly = new TranslationRequest();
        hiOnly.setLanguageCode("hi");
        hiOnly.setQuestionText("...");
        hiOnly.setOptions(List.of("1", "2", "3", "4"));
        request.setTranslations(List.of(hiOnly));

        ResponseEntity<Map> response = restTemplate.postForEntity("/api/questions", request, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").toString()).contains("root language");
    }

    @Test
    void create_unknownLanguageCode_returns400() {
        CreateQuestionRequest request = sampleRequest();
        List<TranslationRequest> translations = new ArrayList<>(request.getTranslations());

        TranslationRequest unknown = new TranslationRequest();
        unknown.setLanguageCode("zz");
        unknown.setQuestionText("...");
        unknown.setOptions(List.of("1", "2", "3", "4"));
        translations.add(unknown);
        request.setTranslations(translations);

        ResponseEntity<Map> response = restTemplate.postForEntity("/api/questions", request, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").toString()).contains("zz");
    }

    @Test
    void create_unknownExamCode_returns400() {
        CreateQuestionRequest request = sampleRequest();
        request.setExamCodes(List.of("NOT_A_REAL_EXAM"));

        ResponseEntity<Map> response = restTemplate.postForEntity("/api/questions", request, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").toString()).contains("NOT_A_REAL_EXAM");
    }

    @Test
    void list_filtersByExamCode() {
        createQuestion(sampleRequest());

        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/questions?examCode=" + TEST_EXAM_CODE + "&size=200", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<?> content = (List<?>) response.getBody().get("content");
        assertThat(content).isNotEmpty();
    }

    private QuestionResponse createQuestion(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response =
                restTemplate.postForEntity("/api/questions", request, QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }
}
