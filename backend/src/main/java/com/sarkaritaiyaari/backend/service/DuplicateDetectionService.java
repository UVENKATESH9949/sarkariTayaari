package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.Question;
import com.sarkaritaiyaari.backend.entity.QuestionDuplicate;
import com.sarkaritaiyaari.backend.entity.QuestionTranslation;
import com.sarkaritaiyaari.backend.repository.QuestionDuplicateRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Server-side duplicate detection (Epic L / TICKET-2109).
 *
 * <p>Closes the gap the §18.2 audit found: the only dedup in the project was
 * {@code admin/src/validateQuestions.js} — exact-lowercased-text, <em>within the pasted
 * batch only</em>, warning-only, never checked against the existing bank. With ~37,900
 * questions already stored and bulk import as the main ingestion path, a re-pasted file
 * silently doubled content and nothing anywhere would notice.
 *
 * <p>Detection records a relationship and never deletes. Supplied §14 requires this, and it
 * is the right call: two questions can share wording and still be genuinely different, and
 * an automatic delete of real editorial content is unrecoverable.
 */
@Service
@Transactional
public class DuplicateDetectionService {

    private static final String ROOT_LANGUAGE = "en";

    /** Exact normalised-text match, so similarity is 100 by construction. */
    private static final BigDecimal EXACT_SIMILARITY = new BigDecimal("100.00");

    private final QuestionRepository questionRepository;
    private final QuestionDuplicateRepository duplicates;

    @PersistenceContext
    private EntityManager entityManager;

    public DuplicateDetectionService(QuestionRepository questionRepository,
                                      QuestionDuplicateRepository duplicates) {
        this.questionRepository = questionRepository;
        this.duplicates = duplicates;
    }

    /**
     * The digest stored on {@code questions.content_fingerprint}.
     *
     * <p><strong>MD5 here is not a security choice</strong> — it is a content fingerprint,
     * and it specifically matches Postgres's built-in {@code md5()}, which V13's backfill
     * uses to fingerprint the ~37,900 pre-existing rows. Stock Postgres has no SHA without
     * enabling pgcrypto, and a migration is the wrong place to require an extension. If the
     * two sides ever disagree on either the hash or the normalisation, old and new rows stop
     * comparing equal and detection silently stops working for everything imported before
     * this ticket — so both halves are pinned deliberately.
     *
     * <p>Normalisation is lowercase, then strip everything that is not a letter or digit.
     * That is what makes {@code "What is 5 + 7?"} and {@code "what is 5+7 ?"} collide;
     * near-identical whitespace and punctuation variants are exactly how re-pasted files and
     * the load-test filler differ from each other.
     */
    public static String fingerprint(String questionText) {
        if (questionText == null) return null;
        String normalised = questionText.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "");
        if (normalised.isEmpty()) return null;
        try {
            byte[] digest = MessageDigest.getInstance("MD5").digest(normalised.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // MD5 is mandated by the JDK spec, so this cannot happen on a working JVM.
            throw new IllegalStateException("MD5 unavailable", e);
        }
    }

    /** The English text a question's fingerprint is derived from, or null if it has none. */
    public static String rootLanguageText(Question question) {
        for (QuestionTranslation t : question.getTranslations()) {
            if (ROOT_LANGUAGE.equals(t.getLanguage().getCode())) {
                return t.getQuestionText();
            }
        }
        return null;
    }

    /**
     * Recomputes a question's fingerprint by reading its in-memory translation collection.
     *
     * <p><strong>Only safe on a transient question</strong> — one being built by
     * {@code create} or {@code bulkImport}, whose {@code translations} is still a plain
     * ArrayList. On a <em>managed</em> question the collection is a lazy Hibernate bag mapped
     * with {@code orphanRemoval = true}, and forcing it to initialise after a transient element
     * has been added to it makes Hibernate compute orphans against a snapshot that does not know
     * about that element — which throws {@code TransientObjectException} at flush time.
     *
     * <p>That is not hypothetical: doing this in {@code upsertTranslation} turned every
     * add-a-new-language request into a 500. Managed paths must use
     * {@link #setFingerprintFromText} and pass the text in, so the collection is never touched.
     */
    public void refreshFingerprint(Question question) {
        question.setContentFingerprint(fingerprint(rootLanguageText(question)));
    }

    /**
     * Sets the fingerprint from text the caller already has, without reading the entity's
     * translation collection.
     *
     * <p>The safe form for a managed question — see {@link #refreshFingerprint} for what goes
     * wrong otherwise. A null or non-alphanumeric text clears the fingerprint, which correctly
     * makes the question un-matchable rather than matching everything.
     */
    public void setFingerprintFromText(Question question, String englishText) {
        question.setContentFingerprint(fingerprint(englishText));
    }

