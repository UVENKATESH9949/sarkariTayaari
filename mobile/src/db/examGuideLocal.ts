import { asc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import {
  examGuideCareerPosts,
  examGuideCycles,
  examGuideDates,
  examGuideDocuments,
  examGuideEligibility,
  examGuideFees,
  examGuideMistakes,
  examGuideSources,
  examGuideSteps,
} from "./schema";
import type {
  ApplicationStepSummary,
  CareerPostSummary,
  DocumentSummary,
  EligibilitySummary,
  ExamGuide,
  FeeSummary,
  ImportantDateSummary,
  SourceSummary,
} from "../api/examGuide";

/**
 * Reads the Exam Guide offline cache (spec §44) written by writeExamGuides() during the
 * ordinary reference sync — reassembles the same {@link ExamGuide} shape the live API
 * returns, so `data/examGuideData.ts`'s hybrid facade can hand either one to a screen
 * without it knowing which source it got.
 */
export async function getExamGuideLocal(examCode: string): Promise<ExamGuide | null> {
  const cycle = await db.select().from(examGuideCycles).where(eq(examGuideCycles.examCode, examCode)).get();
  if (!cycle) return null;

  const [eligibilityRow, dates, documents, steps, mistakes, fees, careerPosts] = await Promise.all([
    db.select().from(examGuideEligibility).where(eq(examGuideEligibility.examCode, examCode)).get(),
    db.select().from(examGuideDates).where(eq(examGuideDates.examCode, examCode)).orderBy(asc(examGuideDates.displayOrder)).all(),
    db
      .select()
      .from(examGuideDocuments)
      .where(eq(examGuideDocuments.examCode, examCode))
      .orderBy(asc(examGuideDocuments.displayOrder))
      .all(),
    db.select().from(examGuideSteps).where(eq(examGuideSteps.examCode, examCode)).orderBy(asc(examGuideSteps.stepNumber)).all(),
    db
      .select()
      .from(examGuideMistakes)
      .where(eq(examGuideMistakes.examCode, examCode))
      .orderBy(asc(examGuideMistakes.displayOrder))
      .all(),
    db.select().from(examGuideFees).where(eq(examGuideFees.examCode, examCode)).orderBy(asc(examGuideFees.displayOrder)).all(),
    db
      .select()
      .from(examGuideCareerPosts)
      .where(eq(examGuideCareerPosts.examCode, examCode))
      .orderBy(asc(examGuideCareerPosts.displayOrder))
      .all(),
  ]);

  const citedSourceIds = new Set<string>();
  [
    eligibilityRow?.sourceId,
    ...dates.map((d) => d.sourceId),
    ...documents.map((d) => d.sourceId),
    ...fees.map((f) => f.sourceId),
    ...careerPosts.map((p) => p.sourceId),
  ].forEach((id) => {
    if (id) citedSourceIds.add(id);
  });
  let sources: SourceSummary[] = [];
  if (citedSourceIds.size > 0) {
    const sourceRows = await db
      .select()
      .from(examGuideSources)
      .where(inArray(examGuideSources.id, [...citedSourceIds]))
      .all();
    sources = sourceRows.map((s) => ({ id: s.id, sourceName: s.sourceName, sourceType: s.sourceType, url: s.url }));
  }

  const eligibility: EligibilitySummary | null = eligibilityRow
    ? {
        minimumAge: eligibilityRow.minimumAge,
        maximumAge: eligibilityRow.maximumAge,
        ageCutoffDate: eligibilityRow.ageCutoffDate,
        qualification: eligibilityRow.qualification,
        nationality: eligibilityRow.nationality,
        genderRequirement: eligibilityRow.genderRequirement,
        categoryRelaxation: eligibilityRow.categoryRelaxation ? JSON.parse(eligibilityRow.categoryRelaxation) : null,
        specialRequirements: eligibilityRow.specialRequirements,
        sourceId: eligibilityRow.sourceId,
      }
    : null;

  const importantDates: ImportantDateSummary[] = dates.map((d) => ({
    id: d.id,
    eventType: d.eventType,
    title: d.title,
    startDate: d.startDate,
    endDate: d.endDate,
    official: d.official,
    sourceId: d.sourceId,
  }));

  const documentSummaries: DocumentSummary[] = documents.map((d) => ({
    id: d.id,
    documentName: d.documentName,
    required: d.required,
    applicableFor: d.applicableFor,
    format: d.format,
    maxSizeKb: d.maxSizeKb,
    dimensions: d.dimensions,
    instructions: d.instructions,
    userStatus: d.userStatus,
    sourceId: d.sourceId,
  }));

  const applicationSteps: ApplicationStepSummary[] = steps.map((s) => ({
    stepNumber: s.stepNumber,
    title: s.title,
    description: s.description,
    warning: s.warning,
    officialUrl: s.officialUrl,
  }));

  const applicationMistakes: string[] = mistakes.map((m) => m.mistake);

  const feeSummaries: FeeSummary[] = fees.map((f) => ({
    category: f.category,
    amountRupees: f.amountRupees,
    exempted: f.exempted,
    notes: f.notes,
    sourceId: f.sourceId,
  }));

  const careerPostSummaries: CareerPostSummary[] = careerPosts.map((p) => ({
    id: p.id,
    postTitle: p.postTitle,
    payLevel: p.payLevel,
    salaryMinRupees: p.salaryMinRupees,
    salaryMaxRupees: p.salaryMaxRupees,
    growthPath: p.growthPath,
    description: p.description,
    sourceId: p.sourceId,
  }));

  return {
    examCode: cycle.examCode,
    examName: cycle.examName,
    recruitmentCycleId: cycle.recruitmentCycleId,
    cycleName: cycle.cycleName,
    status: cycle.status,
    notificationDate: cycle.notificationDate,
    applicationStart: cycle.applicationStart,
    applicationEnd: cycle.applicationEnd,
    examStart: cycle.examStart,
    examEnd: cycle.examEnd,
    vacancyCount: cycle.vacancyCount,
    notificationUrl: cycle.notificationUrl,
    overviewText: cycle.overviewText,
    demo: cycle.isDemo,
    lastVerifiedAt: cycle.lastVerifiedAt,
    eligibility,
    importantDates,
    documents: documentSummaries,
    applicationSteps,
    applicationMistakes,
    fees: feeSummaries,
    careerPosts: careerPostSummaries,
    sources,
  };
}
