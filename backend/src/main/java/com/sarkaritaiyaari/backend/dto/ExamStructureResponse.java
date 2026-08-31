package com.sarkaritaiyaari.backend.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The whole Stage → Paper → Section → Subjects tree for one exam, in display order.
 *
 * Marking inheritance is resolved here rather than in each client: a section's
 * `effectiveMarksCorrect`/`effectiveMarksWrong` already fall back to the paper's values
 * when the section does not override them, so no consumer has to reimplement that rule
 * and none of them can disagree about it.
 */
public record ExamStructureResponse(
        String examCode,
        String examName,
        /**
         * The exam's syllabus — every subject it covers. Sent alongside the pattern
         * because the two answer different questions: an exam can cover a subject
         * without that subject being its own timed section, and can have a syllabus
         * before any papers are defined at all.
         */
        List<PaperSectionResponse.SubjectRef> syllabusSubjects,
        List<StageNode> stages
) {

    public record StageNode(
            UUID id,
            String name,
            int displayOrder,
            LocalDate effectiveFrom,
            LocalDate effectiveTo,
            String versionLabel,
            /** True when this version is the one in force today - see ExamStageResponse.active. */
            boolean active,
            List<PaperNode> papers
    ) {
    }

    public record PaperNode(
            UUID id,
            String name,
            String paperType,
            boolean mockable,
            Integer durationMinutes,
            BigDecimal totalMarks,
            BigDecimal marksCorrect,
            BigDecimal marksWrong,
            boolean qualifying,
            BigDecimal qualifyingPercentage,
            int displayOrder,
            List<SectionNode> sections
    ) {
    }

    public record SectionNode(
            UUID id,
            String name,
            int questionCount,
            /** null = shares the paper's overall time. */
            Integer durationMinutes,
            /** True when this section runs its own enforced timer (IBPS-style). */
            boolean sectionallyTimed,
            /** Raw overrides — null means "inherit". */
            BigDecimal marksCorrect,
            BigDecimal marksWrong,
            /** Resolved values a client can use directly. */
            BigDecimal effectiveMarksCorrect,
            BigDecimal effectiveMarksWrong,
            int displayOrder,
            List<PaperSectionResponse.SubjectRef> subjects
    ) {
    }
}
