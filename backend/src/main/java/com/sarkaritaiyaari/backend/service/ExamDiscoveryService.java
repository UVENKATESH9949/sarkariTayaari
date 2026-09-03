package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.ExamDiscoveryDtos.ExamCardResponse;
import com.sarkaritaiyaari.backend.dto.ExamDiscoveryDtos.PagedExamCards;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycle;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycleStatus;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.RecruitmentCycleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The "Exams" discovery module's own read model (spec §5-15) — deliberately its own
 * service rather than folded into {@link ExamService}, which serves the admin management
 * screen and Home's plain list and has no reason to know about sorting, filtering,
 * pagination, or a computed status/urgency/primary-action. Reads two small existing
 * queries (the full active-exam list, and {@code findCurrentCyclesForActiveExams}, both
 * already N+1-safe) and does sort/filter/paging in Java rather than in SQL.
 *
 * <p>Deliberate scale call, not an oversight: today's catalogue is ~11 exams. Fetching
 * that whole set in one cheap query and sorting/filtering/paging it in memory is both
 * correct and fast at this size, while the API's own contract (page/size/sort/status/
 * category in, a paged response out) doesn't change if the underlying implementation is
 * later swapped for real SQL-level pagination once the catalogue is actually large.
 */
@Service
@Transactional(readOnly = true)
public class ExamDiscoveryService {

    /** Mirrors the "High" boundary in mobile's own {@code priorityTier} (examGuide/dates
     * .ts) — deliberately the same number in both places, not independently chosen, so a
     * card's server-computed {@code closingSoon} flag agrees with what the Guide screen's
     * own countdown badge would call urgent for the same date. */
    private static final long CLOSING_SOON_THRESHOLD_DAYS = 14;

    private static final Set<RecruitmentCycleStatus> APPLICATION_OPEN_STATUSES =
            EnumSet.of(RecruitmentCycleStatus.APPLICATION_OPEN, RecruitmentCycleStatus.APPLICATION_CLOSING_SOON);

    private static final Set<RecruitmentCycleStatus> RESULT_STATUSES = EnumSet.of(
            RecruitmentCycleStatus.ANSWER_KEY_RELEASED, RecruitmentCycleStatus.RESULT_RELEASED,
            RecruitmentCycleStatus.CUTOFF_RELEASED, RecruitmentCycleStatus.FINAL_RESULT,
            RecruitmentCycleStatus.RECRUITMENT_COMPLETED);

    private static final Set<RecruitmentCycleStatus> PREPARE_STATUSES = EnumSet.of(
            RecruitmentCycleStatus.APPLICATION_CLOSED, RecruitmentCycleStatus.CORRECTION_WINDOW_OPEN,
            RecruitmentCycleStatus.EXAM_UPCOMING);

    public enum SortOption {
        DEADLINE, EXAM_DATE, NEWLY_ANNOUNCED, RECENTLY_UPDATED, POPULAR, ALPHABETICAL
    }

    private final ExamRepository examRepository;
    private final RecruitmentCycleRepository cycleRepository;

    public ExamDiscoveryService(ExamRepository examRepository, RecruitmentCycleRepository cycleRepository) {
        this.examRepository = examRepository;
        this.cycleRepository = cycleRepository;
    }

    public PagedExamCards discover(int page, int size, SortOption sort, String statusFilter, String category) {
        Map<String, RecruitmentCycle> cycleByExamCode = new HashMap<>();
        for (RecruitmentCycle cycle : cycleRepository.findCurrentCyclesForActiveExams()) {
            cycleByExamCode.put(cycle.getExam().getCode(), cycle);
        }

        List<ExamCardResponse> cards = examRepository.findAllByOrderByDisplayOrderAsc().stream()
                .filter(Exam::isActive)
                .filter(exam -> category == null || category.equalsIgnoreCase(exam.getCategory()))
                .map(exam -> toCard(exam, cycleByExamCode.get(exam.getCode())))
                .filter(card -> matchesStatusFilter(card, statusFilter))
                .sorted(comparatorFor(sort))
                .toList();

        int fromIndex = Math.min(page * size, cards.size());
        int toIndex = Math.min(fromIndex + size, cards.size());
        List<ExamCardResponse> pageContent = cards.subList(fromIndex, toIndex);

        return new PagedExamCards(pageContent, page, size, cards.size(), toIndex < cards.size());
    }

