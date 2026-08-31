package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.TopicIntelligenceDtos;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Generates synthetic Epic L curation data so the feature can be exercised end to end before
 * any real editorial content exists.
 *
 * <h2>This is demo data and it says so on every row it writes</h2>
 * Every question this class tags carries {@link #SYNTHETIC_MARKER} in {@code source_url}, which
 * is what lets {@link #purge()} remove exactly what was added and nothing else. That marker is
 * the entire reason the field is used this way — without it, synthetic rows become
 * indistinguishable from real ones the moment an admin tags a genuine PYQ.
 *
 * <h2>Why it is deterministic</h2>
 * Every choice derives from an MD5 of the row's own UUID rather than a random number generator.
 * Re-running produces identical output, so the endpoint is safe to call twice, numbers in a
 * screenshot stay reproducible, and a bug is reproducible instead of a different shape each run.
 *
 * <h2>Why native SQL</h2>
 * The PYQ pass touches a five-figure number of rows. Loading those as entities to set a few
 * columns each would be tens of thousands of round trips against a remote Neon database — the
 * same mistake already fixed three times in this codebase. These are set-based updates and are
 * written as such.
 *
 * <h2>Why the SQL is concatenated, not a formatted text block</h2>
 * The first version used {@code """...""".formatted(...)}. The SQL carries prose comments, and a
 * literal percent sign in one of them ("the first ~45% of each subject") is a valid format
 * conversion as far as {@link java.util.Formatter} is concerned — it read {@code "% o"} as an
 * octal directive and threw {@code IllegalFormatConversionException} at runtime. Concatenation
 * carries no such hazard, so none of these strings can be broken by editing a comment.
 *
 * <h2>Gating</h2>
 * Two independent gates, both required: an admin token on the calling endpoint, and
 * {@code app.epic-l.synthetic-seed-enabled=true}. The flag defaults to false so a deployed
 * instance cannot be talked into writing demo content over real editorial work by an
 * authenticated mistake.
 */
@Service
public class SyntheticCurationService {

    private static final Logger log = LoggerFactory.getLogger(SyntheticCurationService.class);

    /**
     * Written into {@code questions.source_url} on every question this class tags — the
     * reversibility hook {@link #purge()} matches on exactly.
     */
    public static final String SYNTHETIC_MARKER = "synthetic://epic-l-demo";

    /** PYQ window. Six years is enough for the two-half trend comparison to have a shape. */
    private static final int PYQ_FROM_YEAR = 2019;
    private static final int PYQ_TO_YEAR = 2024;
    private static final int PYQ_YEAR_SPAN = PYQ_TO_YEAR - PYQ_FROM_YEAR + 1;

    /**
     * Roughly what share of the bank gets tagged as a previous-year question.
     *
     * <p>25% rather than everything, deliberately: a bank where every question is a PYQ would
     * hide every code path that only runs when {@code is_pyq} is false — the cleared-fields rule
     * in {@code QuestionService.applyPyqProvenance}, V13's partial indexes, and the
     * INSUFFICIENT_DATA branch of the trend engine all need untagged rows to exercise.
     */
    private static final int PYQ_TAG_PERCENT = 25;

    /** Share of a syllabus subject's topics that end up in an exam's topic map. */
    private static final int TOPIC_MAP_PERCENT = 70;

    /** Share of topics that become children of another topic (TICKET-2102 hierarchy depth). */
    private static final int CHILD_TOPIC_PERCENT = 55;

    /** Priority an override is set to. High enough to visibly jump the ranking in the UI. */
    private static final String OVERRIDE_PRIORITY = "90.00";

    /** Overrides seeded per exam — enough to demonstrate the split, few enough to stay obvious. */
    private static final int OVERRIDES_PER_EXAM = 2;

    private final ExamRepository exams;
    private final TopicIntelligenceService topicIntelligence;

    @Value("${app.epic-l.synthetic-seed-enabled:false}")
    private boolean enabled;

    @PersistenceContext
    private EntityManager em;

    public SyntheticCurationService(ExamRepository exams, TopicIntelligenceService topicIntelligence) {
        this.exams = exams;
        this.topicIntelligence = topicIntelligence;
    }

    /**
     * A deterministic non-negative integer drawn from any uuid-valued SQL expression.
     *
     * <p>{@code bit(28)::int} rather than {@code bit(32)::int} on purpose: a 32-bit
     * reinterpretation is signed, so half the values come out negative and {@code mod} then
     * returns negatives too — which would silently produce years below the window and negative
     * question numbers. 28 bits is always non-negative in a 32-bit int.
     *
     * <p>{@code offset} reads a different slice of the same digest, so one uuid can yield
     * several independent draws without several hash calls.
     */
    private static String hash(String uuidExpr, int offset) {
        return "(('x' || substr(md5(" + uuidExpr + "::text), " + offset + ", 7))::bit(28)::int)";
    }

    private void requireEnabled() {
        if (!enabled) {
            // ForbiddenException, not IllegalState: this is "you may not do this here", which is
            // a 403 the caller can act on, where an IllegalStateException would surface as an
            // unmapped 500 and read as a server bug.
            throw new ForbiddenException(
                    "Synthetic Epic L seeding is disabled. Set app.epic-l.synthetic-seed-enabled=true "
                            + "in application-local.yml to enable it. It is off by default so demo "
                            + "content cannot be written into real data by accident.");
        }
    }

    /* --------------------------------------------------------------------- Seeding */

    /**
     * Runs every seeding pass in order, then recomputes intelligence for each exam.
     *
     * <p>The order is not arbitrary: the topic map needs a syllabus to draw topics from, the
     * hierarchy has to exist before prerequisites can point along it, and the trend engine needs
     * both PYQ years and a topic map before it has anything to compute.
     */
    @Transactional
    public Map<String, Object> seed() {
        requireEnabled();
        Map<String, Object> report = new LinkedHashMap<>();

        report.put("syllabusRowsAdded", seedSyllabus());
        report.put("topicsGivenParent", seedTopicHierarchy());
        report.put("prerequisiteEdgesAdded", seedPrerequisites());
        report.put("examTopicRowsAdded", seedTopicMap());
        report.put("questionsTaggedAsPyq", seedPyqProvenance());
        report.put("questionsGivenSourcePaper", seedSourcePapers());

        // Flush and clear before recomputing. The trend engine reads the rows above through JPQL,
        // and a native-query write does not update the persistence context — without this, stale
        // entities would be served from it and every topic would score INSUFFICIENT_DATA on a
        // first seed.
        em.flush();
        em.clear();

        List<Map<String, Object>> perExam = new ArrayList<>();
        for (Exam exam : exams.findAllByOrderByDisplayOrderAsc()) {
            TopicIntelligenceDtos.RecomputeResponse result = topicIntelligence.recompute(exam.getCode());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("examCode", result.examCode());
            row.put("topicsScored", result.topicsScored());
            row.put("pyqAppearances", result.pyqTaggedCount());
            perExam.add(row);
        }
        report.put("intelligenceRecomputed", perExam);
        report.put("algorithmVersion", TopicIntelligenceService.ALGORITHM_VERSION);

        // After the recompute, because it edits the priority rows the recompute writes.
        em.flush();
        em.clear();
        report.put("overridesApplied", seedAdminOverrides());

        log.warn("Seeded synthetic Epic L curation data: {}", report);
        return report;
    }

    /**
     * Gives every active exam with no syllabus one, derived from the subjects its own questions
     * already use.
     *
     * <p>Not invented: if a question is tagged to SSC CHSL and filed under Reasoning, then
     * Reasoning is demonstrably part of what SSC CHSL tests. This is the one pass whose output is
     * true rather than fabricated, which is also why {@link #purge()} leaves it alone.
     *
     * <p>Additive — an exam that already has a curated syllabus is skipped entirely, because a
     * real admin decision outranks a derived one.
     */
    private int seedSyllabus() {
        String sql =
                "insert into exam_subjects (exam_code, subject_id) "
                + "select distinct qe.exam_code, t.subject_id "
                + "  from question_exam_types qe "
                + "  join questions q on q.id = qe.question_id "
                + "  join topics t on t.id = q.topic_id "
                + "  join exams e on e.code = qe.exam_code "
                + " where q.is_deleted = false "
                + "   and e.is_active = true "
                + "   and not exists ("
                + "       select 1 from exam_subjects existing where existing.exam_code = qe.exam_code"
                + "   ) "
                + " on conflict do nothing";
        return em.createNativeQuery(sql).executeUpdate();
    }

    /**
     * Builds a two-level topic tree inside each subject (TICKET-2102).
     *
     * <p>The lowest-ordered topics in a subject stay top-level and become the parents; the rest
     * attach to one of them. Acyclic <em>by construction</em> rather than by validation: a child's
     * parent is always drawn from the set of rows left parentless, so no chain longer than one
     * link can form and no cycle is expressible. That matters because {@code TopicService} would
     * reject a cycle with a 400, and here that would mean a half-applied seed rather than a clean
     * failure.
     *
     * <p>Only touches rows where {@code parent_id is null}, so a hierarchy an admin has already
     * curated is never overwritten.
     */
    private int seedTopicHierarchy() {
        String topicDraw = hash("r.id", 1);

        String sql =
                "with ranked as ("
                + "    select t.id,"
                + "           t.subject_id,"
                + "           row_number() over (partition by t.subject_id"
                + "                              order by t.display_order, t.name) as rn,"
                + "           count(*) over (partition by t.subject_id) as total"
                + "      from topics t"
                + "), "
                // greatest(...,1) guarantees at least one parent exists even in a one-topic
                // subject, where the share would otherwise floor to zero and leave nothing to
                // attach anything to.
                + "parents as ("
                + "    select id, subject_id,"
                + "           row_number() over (partition by subject_id order by rn) as pidx,"
                + "           count(*) over (partition by subject_id) as pcount"
                + "      from ranked"
                + "     where rn <= greatest(1, floor(total * (100 - :childPercent) / 100.0))"
                + "), "
                + "children as ("
                + "    select r.id, r.subject_id,"
                + "           mod(" + topicDraw + ","
                + "               (select pcount from parents p where p.subject_id = r.subject_id limit 1)"
                + "           ) + 1 as chosen_pidx"
                + "      from ranked r"
                + "     where r.rn > greatest(1, floor(r.total * (100 - :childPercent) / 100.0))"
                + ") "
                + "update topics t"
                + "   set parent_id = p.id"
                + "  from children c"
                + "  join parents p on p.subject_id = c.subject_id and p.pidx = c.chosen_pidx"
                + " where t.id = c.id"
                + "   and t.parent_id is null";

        return em.createNativeQuery(sql)
                .setParameter("childPercent", CHILD_TOPIC_PERCENT)
                .executeUpdate();
    }

    /**
     * Adds prerequisite edges pointing backwards along each subject's display order
     * (TICKET-2103).
     *
     * <p>Acyclic by construction, again deliberately stronger than relying on
     * {@code TopicService}'s reachability check: an edge only ever runs from a higher-ordered
     * topic to a lower-ordered one in the same subject, so following prerequisites strictly
     * decreases the order and cannot return to its start.
     */
    private int seedPrerequisites() {
        String topicDraw = hash("r.id", 9);

        String sql =
                "with ranked as ("
                + "    select t.id, t.subject_id,"
                + "           row_number() over (partition by t.subject_id"
                + "                              order by t.display_order, t.name) as rn"
                + "      from topics t"
                + ") "
                + "insert into topic_prerequisites (topic_id, prerequisite_topic_id) "
                + "select r.id, prereq.id"
                + "  from ranked r"
                + "  join ranked prereq"
                + "    on prereq.subject_id = r.subject_id"
                // This single predicate is what makes the whole graph a DAG.
                + "   and prereq.rn < r.rn"
                // One edge per topic, to a deterministic 1-2 places earlier: shallow enough to
                // read in the UI, still a genuine multi-hop chain for Epic D's sequencing to walk.
                + "   and prereq.rn = r.rn - (1 + mod(" + topicDraw + ", 2))"
                + " where not exists ("
                + "       select 1 from topic_prerequisites tp"
                + "        where tp.topic_id = r.id and tp.prerequisite_topic_id = prereq.id"
                + "   ) "
                + " on conflict do nothing";

        return em.createNativeQuery(sql).executeUpdate();
    }

    /**
     * Maps topics to exams with weightages that sum to 100 per exam (TICKET-2101).
     *
     * <p>Scoped to each exam's syllabus subjects, matching what the admin UI offers — seeding a
     * topic from a subject the exam does not cover would contradict the syllabus and produce data
     * no admin could have entered through the console.
     *
     * <p>The normalisation is the point. Raw hash draws become a real percentage split via a
     * window function, so the result reads like a genuine curated weightage table rather than a
     * hundred unrelated random percentages. Rounding leaves the total within a few hundredths of
     * 100, which is also true of hand-curated data.
     */
    private int seedTopicMap() {
        String weightDraw = hash("t.id", 1);
        String includeDraw = hash("t.id", 17);

        String sql =
                "with candidates as ("
                + "    select es.exam_code, t.id as topic_id,"
                // +1 so no topic draws a zero raw weight, which would normalise to 0.00 and read
                // as "assessed at zero" rather than "assessed as minor" - a real distinction here,
                // since blank means "relevant, not assessed".
                + "           (mod(" + weightDraw + ", 100) + 1) as raw_weight"
                + "      from exam_subjects es"
                + "      join topics t on t.subject_id = es.subject_id"
                + "     where mod(" + includeDraw + ", 100) < :mapPercent"
                + ") "
                + "insert into exam_topics (id, exam_code, topic_id, weightage_percent) "
                + "select c.exam_code || ':' || c.topic_id,"
                + "       c.exam_code,"
                + "       c.topic_id,"
                + "       round(100.0 * c.raw_weight / sum(c.raw_weight) over (partition by c.exam_code), 2)"
                + "  from candidates c"
                + " where not exists ("
                + "       select 1 from exam_topics et"
                + "        where et.exam_code = c.exam_code and et.topic_id = c.topic_id"
                + "   ) "
                + " on conflict do nothing";

        return em.createNativeQuery(sql)
                .setParameter("mapPercent", TOPIC_MAP_PERCENT)
                .executeUpdate();
    }

    /**
     * Tags roughly a quarter of the bank as previous-year questions (TICKET-2104).
     *
     * <p>The year is deliberately not uniform. Each topic draws a bias — rising, stable or falling
     * — and its questions' years are skewed accordingly, so the trend engine has genuinely
     * different shapes to detect. Without this, every topic would come out STABLE and TICKET-2106
     * would look like it works while actually being untested.
     *
     * <p>Only touches rows that are not already tagged, so a real PYQ entered by an admin is never
     * overwritten with demo values.
     */
    private int seedPyqProvenance() {
        String questionDraw = hash("q.id", 1);
        String topicBias = "mod(" + hash("t.id", 25) + ", 3)";
        String shiftDraw = hash("q.id", 9);
        String numberDraw = hash("q.id", 17);
        String includeDraw = hash("q.id", 25);

        // A 0.0-1.0 draw, shaped by the topic's bias, then mapped onto the year span.
        //   bias 0 (rising):  sqrt pushes the draw high, so appearances cluster in recent years
        //   bias 1 (stable):  uniform
        //   bias 2 (falling): squaring pulls the draw low, clustering appearances early
        // least() clamps the top: at a draw of exactly 1.0 the multiplication lands on
        // PYQ_YEAR_SPAN, one year past the window.
        String uniformDraw = "mod(" + questionDraw + ", 1000) / 1000.0";
        String shapedYearOffset =
                "least(:yearSpan - 1, floor("
                + "  case " + topicBias
                + "    when 0 then sqrt(" + uniformDraw + ")"
                + "    when 2 then power(" + uniformDraw + ", 2)"
                + "    else " + uniformDraw
                + "  end * :yearSpan"
                + "))";

        String sql =
                "update questions q"
                + "   set is_pyq = true,"
                + "       pyq_year = :fromYear + (" + shapedYearOffset + ")::int,"
                + "       pyq_shift = 'Shift ' || (1 + mod(" + shiftDraw + ", 3))::text,"
                + "       question_number = 1 + mod(" + numberDraw + ", 100),"
                + "       source_url = :marker"
                + "  from topics t"
                + " where t.id = q.topic_id"
                + "   and q.is_deleted = false"
                + "   and q.is_pyq = false"
                + "   and mod(" + includeDraw + ", 100) < :tagPercent";

        return em.createNativeQuery(sql)
                .setParameter("fromYear", PYQ_FROM_YEAR)
                .setParameter("yearSpan", PYQ_YEAR_SPAN)
                .setParameter("tagPercent", PYQ_TAG_PERCENT)
                .setParameter("marker", SYNTHETIC_MARKER)
                .executeUpdate();
    }

    /**
     * Points tagged questions at a real paper of an exam they belong to (TICKET-2104's
     * {@code source_paper_id}).
     *
     * <p>A separate pass rather than folded into the tagging update, because the paper has to be
     * chosen through the question's exam links and that exam's stage tree — a correlated subquery
     * that does not compose with the set-based year update.
     *
     * <p>Only exams that have a pattern can contribute a paper, so this legitimately covers a
     * subset of tagged questions. That is the honest outcome: an exam with no paper structure has
     * no paper to cite.
     */
    private int seedSourcePapers() {
        String sql =
                "update questions q"
                + "   set source_paper_id = chosen.paper_id"
                + "  from ("
                + "       select qe.question_id,"
                + "              (select p.id"
                + "                 from exam_papers p"
                + "                 join exam_stages s on s.id = p.stage_id"
                + "                where s.exam_code = qe.exam_code"
                + "                order by s.display_order, p.display_order"
                + "                limit 1) as paper_id"
                + "         from question_exam_types qe"
                + "   ) chosen"
                + " where chosen.question_id = q.id"
                + "   and chosen.paper_id is not null"
                + "   and q.is_pyq = true"
                + "   and q.source_url = :marker"
                + "   and q.source_paper_id is null";

        return em.createNativeQuery(sql)
                .setParameter("marker", SYNTHETIC_MARKER)
                .executeUpdate();
    }

    /**
     * Puts a couple of admin overrides in place per exam, so TICKET-2107's separation is visible
     * rather than merely implemented.
     *
     * <p>Targets the <em>lowest</em>-scoring mapped topics and raises them, which is the realistic
     * editorial case: a topic the formula underrates because it has little PYQ data but which an
     * experienced teacher knows is examined heavily. It also makes the override obvious in the UI,
     * because the row visibly jumps the ranking.
     *
     * <p>Writes {@code admin_override} and {@code final_priority} while leaving
     * {@code system_priority} untouched — the invariant V15's CHECK asserts, exercised here against
     * a real database rather than only in a test.
     */
    private int seedAdminOverrides() {
        String sql =
                "with lowest as ("
                + "    select tp.id,"
                + "           row_number() over (partition by tp.exam_code"
                + "                              order by tp.final_priority asc nulls first) as rn"
                + "      from topic_priority tp"
                + "     where tp.algorithm_version = :version"
                + "       and tp.admin_override is null"
                // Skip exams that already carry an override. Without this the pass is not
                // idempotent: a recompute carries existing overrides forward, so a second run
                // would find the next two un-overridden topics and add two more every time.
                + "       and not exists ("
                + "           select 1 from topic_priority existing"
                + "            where existing.exam_code = tp.exam_code"
                + "              and existing.admin_override is not null"
                + "       )"
                + ") "
                + "update topic_priority tp"
                + "   set admin_override = " + OVERRIDE_PRIORITY + ","
                + "       final_priority = " + OVERRIDE_PRIORITY + ","
                + "       override_reason = :reason,"
                + "       override_at = now()"
                + "  from lowest l"
                + " where l.id = tp.id and l.rn <= :perExam";

        return em.createNativeQuery(sql)
                .setParameter("version", TopicIntelligenceService.ALGORITHM_VERSION)
                .setParameter("perExam", OVERRIDES_PER_EXAM)
                .setParameter("reason",
                        "Synthetic demo override (Epic L / TICKET-2107): raised because "
                                + "previous-year coverage understates how heavily this topic is "
                                + "actually examined.")
                .executeUpdate();
    }

    /* --------------------------------------------------------------------- Purging */

    /**
     * Removes the synthetic data.
     *
     * <p>The PYQ pass is removed precisely, by matching {@link #SYNTHETIC_MARKER} — a genuine PYQ
     * tagged by an admin has a different {@code source_url} (or none) and survives untouched.
     *
     * <p>The curation passes are <strong>not</strong> that precise, and the returned report says
     * so out loud. {@code exam_topics}, {@code topics.parent_id} and {@code topic_prerequisites}
     * carry no provenance column, so purge clears them wholesale. That is safe while the synthetic
     * rows are the only ones present — true as long as nobody has curated by hand since seeding.
     * Anyone who has should not run this.
     */
    @Transactional
    public Map<String, Object> purge() {
        requireEnabled();
        Map<String, Object> report = new LinkedHashMap<>();

        report.put("pyqTagsCleared", em.createNativeQuery(
                "update questions"
                + "   set is_pyq = false,"
                + "       pyq_year = null,"
                + "       pyq_shift = null,"
                + "       question_number = null,"
                + "       source_paper_id = null,"
                + "       source_url = null"
                + " where source_url = :marker")
                .setParameter("marker", SYNTHETIC_MARKER)
                .executeUpdate());

        // Derived tables first: both reference topics and exams, and clearing them before the
        // curation they were computed from keeps the deletes in dependency order.
        report.put("topicPriorityRowsDeleted",
                em.createNativeQuery("delete from topic_priority").executeUpdate());
        report.put("topicTrendRowsDeleted",
                em.createNativeQuery("delete from topic_trend").executeUpdate());
        report.put("examTopicRowsDeleted",
                em.createNativeQuery("delete from exam_topics").executeUpdate());
        report.put("prerequisiteEdgesDeleted",
                em.createNativeQuery("delete from topic_prerequisites").executeUpdate());
        report.put("topicParentsCleared", em.createNativeQuery(
                "update topics set parent_id = null where parent_id is not null").executeUpdate());

        report.put("note", "exam_topics, topic_prerequisites and topics.parent_id carry no "
                + "provenance column, so these were cleared wholesale rather than selectively. "
                + "Only the PYQ tags were removed precisely (by source_url marker). Do not run "
                + "this if real curation has been entered since seeding.");

        // exam_subjects is deliberately left intact: seedSyllabus derived it from questions that
        // genuinely exist, so it is the one pass whose output is true rather than invented, and
        // clearing it would regress Practice's syllabus scoping for exams that had none before.
        report.put("syllabusLeftIntact", true);

        log.warn("Purged synthetic Epic L curation data: {}", report);
        return report;
    }

    public boolean isEnabled() {
        return enabled;
    }
}
