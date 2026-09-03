package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.ApplicationMistake;
import com.sarkaritaiyaari.backend.entity.ApplicationStep;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.DocumentRequirement;
import com.sarkaritaiyaari.backend.entity.DocumentRequirementLevel;
import com.sarkaritaiyaari.backend.entity.EligibilityRule;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.ExamSource;
import com.sarkaritaiyaari.backend.entity.ExamSourceType;
import com.sarkaritaiyaari.backend.entity.FeeRule;
import com.sarkaritaiyaari.backend.entity.ImportantDate;
import com.sarkaritaiyaari.backend.entity.ImportantDateEventType;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycle;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycleStatus;
import com.sarkaritaiyaari.backend.repository.ApplicationMistakeRepository;
import com.sarkaritaiyaari.backend.repository.ApplicationStepRepository;
import com.sarkaritaiyaari.backend.repository.DocumentRequirementRepository;
import com.sarkaritaiyaari.backend.repository.EligibilityRuleRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.ExamSourceRepository;
import com.sarkaritaiyaari.backend.repository.FeeRuleRepository;
import com.sarkaritaiyaari.backend.repository.ImportantDateRepository;
import com.sarkaritaiyaari.backend.repository.RecruitmentCycleRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.Month;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * Seeds one demo recruitment cycle (SSC CGL) so the Exam Guide can be exercised end to
 * end before any real notification content exists.
 *
 * <h2>This is demo data and it is structurally impossible to mistake for real content</h2>
 * Unlike Epic L's synthetic seeder — which had to invent a marker in a spare text column
 * because nothing in that schema distinguished synthetic rows — {@code recruitment_cycles}
 * was designed from the start with a persistent {@code is_demo} column (see the V17
 * migration). Every value here is invented, plausible-looking, and clearly labelled: the
 * source cited is {@link ExamSourceType#ADMIN_ESTIMATE}, never a fabricated official
 * notification, and {@link RecruitmentCycle#isDemo()} is what every consumer (mobile +
 * admin) must render as a visible badge.
 *
 * <h2>Gating</h2>
 * Same two independent gates as {@link SyntheticCurationService}: an admin token on the
 * calling endpoint, and {@code app.exam-guide.demo-seed-enabled=true} (default false).
 *
 * <h2>Reversibility</h2>
 * {@link #purge()} deletes the demo cycle by id; the cascade declared in V17
 * (eligibility/dates/documents/steps/mistakes/fees all {@code ON DELETE CASCADE} from
 * {@code recruitment_cycle_id}) removes everything else in one statement. The sources
 * this class creates are deleted explicitly by name, since sources are not owned by the
 * cycle's cascade (they are meant to be reusable across cycles).
 */
@Service
public class ExamGuideDemoSeeder {

    /** Distinguishes this seeder's sources from admin-authored ones, for purge(). */
    private static final String DEMO_SOURCE_PREFIX = "[Demo] ";

    private final ExamRepository examRepository;
    private final RecruitmentCycleRepository cycleRepository;
    private final ExamSourceRepository sourceRepository;
    private final EligibilityRuleRepository eligibilityRepository;
    private final ImportantDateRepository importantDateRepository;
    private final DocumentRequirementRepository documentRequirementRepository;
    private final ApplicationStepRepository applicationStepRepository;
    private final ApplicationMistakeRepository applicationMistakeRepository;
    private final FeeRuleRepository feeRuleRepository;

    @Value("${app.exam-guide.demo-seed-enabled:false}")
    private boolean enabled;

    public ExamGuideDemoSeeder(ExamRepository examRepository,
                                RecruitmentCycleRepository cycleRepository,
                                ExamSourceRepository sourceRepository,
                                EligibilityRuleRepository eligibilityRepository,
                                ImportantDateRepository importantDateRepository,
                                DocumentRequirementRepository documentRequirementRepository,
                                ApplicationStepRepository applicationStepRepository,
                                ApplicationMistakeRepository applicationMistakeRepository,
                                FeeRuleRepository feeRuleRepository) {
        this.examRepository = examRepository;
        this.cycleRepository = cycleRepository;
        this.sourceRepository = sourceRepository;
        this.eligibilityRepository = eligibilityRepository;
        this.importantDateRepository = importantDateRepository;
        this.documentRequirementRepository = documentRequirementRepository;
        this.applicationStepRepository = applicationStepRepository;
        this.applicationMistakeRepository = applicationMistakeRepository;
        this.feeRuleRepository = feeRuleRepository;
    }

    public boolean isEnabled() {
        return enabled;
    }

    @Transactional
    public Map<String, Object> seed() {
        if (!enabled) {
            throw new IllegalStateException("Exam Guide demo seeding is disabled on this instance.");
        }
        Exam exam = examRepository.findById("SSC_CGL")
                .orElseThrow(() -> new NoSuchElementException("Exam not found: SSC_CGL"));

        cycleRepository.findByExamCodeAndCycleNameIgnoreCase("SSC_CGL", "2027 (Demo)")
                .ifPresent(existing -> {
                    throw new IllegalStateException("Demo cycle already exists — purge it first.");
                });

        ExamSource calendar = source("Tentative Exam Calendar", ExamSourceType.ADMIN_ESTIMATE, null);
        ExamSource notification = source("Draft Notification Estimate", ExamSourceType.ADMIN_ESTIMATE, null);

        // No real cycle to exclude yet — a throwaway id that can't match any row clears
        // every existing "current" flag for this exam. `!= null` in JPQL would silently
        // match nothing (SQL NULL comparison semantics), which is why this isn't just
        // `clearCurrentForExam("SSC_CGL", null)`.
        cycleRepository.clearCurrentForExam("SSC_CGL", java.util.UUID.randomUUID());

        RecruitmentCycle cycle = new RecruitmentCycle();
        cycle.setExam(exam);
        cycle.setCycleName("2027 (Demo)");
        cycle.setStatus(RecruitmentCycleStatus.APPLICATION_OPEN);
        cycle.setNotificationDate(LocalDate.of(2027, Month.MARCH, 15));
        cycle.setApplicationStart(LocalDate.of(2027, Month.MARCH, 15));
        cycle.setApplicationEnd(LocalDate.of(2027, Month.APRIL, 20));
        cycle.setExamStart(LocalDate.of(2027, Month.JUNE, 10));
        cycle.setExamEnd(LocalDate.of(2027, Month.JUNE, 25));
        cycle.setVacancyCount(4500);
        cycle.setNotificationUrl("https://ssc.gov.in");
        cycle.setCurrent(true);
        cycle.setDemo(true);
        // Explicit, not relying on the entity's DRAFT default: this seeded content is
        // meant to be immediately visible end to end (it's already unmistakably labelled
        // as demo via isDemo()), same as before content-validation states existed.
        cycle.setContentStatus(ContentStatus.PUBLISHED);
        cycle.setLastVerifiedAt(OffsetDateTime.now());
        cycle.setCreatedAt(OffsetDateTime.now());
        cycle.setUpdatedAt(OffsetDateTime.now());
        cycle = cycleRepository.save(cycle);

        seedEligibility(cycle, calendar);
        seedImportantDates(cycle, calendar);
        seedDocuments(cycle);
        seedApplicationSteps(cycle);
        seedApplicationMistakes(cycle);
        seedFees(cycle, notification);

        RecruitmentCycle pastCycle = seedPastCycle(exam);

        return Map.of(
                "recruitmentCycleId", cycle.getId(),
                "examCode", "SSC_CGL",
                "cycleName", cycle.getCycleName(),
                "pastCycleId", pastCycle.getId(),
                "demo", true);
    }

    /**
     * A completed, non-current cycle — otherwise §63 "Notification History" has nothing
     * to show and is unverifiable end to end from a fresh seed. `demo=true` here too, so
     * {@link #purge()}'s existing "every demo cycle for this exam" filter removes it along
     * with the current one without needing its own cleanup path.
     */
    private RecruitmentCycle seedPastCycle(Exam exam) {
        RecruitmentCycle past = new RecruitmentCycle();
        past.setExam(exam);
        past.setCycleName("2026 (Demo, past)");
        past.setStatus(RecruitmentCycleStatus.RECRUITMENT_COMPLETED);
        past.setNotificationDate(LocalDate.of(2026, Month.FEBRUARY, 10));
        past.setApplicationStart(LocalDate.of(2026, Month.FEBRUARY, 10));
        past.setApplicationEnd(LocalDate.of(2026, Month.MARCH, 15));
        past.setExamStart(LocalDate.of(2026, Month.MAY, 5));
        past.setExamEnd(LocalDate.of(2026, Month.MAY, 20));
        past.setVacancyCount(3800);
        past.setNotificationUrl("https://ssc.gov.in");
        past.setCurrent(false);
        past.setDemo(true);
        past.setContentStatus(ContentStatus.PUBLISHED);
        past.setCreatedAt(OffsetDateTime.now());
        past.setUpdatedAt(OffsetDateTime.now());
        return cycleRepository.save(past);
    }

    @Transactional
    public Map<String, Object> purge() {
        List<RecruitmentCycle> demoCycles = cycleRepository.findByExamCodeOrderByCreatedAtDesc("SSC_CGL").stream()
                .filter(RecruitmentCycle::isDemo)
                .toList();
        demoCycles.forEach(cycleRepository::delete);

        long sourcesDeleted = sourceRepository.findAll().stream()
                .filter(s -> s.getSourceName().startsWith(DEMO_SOURCE_PREFIX))
                .peek(sourceRepository::delete)
                .count();

        return Map.of("cyclesRemoved", demoCycles.size(), "sourcesRemoved", sourcesDeleted);
    }

    private ExamSource source(String name, ExamSourceType type, String url) {
        ExamSource s = new ExamSource();
        s.setSourceName(DEMO_SOURCE_PREFIX + name);
        s.setSourceType(type);
        s.setUrl(url);
        s.setCreatedAt(OffsetDateTime.now());
        return sourceRepository.save(s);
    }

    private void seedEligibility(RecruitmentCycle cycle, ExamSource source) {
        EligibilityRule rule = new EligibilityRule();
        rule.setRecruitmentCycle(cycle);
        rule.setMinimumAge(18);
        rule.setMaximumAge(32);
        rule.setAgeCutoffDate(LocalDate.of(2027, Month.AUGUST, 1));
        rule.setQualification("Bachelor's degree from a recognised university (some posts require a specific stream — check post-wise eligibility on the official notification).");
        rule.setNationality("Indian citizen (some posts also accept specified categories of Nepal/Bhutan/Tibetan-refugee/PIO candidates — see the notification).");
        rule.setGenderRequirement("Open to all genders.");
        rule.setCategoryRelaxation(Map.of("OBC", 3, "SC", 5, "ST", 5, "PWBD", 10, "EX_SERVICEMEN", 3));
        rule.setSpecialRequirements("Age relaxations are cumulative for candidates who qualify under more than one category, subject to official rules.");
        rule.setSourceId(source.getId());
        eligibilityRepository.save(rule);
    }

    private void seedImportantDates(RecruitmentCycle cycle, ExamSource source) {
        record Row(ImportantDateEventType type, String title, LocalDate start, LocalDate end, boolean official, int order) {
        }
        List<Row> rows = List.of(
                new Row(ImportantDateEventType.NOTIFICATION, "Notification released", cycle.getNotificationDate(), null, false, 0),
                new Row(ImportantDateEventType.APPLICATION_START, "Application opens", cycle.getApplicationStart(), null, false, 1),
                new Row(ImportantDateEventType.APPLICATION_END, "Application closes", cycle.getApplicationEnd(), null, false, 2),
                new Row(ImportantDateEventType.CORRECTION_WINDOW, "Correction window",
                        cycle.getApplicationEnd().plusDays(3), cycle.getApplicationEnd().plusDays(6), false, 3),
                new Row(ImportantDateEventType.ADMIT_CARD, "Admit card released", cycle.getExamStart().minusDays(10), null, false, 4),
                new Row(ImportantDateEventType.EXAM_STAGE, "Tier 1 examination", cycle.getExamStart(), cycle.getExamEnd(), false, 5),
                new Row(ImportantDateEventType.ANSWER_KEY, "Answer key released", cycle.getExamEnd().plusDays(15), null, false, 6),
                new Row(ImportantDateEventType.RESULT, "Tier 1 result", cycle.getExamEnd().plusDays(45), null, false, 7));
        for (Row row : rows) {
            ImportantDate date = new ImportantDate();
            date.setRecruitmentCycle(cycle);
            date.setEventType(row.type());
            date.setTitle(row.title());
            date.setStartDate(row.start());
            date.setEndDate(row.end());
            date.setOfficial(row.official());
            date.setDisplayOrder(row.order());
            date.setSourceId(source.getId());
            importantDateRepository.save(date);
        }
    }

    private void seedDocuments(RecruitmentCycle cycle) {
        record Row(String name, DocumentRequirementLevel level, String applicableFor, String format,
                   Integer maxSizeKb, String dimensions, String instructions, int order) {
        }
        List<Row> rows = List.of(
                new Row("Recent photograph", DocumentRequirementLevel.YES, null, "JPEG", 50, "200x230 px", "White background, taken within the last 3 months.", 0),
                new Row("Signature", DocumentRequirementLevel.YES, null, "JPEG", 20, "140x60 px", "Signed on white paper with black ink.", 1),
                new Row("Photo ID proof", DocumentRequirementLevel.YES, null, "PDF/JPEG", 200, null, "Aadhaar, PAN, voter ID or passport.", 2),
                new Row("Educational certificate", DocumentRequirementLevel.YES, null, "PDF", 500, null, "Latest qualifying degree/provisional certificate and marksheet.", 3),
                new Row("Category certificate", DocumentRequirementLevel.IF_APPLICABLE, "SC/ST/OBC/EWS candidates", "PDF", 500, null, "Issued by a competent authority in the prescribed format.", 4),
                new Row("PwBD certificate", DocumentRequirementLevel.IF_APPLICABLE, "PwBD candidates", "PDF", 500, null, "Disability certificate issued by a competent medical authority.", 5),
                new Row("Ex-servicemen discharge certificate", DocumentRequirementLevel.IF_APPLICABLE, "Ex-servicemen candidates", "PDF", 500, null, null, 6));
        for (Row row : rows) {
            DocumentRequirement doc = new DocumentRequirement();
            doc.setRecruitmentCycle(cycle);
            doc.setDocumentName(row.name());
            doc.setRequired(row.level());
            doc.setApplicableFor(row.applicableFor());
            doc.setFormat(row.format());
            doc.setMaxSizeKb(row.maxSizeKb());
            doc.setDimensions(row.dimensions());
            doc.setInstructions(row.instructions());
            doc.setDisplayOrder(row.order());
            documentRequirementRepository.save(doc);
        }
    }

    private void seedApplicationSteps(RecruitmentCycle cycle) {
        record Row(int number, String title, String description, String warning) {
        }
        List<Row> rows = List.of(
                new Row(1, "Visit the official website", "Go to ssc.gov.in and open the SSC CGL notification link.", null),
                new Row(2, "Register", "Create a One Time Registration (OTR) if you don't already have one.", "Double-check your date of birth and name spelling — these usually cannot be corrected later."),
                new Row(3, "Enter personal and educational details", "Fill in category, qualification and other personal details.", null),
                new Row(4, "Upload photograph and signature", "Upload to the exact size/format specified.", "A wrong-format upload is one of the most common reasons an application is flagged."),
                new Row(5, "Select exam centre and post preferences", "Choose your preferred centres and, where applicable, post preferences.", null),
                new Row(6, "Pay the application fee", "Pay online; fee-exempted categories should verify their exemption before submitting.", "Keep the payment confirmation/transaction id."),
                new Row(7, "Review and submit", "Check every section carefully before final submission.", "Most fields cannot be edited after submission — only the correction window (if any) allows changes."),
                new Row(8, "Download the submitted application", "Save a copy for your own records.", null));
        for (Row row : rows) {
            ApplicationStep step = new ApplicationStep();
            step.setRecruitmentCycle(cycle);
            step.setStepNumber(row.number());
            step.setTitle(row.title());
            step.setDescription(row.description());
            step.setWarning(row.warning());
            applicationStepRepository.save(step);
        }
    }

    private void seedApplicationMistakes(RecruitmentCycle cycle) {
        List<String> mistakes = List.of(
                "Incorrect date of birth",
                "Wrong category selected",
                "Photograph/signature not matching the specified format",
                "Incorrect exam centre preference",
                "Payment failure not resolved before the deadline",
                "Not downloading the submitted application",
                "Waiting until the last day to apply");
        int order = 0;
        for (String mistake : mistakes) {
            ApplicationMistake row = new ApplicationMistake();
            row.setRecruitmentCycle(cycle);
            row.setMistake(mistake);
            row.setDisplayOrder(order++);
            applicationMistakeRepository.save(row);
        }
    }

    private void seedFees(RecruitmentCycle cycle, ExamSource source) {
        record Row(String category, int rupees, boolean exempted, int order) {
        }
        List<Row> rows = List.of(
                new Row("GENERAL", 100, false, 0),
                new Row("OBC", 100, false, 1),
                new Row("SC", 0, true, 2),
                new Row("ST", 0, true, 3),
                new Row("FEMALE", 0, true, 4),
                new Row("PWBD", 0, true, 5),
                new Row("EX_SERVICEMEN", 0, true, 6));
        for (Row row : rows) {
            FeeRule fee = new FeeRule();
            fee.setRecruitmentCycle(cycle);
            fee.setCategory(row.category());
            fee.setAmountRupees(row.rupees());
            fee.setExempted(row.exempted());
            fee.setDisplayOrder(row.order());
            fee.setSourceId(source.getId());
            feeRuleRepository.save(fee);
        }
    }
}
