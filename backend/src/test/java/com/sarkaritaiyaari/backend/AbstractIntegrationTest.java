package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserToken;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import com.sarkaritaiyaari.backend.repository.UserTokenRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Runs against the real dev database (Neon) — there's no local/Testcontainers Postgres available
 * on this machine. Every question/exam/subject/topic created by a test is hard-deleted in
 * cleanup(), bypassing soft-delete where relevant, so the dev database (and the admin UI) stays
 * clean between runs. A dedicated "Automated Test" exam/subject/topic fixture is created once
 * (idempotently) and reused by every test that just needs *some* valid topic/exam to point at.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
abstract class AbstractIntegrationTest {

    protected static final String TEST_EXAM_CODE = "AUTOMATED_TEST";
    protected static final String TEST_SUBJECT_NAME = "Automated Test Subject";
    protected static final String TEST_TOPIC_NAME = "Automated Test Topic";
    protected static final String TEST_ADMIN_EMAIL = "automated-test-admin@sarkaritaiyaari.internal";

    @Autowired
    protected TestRestTemplate restTemplate;

    @Autowired
    protected QuestionRepository questionRepository;

    @Autowired
    protected ExamRepository examRepository;

    @Autowired
    protected SubjectRepository subjectRepository;

    @Autowired
    protected TopicRepository topicRepository;

    @Autowired
    protected UserRepository userRepository;

    @Autowired
    protected UserTokenRepository userTokenRepository;

    protected final List<UUID> createdIds = new ArrayList<>();
    protected final List<UUID> createdTopicIds = new ArrayList<>();
    protected final List<UUID> createdSubjectIds = new ArrayList<>();
    protected final List<String> createdExamCodes = new ArrayList<>();

    protected UUID testTopicId;
    private String adminToken;

    @BeforeEach
    void ensureTestFixtures() {
        if (!examRepository.existsById(TEST_EXAM_CODE)) {
            Exam exam = new Exam();
            exam.setCode(TEST_EXAM_CODE);
            exam.setName("Automated Test Exam");
            exam.setActive(false);
            exam.setDisplayOrder(999);
            examRepository.save(exam);
        }

        Subject subject = subjectRepository.findByNameIgnoreCase(TEST_SUBJECT_NAME)
                .orElseGet(() -> {
                    Subject s = new Subject();
                    s.setName(TEST_SUBJECT_NAME);
                    return subjectRepository.save(s);
                });

        Topic topic = topicRepository.findBySubjectIdAndNameIgnoreCase(subject.getId(), TEST_TOPIC_NAME)
                .orElseGet(() -> {
                    Topic t = new Topic();
                    t.setSubject(subject);
                    t.setName(TEST_TOPIC_NAME);
                    return topicRepository.save(t);
                });

        testTopicId = topic.getId();

        User admin = userRepository.findByEmail(TEST_ADMIN_EMAIL).orElseGet(() -> {
            User u = new User();
            u.setEmail(TEST_ADMIN_EMAIL);
            u.setPasswordHash("unused-in-tests"); // tests authenticate via a fabricated token, never a password
            u.setRole(Role.ADMIN);
            return userRepository.save(u);
        });

        UserToken token = new UserToken();
        token.setToken("test-admin-token-" + UUID.randomUUID());
        token.setUser(admin);
        token.setExpiresAt(OffsetDateTime.now().plusHours(1));
        userTokenRepository.save(token);
        adminToken = token.getToken();
    }

    @AfterEach
    void cleanup() {
        if (adminToken != null) {
            userTokenRepository.deleteById(adminToken);
            adminToken = null;
        }
        if (!createdIds.isEmpty()) {
            questionRepository.deleteAllById(createdIds);
            createdIds.clear();
        }
        if (!createdTopicIds.isEmpty()) {
            topicRepository.deleteAllById(createdTopicIds);
            createdTopicIds.clear();
        }
        if (!createdSubjectIds.isEmpty()) {
            subjectRepository.deleteAllById(createdSubjectIds);
            createdSubjectIds.clear();
        }
        if (!createdExamCodes.isEmpty()) {
            examRepository.deleteAllById(createdExamCodes);
            createdExamCodes.clear();
        }
    }

    /** An `Authorization: Bearer <admin token>` header with no body — for GET/DELETE. */
    protected HttpEntity<Void> adminAuth() {
        return adminAuth(null);
    }

    /** An `Authorization: Bearer <admin token>` header wrapping the given body — for POST/PUT. */
    protected <T> HttpEntity<T> adminAuth(T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + adminToken);
        return new HttpEntity<>(body, headers);
    }

    protected CreateQuestionRequest sampleRequest() {
        CreateQuestionRequest request = new CreateQuestionRequest();
        request.setCorrectAnswer("A");
        request.setTopicId(testTopicId);
        request.setDifficulty("easy");
        request.setExamCodes(List.of(TEST_EXAM_CODE));

        TranslationRequest en = new TranslationRequest();
        en.setLanguageCode("en");
        en.setQuestionText("Sample question text?");
        en.setOptions(List.of("One", "Two", "Three", "Four"));
        en.setExplanation("Because.");
        request.setTranslations(List.of(en));
        return request;
    }
}