    /**
     * Records a duplicate edge for {@code question} against the oldest existing question
     * with the same fingerprint, if there is one.
     *
     * @return the id of the question this was found to duplicate, or null if it is unique.
     */
    public UUID detectAndRecord(Question question) {
        String fingerprint = question.getContentFingerprint();
        if (fingerprint == null) return null;

        List<Question> matches = questionRepository.findByContentFingerprint(fingerprint, question.getId());
        if (matches.isEmpty()) return null;

        // Oldest first from the query, so the first match is the original.
        Question original = matches.get(0);
        recordEdge(question.getId(), original.getId());
        return original.getId();
    }

    /**
     * Batch equivalent of {@link #detectAndRecord} for bulk import.
     *
     * <p>One grouped lookup for the whole batch instead of one per row. Bulk import already
     * pre-loads every other lookup up front for exactly this reason — a per-row query here
     * would reintroduce the 1+N that made a 500-row import take minutes rather than seconds
     * (see reports/12-load-test-data-seeding/).
     *
     * <p>Also catches duplicates <em>within</em> the batch, which the old client-side check
     * did and which a purely against-the-bank check would miss: the first occurrence is
     * inserted, so the second sees it as an existing row only if the batch has already been
     * flushed. Tracking first-seen fingerprints in-memory makes that independent of flush
     * timing.
     *
     * @return question id -> the id of the earlier question it duplicates.
     */
    public Map<UUID, UUID> detectAndRecordBatch(List<Question> questions) {
        Map<UUID, UUID> found = new HashMap<>();
        Map<String, UUID> firstSeenInBatch = new HashMap<>();

        List<String> fingerprints = questions.stream()
                .map(Question::getContentFingerprint)
                .filter(f -> f != null)
                .distinct()
                .toList();
        if (fingerprints.isEmpty()) return found;

        Map<String, UUID> oldestByFingerprint = new HashMap<>();
        for (String fingerprint : fingerprints) {
            List<Question> matches = questionRepository.findByContentFingerprint(fingerprint, null);
            for (Question match : matches) {
                // Rows from this very batch may already be persisted; they are handled by
                // firstSeenInBatch instead, so that "the original" stays the pre-existing row.
                boolean inBatch = questions.stream().anyMatch(q -> match.getId().equals(q.getId()));
                if (!inBatch) {
                    oldestByFingerprint.putIfAbsent(fingerprint, match.getId());
                    break;
                }
            }
        }

        for (Question question : questions) {
            String fingerprint = question.getContentFingerprint();
            if (fingerprint == null) continue;

            UUID originalId = oldestByFingerprint.get(fingerprint);
            if (originalId == null) {
                originalId = firstSeenInBatch.get(fingerprint);
            }
            if (originalId == null) {
                firstSeenInBatch.put(fingerprint, question.getId());
                continue;
            }
            if (originalId.equals(question.getId())) continue;

            recordEdge(question.getId(), originalId);
            found.put(question.getId(), originalId);
        }
        return found;
    }

    /**
     * Inserts the edge unless it already exists.
     *
     * <p>{@code persist()} rather than {@code save()} deliberately. This entity has a
     * manually-assigned composite id, so {@code save()} takes the {@code merge()} path,
     * which issues its own SELECT before inserting — the exact doubled-round-trip already
     * fixed in {@link BookmarkService}. The existence check here is the one we need, so
     * paying for a second one is pure waste.
     */
    private void recordEdge(UUID questionId, UUID originalId) {
        if (questionId == null || originalId == null || questionId.equals(originalId)) return;

        QuestionDuplicate.Key key = new QuestionDuplicate.Key(questionId, originalId);
        if (duplicates.existsById(key)) return;

        QuestionDuplicate edge = new QuestionDuplicate();
        edge.setQuestionId(questionId);
        edge.setDuplicateOfQuestionId(originalId);
        edge.setSimilarityPercent(EXACT_SIMILARITY);
        edge.setDetectionMethod(QuestionDuplicate.METHOD_EXACT_FINGERPRINT);
        edge.setDetectedAt(OffsetDateTime.now());
        entityManager.persist(edge);
    }

