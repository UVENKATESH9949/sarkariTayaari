package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.BulkDeleteRequest;
import com.sarkaritaiyaari.backend.dto.BulkDeleteResponse;
import com.sarkaritaiyaari.backend.dto.BulkImportQuestionRequest;
import com.sarkaritaiyaari.backend.dto.BulkImportRequest;
import com.sarkaritaiyaari.backend.dto.BulkImportResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.entity.Question;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class BulkOperationsTest extends AbstractIntegrationTest {

    @Test
    void bulkImport_allValid_createsEveryQuestion() {
        BulkImportRequest request = new BulkImportRequest();
        request.setQuestions(List.of(sampleBulkRequest("Bulk A?"), sampleBulkRequest("Bulk B?")));

        ResponseEntity<BulkImportResponse> response =
                restTemplate.postForEntity("/api/questions/bulk-import", request, BulkImportResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        BulkImportResponse body = response.getBody();
        assertThat(body.getCreatedCount()).isEqualTo(2);
        assertThat(body.getIds()).hasSize(2);
        assertThat(body.getFailures()).isEmpty();

        createdIds.addAll(body.getIds());
    }

    @Test
    void bulkImport_reusesExistingSubjectAndTopicByName_doesNotDuplicate() {
        long subjectCountBefore = subjectRepository.count();
        long topicCountBefore = topicRepository.count();

        BulkImportRequest request = new BulkImportRequest();
        request.setQuestions(List.of(sampleBulkRequest("Bulk Reuse?")));

        ResponseEntity<BulkImportResponse> response =
                restTemplate.postForEntity("/api/questions/bulk-import", request, BulkImportResponse.class);

        assertThat(response.getBody().getCreatedCount()).isEqualTo(1);
        createdIds.addAll(response.getBody().getIds());

        assertThat(subjectRepository.count()).isEqualTo(subjectCountBefore);
        assertThat(topicRepository.count()).isEqualTo(topicCountBefore);
    }

    @Test
    void bulkImport_oneBadItem_doesNotBlockTheOthers() {
        BulkImportQuestionRequest good = sampleBulkRequest("Bulk Good?");

        BulkImportQuestionRequest bad = sampleBulkRequest("Bulk Bad?");
        TranslationRequest badTranslation = new TranslationRequest();
        badTranslation.setLanguageCode("zz");
        badTranslation.setQuestionText("...");
        badTranslation.setOptions(List.of("1", "2", "3", "4"));
        bad.setTranslations(List.of(badTranslation));

        BulkImportRequest request = new BulkImportRequest();
        request.setQuestions(List.of(good, bad));

        ResponseEntity<BulkImportResponse> response =
                restTemplate.postForEntity("/api/questions/bulk-import", request, BulkImportResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        BulkImportResponse body = response.getBody();
        assertThat(body.getCreatedCount()).isEqualTo(1);
        assertThat(body.getFailures()).hasSize(1);
        assertThat(body.getFailures().get(0).getIndex()).isEqualTo(1);

        createdIds.addAll(body.getIds());
    }

    @Test
    void bulkImport_unknownExamCode_failsThatItemOnly() {
        BulkImportQuestionRequest badExam = sampleBulkRequest("Bulk Unknown Exam?");
        badExam.setExamCodes(List.of("NOT_A_REAL_EXAM"));

        BulkImportRequest request = new BulkImportRequest();
        request.setQuestions(List.of(badExam));

        ResponseEntity<BulkImportResponse> response =
                restTemplate.postForEntity("/api/questions/bulk-import", request, BulkImportResponse.class);

        assertThat(response.getBody().getCreatedCount()).isEqualTo(0);
        assertThat(response.getBody().getFailures()).hasSize(1);
        assertThat(response.getBody().getFailures().get(0).getError()).contains("NOT_A_REAL_EXAM");
    }

    @Test
    void bulkDelete_marksAllAsDeleted() {
        QuestionResponse first = createQuestion(sampleRequest());
        QuestionResponse second = createQuestion(sampleRequest());

        BulkDeleteRequest request = new BulkDeleteRequest();
        request.setIds(List.of(first.getId(), second.getId()));

        ResponseEntity<BulkDeleteResponse> response =
                restTemplate.postForEntity("/api/questions/bulk-delete", request, BulkDeleteResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getDeletedCount()).isEqualTo(2);

        Question reloaded = questionRepository.findById(first.getId()).orElseThrow();
        assertThat(reloaded.isDeleted()).isTrue();
    }

    private BulkImportQuestionRequest sampleBulkRequest(String questionText) {
        BulkImportQuestionRequest request = new BulkImportQuestionRequest();
        request.setCorrectAnswer("A");
        request.setSubjectName(TEST_SUBJECT_NAME);
        request.setTopicName(TEST_TOPIC_NAME);
        request.setDifficulty("easy");
        request.setExamCodes(List.of(TEST_EXAM_CODE));

        TranslationRequest en = new TranslationRequest();
        en.setLanguageCode("en");
        en.setQuestionText(questionText);
        en.setOptions(List.of("One", "Two", "Three", "Four"));
        en.setExplanation("Because.");
        request.setTranslations(List.of(en));
        return request;
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