    private boolean matchesStatusFilter(ExamCardResponse card, String statusFilter) {
        if (statusFilter == null || statusFilter.isBlank()) return true;
        String normalized = statusFilter.trim().toUpperCase(Locale.ROOT);
        // "CLOSING_SOON" is a synthetic bucket layered on top of the two real "open"
        // statuses, not a RecruitmentCycleStatus value of its own — see the class comment.
        if (normalized.equals("CLOSING_SOON")) return card.closingSoon();
        return normalized.equals(card.status());
    }

    private Comparator<ExamCardResponse> comparatorFor(SortOption sort) {
        return switch (sort == null ? SortOption.ALPHABETICAL : sort) {
            case DEADLINE -> Comparator.comparing(
                    ExamCardResponse::applicationEnd, Comparator.nullsLast(Comparator.naturalOrder()));
            case EXAM_DATE -> Comparator.comparing(
                    ExamCardResponse::examStart, Comparator.nullsLast(Comparator.naturalOrder()));
            case NEWLY_ANNOUNCED -> Comparator.comparing(
                    ExamCardResponse::notificationDate, Comparator.nullsLast(Comparator.reverseOrder()));
            case RECENTLY_UPDATED -> Comparator.comparing(
                    ExamCardResponse::lastVerifiedAt, Comparator.nullsLast(Comparator.reverseOrder()));
            // "Popular" has no real signal yet (Follow persistence is Phase 2 of this same
            // build) — falls back to alphabetical rather than a fabricated ranking.
            case POPULAR, ALPHABETICAL -> Comparator.comparing(ExamCardResponse::examName);
        };
    }

    private ExamCardResponse toCard(Exam exam, RecruitmentCycle cycle) {
        if (cycle == null) {
            return new ExamCardResponse(
                    exam.getCode(), exam.getName(), exam.getImageUrl(), exam.getCategory(),
                    exam.getDifficulty(), exam.getBadge(), null, null, null, false, null,
                    null, null, null, null, null, null, false, null, "VIEW_EXAM");
        }

        RecruitmentCycleStatus status = cycle.getStatus();
        Integer daysUntilDeadline = null;
        boolean closingSoon = false;
        if (APPLICATION_OPEN_STATUSES.contains(status) && cycle.getApplicationEnd() != null) {
            long days = ChronoUnit.DAYS.between(LocalDate.now(), cycle.getApplicationEnd());
            daysUntilDeadline = (int) days;
            closingSoon = days >= 0 && days <= CLOSING_SOON_THRESHOLD_DAYS;
        }

        return new ExamCardResponse(
                exam.getCode(), exam.getName(), exam.getImageUrl(), exam.getCategory(),
                exam.getDifficulty(), exam.getBadge(),
                cycle.getId(), cycle.getCycleName(), status.name(), closingSoon, daysUntilDeadline,
                cycle.getNotificationDate(), cycle.getApplicationStart(), cycle.getApplicationEnd(),
                cycle.getExamStart(), cycle.getExamEnd(), cycle.getVacancyCount(),
                cycle.isDemo(), cycle.getLastVerifiedAt(),
                primaryActionFor(status, cycle));
    }

    /** Spec §52 — exactly one primary action per lifecycle state. */
    private String primaryActionFor(RecruitmentCycleStatus status, RecruitmentCycle cycle) {
        if (APPLICATION_OPEN_STATUSES.contains(status)) {
            return cycle.getNotificationUrl() != null ? "APPLY_NOW" : "VIEW_EXAM";
        }
        if (PREPARE_STATUSES.contains(status)) return "PREPARE_NOW";
        if (RESULT_STATUSES.contains(status)) return "VIEW_RESULT_INFO";
        return "VIEW_EXAM";
    }
}