    /**
     * A dry-run check for the admin console's Bulk Import screen: reports which of the
     * supplied texts already exist in the bank, without writing anything.
     *
     * <p>Separate from {@link #detectAndRecord} because the import screen needs to warn
     * <em>before</em> the admin commits, and recording edges for questions that were never
     * imported would fill the review queue with pairs that do not exist.
     */
    @Transactional(readOnly = true)
    public List<UUID> findExistingMatches(String questionText) {
        String fingerprint = fingerprint(questionText);
        if (fingerprint == null) return List.of();
        return questionRepository.findByContentFingerprint(fingerprint, null).stream()
                .map(Question::getId)
                .toList();
    }

    /** Marks a detected pair as reviewed. Idempotent — re-resolving just restamps it. */
    public void resolve(UUID questionId, UUID duplicateOfQuestionId, QuestionDuplicate.Resolution resolution) {
        QuestionDuplicate edge = duplicates
                .findById(new QuestionDuplicate.Key(questionId, duplicateOfQuestionId))
                .orElseThrow(() -> new NoSuchElementException(
                        "No detected duplicate pair for " + questionId + " -> " + duplicateOfQuestionId));
        edge.setResolution(resolution);
        edge.setResolvedAt(OffsetDateTime.now());
    }

    /**
     * Re-runs detection across the entire bank in one set-based statement.
     *
     * <p>Needed because V13 backfilled fingerprints onto ~37,900 rows that had never been compared
     * with each other — including the ~35,700 templated load-test questions, where genuine
     * collisions are expected.
     *
     * <p><strong>Native SQL, and the first version of this was wrong.</strong> It did
     * {@code questionRepository.findAll()} and grouped in Java, which meant loading every one of
     * ~37,900 entities (each with lazy topic/subject/exam/translation associations) to read two
     * columns. Against a remote Neon database that request never returned. This is exactly the
     * mistake the rest of this codebase has already fixed three times, and it is a set operation,
     * so it is written as one.
     *
     * <p>{@code first_value} picks the oldest row in each fingerprint group as "the original", and
     * {@code row_number} identifies every later row as a duplicate of it. The whole thing rides
     * the {@code idx_questions_content_fingerprint} index added in V13.
     *
     * <p>Admin-triggered rather than automatic on startup: it is a full pass over the table, and
     * running it unasked on every boot of a Cloud Run instance would be an unpleasant surprise.
     *
     * @param limit maximum number of edges to record in one pass, so a first run on a bank this
     *              size cannot produce an unbounded write burst. Re-run to continue.
     */
    public int backfillDetection(int limit) {
        String sql =
                "with ranked as ("
                + "    select q.id,"
                + "           first_value(q.id) over ("
                + "               partition by q.content_fingerprint"
                + "               order by q.updated_at, q.id"
                + "           ) as original_id,"
                + "           row_number() over ("
                + "               partition by q.content_fingerprint"
                + "               order by q.updated_at, q.id"
                + "           ) as rn"
                + "      from questions q"
                + "     where q.is_deleted = false"
                + "       and q.content_fingerprint is not null"
                + ") "
                + "insert into question_duplicates ("
                + "    question_id, duplicate_of_question_id, similarity_percent, detection_method, detected_at"
                + ") "
                + "select r.id, r.original_id, :similarity, :method, now()"
                + "  from ranked r"
                + " where r.rn > 1"
                + "   and r.id <> r.original_id"
                + "   and not exists ("
                + "       select 1 from question_duplicates d"
                + "        where d.question_id = r.id"
                + "          and d.duplicate_of_question_id = r.original_id"
                + "   )"
                + " limit :maxRows "
                + " on conflict do nothing";

        return entityManager.createNativeQuery(sql)
                .setParameter("similarity", EXACT_SIMILARITY)
                .setParameter("method", QuestionDuplicate.METHOD_EXACT_FINGERPRINT)
                .setParameter("maxRows", limit)
                .executeUpdate();
    }

    /**
     * How many questions share a fingerprint with at least one other, ignoring what has already
     * been recorded.
     *
     * <p>Separate from {@link #backfillDetection} so the admin console can say how much work a scan
     * would find before anyone triggers it — a button that might record 20,000 rows should not be
     * the only way to discover that.
     */
    @Transactional(readOnly = true)
    public long countPotentialDuplicates() {
        String sql =
                "select count(*) from ("
                + "    select q.content_fingerprint"
                + "      from questions q"
                + "     where q.is_deleted = false"
                + "       and q.content_fingerprint is not null"
                + "     group by q.content_fingerprint"
                + "    having count(*) > 1"
                + ") groups";
        Object result = entityManager.createNativeQuery(sql).getSingleResult();
        return ((Number) result).longValue();
    }
}
